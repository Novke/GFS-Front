// Stanje jedne instance editora platna (Ugovor 4): dokument, izbor, skriveni slojevi, tab, istorija i izlaz ka
// `EditorStore.izmeniPlatno`. Pruža ga komponenta editora (jedna instanca po slajdu), nije root. Pravila editora koja
// komande (F3) ne proveravaju su ovde: zaključan sloj (odluka 14) i granice broja slojeva, animacija i znakova (odluka 10),
// sa porukom kroz `NotificationStore`. Gest mišem (F5) menja dokument bez istorije dok traje i beleži se kao jedan korak
// na kraju. Sesija teksta (F12) je takođe jedan korak: aktivni uređivač (`KomandeTeksta`) predaje presek teksta pri
// izlasku, pre svake druge izmene (`primeni`) i pri pražnjenju. F14 (ćelije), F17 (animacije) i F18 (pregled) dodaju svoje
// metode u isti store.
import { computed, inject, signal } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { NotificationStore } from '../../../core/state/notification.store';
import type { Platno, Sloj } from '../data-access/platno.models';
import { prekoGranica } from '../data-access/platno-provera';
import {
  POMAK_KOPIJE, type SmerZ, dodajSloj, izmeniSlojeve, kopijeSlojeva, medjuspremnik, noviId, obrisiSlojeve, pomeriSlojeve,
  premestiSloj as premestiSlojKomanda, zOsa,
} from './komande';
import { Istorija, SAT_ISTORIJE } from './istorija';
import { preslikajAnimacije } from './tekst/kljucevi-pasusa';
import type { KomandeTeksta, RezultatTeksta } from './tekst/tekst-uredjivac.component';

export type TabPanela = 'SVOJSTVA' | 'SLOJEVI' | 'ANIMACIJE';
export type RezimEditora = 'UREDJIVANJE' | 'PREGLED';
export interface Uredjivanje { slojId: string; celija: { r: number; k: number } | null; }   // F12/F14

export interface PlatnoEditorState {
  platno: Platno;
  /** Id-jevi izabranih slojeva, redom izbora. */
  izbor: readonly string[];
  /** Skriveni samo u editoru (odluka 14; ne čuva se). */
  skriveni: readonly string[];
  tab: TabPanela;
  rezim: RezimEditora;                                                       // F18
  uredjivanje: Uredjivanje | null;                                           // F12
  izabranaCelija: { r: number; k: number } | null;                           // F14
  opsegCelija: { r1: number; k1: number; r2: number; k2: number } | null;    // F14
  izabranaAnimacija: string | null;                                          // F17
  mozeNazad: boolean;
  mozeNapred: boolean;
  /** Dokument na početku gesta mišem (F5); null = nema gesta. */
  gest: Platno | null;
}

/** Dokument pre `inicijalizuj` (prazan); nikad se ne predaje izlazu. */
const POCETNO_PLATNO: Platno = { verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi: [], animacije: [] };
/** Najviše znakova naziva sloja (code point-i, kao server). */
const MAX_NAZIV = 60;

