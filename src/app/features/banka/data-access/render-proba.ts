import { HttpErrorResponse } from '@angular/common/http';
import {
  catchError, concat, defer, distinctUntilChanged, EMPTY, map, merge, Observable, of, scan, shareReplay, switchMap, timer, withLatestFrom,
} from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import type { BankaApi } from './banka.api';
import type { RenderDeo, RenderGreskaInfo, RenderProbaCmd, RenderProbaInfo } from './banka.models';

/** Mir u kucanju posle kog editor traži pregled (`render-proba`). */
export const KASNJENJE_PREGLEDA = 800;

/**
 * Stanje živog pregleda: `prazno` (nema teksta), `ceka` (sadržaj se promenio, render još nije stigao), `ok`, `greska`
 * (LaTeX greška sa linijom i delom, ili odbijen sadržaj bez linije, npr. zabranjena komanda) i `nedostupan` (render servis
 * ne radi ili je zauzet: 429, 503, bez veze).
 */
export type StanjePregleda = 'prazno' | 'ceka' | 'ok' | 'greska' | 'nedostupan';

export interface Pregled {
  stanje: StanjePregleda;
  /** SVG zadatka (tekst sa našeg servera); dok je `ceka`, poslednji prikazan. */
  svg: string | null;
  resenjeSvg: string | null;
  greska: RenderGreskaInfo | null;
  /** Deo sa LaTeX greškom; `null` kad se ne zna (odbijen sadržaj). */
  deo: RenderDeo | null;
}

/** Pregled pre prvog sadržaja (početna vrednost za `toSignal`). */
export const PRAZAN_PREGLED: Pregled = { stanje: 'prazno', svg: null, resenjeSvg: null, greska: null, deo: null };
const TIHO = { tiho: true } as const;

/** Ključ sadržaja: isti tekst, rešenje, predmet i prilozi su isti render. */
const kljuc = (c: RenderProbaCmd | null) => (c === null ? null : JSON.stringify(c));

function izOdgovora(r: RenderProbaInfo): Pregled {
  return r.ok
    ? { stanje: 'ok', svg: r.svg, resenjeSvg: r.resenjeSvg, greska: null, deo: null }
    : { stanje: 'greska', svg: null, resenjeSvg: null, greska: r.greska ?? { linija: null, poruka: 'Render nije uspeo.' }, deo: r.deo ?? null };
}

/** 429 (zauzet), 503 (ne radi) i 0 (nema veze) su prolazni; ostalo (400 zabranjena komanda, loš prilog) je greška sadržaja. */
function izGreske(e: unknown): Pregled {
  if (e instanceof HttpErrorResponse && (e.status === 429 || e.status === 503 || e.status === 0)) {
    return { ...PRAZAN_PREGLED, stanje: 'nedostupan' };
  }
  const poruka = e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
  return { ...PRAZAN_PREGLED, stanje: 'greska', greska: { linija: null, poruka } };
}

/**
 * Živi pregled editora varijante: za svaki nov sadržaj (`izvor$`; `null` = nema teksta) odmah `ceka` (sa poslednjim SVG-om),
 * pa posle {@link KASNJENJE_PREGLEDA} ms mira `render-proba` (tiho: greške su stanje, nikad snackbar ni izuzetak u toku).
 * Isti sadržaj (po JSON ključu) se ne traži ponovo; nov sadržaj otkazuje i čekanje i zahtev u letu (`switchMap` nad
 * `timer`, što je debounce koji ne pušta stari odgovor posle novog stanja). `odmah$` (Ctrl+Enter) renderuje trenutni
 * sadržaj bez čekanja, i kad se nije promenio (npr. posle `nedostupan`).
 */
export function pregledUzivo(izvor$: Observable<RenderProbaCmd | null>, api: BankaApi, odmah$: Observable<unknown> = EMPTY): Observable<Pregled> {
  const sadrzaj$ = izvor$.pipe(shareReplay({ bufferSize: 1, refCount: true }));
  const zahtevi$ = merge(
    sadrzaj$.pipe(
      distinctUntilChanged((a, b) => kljuc(a) === kljuc(b)),
      map(cmd => ({ cmd, cekaj: true })),
    ),
    odmah$.pipe(
      withLatestFrom(sadrzaj$),
      map(([, cmd]) => ({ cmd, cekaj: false })),
    ),
  );
  return zahtevi$.pipe(
    switchMap(({ cmd, cekaj }) => {
      if (cmd === null) {
        return of(PRAZAN_PREGLED);
      }
      const render$ = defer(() => api.renderProba(cmd, TIHO)).pipe(map(izOdgovora), catchError((e: unknown) => of(izGreske(e))));
      return concat(of<Pregled | null>(null), cekaj ? timer(KASNJENJE_PREGLEDA).pipe(switchMap(() => render$)) : render$);
    }),
    // `null` je "ceka": zadržava SVG-ove poslednjeg stanja (prazno i greška ih nemaju, pa ni ceka posle njih)
    scan<Pregled | null, Pregled>((prethodno, novo) => novo ?? { ...prethodno, stanje: 'ceka', greska: null, deo: null }, PRAZAN_PREGLED),
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
