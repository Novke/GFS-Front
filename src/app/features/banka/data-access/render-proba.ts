import { HttpErrorResponse } from '@angular/common/http';
import {
  catchError, concat, defer, distinctUntilChanged, EMPTY, forkJoin, map, merge, Observable, of, scan, shareReplay, switchMap, timer,
  withLatestFrom,
} from 'rxjs';

import type { BankaApi } from './banka.api';
import type { RenderDeo, RenderGreskaInfo, RenderProbaCmd, RenderProbaInfo } from './banka.models';
import { razlogBanke, TIHO } from './greske';

/** Mir u kucanju posle kog editor traži pregled (`render-proba`). */
export const KASNJENJE_PREGLEDA = 800;

/**
 * Stanje živog pregleda: `prazno` (nema teksta), `ceka` (sadržaj se promenio, render još nije stigao), `ok`, `greska`
 * (LaTeX greška sa linijom i delom, ili odbijen sadržaj bez linije, npr. zabranjena komanda), `zauzet` (429: sve probe su
 * zauzete, prolazno) i `nedostupan` (render servis ne radi, istek ili nema veze: 503, 504, 0).
 */
export type StanjePregleda = 'prazno' | 'ceka' | 'ok' | 'greska' | 'zauzet' | 'nedostupan';

export interface Pregled {
  stanje: StanjePregleda;
  /** SVG zadatka (tekst sa našeg servera); dok je `ceka`, poslednji prikazan; uz grešku u rešenju SVG zadatka. */
  svg: string | null;
  resenjeSvg: string | null;
  greska: RenderGreskaInfo | null;
  /** Deo sa LaTeX greškom; `null` kad se ne zna (odbijen sadržaj). */
  deo: RenderDeo | null;
}

/**
 * Sačuvan render varijante koji važi za trenutni sadržaj forme (isti ulaz rendera kao sačuvani): SVG-ovi uspelog rendera
 * (`svgId`, `resenjeSvgId`) ili `'greska'` (grešku prikazuje sačuvana varijanta, pregled ostaje bez SVG-a). Tada nema
 * render-probe.
 */
export type SacuvanRender = { svgId: string; resenjeSvgId: string | null } | 'greska';

/** Jedan sadržaj za pregled: komanda probe i, dok je sadržaj isti kao sačuvani, sačuvan render. */
export interface SadrzajPregleda {
  cmd: RenderProbaCmd;
  sacuvan: SacuvanRender | null;
}

/** Pregled pre prvog sadržaja (početna vrednost za `toSignal`). */
export const PRAZAN_PREGLED: Pregled = { stanje: 'prazno', svg: null, resenjeSvg: null, greska: null, deo: null };

/** Korak stanja: novo stanje iz prethodnog (`scan`). */
type Korak = (prethodno: Pregled) => Pregled;

/** Ključ sadržaja: isti tekst, rešenje, predmet, prilozi i sačuvan render su isti pregled. */
const kljuc = (s: SadrzajPregleda | null) => (s === null ? null : JSON.stringify(s));

/** Uz grešku u rešenju zadatak se preveo: njegov SVG iz odgovora, a kad ga odgovor nema, poslednji prikazan. */
function izOdgovora(r: RenderProbaInfo): Korak {
  if (r.ok) {
    return () => ({ stanje: 'ok', svg: r.svg, resenjeSvg: r.resenjeSvg, greska: null, deo: null });
  }
  const greska = r.greska ?? { linija: null, poruka: 'Render nije uspeo.' };
  const deo = r.deo ?? null;
  return p => ({ stanje: 'greska', svg: deo === 'resenje' ? (r.svg ?? p.svg) : null, resenjeSvg: null, greska, deo });
}

/** 429 (zauzet), 503, 504 i 0 (ne radi, istek, nema veze) su prolazni; ostalo (400 zabranjena komanda, loš prilog) je greška sadržaja. */
function izGreske(e: unknown): Pregled {
  if (e instanceof HttpErrorResponse && e.status === 429) {
    return { ...PRAZAN_PREGLED, stanje: 'zauzet' };
  }
  if (e instanceof HttpErrorResponse && (e.status === 503 || e.status === 504 || e.status === 0)) {
    return { ...PRAZAN_PREGLED, stanje: 'nedostupan' };
  }
  return { ...PRAZAN_PREGLED, stanje: 'greska', greska: { linija: null, poruka: razlogBanke(e) } };
}

/**
 * Živi pregled editora varijante: za svaki nov sadržaj (`izvor$`; `null` = nema teksta) odmah `ceka` (sa poslednjim SVG-om),
 * pa posle {@link KASNJENJE_PREGLEDA} ms mira `render-proba` (tiho: greške su stanje, nikad snackbar ni izuzetak u toku).
 * Isti sadržaj (po JSON ključu) se ne traži ponovo; nov sadržaj otkazuje i čekanje i zahtev u letu (`switchMap` nad
 * `timer`, što je debounce koji ne pušta stari odgovor posle novog stanja). Sadržaj sa sačuvanim renderom (`sacuvan`:
 * otvorena varijanta, dok je ista kao sačuvana) ne troši probu: uspeo render se odmah prikazuje iz sačuvanih SVG-ova
 * (`BankaApi.svg`; ako se ne učitaju, ipak proba), a neuspeo ostaje bez SVG-a (grešku daje sačuvana varijanta). `odmah$`
 * (Ctrl+Enter) renderuje trenutni sadržaj probom bez čekanja, i kad se nije promenio (npr. posle `nedostupan`).
 */