export const PlatnoEditorStore = signalStore(
  withState<PlatnoEditorState>({
    platno: POCETNO_PLATNO,
    izbor: [], skriveni: [], tab: 'SVOJSTVA', rezim: 'UREDJIVANJE', uredjivanje: null, izabranaCelija: null,
    opsegCelija: null, izabranaAnimacija: null, mozeNazad: false, mozeNapred: false, gest: null,
  }),
  withComputed(({ platno, izbor, skriveni, uredjivanje }) => ({
    /** Izabrani slojevi redom z-ose (odozdo). */
    izabraniSlojevi: computed<Sloj[]>(() => {
      const ids = new Set(izbor());
      return platno().slojevi.filter((s) => ids.has(s.id));
    }),
    jedan: computed<Sloj | null>(() => (izbor().length === 1 ? platno().slojevi.find((s) => s.id === izbor()[0]) ?? null : null)),
    /** Ono što platno u editoru crta (odluka 11): bez animacija, bez skrivenih i bez sloja čiji se tekst upravo uređuje. */
    zaPrikaz: computed<Platno>(() => {
      const u = uredjivanje();
      const bez = new Set([...skriveni(), ...(u && !u.celija ? [u.slojId] : [])]);
      const p = platno();
      return { ...p, animacije: [], slojevi: bez.size ? p.slojevi.filter((s) => !bez.has(s.id)) : p.slojevi };
    }),
  })),
  withProps(() => ({
    /**
     * Izlaz ka `EditorStore.izmeniPlatno` i poslednji predat dokument: `isprazni` predaje samo ako se dokument promenio
     * od poslednje predaje (idempotentno: ponovljen Ctrl+S ne pravi nove korake ni PUT-ove).
     */
    _izlaz: { f: null as ((p: Platno) => void) | null, predato: POCETNO_PLATNO },
    _istorija: new Istorija(inject(SAT_ISTORIJE)),
    /** Aktivni uređivač teksta (F12); van stanja jer nosi funkcije i signal (stanje store-a se zamrzava). */
    _uredjivac: signal<KomandeTeksta | null>(null),
  })),
  withProps(({ _uredjivac }) => ({
    /** Aktivni uređivač teksta: panel teksta (F13) čita `aktivniUredjivac()?.stanje()` i zove njegove komande. */
    aktivniUredjivac: _uredjivac.asReadonly(),
  })),
  withMethods((store) => {
    const obavestenja = inject(NotificationStore);
    const zastavice = () => patchState(store, { mozeNazad: store._istorija.mozeNazad, mozeNapred: store._istorija.mozeNapred });
    /** Kraj sesije teksta bez preseka (sloj više ne postoji, nov dokument). */
    const zatvoriSesiju = () => {
      patchState(store, { uredjivanje: null });
      store._uredjivac.set(null);
    };
    /**
     * Nov dokument; izbor i skriveni bez slojeva kojih više nema (nov sloj sa istim id-jem ne nasleđuje skrivenost); sesija
     * teksta sloja koga više nema se zatvara.
     */
    const postavi = (p: Platno) => {
      const postoje = new Set(p.slojevi.map((s) => s.id));
      patchState(store, {
        platno: p,
        izbor: store.izbor().filter((id) => postoje.has(id)),
        skriveni: store.skriveni().filter((id) => postoje.has(id)),
      });
      const u = store.uredjivanje();
      if (u && !postoje.has(u.slojId)) zatvoriSesiju();
    };
    /** Sinhrona predaja izlazu (Ugovor 4); bez postavljenog izlaza dokument ostaje nepredat, pa ga `isprazni` preda. */
    const predaj = (p: Platno) => {
      const izlaz = store._izlaz;
      if (!izlaz.f || izlaz.predato === p) return;
      izlaz.predato = p;
      izlaz.f(p);
    };
    const postojeci = (ids: readonly string[]) => {
      const postoje = new Set(store.platno().slojevi.map((s) => s.id));
      return [...new Set(ids)].filter((id) => postoje.has(id));
    };

    /** Primena izmene: odbija preko granica (poruka), beleži stanje PRE izmene, javlja izlazu. */
    function primeniBezTeksta(f: (p: Platno) => Platno, kljuc?: string): boolean {
      if (store.gest()) return false;
      const pre = store.platno();
      const posle = f(pre);
      if (posle === pre) return false;
      const g = prekoGranica(posle);
      if (g) {
        obavestenja.greska(g);
        return false;
      }
      store._istorija.zabelezi(pre, kljuc);
      postavi(posle);
      zastavice();
      predaj(posle);
      return true;
    }

    /**
     * Tekst sesije u dokument (F12): presek aktivnog uređivača je jedan korak istorije i jedna predaja izlazu (zamena
     * pasusa sloja i animacije pasusa po ključevima); bez izmena ništa. Sesija se nastavlja. Vraća false kad tekst NIJE
     * u dokumentu (gest u toku ili odbijena izmena): tada se sesija ne sme zatvoriti, inače bi se tekst izgubio.
     */
    function zabeleziTekst(): boolean {
      const u = store.uredjivanje();
      const uredjivac = store._uredjivac();
      if (!u || u.celija || !uredjivac) return true; // ćelije tabele: F14
      // usred gesta izmena ne bi prošla: presek se ne uzima (tekst ostaje u uređivaču do sledećeg preseka)
      if (store.gest()) return false;
      const r: RezultatTeksta | null = uredjivac.presek();
      if (!r) return true;
      let uklonjeno = 0;
      const ok = primeniBezTeksta((p) => {
        const sa = izmeniSlojeve(p, new Set([u.slojId]), (s) => (s.tip === 'TEKST' ? { ...s, pasusi: r.pasusi } : s));
        if (sa === p) return p;
        const a = preslikajAnimacije(sa, u.slojId, r.mapa);
        uklonjeno = a.uklonjeno;
        return a.platno;
      });
      // odbijena izmena (granice, poruka) ne sme da pomeri osnovu preseka: tekst nije u dokumentu, pa ga sledeći presek daje
      if (!ok) {
        uredjivac.odbaciPresek();
        return false;
      }
      if (uklonjeno > 0) obavestenja.info(`Uklonjene animacije pasusa koji više ne postoje: ${uklonjeno}.`);
      return true;
    }

    /**
     * Kraj sesije teksta: presek je jedan korak (prazan rezultat: bez koraka), pa `uredjivanje` null. Kad presek nije
     * primljen (gest, granica), sesija ostaje otvorena i vraća se false: tekst se ne gubi, a pozivalac ne nastavlja kao da
     * je sesija zatvorena (nova sesija, ubacivanje, poništavanje).
     */
    function zavrsiUredjivanje(): boolean {
      if (!store.uredjivanje()) return true;
      if (!zabeleziTekst()) return false;
      zatvoriSesiju();
      return true;
    }

    /** Svaka izmena tokom sesije teksta prvo beleži tekst (redosled istorije: tekst, pa ta izmena). */
    function primeni(f: (p: Platno) => Platno, kljuc?: string): boolean {
      zabeleziTekst();
      return primeniBezTeksta(f, kljuc);
    }

    /**
     * Snimak iz istorije (poništi/ponovi); ne radi dok traje gest. Otvorena sesija teksta se prvo završava (tekst je
     * korak), pa poništi vraća upravo njega; unutar teksta Ctrl+Z je istorija uređivača (ProseMirror).
     */
    function vrati(snimak: (sada: Platno) => Platno | null): void {
      if (store.gest() || !zavrsiUredjivanje()) return;
      const p = snimak(store.platno());
      if (!p) return;
      postavi(p);
      zastavice();
      predaj(p);
    }

    const imaZakljucan = () => {
      if (!store.izabraniSlojevi().some((s) => s.zakljucan)) return false;
      obavestenja.greska('Sloj je zaključan.');
      return true;
    };
    const izabrani = () => new Set(store.izbor());

    /** Kopije slojeva na vrh (lepljenje, dupliranje), izabrane posle uspeha. */
    function dodajKopije(slojevi: readonly Sloj[]): void {
      // kopije menjaju izbor na druge slojeve: otvorena sesija teksta se prvo završava (kao ubaci)
      if (!slojevi.length || !zavrsiUredjivanje()) return;
      let nove: string[] = [];
      const ok = primeni((p) => {
        const r = kopijeSlojeva(p, slojevi, POMAK_KOPIJE);
        nove = r.ids;
        return r.platno;
      });
      if (ok) patchState(store, { izbor: nove });
    }

    /** Kraj gesta mišem (pointerup, pražnjenje): ceo gest je jedan korak istorije i jedna predaja (odluka 8). */
    function zavrsiGest(): void {
      const pocetak = store.gest();
      if (!pocetak) return;
      patchState(store, { gest: null });
      const kraj = store.platno();
      if (kraj === pocetak) return;
      store._istorija.zabelezi(pocetak);
      zastavice();
      predaj(kraj);
    }

    function isprazni(): void {
      // otvoren tekst (sesija ostaje otvorena) i gest u toku idu u dokument (pražnjenje pre čuvanja, Ugovor 5). Predaja
      // posle toga hvata i izmenu koja nije predata jer izlaz još nije bio postavljen (idempotentno).
      zabeleziTekst();
      zavrsiGest();
      predaj(store.platno());
    }

    return {
      /** Nov dokument (ovaj slajd): prazan izbor i istorija; izlaz se ne zove. */
      inicijalizuj(p: Platno): void {
        store._istorija.resetuj();
        store._izlaz.predato = p;
        patchState(store, { platno: p, izbor: [], mozeNazad: false, mozeNapred: false, gest: null });
        zatvoriSesiju();
      },
      postaviIzlaz(f: (p: Platno) => void): void {
        store._izlaz.f = f;
      },
      primeni,
      ponisti(): void {
        vrati((sada) => store._istorija.ponisti(sada));
      },
      ponovi(): void {
        vrati((sada) => store._istorija.ponovi(sada));
      },
      izaberi(ids: readonly string[]): void {
        patchState(store, { izbor: postojeci(ids) });
      },
      /** Shift+klik: dodaje ili uklanja sloj iz izbora. */
      prebaciIzbor(id: string): void {
        const izbor = store.izbor();
        if (izbor.includes(id)) patchState(store, { izbor: izbor.filter((x) => x !== id) });
        else patchState(store, { izbor: [...izbor, ...postojeci([id])] });
      },
      ponistiIzbor(): void {
        patchState(store, { izbor: [] });
      },
      /** Ctrl+A: vidljivi i otključani slojevi (zaključan, npr. pozadina, bira se klikom ili u panelu). */
      izaberiSve(): void {
        const skriveni = new Set(store.skriveni());
        patchState(store, {
          izbor: store.platno().slojevi.filter((s) => !s.zakljucan && !skriveni.has(s.id)).map((s) => s.id),
        });
      },
      obrisiIzabrane(): void {
        if (!store.izbor().length || imaZakljucan()) return;
        primeni((p) => obrisiSlojeve(p, izabrani()));
      },
      /** Duboka kopija izabranih u unutrašnji međuspremnik (odluka 15). */
      kopiraj(): void {
        const s = store.izabraniSlojevi();
        if (s.length) medjuspremnik.slojevi = structuredClone(s);
      },
      nalepi(): void {
        dodajKopije(medjuspremnik.slojevi);
      },
      duplirajIzabrane(): void {
        if (!store.izbor().length || imaZakljucan()) return;
        dodajKopije(store.izabraniSlojevi());
      },
      /** Zaključani se pomeraju po z-osi kao i ostali (odluka 14). */
      zOsaIzabranih(smer: SmerZ): void {
        if (store.izbor().length) primeni((p) => zOsa(p, izabrani(), smer));
      },
      /** Strelice: uzastopna pomeranja u roku od 1 s su jedan korak (ključ `strelice`). */
      pomeriIzabrane(dx: number, dy: number): void {
        if (!store.izbor().length || imaZakljucan()) return;
        primeni((p) => pomeriSlojeve(p, izabrani(), dx, dy), 'strelice');
      },
      premestiSloj(id: string, indeks: number): void {
        primeni((p) => premestiSlojKomanda(p, id, indeks));
      },
      zakljucaj(id: string, da: boolean): void {
        primeni((p) => izmeniSlojeve(p, new Set([id]), (s) => (s.zakljucan === da ? s : { ...s, zakljucan: da })));
      },
      /** Prazan naziv -> null (podrazumevani naziv), duži od 60 znakova se odseca. */
      preimenuj(id: string, naziv: string): void {
        const znaci = Array.from(naziv.trim());
        const novi = znaci.length ? znaci.slice(0, MAX_NAZIV).join('') : null;
        primeni((p) => izmeniSlojeve(p, new Set([id]), (s) => (s.naziv === novi ? s : { ...s, naziv: novi })));
      },
      /** Skrivanje samo u editoru: ne ide u istoriju ni izlaz; skriven sloj izlazi iz izbora. */
      prebaciSkriven(id: string): void {
        const skriveni = store.skriveni();
        if (skriveni.includes(id)) patchState(store, { skriveni: skriveni.filter((x) => x !== id) });
        else if (postojeci([id]).length) {
          patchState(store, { skriveni: [...skriveni, id], izbor: store.izbor().filter((x) => x !== id) });
        }
      },
      postaviTab(tab: TabPanela): void {
        patchState(store, { tab });
      },
      /**
       * Nov sloj na vrh sa novim `s<n>`, izabran; null kad bi prešao granice (poruka). Otvorena sesija teksta se prvo
       * završava (tekst je korak), kao u PowerPointu: ubacivanje iz trake, menija ili prevlačenjem izlazi iz teksta.
       */
      ubaci(napravi: (id: string, p: Platno) => Sloj): string | null {
        if (!zavrsiUredjivanje()) return null;
        let id = '';
        const ok = primeni((p) => {
          id = noviId(p, 's');
          return dodajSloj(p, napravi(id, p));
        });
        if (!ok) return null;
        patchState(store, { izbor: [id] });
        return id;
      },
      /** Početak gesta mišem (pomeranje, ručka, rotacija, kraj linije); drugi poziv usred gesta ne pomera početak. */
      pocniGest(): void {
        if (!store.gest()) patchState(store, { gest: store.platno() });
      },
      /**
       * Tokom gesta dokument se menja bez istorije i bez izlaza (čuvanje i istorija tek na kraju); `f` uvek dobija
       * dokument sa POČETKA gesta, pa se pomeraji ne sabiraju. Bez gesta ne radi ništa.
       */
      azurirajGest(f: (pocetak: Platno) => Platno): void {
        const pocetak = store.gest();
        if (pocetak) patchState(store, { platno: f(pocetak) });
      },
      zavrsiGest,
      /** Esc ili `pointercancel` usred gesta: vraća početak, bez koraka u istoriji i bez izlaza; izbor ostaje. */
      prekiniGest(): void {
        const pocetak = store.gest();
        if (pocetak) patchState(store, { platno: pocetak, gest: null });
      },
      /**
       * True i poruka "Sloj je zaključan." kad je u izboru zaključan sloj: isto pravilo i ista poruka kao za strelice,
       * brisanje i dupliranje (overlay ga zove jednom po pritisku, kad prevlačenje pređe prag).
       */
      zakljucanUIzboru(): boolean {
        return imaZakljucan();
      },
      /**
       * Uređivanje teksta sloja (F12; ćelija tabele: F14): dvoklik, Enter/F2, dugme "Tekst". Zaključan sloj -> poruka i
       * false; ne-TEKST (bez ćelije), nepostojeći sloj ili gest u toku -> false. Prethodna sesija se završava; sloj postaje
       * jedini izabran, a panel prelazi na Svojstva (Slojevi i Animacije su zaključani dok traje uređivanje).
       */
      pocniUredjivanje(slojId: string, celija?: { r: number; k: number }): boolean {
        if (store.gest() || store.rezim() !== 'UREDJIVANJE') return false;
        const s = store.platno().slojevi.find((x) => x.id === slojId);
        if (!s || (celija ? s.tip !== 'TABELA' : s.tip !== 'TEKST')) return false;
        if (s.zakljucan) {
          obavestenja.greska('Sloj je zaključan.');
          return false;
        }
        const u = store.uredjivanje();
        if (u && u.slojId === slojId && u.celija?.r === celija?.r && u.celija?.k === celija?.k) return true;
        if (!zavrsiUredjivanje()) return false;
        patchState(store, { uredjivanje: { slojId, celija: celija ? { ...celija } : null }, izbor: [slojId], tab: 'SVOJSTVA' });
        return true;
      },
      /** Aktivni uređivač (komponenta ga registruje pri pravljenju); store ga sam briše na kraju sesije. */
      registrujUredjivac(k: KomandeTeksta | null): void {
        store._uredjivac.set(k);
      },
      zabeleziTekst,
      zavrsiUredjivanje,
      /** Da li je nešto otvoreno (gest F5, sesija teksta F12): `EditorStore.imaNesacuvano` ga uključuje. */
      imaOtvoreno(): boolean {
        return store.gest() !== null || store.uredjivanje() !== null;
      },
      isprazni,
    };
  }),
  withHooks({
    // instanca nestaje (promena slajda): otvoreno se upisuje i predaje pre nestanka (Ugovor 4); idempotentno, pa ne smeta
    // ako je komponenta već ispraznila u svom ngOnDestroy
    onDestroy(store) {
      // gest prvo, pa tekst (tekst usred gesta se ne bi primio)
      store.zavrsiGest();
      store.zavrsiUredjivanje();
      store.isprazni();
      // posle završnog pražnjenja izlaz se gasi: kasniji (async) put ne sme da upiše u slajd koji se više ne uređuje
      store._izlaz.f = null;
    },
  }),
);

export type PlatnoEditorStore = InstanceType<typeof PlatnoEditorStore>;
