import { moveItemInArray } from '@angular/cdk/drag-drop';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  EMPTY, Observable, Subject, catchError, concat, debounce, defer, filter, finalize, groupBy, map, mergeMap, of, pipe, race,
  switchMap, take, tap, throwError, timer,
} from 'rxjs';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja, SesijaCuvanja } from '../../../core/state/registar-cuvanja';
import { PrezentacijeApi } from './prezentacije.api';
import { razlogGreske } from './razlog-greske';
import {
  MAX_SLAJDOVA, PORUKE, greskePrezentacije, greskeSlajda, greskeSlajdaZaSlanje, noviSlajd, prazanZadatakInfo, slajdIzCmd, slajdUCmd,
} from './slajd-pravila';
import { novoPlatno, type RasporedNovogPlatna } from './platno-novo';
import type { Platno } from './platno.models';
import { vazecaTema } from '../ui/teme';
import {
  MedijInfo, PrezentacijaDetails, SlajdCmd, SlajdDetails, TipPitanja, TipSlajda, UpdatePrezentacijaCmd,
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
 * POST nacrta na putu. Ako se editor napusti ili pređe na drugu prezentaciju pre odgovora, `sacuvajPreIzlaska` ovde
 * zapiše šta je stiglo posle POST-a (izmena ili brisanje nacrta), a odgovor to pošalje na pravi id (zatvaranje sesije,
 * ne otkazivanje: izmena nacrta se ne gubi).
 */
interface NacrtUSlanju {
  /** Broj izmene koji nosi POST. */
  readonly rev: number;
  /** Poslednja ispravna izmena posle POST-a, zapisana pri izlasku. */
  ostatak: SlajdCmd | null;
  /** Nacrt obrisan dok je POST trajao, zapisano pri izlasku. */
  obrisan: boolean;
}

/**
 * Sesija čuvanja jedne učitane prezentacije u `RegistarCuvanja` (ključ `prezentacija-<id>`). Ima **sopstveni** brojač
 * zahteva: brojač store-a se vraća na 0 u `ucitaj`, a njegov `zavrsi` je uslovljen generacijom, pa zahtev započet pre
 * ponovnog učitavanja nikad ne bi spustio brojač na koji registar čeka. Ovaj se spušta bezuslovno u `finalize`.
 *
 * Zatvorena sesija (prelaz na drugu prezentaciju, napušten editor) broji još samo svoje zahteve i odjavljuje se kad oni
 * završe; zahtev koji krene posle zatvaranja (npr. DELETE nacrta obrisanog dok je POST trajao, iz odgovora na POST
 * posle napuštanja editora) je ponovo prijavljuje, pa i njega čeka sledeće čitanje iste prezentacije.
 */
class SesijaPrezentacije implements SesijaCuvanja {
  readonly kljuc: string;
  uToku = 0;
  private readonly mir = new Subject<void>();
  readonly mirovanje = this.mir.asObservable();
  private zatvorena = false;
  private prijavljena = false;

  constructor(id: number, private nesacuvanoFn: () => number, private readonly registar: RegistarCuvanja) {
    this.kljuc = `prezentacija-${id}`;
  }

  /** Ne broji isti slajd dvaput (izmena na čekanju i njen PUT u toku): najveći od dva izvora. */
  nesacuvano(): number {
    return Math.max(this.nesacuvanoFn(), this.uToku);
  }

  prijavi(): void {
    if (this.prijavljena) return;
    this.prijavljena = true;
    this.registar.prijavi(this);
  }

  /** Zatvaranje, ne otkazivanje: zahtevi na putu završavaju, pa se sesija odjavljuje. Stanje store-a više nije njeno. */
  zatvori(): void {
    this.zatvorena = true;
    this.nesacuvanoFn = () => 0;
    if (this.uToku === 0) this.odjavi();
  }

  /** Svaki zahtev ka serveru prolazi ovuda: brojač gore pri pretplati, dole u `finalize` (bez obzira na generaciju). */
  prati<T>(zahtev: Observable<T>): Observable<T> {
    return defer(() => {
      this.prijavi();
      this.uToku++;
      this.registar.promena();
      return zahtev.pipe(finalize(() => {
        this.uToku--;
        this.registar.promena();
        if (this.uToku === 0) {
          if (this.zatvorena) this.odjavi();
          this.mir.next();
        }
      }));
    });
  }

  private odjavi(): void {
    if (!this.prijavljena) return;
    this.prijavljena = false;
    this.registar.odjavi(this);
  }
}

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
 * - PLATNO: editor platna predaje ceo dokument (`izmeniPlatno`) posle svake zabeležene izmene, a otvorenu sesiju (tekst,
 *   gest) upisuje funkcija iz `registrujPraznjenje`, koju store zove pre svakog čuvanja. Lista i forma proveravaju dokument
 *   samo jeftino (`greskeSlajda`); puna provera kao na serveru (`greskeSlajdaZaSlanje`) ide samo pred slanje.
 */
export const EditorStore = signalStore(
  withState<EditorState>(POCETNO),
  withComputed(({ prezentacija, izabraniId }) => {
    const slajdovi = computed(() => prezentacija()?.slajdovi ?? []);
    return {
      slajdovi,
      izabrani: computed(() => slajdovi().find(s => s.id === izabraniId()) ?? null),
      /** Sačuvani slajdovi sa rundama, pitanja i zadaci (o njima odlučuje dijalog "Pokreni"; kao `brojPitanja` servera). */
      brojPitanja: computed(() => slajdovi().filter(s => s.id > 0 && (s.tip === 'PITANJE' || s.tip === 'ZADATAK')).length),
      /** Id-jevi slajdova koji ne prolaze validaciju (u listi dobijaju upozorenje). */
      neispravni: computed(() => new Set(slajdovi().filter(s => greskeSlajda(slajdUCmd(s)).length > 0).map(s => s.id))),
    };
  }),
  withMethods(store => {
    const api = inject(PrezentacijeApi);
    const obavestenja = inject(NotificationStore);
    const registar = inject(RegistarCuvanja);

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
    const nacrtiUSlanju = new Map<number, NacrtUSlanju>();
    /** Broj izmene koji je upravo na putu (PUT), po id-ju: ista izmena se ne šalje dvaput (npr. iz grupe nacrta i pravog id-ja). */
    const uSlanju = new Map<number, number>();
    const obrisani = new Set<number>();
    /** Editor platna: upis otvorene sesije teksta i gesta u dokument, i da li je nešto otvoreno (odluka 9c). */
    let praznjenje: { isprazni: () => void; otvoreno: () => boolean } | null = null;
    /** Sesija učitane prezentacije u registru; posle napuštanja editora ostaje zatvorena (broji zakasnele zahteve). */
    let sesija: SesijaPrezentacije | null = null;
    /** Store je uništen (editor napušten): `rxMethod` čuvanja više ne radi, zakasneli odgovori šalju direktno. */
    let napusten = false;

    const razresi = (id: number) => zamene.get(id) ?? id;
    const naCekanju = (id: number) => (izmena.get(id) ?? 0) > (sacuvano.get(id) ?? 0);

    /** Svaki zahtev koji menja server ide kroz sesiju učitane prezentacije (registar čeka na njega). */
    const pratiZahtev = <T>(z: Observable<T>): Observable<T> => (sesija ? sesija.prati(z) : z);

    /** Lokalna izmena je promenila broj nesačuvanih (upozorenje pre zatvaranja kartice se uključuje odmah). */
    const javi = () => registar.promena();

    /**
     * Neuspeh upisa kad editor ove prezentacije više nije na ekranu (napušten, ili je učitana druga prezentacija): status
     * editora to ne može da pokaže, pa poruka ide kroz globalni snackbar (više neuspeha = jedna poruka).
     */
    function javiPriIzlasku(sta: string, e: unknown): void {
      const razlog = razlogGreske(e, '');
      obavestenja.greska(razlog ? `${sta}: ${razlog}` : `${sta}.`, { grupa: 'uzivo-cuvanje-pri-izlasku' });
    }

    /** Editor ove prezentacije više nije na ekranu (zahtev je krenuo u generaciji `gen`). */
    const vanEkrana = (gen: number) => napusten || gen !== generacija;

    /** Upis pri izlasku (van `rxMethod`-a, preživi uništavanje store-a), kroz sesiju prezentacije kojoj pripada. */
    function posaljiPriIzlasku(s: SesijaPrezentacije | null, zahtev: Observable<unknown>, sta = 'Izmena slajda nije sačuvana'): void {
      (s ? s.prati(zahtev) : zahtev).subscribe({ error: e => javiPriIzlasku(sta, e) });
    }

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
      // stanje 'greska' ulazi u nesačuvano sesije (redosled, brisanje, podešavanja nemaju izmenu slajda na čekanju)
      javi();
    }

    function neispravno(id: number, poruka: string): void {
      const rb = store.slajdovi().find(s => s.id === id)?.rb;
      patchState(store, { greska: rb ? `Slajd ${rb} nije sačuvan: ${poruka}` : poruka });
      if (uToku === 0) {
        patchState(store, { cuvanje: 'greska' });
      }
      javi();
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
      pratiZahtev(api.redosled(prezentacijaId, ids))
        .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
        .subscribe({
          next: () => (ishod = null),
          error: e => {
            ishod = razlogGreske(e, PORUKA_CUVANJE);
            if (vanEkrana(gen)) javiPriIzlasku('Redosled slajdova nije sačuvan', e);
            if (gen === generacija) vrati?.();
          },
        });
    }

    function obrisiNaServeru(id: number, vrati?: () => void): void {
      const gen = generacija;
      let ishod: string | null | undefined;
      pocni();
      pratiZahtev(api.obrisiSlajd(id))
        .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
        .subscribe({
          complete: () => (ishod = null),
          error: e => {
            ishod = razlogGreske(e, 'Brisanje slajda nije uspelo.');
            if (vanEkrana(gen)) javiPriIzlasku('Brisanje slajda nije uspelo', e);
            if (gen === generacija) vrati?.();
          },
        });
    }

    /**
     * Nacrt ide POST-om van `switchMap`-a: otkazivanje bi prekinulo samo odgovor, a server bi slajd ipak napravio
     * (duplikat). Izmene stigle dok POST traje šalju se posle njega, na pravi id; i kad je editor u međuvremenu napušten
     * ili je učitana druga prezentacija (tada kroz sesiju u kojoj je POST brojan, pa ih registar čeka).
     */
    function posaljiNacrt(nacrt: number): void {
      if (nacrtiUSlanju.has(nacrt)) return;
      const cmd = cmdovi.get(nacrt)!;
      const rev = izmena.get(nacrt)!;
      const { posle, sacuvaniPosle } = posleZa(nacrt);
      const gen = generacija;
      const s = sesija;
      const posao: NacrtUSlanju = { rev, ostatak: null, obrisan: false };
      let ishod: string | null | undefined;
      nacrtiUSlanju.set(nacrt, posao);
      pocni();
      pratiZahtev(api.dodajSlajd(prezentacijaId, cmd, posle))
        .pipe(finalize(() => {
          nacrtiUSlanju.delete(nacrt);
          if (gen === generacija) zavrsi(ishod);
        }))
        .subscribe({
          next: d => {
            ishod = null;
            if (gen !== generacija) {
              // u međuvremenu je učitana druga prezentacija: ono što je zapisano pri izlasku ide na pravi id
              if (posao.obrisan) posaljiPriIzlasku(s, api.obrisiSlajd(d.id), 'Brisanje slajda nije uspelo');
              else if (posao.ostatak) posaljiPriIzlasku(s, api.izmeniSlajd(d.id, posao.ostatak));
              return;
            }
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
              if (!napusten) {
                cuvaj(d.id);
              } else if (posao.ostatak) {
                // editor napušten dok je POST trajao: `cuvaj` (rxMethod) je ugašen, izmena ide direktno
                sacuvano.set(d.id, izmena.get(d.id)!);
                posaljiPriIzlasku(s, api.izmeniSlajd(d.id, posao.ostatak));
              }
            }
          },
          error: e => {
            ishod = razlogGreske(e, PORUKA_CUVANJE);
            // editor napušten ili druga prezentacija: ceo nov slajd bi inače nestao bez reči
            if (vanEkrana(gen)) javiPriIzlasku('Novi slajd nije sačuvan', e);
          },
        });
    }

    function posalji(id: number): Observable<unknown> {
      const kljuc = razresi(id);
      const cmd = cmdovi.get(kljuc);
      if (!cmd || obrisani.has(kljuc) || !naCekanju(kljuc)) {
        return EMPTY;
      }
      const greske = greskeSlajdaZaSlanje(cmd);
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
      return pratiZahtev(api.izmeniSlajd(kljuc, cmd)).pipe(
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
        // otvoren tekst ili gest editora platna u dokument PRE slanja (inače bi stigao tek pri uništavanju editora, posle
        // debounce-a); registracija pražnjenja je i dalje ona trenutnog slajda
        isprazni();
        posaljiOdmah(trenutni);
      }
      patchState(store, { izabraniId: novi });
    }

    /** `osnova`: lokalni opis do odgovora servera (npr. opis zadatka iz izabranog čvora ili originala kopije). */
    function ubaciNacrt(cmd: SlajdCmd, posleIndeksa: number, osnova: Partial<SlajdDetails> = {}): number {
      const id = sledeciNacrt--;
      const lista = [...store.slajdovi()];
      lista.splice(posleIndeksa + 1, 0, slajdIzCmd(cmd, { ...osnova, id, rb: 0 }));
      postaviSlajdove(lista);
      cmdovi.set(id, cmd);
      izmena.set(id, 1);
      sacuvano.set(id, 0);
      javi();
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

    /** Upis otvorenih izmena editora platna (ide kroz izmeniPlatno -> izmeniSlajd, pa ga sledeći korak čuvanja vidi). */
    function isprazni(): void {
      praznjenje?.isprazni();
    }

    /**
     * `slika`: podaci slike za lokalni prikaz do odgovora servera (komanda nosi samo `slikaId`; bez ovoga nova slika je
     * "Slika"), npr. "Poništi" pretvaranja u platno vraća INFO sa njegovom slikom.
     */
    function izmeniSlajd(id: number, cmd: SlajdCmd, slika?: MedijInfo | null): void {
      const kljuc = razresi(id);
      if (obrisani.has(kljuc) || !store.slajdovi().some(s => s.id === kljuc)) return;
      cmdovi.set(kljuc, cmd);
      izmena.set(kljuc, (izmena.get(kljuc) ?? 0) + 1);
      zameni(kljuc, s => slajdIzCmd(cmd, slika ? { ...s, slika } : s));
      javi();
      cuvaj(kljuc);
    }

    /** Nov dokument platna uz poslednju lokalnu komandu slajda (beleške otkucane posle poslednjeg čuvanja ostaju). */
    function izmeniPlatno(id: number, platno: Platno): void {
      const kljuc = razresi(id);
      const s = store.slajdovi().find(x => x.id === kljuc);
      if (!s || s.tip !== 'PLATNO' || obrisani.has(kljuc)) return;
      const cmd = cmdovi.get(kljuc) ?? slajdUCmd(s);
      // isti dokument (pražnjenje bez otvorene izmene): nema nove izmene ni PUT-a
      if (cmd.platno === platno) return;
      izmeniSlajd(kljuc, { ...cmd, platno });
    }

    function sacuvajOdmah(): void {
      isprazni();
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
        const greske = greskeSlajdaZaSlanje(cmdovi.get(id)!);
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

    /**
     * Šalje sve ispravne nesačuvane izmene van rxMethod-a (preživi uništavanje store-a pri napuštanju editora). Za nacrt
     * čiji POST upravo traje zapisuje šta je stiglo posle njega; to šalje odgovor na POST (`posaljiNacrt`).
     */
    function sacuvajPreIzlaska(): void {
      isprazni();
      for (const [id, cmd] of cmdovi) {
        const posao = nacrtiUSlanju.get(id);
        if (posao) {
          posao.obrisan = obrisani.has(id);
          posao.ostatak = !posao.obrisan && izmena.get(id)! > posao.rev && !greskeSlajdaZaSlanje(cmd).length ? cmd : null;
          continue;
        }
        if (obrisani.has(id) || !naCekanju(id) || greskeSlajdaZaSlanje(cmd).length) continue;
        sacuvano.set(id, izmena.get(id)!);
        if (id > 0) posaljiPriIzlasku(sesija, api.izmeniSlajd(id, cmd));
        else posaljiPriIzlasku(sesija, api.dodajSlajd(prezentacijaId, cmd, posleZa(id).posle), 'Novi slajd nije sačuvan');
      }
    }

    /** Nesačuvano učitane prezentacije za `NesacuvaneIzmene` (otvorena sesija editora platna se broji i bez izmene). */
    const nesacuvanoUkupno = () => nesacuvani().length + nacrtiUSlanju.size + (praznjenje?.otvoreno() ? 1 : 0)
      + (store.cuvanje() === 'greska' ? 1 : 0);

    return {
      /**
       * Čita prezentaciju sa servera. Ponovno čitanje iste, već prikazane prezentacije (nepoznat ishod uvoza) ostavlja
       * prikazanu dok ne stigne nova, pa se editor ne ruši (fokus ostaje gde je bio) i izabran slajd ostaje kad ga nova
       * lista ima; neuspelo ponovno čitanje je greška kao pri prvom.
       *
       * `GET` ide tek kad sve sesije te prezentacije u registru (napušten editor, prelaz 5 -> 6 -> 5, i sopstveni zahtevi
       * pre ponovnog čitanja) završe svoje upise, pa učitano stanje nikad ne prethodi izmenama koje su još na putu.
       */
      ucitaj(id: number): void {
        if (prezentacijaId && prezentacijaId !== id) {
          // tačno ovim redom: zahtevi iz sacuvajPreIzlaska ulaze u brojač STARE sesije, pa se ona zatvara
          sacuvajPreIzlaska();
          sesija?.zatvori();
          sesija = null;
        }
        if (!sesija) {
          sesija = new SesijaPrezentacije(id, nesacuvanoUkupno, registar);
          sesija.prijavi();
        }
        const ponovo = prezentacijaId === id && store.prezentacija()?.id === id;
        const izabranPre = ponovo ? store.izabraniId() : null;
        generacija++;
        const gen = generacija;
        prezentacijaId = id;
        uToku = 0;
        for (const m of [cmdovi, izmena, sacuvano, zamene, poreklo]) m.clear();
        nacrtiUSlanju.clear();
        uSlanju.clear();
        obrisani.clear();
        patchState(store, ponovo ? { cuvanje: POCETNO.cuvanje, greska: null } : POCETNO);
        registar.sacekaj(`prezentacija-${id}`).pipe(
          // novije učitavanje u međuvremenu: ovo čitanje više nikome ne treba
          switchMap(() => (gen === generacija ? api.detalji(id) : EMPTY)),
        ).subscribe({
          next: p => {
            if (gen !== generacija) return;
            const slajdovi = [...p.slajdovi].sort((a, b) => a.rb - b.rb);
            const izabran = slajdovi.some(s => s.id === izabranPre) ? izabranPre : slajdovi[0]?.id ?? null;
            patchState(store, { prezentacija: { ...p, slajdovi }, izabraniId: izabran });
          },
          error: e => gen === generacija
            && patchState(store, { prezentacija: null, izabraniId: null, greska: razlogGreske(e, 'Prezentacija nije učitana.') }),
        });
      },

      izaberi,

      izmeniSlajd,

      izmeniPlatno,

      /** Ctrl+S: šalje sve nesačuvano odmah (i ponavlja neuspela čuvanja). */
      sacuvajOdmah,

      /**
       * Šalje sve nesačuvano i završava se (jedna vrednost) tek kad na serveru nema ničeg nesačuvanog ni zahteva u toku
       * (PUT-ovi i POST-ovi nacrta). Greška `NijeSacuvano` kad neki slajd nije ispravan ili čuvanje padne posle poziva.
       * Pokretanje i dupliranje čekaju ovo, da server vidi poslednje izmene.
       */
      sacuvajSve(): Observable<void> {
        return defer(() => {
          isprazni();
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

      /**
       * Nov slajd posle izabranog (ili na kraj), kao lokalni nacrt; bira ga. PLATNO dobija dokument iz teme prezentacije
       * (`raspored`, podrazumevano prazan) i odmah je ispravan, pa se šalje odmah, kao kopija u `dupliraj`.
       */
      dodaj(tip: TipSlajda, tipPitanja?: TipPitanja, raspored: RasporedNovogPlatna = 'PRAZNO'): void {
        if (!imaMesta()) return;
        const lista = store.slajdovi();
        const i = lista.findIndex(s => s.id === store.izabraniId());
        const platno = tip === 'PLATNO' ? novoPlatno(vazecaTema(store.prezentacija()?.tema), raspored) : null;
        const id = ubaciNacrt(noviSlajd(tip, tipPitanja, platno), i < 0 ? lista.length - 1 : i);
        if (tip === 'PLATNO') posaljiOdmah(id);
      },

      /**
       * Nov Zadatak slajd nad čvorom banke iz dijaloga izbora, posle slajda `posle` (id; bez njega posle izabranog, inače na
       * kraj); bira ga. Bez tajmera, sve aktivne varijante. Ispravan je odmah, pa se šalje odmah; do odgovora servera opis
       * (naziv, kandidati, isključenje) dolazi iz čvora, pa lista odmah kaže "Zadatak: <grupa>".
       */
      dodajZadatak(cvor: CvorIzbora, posle?: number): void {
        if (!imaMesta()) return;
        const lista = store.slajdovi();
        const posleId = posle === undefined ? store.izabraniId() : razresi(posle);
        const i = lista.findIndex(s => s.id === posleId);
        const z = { grupaId: cvor.id, vremeSekunde: null, brojVarijanti: null };
        const opis = {
          ...prazanZadatakInfo(z), grupaNaziv: cvor.naziv, putanja: [{ id: cvor.id, naziv: cvor.naziv }], list: cvor.list,
          brojAktivnihVarijanti: cvor.brojAktivnih, iskljucena: cvor.iskljucena,
        };
        posaljiOdmah(ubaciNacrt(noviSlajd('ZADATAK', undefined, null, z), i < 0 ? lista.length - 1 : i, { zadatak: opis }));
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
        javi();
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
          posaljiOdmah(ubaciNacrt(cmd, i, { zadatak: lista[i].zadatak }));
          return;
        }
        const gen = generacija;
        let ishod: string | null | undefined;
        pocni();
        pratiZahtev(api.duplirajSlajd(kljuc))
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
            error: e => {
              ishod = razlogGreske(e, 'Dupliranje slajda nije uspelo.');
              if (vanEkrana(gen)) javiPriIzlasku('Dupliranje slajda nije uspelo', e);
            },
          });
      },

      /** Optimistično premeštanje (indeksi u listi), pa `PUT redosled`; neuspeh vraća stari redosled. */
      pomeri(prethodni: number, sledeci: number): void {
        const stara = store.slajdovi();
        if (prethodni === sledeci || prethodni < 0 || prethodni >= stara.length) return;
        const nova = [...stara];
        moveItemInArray(nova, prethodni, Math.min(Math.max(sledeci, 0), stara.length - 1));
        postaviSlajdove(nova);
        javi();
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
          naziv: p.naziv, opis: p.opis, tema: p.tema, takmicenje: p.takmicenje, telefonPrikaz: p.telefonPrikaz,
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
        pratiZahtev(api.izmeni(p.id, cmd))
          .pipe(finalize(() => gen === generacija && zavrsi(ishod)))
          .subscribe({
            next: d => {
              ishod = null;
              if (gen !== generacija) return;
              primeni({
                naziv: d.naziv, opis: d.opis, tema: d.tema, takmicenje: d.takmicenje, telefonPrikaz: d.telefonPrikaz,
                detaljiDozvoljeni: d.detaljiDozvoljeni, izmenjeno: d.izmenjeno,
              });
            },
            error: e => {
              ishod = razlogGreske(e, PORUKA_CUVANJE);
              if (vanEkrana(gen)) javiPriIzlasku('Podešavanja prezentacije nisu sačuvana', e);
              if (gen === generacija) primeni(staro);
            },
          });
      },

      /**
       * Rezultat uvoza iz PowerPointa (cela prezentacija posle `POST slajdovi/uvoz`): slajdovi po `rb`, izabran prvi slajd
       * čiji id ranije nije postojao. Id-jevi postojećih slajdova se ne menjaju, pa lokalno stanje čuvanja (izmene, nacrti
       * zamenjeni pravim id-jem) i dalje važi; slajd sa izmenom koja još nije na serveru zadržava lokalni sadržaj. Uvoz
       * kreće tek posle `sacuvajSve`, pa nacrta nema. Odgovor za drugu prezentaciju (u međuvremenu učitanu) se odbacuje.
       */
      primeniUvoz(p: PrezentacijaDetails): void {
        const sada = store.prezentacija();
        if (!sada || p.id !== prezentacijaId) return;
        const lokalni = new Map(store.slajdovi().map(s => [s.id, s]));
        const slajdovi = [...p.slajdovi]
          .sort((a, b) => a.rb - b.rb)
          .map((s, i) => {
            const l = lokalni.get(s.id);
            return { ...(l && naCekanju(s.id) ? l : s), rb: i + 1 };
          });
        patchState(store, { prezentacija: { ...p, slajdovi } });
        const prvi = slajdovi.find(s => !lokalni.has(s.id));
        if (prvi) izaberi(prvi.id);
      },

      /** Stabilan ključ slajda (isti pre i posle zamene id-ja nacrta) za `track`. */
      kljuc(id: number): number {
        return poreklo.get(id) ?? id;
      },

      /**
       * Editor platna predaje funkciju koja upisuje otvorenu sesiju teksta i gest, i proveru da li je nešto otvoreno.
       * Vraća odjavu koja briše SAMO ovu registraciju (stara instanca editora koja se uništava posle pravljenja nove ne
       * briše registraciju nove).
       */
      registrujPraznjenje(f: () => void, o: () => boolean = () => false): () => void {
        // otvoreno() ulazi u nesačuvano sesije: upozorenje pre zatvaranja kartice se odmah usklađuje
        const ova = { isprazni: f, otvoreno: o };
        praznjenje = ova;
        javi();
        return () => {
          if (praznjenje === ova) {
            praznjenje = null;
            javi();
          }
        };
      },

      /** Zove registrovano pražnjenje (store ga zove sam pre čuvanja; stranica pri zatvaranju kartice). */
      isprazni,

      /** Ima li izmena koje još nisu na serveru (uključujući neispravne nacrte i otvorenu sesiju editora platna). */
      imaNesacuvano(): boolean {
        return !!praznjenje?.otvoreno() || nesacuvani().length > 0 || nacrtiUSlanju.size > 0;
      },

      sacuvajPreIzlaska,

      /** Napušten editor: sesija se zatvara (ne otkazuje), odjavljuje se iz registra kad joj završe zahtevi. */
      _zatvoriSesiju(): void {
        napusten = true;
        sesija?.zatvori();
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store.sacuvajPreIzlaska();
      store._zatvoriSesiju();
    },
  }),
);
