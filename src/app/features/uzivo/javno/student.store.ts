import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Subscription } from 'rxjs';
import { razlogGreske } from '../data-access/razlog-greske';
import { ServerskiSat } from '../data-access/sat';
import { STOMP_FABRIKA } from '../data-access/stomp';
import {
  JavnoIzvodjenjeInfo, JavnoPitanje, JavnoStanje, LicnoStanje, OdgovorCmd, PocetnoStanje, UcesnikInfo,
} from '../data-access/uzivo.models';
import { decimalni } from '../ui/format';
import { JavnoApi } from './javno.api';

export type FazaStudenta = 'kod' | 'ime' | 'uzivo' | 'kraj' | 'izbacen' | 'greska';
export type Veza = 'povezivanje' | 'povezan' | 'prekinut';

export interface StudentState {
  faza: FazaStudenta;
  kod: string | null;
  info: JavnoIzvodjenjeInfo | null;
  ucesnik: UcesnikInfo | null;
  javno: JavnoStanje | null;
  licno: LicnoStanje | null;
  veza: Veza;
  /** Runda za koju je odgovor poslat (zaključava unos odmah, pre potvrde servera). */
  poslato: number | null;
  /** Runda u kojoj server više ne prima odgovor ("Pitanje je zatvoreno.", "Vreme je isteklo."). */
  zakljucano: number | null;
  greska: string | null;
  /** Prijava imenom čeka odgovor servera. */
  salje: boolean;
}

/**
 * Šta telefon prikazuje u fazi `uzivo` (i `kraj`): izvedeno iz javnog i ličnog stanja. Rang-lista se crta preko
 * ovoga u stranici (osim dok student unosi odgovor).
 */
export type EkranStudenta =
  | 'povezivanje' | 'cekamo' | 'tabla' | 'stize' | 'unos' | 'primljen' | 'isteklo' | 'tacan' | 'kraj';

export interface TacanOdgovor {
  /** Tačne opcije: `indeks` je mesto u listi opcija (oblik i slovo), tekst kad je poznat. */
  opcije: { indeks: number; tekst: string | null }[];
  /** Broj sa jedinicom ili prihvatljivi tekstovi. */
  tekst: string | null;
}

/** Koliko dugo stoji poruka greške sa servera. */
export const GRESKA_TRAJANJE_MS = 4000;
/** Poslat odgovor bez potvrde servera ovoliko dugo (dok je veza otvorena) smatra se izgubljenim. */
export const POTVRDA_MS = 8000;
/** Najviše jedna provera prijave (`GET ja`) posle neuspelog povezivanja u ovom razmaku (limit javnih putanja). */
const PROVERA_RAZMAK_MS = 10_000;

const PORUKA_KOD = 'Kod ima 6 cifara.';
const PORUKA_IME = 'Ime mora imati od 1 do 40 znakova.';
const PORUKA_NIJE_STIGAO = 'Odgovor nije stigao. Pošalji ponovo.';
/** Greške posle kojih server u ovoj rundi više ne prima odgovor. */
const ZAKLJUCAVAJU = new Set(['Pitanje je zatvoreno.', 'Vreme je isteklo.']);
const VEC_ODGOVORIO = 'Već si odgovorio.';
const NIJE_PRIJAVLJEN = 'Nisi prijavljen na ovo izvođenje.';
const ZAVRSENO = 'Izvođenje je završeno.';

const POCETNO: StudentState = {
  faza: 'kod', kod: null, info: null, ucesnik: null, javno: null, licno: null, veza: 'povezivanje',
  poslato: null, zakljucano: null, greska: null, salje: false,
};

const BEZ_UCESNIKA: Partial<StudentState> = {
  ucesnik: null, javno: null, licno: null, veza: 'povezivanje', poslato: null, zakljucano: null,
};