export function pregledUzivo(izvor$: Observable<SadrzajPregleda | null>, api: BankaApi, odmah$: Observable<unknown> = EMPTY): Observable<Pregled> {
  const sadrzaj$ = izvor$.pipe(shareReplay({ bufferSize: 1, refCount: true }));
  const zahtevi$ = merge(
    sadrzaj$.pipe(
      distinctUntilChanged((a, b) => kljuc(a) === kljuc(b)),
      map(s => ({ s, odmah: false })),
    ),
    odmah$.pipe(
      withLatestFrom(sadrzaj$),
      map(([, s]) => ({ s, odmah: true })),
    ),
  );
  const ceka: Korak = p => ({ ...p, stanje: 'ceka', greska: null, deo: null });
  return zahtevi$.pipe(
    switchMap(({ s, odmah }): Observable<Korak> => {
      if (s === null) {
        return of(() => PRAZAN_PREGLED);
      }
      const proba$ = defer(() => api.renderProba(s.cmd, TIHO)).pipe(
        map(izOdgovora),
        catchError((e: unknown) => of<Korak>(() => izGreske(e))),
      );
      if (odmah) {
        return concat(of(ceka), proba$);
      }
      if (s.sacuvan === 'greska') {
        return of(() => PRAZAN_PREGLED);
      }
      if (s.sacuvan) {
        const { svgId, resenjeSvgId } = s.sacuvan;
        return forkJoin({ svg: api.svg(svgId, TIHO), resenjeSvg: resenjeSvgId ? api.svg(resenjeSvgId, TIHO) : of(null) }).pipe(
          map(r => (): Pregled => ({ stanje: 'ok', svg: r.svg, resenjeSvg: r.resenjeSvg, greska: null, deo: null })),
          catchError(() => proba$),
        );
      }
      return concat(of(ceka), timer(KASNJENJE_PREGLEDA).pipe(switchMap(() => proba$)));
    }),
    scan((prethodno: Pregled, korak: Korak) => korak(prethodno), PRAZAN_PREGLED),
  );
}

// ------------------------------------------------------------------------------------------------ paneli pregleda

/** LaTeX greška koja važi za trenutni sadržaj i deo u kome je (`null` = ne zna se, prikazuje se uz zadatak). */
export interface GreskaDela {
  greska: RenderGreskaInfo;
  deo: RenderDeo | null;
}

/** Ulaz jednog `app-svg-pregled`: stanje, SVG, greška i, za `prazno`, razlog (`null` = podrazumevana poruka). */
export interface Panel {
  stanje: StanjePregleda;
  svg: string | null;
  greska: RenderGreskaInfo | null;
  prazno: string | null;
}

const panel = (stanje: StanjePregleda, svg: string | null = null, greska: RenderGreskaInfo | null = null, prazno: string | null = null): Panel =>
  ({ stanje, svg, greska, prazno });

/**
 * Greška za istaknutu liniju i panele: živog pregleda kad je stigao (`ok` je briše); dok ne stigne (`ceka`, `nedostupan`)
 * greška sačuvanog rendera, koju stranica daje samo dok je sadržaj isti kao sačuvani.
 */
export function vazecaGreska(p: Pregled, sacuvana: GreskaDela | null): GreskaDela | null {
  if (p.stanje === 'greska') {
    return { greska: p.greska ?? { linija: null, poruka: 'Render nije uspeo.' }, deo: p.deo };
  }
  return p.stanje === 'ok' ? null : sacuvana;
}

/** Panel zadatka: greška u tekstu (ili nepoznatog dela) je njegova; uz grešku u rešenju ostaje SVG zadatka ako ga ima. */
export function panelZadatka(p: Pregled, g: GreskaDela | null): Panel {
  if (g && g.deo !== 'resenje') {
    return panel('greska', null, g.greska);
  }
  if (g) {
    return p.svg ? panel(p.stanje === 'greska' ? 'ok' : p.stanje, p.svg) : panel('prazno', null, null, 'Zadatak se prikazuje kad se ispravi greška u rešenju.');
  }
  return panel(p.stanje, p.svg, p.stanje === 'greska' ? p.greska : null);
}

/** Panel rešenja: prazan bez rešenja ili bez teksta zadatka (proba traži tekst); greška samo kad je u rešenju. */
export function panelResenja(p: Pregled, g: GreskaDela | null, imaTekst: boolean, imaResenje: boolean): Panel {
  if (!imaResenje) {
    return panel('prazno', null, null, 'Rešenje nije uneto.');
  }
  if (!imaTekst) {
    return panel('prazno', null, null, 'Pregled rešenja stiže kad zadatak ima tekst.');
  }
  if (g?.deo === 'resenje') {
    return panel('greska', null, g.greska);
  }
  if (g) {
    return p.resenjeSvg ? panel(p.stanje === 'greska' ? 'ok' : p.stanje, p.resenjeSvg) : panel('prazno', null, null, 'Rešenje se prikazuje kad se ispravi greška u zadatku.');
  }
  return p.stanje === 'ok' && !p.resenjeSvg ? panel('prazno', null, null, 'Rešenje nije uneto.') : panel(p.stanje, p.resenjeSvg);
}
