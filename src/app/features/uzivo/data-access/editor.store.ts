import { moveItemInArray } from '@angular/cdk/drag-drop';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  EMPTY, Observable, Subject, catchError, concat, debounce, defer, filter, finalize, groupBy, map, mergeMap, of, pipe, race,
  switchMap, take, tap, throwError, timer,
} from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { PrezentacijeApi } from './prezentacije.api';
import { razlogGreske } from './razlog-greske';
import {
  MAX_SLAJDOVA, PORUKE, greskePrezentacije, greskeSlajda, noviSlajd, slajdIzCmd, slajdUCmd,
} from './slajd-pravila';
import {
  PrezentacijaDetails, SlajdCmd, SlajdDetails, TipPitanja, TipSlajda, UpdatePrezentacijaCmd,
} from './uzivo.models';

export type StanjeCuvanja = 'miruje' | 'cuva' | 'sacuvano' | 'greska';

export interface EditorState {
  prezentacija: PrezentacijaDetails | null;
  izabraniId: number | null;
  cuvanje: StanjeCuvanja;
  greska: string | null;
}

/** Automatsko čuvanje: toliko posle poslednje izmene slajda (spec 6.3). */
export const DEBOUNCE_MS = 800;

const PORUKA_CUVANJE = 'Čuvanje nije uspelo. Pokušaj ponovo (Ctrl+S).';

/** Greška iz `sacuvajSve`: poruka je za korisnika (prva neispravnost ili razlog servera). */
export class NijeSacuvano extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = 'NijeSacuvano';
  }
}

const POCETNO: EditorState = { prezentacija: null, izabraniId: null, cuvanje: 'miruje', greska: null };

/**
 * Stanje editora prezentacije (jedna instanca po stranici editora).
 *
 * - Izmene slajda se primenjuju lokalno odmah (lista i pregled), a na server idu 800 ms posle poslednje izmene tog
 *   slajda (`PUT /slajdovi/{id}`, puna zamena); promena izabranog slajda i `sacuvajOdmah` (Ctrl+S) šalju odmah. Odgovor
 *   servera zamenjuje lokalni slajd samo ako u međuvremenu nije bilo novije izmene (id-jevi opcija se menjaju pri
 *   svakom čuvanju, pa se uzimaju iz odgovora).
 * - Neispravan slajd (ista pravila kao server, `greskeSlajda`) se ne šalje; `greska` kaže zašto.
 * - Nov slajd (`dodaj`) je lokalni **nacrt** sa negativnim id-jem dok ne postane ispravan (server ne prima prazan slajd
 *   ni prazne opcije); prva ispravna izmena ga šalje kao `POST` posle prethodnog sačuvanog slajda, i od tada ima pravi id.
 *   `kljuc(id)` ostaje isti kroz tu zamenu (za `track` u šablonu).
 * - `pomeri` je optimističan, pa `PUT redosled` sa id-jevima sačuvanih slajdova; neuspeh vraća stari redosled.
 */