/** Ime kao na serveru: kontrolni znaci u razmak, razmaci skraćeni. */
export function srediIme(ime: string): string {
  return ime.replace(/\p{Cc}/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** Pitanje trenutnog slajda (null van slajda-pitanja). */
export function trenutnoPitanje(javno: JavnoStanje | null): JavnoPitanje | null {
  return javno?.prikaz === 'SLAJD' && javno.slajdTip === 'PITANJE' ? javno.pitanje : null;
}

/** Da li je server primio odgovor ovog učesnika u rundi `rundaId`. */
export function primljenU(licno: LicnoStanje | null, rundaId: number | null): boolean {
  return rundaId !== null && licno?.odgovor?.rundaId === rundaId && licno.odgovor.primljen;
}

function tacanPrikazan(p: JavnoPitanje, licno: LicnoStanje | null): boolean {
  return p.tacneOpcije !== null || p.tacanBroj !== null || p.prihvatljiviOdgovori !== null
    || (licno?.odgovor?.rundaId === p.rundaId && licno?.odgovor?.tacno != null);
}

export function ekranStudenta(s: Pick<StudentState, 'faza' | 'javno' | 'licno' | 'poslato' | 'zakljucano'>): EkranStudenta {
  const j = s.javno;
  if (s.faza === 'kraj' || j?.status === 'ZAVRSENO' || j?.prikaz === 'KRAJ') return 'kraj';
  if (!j) return 'povezivanje';
  if (j.prikaz === 'PRIJAVA') return 'cekamo';
  const p = trenutnoPitanje(j);
  if (!p) return 'tabla';
  if (p.faza === 'CEKA' || p.rundaId === null) return 'stize';
  const odgovoreno = primljenU(s.licno, p.rundaId) || s.poslato === p.rundaId;
  if (p.faza === 'ZATVORENO' && tacanPrikazan(p, s.licno)) return 'tacan';
  if (odgovoreno) return 'primljen';
  if (p.faza === 'ZATVORENO' || s.zakljucano === p.rundaId) return 'isteklo';
  return 'unos';
}

/** Tačan odgovor posle `C` (null dok nije prikazan ili kad ga pitanje nema, npr. anketa i skala). */
export function tacanOdgovor(p: JavnoPitanje): TacanOdgovor | null {
  if (p.tacneOpcije) {
    const opcije = p.opcije ?? [];
    return {
      opcije: p.tacneOpcije
        .map(id => opcije.findIndex(o => o.id === id))
        .filter(i => i >= 0)
        .map(i => ({ indeks: i, tekst: opcije[i].tekst ?? (p.tip === 'TACNO_NETACNO' ? (i === 0 ? 'Tačno' : 'Netačno') : null) })),
      tekst: null,
    };
  }
  if (p.tacanBroj !== null) {
    return { opcije: [], tekst: decimalni(p.tacanBroj) + (p.jedinica ? ' ' + p.jedinica : '') };
  }
  if (p.prihvatljiviOdgovori?.length) {
    return { opcije: [], tekst: p.prihvatljiviOdgovori.join(', ') };
  }
  return null;
}

const je404 = (e: unknown) => e instanceof HttpErrorResponse && e.status === 404;

/**
 * Stanje studenta na javnim stranicama (`uzivo/:kod`; jedna instanca po stranici, `providers: [StudentStore]`).
 * Sme da zove samo `api/public/uzivo/*` (kroz {@link JavnoApi}) i `api/public/ws`.
 *
 * - `otvori(kod)`: `info` (naziv), pa `ja` -> kolačić važi: STOMP i faza `uzivo`; 404: faza `ime`.
 * - STOMP: `/topic/izvodjenja/{id}/javno`, `/user/queue/licno`, `/user/queue/greske` i `/app/izvodjenja/{id}/pocetno`
 *   (snimak odmah, i posle svakog ponovnog povezivanja, jer `watch` ponovo pretplaćuje). Starija verzija se odbacuje.
 * - `odgovori`: `poslato` odmah (dugmad zaključana), poruka kroz STOMP (RxStomp je čuva dok veza ne proradi). Potvrda je
 *   `licno.odgovor.primljen` za tu rundu; ako je nema `POTVRDA_MS` dok je veza otvorena, unos se otključava.
 * - Rukovanje odbijeno (zatvoreno pre otvaranja): `GET ja`; 404 -> kolačić više ne važi (izbačen, istekao, kraj), pa
 *   `otvori` iznova (ime ili greška).
 */
export const StudentStore = signalStore(
  withState<StudentState>(POCETNO),
  withProps(() => ({
    _sat: new ServerskiSat(),
    /** Prvo viđeno preostalo vreme po rundi (pun krug tajmera; telefon ne zna trajanje pitanja). */
    _prvoPreostalo: new Map<number, number>(),
  })),
  withComputed(store => {
    const pitanje = computed(() => trenutnoPitanje(store.javno()));
    const ekran = computed(() => ekranStudenta({
      faza: store.faza(), javno: store.javno(), licno: store.licno(), poslato: store.poslato(), zakljucano: store.zakljucano(),
    }));
    return {
      sat: computed(() => store._sat),
      pitanje,
      ekran,
      unosZakljucan: computed(() => ekran() !== 'unos'),
      primljen: computed(() => primljenU(store.licno(), pitanje()?.rundaId ?? null)),
      tacan: computed(() => {
        const p = pitanje();
        return p && ekran() === 'tacan' ? tacanOdgovor(p) : null;
      }),
      /** Lični ishod trenutne runde posle `C` (null dok nije prikazan). */
      ishod: computed(() => {
        const p = pitanje();
        const o = store.licno()?.odgovor;
        if (!p || ekran() !== 'tacan') return null;
        if (!o || o.rundaId !== p.rundaId || !o.primljen) return { odgovorio: false, tacno: null, poeni: null };
        return { odgovorio: true, tacno: o.tacno, poeni: o.poeni };
      }),
      ukupnoMs: computed(() => {
        const p = pitanje();
        if (!p || p.rundaId === null || p.faza !== 'OTVORENO') return null;
        const preostalo = p.preostaloMs ?? (p.rokMs !== null ? store._sat.preostalo(p.rokMs) : null);
        if (preostalo === null) return null;
        if (!store._prvoPreostalo.has(p.rundaId)) store._prvoPreostalo.set(p.rundaId, preostalo);
        return store._prvoPreostalo.get(p.rundaId)!;
      }),
    };
  }),
  withMethods(store => {
    const api = inject(JavnoApi);
    const fabrika = inject(STOMP_FABRIKA);

    let stomp: RxStomp | null = null;
    let veza = new Subscription();
    let zahtevi = new Subscription();
    let greskaTajmer: ReturnType<typeof setTimeout> | undefined;
    let potvrdaTajmer: ReturnType<typeof setTimeout> | undefined;
    /** Runda poslatog odgovora koji server još nije potvrdio. */
    let cekaPotvrdu: number | null = null;
    let poslednjaProvera = -Infinity;

    function postaviGresku(poruka: string | null, trajanjeMs?: number): void {
      clearTimeout(greskaTajmer);
      patchState(store, { greska: poruka });
      if (poruka && trajanjeMs) {
        greskaTajmer = setTimeout(() => patchState(store, { greska: null }), trajanjeMs);
      }
    }

    function zatvoriVezu(): void {
      veza.unsubscribe();
      veza = new Subscription();
      clearTimeout(potvrdaTajmer);
      cekaPotvrdu = null;
      void stomp?.deactivate();
      stomp = null;
    }

    function novZahtev(): Subscription {
      zahtevi.unsubscribe();
      zahtevi = new Subscription();
      return zahtevi;
    }

    function fazaGreska(e: unknown, podrazumevano: string): void {
      zatvoriVezu();
      patchState(store, { faza: 'greska', ...BEZ_UCESNIKA });
      postaviGresku(razlogGreske(e, podrazumevano));
    }

    function naIme(poruka: string | null = null): void {
      zatvoriVezu();
      patchState(store, { faza: 'ime', ...BEZ_UCESNIKA, salje: false });
      postaviGresku(poruka);
    }

    function zavrsi(faza: 'kraj' | 'izbacen'): void {
      zatvoriVezu();
      patchState(store, { faza });
      postaviGresku(null); // zaostala poruka (npr. "Vreme je isteklo.") ne visi na ekranu kraja
    }

    /** Odgovor bez potvrde: rok teče samo dok je veza otvorena (poruka u redu RxStomp-a čeka vezu). */
    function pratiPotvrdu(): void {
      clearTimeout(potvrdaTajmer);
      const r = cekaPotvrdu;
      if (r === null || store.veza() !== 'povezan') return;
      potvrdaTajmer = setTimeout(() => {
        if (cekaPotvrdu !== r || store.poslato() !== r || primljenU(store.licno(), r)) return;
        cekaPotvrdu = null;
        patchState(store, { poslato: null });
        if (store.pitanje()?.rundaId === r && store.pitanje()?.faza === 'OTVORENO') {
          postaviGresku(PORUKA_NIJE_STIGAO, GRESKA_TRAJANJE_MS);
        }
      }, POTVRDA_MS);
    }

    function potvrdi(): void {
      cekaPotvrdu = null;
      clearTimeout(potvrdaTajmer);
    }

    function prihvatiJavno(j: JavnoStanje): void {
      if (store.faza() !== 'uzivo') return;
      const u = store.ucesnik();
      if (u && j.izvodjenjeId !== u.izvodjenjeId) return;
      const t = store.javno();
      if (t && j.verzija < t.verzija) return;
      store._sat.azuriraj(j.serverVremeMs);
      patchState(store, { javno: j });
      if (j.status === 'ZAVRSENO') zavrsi('kraj');
    }

    function prihvatiLicno(l: LicnoStanje): void {
      if (store.faza() !== 'uzivo') return;
      const u = store.ucesnik();
      if (u && l.ucesnikId !== u.ucesnikId) return;
      const t = store.licno();
      if (t && l.verzija < t.verzija) return;
      patchState(store, { licno: l });
      if (cekaPotvrdu !== null && primljenU(l, cekaPotvrdu)) potvrdi();
      if (l.izbacen) zavrsi('izbacen');
    }

    function greskaServera(poruka: string): void {
      if (store.faza() !== 'uzivo') return;
      if (poruka === NIJE_PRIJAVLJEN) {
        naIme(poruka);
        return;
      }
      if (poruka === ZAVRSENO) {
        zavrsi('kraj');
        return;
      }
      const runda = store.poslato() ?? store.pitanje()?.rundaId ?? null;
      if (poruka === VEC_ODGOVORIO) {
        // server već ima odgovor za ovu rundu: ostaje zaključano
        potvrdi();
        patchState(store, { poslato: runda });
      } else if (ZAKLJUCAVAJU.has(poruka)) {
        potvrdi();
        patchState(store, { poslato: null, zakljucano: runda });
      } else {
        // greška provere (npr. "Unesi broj."): student ispravlja i šalje ponovo
        potvrdi();
        patchState(store, { poslato: null });
      }
      postaviGresku(poruka, GRESKA_TRAJANJE_MS);
    }

    function procitaj<T>(telo: string, dalje: (t: T) => void): void {
      let t: T;
      try {
        t = JSON.parse(telo) as T;
      } catch {
        return; // neispravna poruka se preskače; sledeći snimak je ionako ceo
      }
      dalje(t);
    }

    /** Rukovanje odbijeno: da li kolačić još važi? 404 -> ispočetka (ime ili greška); ostalo je mreža, veza pokušava sama. */
    function proveriPrijavu(): void {
      const kod = store.kod();
      const sada = Date.now();
      if (!kod || sada - poslednjaProvera < PROVERA_RAZMAK_MS) return;
      poslednjaProvera = sada;
      zahtevi.add(api.ja(kod).subscribe({
        error: e => {
          if (je404(e) && store.faza() === 'uzivo') otvori(kod);
        },
      }));
    }

    function povezi(id: number): void {
      zatvoriVezu();
      const s = fabrika('api/public/ws');
      stomp = s;
      let biloPovezano = false;
      let pokusaj = false;
      let otvoreno = false;
      veza.add(s.connectionState$.subscribe(st => {
        if (st === RxStompState.OPEN) {
          biloPovezano = otvoreno = true;
          patchState(store, { veza: 'povezan' });
          pratiPotvrdu();
          return;
        }
        patchState(store, { veza: biloPovezano ? 'prekinut' : 'povezivanje' });
        if (st === RxStompState.CONNECTING) {
          pokusaj = true;
          otvoreno = false;
        } else if (st === RxStompState.CLOSED) {
          clearTimeout(potvrdaTajmer);
          if (pokusaj && !otvoreno) proveriPrijavu();
          pokusaj = false;
        }
      }));
      veza.add(s.watch(`/topic/izvodjenja/${id}/javno`).subscribe(m => procitaj(m.body, prihvatiJavno)));
      veza.add(s.watch('/user/queue/licno').subscribe(m => procitaj(m.body, prihvatiLicno)));
      veza.add(s.watch('/user/queue/greske').subscribe(m => procitaj<{ poruka?: unknown }>(m.body, g => {
        if (typeof g?.poruka === 'string') greskaServera(g.poruka);
      })));
      veza.add(s.watch(`/app/izvodjenja/${id}/pocetno`).subscribe(m => procitaj<PocetnoStanje>(m.body, p => {
        if (p?.javno) prihvatiJavno(p.javno);
        if (p?.licno) prihvatiLicno(p.licno);
      })));
    }

    function udji(u: UcesnikInfo): void {
      patchState(store, { ...BEZ_UCESNIKA, faza: 'uzivo', ucesnik: u, salje: false });
      postaviGresku(null);
      povezi(u.izvodjenjeId);
    }

    function otvori(kod: string): void {
      zatvoriVezu();
      clearTimeout(greskaTajmer);
      patchState(store, { ...POCETNO, kod });
      if (!/^\d{6}$/.test(kod)) {
        patchState(store, { faza: 'greska', greska: PORUKA_KOD });
        return;
      }
      const z = novZahtev();
      z.add(api.info(kod).subscribe({
        next: info => {
          patchState(store, { info });
          z.add(api.ja(kod).subscribe({
            next: udji,
            error: e => (je404(e) ? naIme() : fazaGreska(e, 'Prijava nije proverena. Pokušaj ponovo.')),
          }));
        },
        error: e => fazaGreska(e, 'Izvođenje nije učitano. Pokušaj ponovo.'),
      }));
    }

    return {
      otvori,
      prihvatiJavno,
      prihvatiLicno,

      prijavi(ime: string): void {
        const kod = store.kod();
        if (!kod || store.faza() !== 'ime' || store.salje()) return;
        const cisto = srediIme(ime);
        if (cisto.length < 1 || cisto.length > 40) {
          postaviGresku(PORUKA_IME);
          return;
        }
        patchState(store, { salje: true });
        postaviGresku(null);
        novZahtev().add(api.prijava(kod, cisto).subscribe({
          next: udji,
          error: e => {
            patchState(store, { salje: false });
            if (je404(e)) fazaGreska(e, 'Izvođenje sa ovim kodom ne postoji ili je završeno.');
            else postaviGresku(razlogGreske(e, 'Prijava nije uspela. Pokušaj ponovo.'));
          },
        }));
      },

      odgovori(cmd: OdgovorCmd): void {
        const p = store.pitanje();
        const u = store.ucesnik();
        if (!stomp || !u || !p || cmd.rundaId !== p.rundaId || store.unosZakljucan()) return;
        patchState(store, { poslato: cmd.rundaId });
        postaviGresku(null);
        cekaPotvrdu = cmd.rundaId;
        stomp.publish({ destination: `/app/izvodjenja/${u.izvodjenjeId}/odgovor`, body: JSON.stringify(cmd) });
        pratiPotvrdu();
      },

      /** Posle izbacivanja: novo ime (isti kod, naziv ostaje). */
      ponovoUdji(): void {
        naIme();
      },

      /** Zatvara STOMP vezu, zahteve i tajmere (zove se i iz `onDestroy`). */
      destroy(): void {
        zatvoriVezu();
        zahtevi.unsubscribe();
        clearTimeout(greskaTajmer);
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store.destroy();
    },
  }),
);