export const EditorStore = signalStore(
  withState<EditorState>(POCETNO),
  withComputed(({ prezentacija, izabraniId }) => {
    const slajdovi = computed(() => prezentacija()?.slajdovi ?? []);
    return {
      slajdovi,
      izabrani: computed(() => slajdovi().find(s => s.id === izabraniId()) ?? null),
      /** Sačuvana pitanja (o njima odlučuje dijalog "Pokreni"). */
      brojPitanja: computed(() => slajdovi().filter(s => s.id > 0 && s.tip === 'PITANJE').length),
      /** Id-jevi slajdova koji ne prolaze validaciju (u listi dobijaju upozorenje). */
      neispravni: computed(() => new Set(slajdovi().filter(s => greskeSlajda(slajdUCmd(s)).length > 0).map(s => s.id))),
    };
  }),
  withMethods(store => {
    const api = inject(PrezentacijeApi);
    const obavestenja = inject(NotificationStore);

    let prezentacijaId = 0;
    let generacija = 0;
    let sledeciNacrt = -1;
    let uToku = 0;
    /** Broj zahteva završenih greškom (za `sacuvajSve`: da li je greška nastala posle njegovog poziva). */
    let brojGresaka = 0;
    const flush$ = new Subject<number | null>();
    /** Emituje kad se završi bilo koji zahtev ka serveru. */
    const zavrseno$ = new Subject<void>();
    /** Poslednja lokalna komanda, njen broj izmene i poslednji sačuvan broj izmene, po id-ju slajda. */
    const cmdovi = new Map<number, SlajdCmd>();
    const izmena = new Map<number, number>();
    const sacuvano = new Map<number, number>();
    /** Nacrt -> pravi id posle POST-a, i obrnuto (za `kljuc`). */
    const zamene = new Map<number, number>();
    const poreklo = new Map<number, number>();
    const nacrtiUSlanju = new Set<number>();
    /** Broj izmene koji je upravo na putu (PUT), po id-ju: ista izmena se ne šalje dvaput (npr. iz grupe nacrta i pravog id-ja). */
    const uSlanju = new Map<number, number>();
    const obrisani = new Set<number>();

    const razresi = (id: number) => zamene.get(id) ?? id;
    const naCekanju = (id: number) => (izmena.get(id) ?? 0) > (sacuvano.get(id) ?? 0);

    function postaviSlajdove(lista: SlajdDetails[]): void {
      const p = store.prezentacija();
      if (!p) return;
      const slajdovi = lista.map((s, i) => (s.rb === i + 1 ? s : { ...s, rb: i + 1 }));
      patchState(store, { prezentacija: { ...p, slajdovi } });
    }

    function zameni(id: number, fn: (s: SlajdDetails) => SlajdDetails): void {
      postaviSlajdove(store.slajdovi().map(s => (s.id === id ? fn(s) : s)));
    }

    function pocni(): void {
      uToku++;
      patchState(store, { cuvanje: 'cuva' });
    }

    /** `null` = uspeh (briše grešku), string = greška, `undefined` = otkazano (ništa ne menja). */
    function zavrsi(ishod: string | null | undefined): void {
      uToku = Math.max(0, uToku - 1);
      if (ishod !== undefined) {
        patchState(store, { greska: ishod });
      }
      if (typeof ishod === 'string') {
        brojGresaka++;
      }
      if (uToku === 0) {
        patchState(store, { cuvanje: store.greska() ? 'greska' : 'sacuvano' });
      }
      // otkazan zahtev (switchMap) uvek odmah zamenjuje nov, pa se ne javlja
      if (ishod !== undefined) {
        zavrseno$.next();
      }
    }

    function neispravno(id: number, poruka: string): void {
      const rb = store.slajdovi().find(s => s.id === id)?.rb;
      patchState(store, { greska: rb ? `Slajd ${rb} nije sačuvan: ${poruka}` : poruka });
      if (uToku === 0) {
        patchState(store, { cuvanje: 'greska' });
      }
    }

    function posleZa(nacrt: number): { posle: number | null; sacuvaniPosle: boolean } {
      const lista = store.slajdovi();
      const i = lista.findIndex(s => s.id === nacrt);
      const pre = lista.slice(0, Math.max(i, 0)).reverse().find(s => s.id > 0);
      return { posle: pre?.id ?? null, sacuvaniPosle: lista.slice(i + 1).some(s => s.id > 0) };
    }

    function sacuvaniIds(): number[] {
      return store.slajdovi().filter(s => s.id > 0).map(s => s.id);
    }

    function posaljiRedosled(ids: number[], vrati?: () => void): void {
      const gen = generacija;
      let ishod: string | null | undefined;
      pocni();
      api.redosled(prezentacijaId, ids)
        .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
        .subscribe({
          next: () => (ishod = null),
          error: e => {
            ishod = razlogGreske(e, PORUKA_CUVANJE);
            if (gen === generacija) vrati?.();
          },
        });
    }

    function obrisiNaServeru(id: number, vrati?: () => void): void {
      const gen = generacija;
      let ishod: string | null | undefined;
      pocni();
      api.obrisiSlajd(id)
        .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
        .subscribe({
          complete: () => (ishod = null),
          error: e => {
            ishod = razlogGreske(e, 'Brisanje slajda nije uspelo.');
            if (gen === generacija) vrati?.();
          },
        });
    }

    /**
     * Nacrt ide POST-om van `switchMap`-a: otkazivanje bi prekinulo samo odgovor, a server bi slajd ipak napravio
     * (duplikat). Izmene stigle dok POST traje šalju se posle njega, na pravi id.
     */
    function posaljiNacrt(nacrt: number): void {
      if (nacrtiUSlanju.has(nacrt)) return;
      const cmd = cmdovi.get(nacrt)!;
      const rev = izmena.get(nacrt)!;
      const { posle, sacuvaniPosle } = posleZa(nacrt);
      const gen = generacija;
      let ishod: string | null | undefined;
      nacrtiUSlanju.add(nacrt);
      pocni();
      api.dodajSlajd(prezentacijaId, cmd, posle)
        .pipe(finalize(() => {
          nacrtiUSlanju.delete(nacrt);
          if (gen === generacija) zavrsi(ishod);
        }))
        .subscribe({
          next: d => {
            ishod = null;
            if (gen !== generacija) return;
            zamene.set(nacrt, d.id);
            poreklo.set(d.id, nacrt);
            cmdovi.set(d.id, cmdovi.get(nacrt) ?? cmd);
            izmena.set(d.id, izmena.get(nacrt) ?? rev);
            sacuvano.set(d.id, rev);
            cmdovi.delete(nacrt);
            izmena.delete(nacrt);
            sacuvano.delete(nacrt);
            if (obrisani.has(nacrt) || !store.slajdovi().some(s => s.id === nacrt)) {
              // obrisan dok je POST trajao
              obrisani.add(d.id);
              obrisiNaServeru(d.id);
              return;
            }
            zameni(nacrt, s => (izmena.get(d.id) === rev ? { ...d, rb: s.rb } : { ...s, id: d.id }));
            if (store.izabraniId() === nacrt) {
              patchState(store, { izabraniId: d.id });
            }
            if (posle === null && sacuvaniPosle) {
              // server je dodao na kraj, a lokalno je ispred sačuvanih slajdova
              posaljiRedosled(sacuvaniIds());
            }
            if (naCekanju(d.id)) {
              cuvaj(d.id);
            }
          },
          error: e => (ishod = razlogGreske(e, PORUKA_CUVANJE)),
        });
    }

    function posalji(id: number): Observable<unknown> {
      const kljuc = razresi(id);
      const cmd = cmdovi.get(kljuc);
      if (!cmd || obrisani.has(kljuc) || !naCekanju(kljuc)) {
        return EMPTY;
      }
      const greske = greskeSlajda(cmd);
      if (greske.length) {
        neispravno(kljuc, greske[0]);
        return EMPTY;
      }
      if (kljuc < 0) {
        posaljiNacrt(kljuc);
        return EMPTY;
      }
      const rev = izmena.get(kljuc)!;
      if (uSlanju.get(kljuc) === rev) {
        return EMPTY;
      }
      uSlanju.set(kljuc, rev);
      const gen = generacija;
      let ishod: string | null | undefined;
      pocni();
      return api.izmeniSlajd(kljuc, cmd).pipe(
        tap(d => {
          ishod = null;
          if (gen !== generacija) return;
          sacuvano.set(kljuc, Math.max(rev, sacuvano.get(kljuc) ?? 0));
          if (izmena.get(kljuc) === rev && !obrisani.has(kljuc)) {
            zameni(kljuc, s => ({ ...d, rb: s.rb }));
          }
        }),
        catchError(e => {
          ishod = razlogGreske(e, PORUKA_CUVANJE);
          return EMPTY;
        }),
        finalize(() => {
          if (uSlanju.get(kljuc) === rev) uSlanju.delete(kljuc);
          if (gen === generacija) zavrsi(ishod);
        }),
      );
    }

    /** Po slajdu: čeka 800 ms mira (ili flush), pa šalje; novija izmena istog slajda zamenjuje stariju. */
    const cuvaj = rxMethod<number>(pipe(
      groupBy(id => id),
      mergeMap(grupa => grupa.pipe(
        debounce(id => race(timer(DEBOUNCE_MS), flush$.pipe(filter(f => f === null || f === id)))),
        switchMap(id => posalji(id)),
      )),
    ));

    function posaljiOdmah(id: number): void {
      const kljuc = razresi(id);
      if (naCekanju(kljuc) && !obrisani.has(kljuc)) {
        cuvaj(kljuc);
        flush$.next(kljuc);
      }
    }

    function izaberi(slajdId: number | null): void {
      const trenutni = store.izabraniId();
      const novi = slajdId === null ? null : razresi(slajdId);
      if (trenutni !== null && trenutni !== novi) {
        posaljiOdmah(trenutni);
      }
      patchState(store, { izabraniId: novi });
    }

    function ubaciNacrt(cmd: SlajdCmd, posleIndeksa: number): number {
      const id = sledeciNacrt--;
      const lista = [...store.slajdovi()];
      lista.splice(posleIndeksa + 1, 0, slajdIzCmd(cmd, { id, rb: 0 }));
      postaviSlajdove(lista);
      cmdovi.set(id, cmd);
      izmena.set(id, 1);
      sacuvano.set(id, 0);
      izaberi(id);
      return id;
    }

    function imaMesta(): boolean {
      if (store.slajdovi().length < MAX_SLAJDOVA) return true;
      patchState(store, { greska: PORUKE.brojSlajdova, cuvanje: uToku ? 'cuva' : 'greska' });
      return false;
    }

    /** Slajdovi čije poslednje izmene još nisu na serveru (bez obrisanih). */
    function nesacuvani(): number[] {
      return [...izmena.keys()].filter(id => !obrisani.has(id) && naCekanju(id));
    }

    function sacuvajOdmah(): void {
      for (const id of nesacuvani()) cuvaj(id);
      flush$.next(null);
    }

    /**
     * Ishod čekanja u `sacuvajSve`: `undefined` = još traje, `null` = sve je na serveru, string = greška. Ispravne izmene
     * koje su ostale (npr. stigle dok je POST nacrta trajao, pa čekaju debounce) šalju se odmah.
     */
    function ishodCuvanja(greskePre: number): string | null | undefined {
      if (uToku > 0 || nacrtiUSlanju.size > 0) return undefined;
      if (brojGresaka > greskePre) return store.greska() ?? PORUKA_CUVANJE;
      const ostali = nesacuvani();
      for (const id of ostali) {
        const greske = greskeSlajda(cmdovi.get(id)!);
        if (greske.length) {
          const rb = store.slajdovi().find(s => s.id === id)?.rb;
          return rb ? `Slajd ${rb} nije sačuvan: ${greske[0]}` : greske[0];
        }
      }
      if (!ostali.length) return null;
      // van tekućeg završetka zahteva (bez ulaska u rxMethod usred njegovog `finalize`); sledeći završetak ponovo procenjuje
      queueMicrotask(sacuvajOdmah);
      return undefined;
    }

    /** Šalje sve ispravne nesačuvane izmene van rxMethod-a (preživi uništavanje store-a pri napuštanju editora). */
    function sacuvajPreIzlaska(): void {
      for (const [id, cmd] of cmdovi) {
        if (obrisani.has(id) || !naCekanju(id) || greskeSlajda(cmd).length || nacrtiUSlanju.has(id)) continue;
        sacuvano.set(id, izmena.get(id)!);
        const zahtev = id > 0 ? api.izmeniSlajd(id, cmd) : api.dodajSlajd(prezentacijaId, cmd, posleZa(id).posle);
        // editor je možda već zatvoren: poruka ide kroz globalni snackbar (više neuspeha = jedna poruka)
        zahtev.subscribe({
          error: e => {
            const razlog = razlogGreske(e, '');
            obavestenja.greska(razlog ? `Izmena slajda nije sačuvana: ${razlog}` : 'Izmena slajda nije sačuvana.',
              { grupa: 'uzivo-cuvanje-pri-izlasku' });
          },
        });
      }
    }

    return {
      ucitaj(id: number): void {
        if (prezentacijaId && prezentacijaId !== id) {
          sacuvajPreIzlaska();
        }
        generacija++;
        const gen = generacija;
        prezentacijaId = id;
        uToku = 0;
        for (const m of [cmdovi, izmena, sacuvano, zamene, poreklo]) m.clear();
        nacrtiUSlanju.clear();
        uSlanju.clear();
        obrisani.clear();
        patchState(store, POCETNO);
        api.detalji(id).subscribe({
          next: p => {
            if (gen !== generacija) return;
            const slajdovi = [...p.slajdovi].sort((a, b) => a.rb - b.rb);
            patchState(store, { prezentacija: { ...p, slajdovi }, izabraniId: slajdovi[0]?.id ?? null });
          },
          error: e => gen === generacija && patchState(store, { greska: razlogGreske(e, 'Prezentacija nije učitana.') }),
        });
      },

      izaberi,

      izmeniSlajd(id: number, cmd: SlajdCmd): void {
        const kljuc = razresi(id);
        if (obrisani.has(kljuc) || !store.slajdovi().some(s => s.id === kljuc)) return;
        cmdovi.set(kljuc, cmd);
        izmena.set(kljuc, (izmena.get(kljuc) ?? 0) + 1);
        zameni(kljuc, s => slajdIzCmd(cmd, s));
        cuvaj(kljuc);
      },

      /** Ctrl+S: šalje sve nesačuvano odmah (i ponavlja neuspela čuvanja). */
      sacuvajOdmah,

      /**
       * Šalje sve nesačuvano i završava se (jedna vrednost) tek kad na serveru nema ničeg nesačuvanog ni zahteva u toku
       * (PUT-ovi i POST-ovi nacrta). Greška `NijeSacuvano` kad neki slajd nije ispravan ili čuvanje padne posle poziva.
       * Pokretanje i dupliranje čekaju ovo, da server vidi poslednje izmene.
       */
      sacuvajSve(): Observable<void> {
        return defer(() => {
          const greskePre = brojGresaka;
          sacuvajOdmah();
          return concat(of(undefined), zavrseno$).pipe(
            map(() => ishodCuvanja(greskePre)),
            filter(ishod => ishod !== undefined),
            take(1),
            switchMap(ishod => (ishod === null ? of(undefined) : throwError(() => new NijeSacuvano(ishod)))),
          );
        });
      },

      /** Nov slajd posle izabranog (ili na kraj), kao lokalni nacrt; bira ga. */
      dodaj(tip: TipSlajda, tipPitanja?: TipPitanja): void {
        if (!imaMesta()) return;
        const lista = store.slajdovi();
        const i = lista.findIndex(s => s.id === store.izabraniId());
        ubaciNacrt(noviSlajd(tip, tipPitanja), i < 0 ? lista.length - 1 : i);
      },

      obrisi(id: number): void {
        const kljuc = razresi(id);
        const lista = store.slajdovi();
        const i = lista.findIndex(s => s.id === kljuc);
        if (i < 0) return;
        const slajd = lista[i];
        obrisani.add(kljuc);
        const nova = lista.filter(s => s.id !== kljuc);
        postaviSlajdove(nova);
        if (store.izabraniId() === kljuc) {
          patchState(store, { izabraniId: (nova[i] ?? nova[i - 1])?.id ?? null });
        }
        if (kljuc < 0) return; // nacrt: ako POST upravo traje, briše se posle njega
        obrisiNaServeru(kljuc, () => {
          obrisani.delete(kljuc);
          const sada = [...store.slajdovi()];
          if (!sada.some(s => s.id === kljuc)) {
            sada.splice(Math.min(i, sada.length), 0, slajd);
            postaviSlajdove(sada);
          }
        });
      },

      /** Kopija odmah posle originala. Nesačuvan ili nacrt se kopira lokalno (sa trenutnim izmenama). */
      dupliraj(id: number): void {
        const kljuc = razresi(id);
        const lista = store.slajdovi();
        const i = lista.findIndex(s => s.id === kljuc);
        if (i < 0 || !imaMesta()) return;
        if (kljuc < 0 || naCekanju(kljuc)) {
          const cmd = structuredClone(cmdovi.get(kljuc) ?? slajdUCmd(lista[i]));
          posaljiOdmah(ubaciNacrt(cmd, i));
          return;
        }
        const gen = generacija;
        let ishod: string | null | undefined;
        pocni();
        api.duplirajSlajd(kljuc)
          .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
          .subscribe({
            next: d => {
              ishod = null;
              if (gen !== generacija) return;
              const sada = [...store.slajdovi()];
              const j = sada.findIndex(s => s.id === kljuc);
              sada.splice(j < 0 ? sada.length : j + 1, 0, d);
              postaviSlajdove(sada);
              izaberi(d.id);
            },
            error: e => (ishod = razlogGreske(e, 'Dupliranje slajda nije uspelo.')),
          });
      },

      /** Optimistično premeštanje (indeksi u listi), pa `PUT redosled`; neuspeh vraća stari redosled. */
      pomeri(prethodni: number, sledeci: number): void {
        const stara = store.slajdovi();
        if (prethodni === sledeci || prethodni < 0 || prethodni >= stara.length) return;
        const nova = [...stara];
        moveItemInArray(nova, prethodni, Math.min(Math.max(sledeci, 0), stara.length - 1));
        postaviSlajdove(nova);
        const stariIds = stara.filter(s => s.id > 0).map(s => s.id);
        const noviIds = sacuvaniIds();
        if (stariIds.every((id, k) => id === noviIds[k])) return;
        const red = new Map(stara.map((s, k) => [s.id, k]));
        posaljiRedosled(noviIds, () => postaviSlajdove(
          [...store.slajdovi()].sort((a, b) => (red.get(a.id) ?? 1e9) - (red.get(b.id) ?? 1e9))));
      },

      /** Naziv, opis i podešavanja (takmičenje, telefon, detalji); optimistično, neuspeh vraća staro. */
      izmeniPodesavanja(cmd: UpdatePrezentacijaCmd): void {
        const p = store.prezentacija();
        if (!p) return;
        const greske = greskePrezentacije(cmd.naziv, cmd.opis);
        if (greske.length) {
          patchState(store, { greska: greske[0], cuvanje: uToku ? 'cuva' : 'greska' });
          return;
        }
        const staro: UpdatePrezentacijaCmd = {
          naziv: p.naziv, opis: p.opis, takmicenje: p.takmicenje, telefonPrikaz: p.telefonPrikaz,
          detaljiDozvoljeni: p.detaljiDozvoljeni,
        };
        const primeni = (v: Partial<PrezentacijaDetails>) => {
          const sada = store.prezentacija();
          if (sada) patchState(store, { prezentacija: { ...sada, ...v } });
        };
        primeni(cmd);
        const gen = generacija;
        let ishod: string | null | undefined;
        pocni();
        api.izmeni(p.id, cmd)
          .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
          .subscribe({
            next: d => {
              ishod = null;
              if (gen !== generacija) return;
              primeni({
                naziv: d.naziv, opis: d.opis, takmicenje: d.takmicenje, telefonPrikaz: d.telefonPrikaz,
                detaljiDozvoljeni: d.detaljiDozvoljeni, izmenjeno: d.izmenjeno,
              });
            },
            error: e => {
              ishod = razlogGreske(e, PORUKA_CUVANJE);
              if (gen === generacija) primeni(staro);
            },
          });
      },

      /** Stabilan ključ slajda (isti pre i posle zamene id-ja nacrta) za `track`. */
      kljuc(id: number): number {
        return poreklo.get(id) ?? id;
      },

      /** Ima li izmena koje još nisu na serveru (uključujući neispravne nacrte). */
      imaNesacuvano(): boolean {
        return nesacuvani().length > 0 || nacrtiUSlanju.size > 0;
      },

      sacuvajPreIzlaska,
    };
  }),
  withHooks({
    onDestroy(store) {
      store.sacuvajPreIzlaska();
    },
  }),
);
