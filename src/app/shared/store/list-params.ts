import { HttpParams } from '@angular/common/http';
import { ParamMap, Params } from '@angular/router';

/** Vrednost jednog filtera liste; `null` znači "bez filtera". */
export type FilterValue = string | number | boolean | null;

/**
 * Tip filtera određuje kako se parsira iz URL-a:
 * - `broj`: pozitivan ceo broj (id grupe, predmeta, ...);
 * - `tekst`: slobodan tekst (pretraga), skraćen, najviše {@link MAX_TEKST} znakova;
 * - `bool`: samo `true` / `false`;
 * - `datum`: `YYYY-MM-DD` koji postoji u kalendaru (ostaje string).
 */
export interface FilterDef { tip: 'broj' | 'tekst' | 'bool' | 'datum' }

/** Upit liste. `strana` je 1-based (kao u URL-u); backend dobija `page = strana - 1`. */
export interface ListQuery<F> {
  filteri: F;
  sort: string;
  strana: number;
  velicina: number;
}

export const VELICINE = [10, 25, 50, 100] as const;
export const PODRAZUMEVANA_VELICINA = 25;
export const MAX_TEKST = 200;
const MAX_STRANA = 999_999;

/** Imena parametara koje lista koristi za sebe; filter se ne sme zvati isto. */
export const REZERVISANI_PARAMETRI = ['strana', 'velicina', 'sort'] as const;

const POZITIVAN_CEO = /^[1-9]\d{0,14}$/;
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const SORT = /^([A-Za-z][A-Za-z0-9_.]*),(asc|desc)$/;

function parseBroj(s: string): number | undefined {
  if (!POZITIVAN_CEO.test(s)) {
    return undefined;
  }
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

function jeDatum(s: string): boolean {
  const m = DATUM.exec(s);
  if (!m) {
    return false;
  }
  const [g, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const datum = new Date(Date.UTC(g, mes - 1, d));
  return datum.getUTCFullYear() === g && datum.getUTCMonth() === mes - 1 && datum.getUTCDate() === d;
}

/** Vrednost iz URL-a u tip filtera; `undefined` = neispravno (koristi se podrazumevana), `null` = eksplicitno bez filtera. */
function parseFilter(sirovo: string, def: FilterDef): FilterValue | undefined {
  if (sirovo === '') {
    return null;
  }
  switch (def.tip) {
    case 'broj':
      return parseBroj(sirovo);
    case 'tekst': {
      const t = sirovo.trim();
      return t === '' || t.length > MAX_TEKST ? undefined : t;
    }
    case 'bool':
      return sirovo === 'true' ? true : sirovo === 'false' ? false : undefined;
    case 'datum':
      return jeDatum(sirovo) ? sirovo : undefined;
  }
}

/** Vrednost parametra samo ako je string; sačuvani filteri dolaze iz JSON-a i mogu biti bilo šta. */
function uzmi(params: ParamMap, kljuc: string): string | null {
  const v: unknown = params.get(kljuc);
  return typeof v === 'string' ? v : null;
}

function jeVelicina(n: number): boolean {
  return (VELICINE as readonly number[]).includes(n);
}

/** `polje,(asc|desc)` gde je polje među dozvoljenima. */
export function jeDozvoljenSort(s: string, polja: readonly string[]): boolean {
  const m = SORT.exec(s);
  return m !== null && polja.includes(m[1]);
}

function poljeSorta(s: string): string | null {
  return SORT.exec(s)?.[1] ?? null;
}

/**
 * Query parametri (nepouzdani: URL, zastareo link, sačuvani filteri) -> ispravan upit. Nikad ne baca:
 * svaka neispravna vrednost pada na podrazumevanu (`strana` na 1, `velicina` na podrazumevanu iz {@link VELICINE}).
 *
 * @param sortPolja dozvoljena polja sorta; bez njih je dozvoljeno samo polje podrazumevanog sorta.
 */
export function parseListParams<F extends Record<string, FilterValue>>(
  params: ParamMap,
  defs: Record<keyof F, FilterDef>,
  podrazumevano: ListQuery<F>,
  sortPolja?: readonly string[],
): ListQuery<F> {
  const filteri = { ...podrazumevano.filteri };
  for (const kljuc of Object.keys(defs) as (keyof F & string)[]) {
    const sirovo = uzmi(params, kljuc);
    if (sirovo === null) {
      continue;
    }
    const v = parseFilter(sirovo, defs[kljuc]);
    if (v !== undefined) {
      (filteri as Record<string, FilterValue>)[kljuc] = v;
    }
  }

  const strana = parseBroj(uzmi(params, 'strana') ?? '');
  const velicina = parseBroj(uzmi(params, 'velicina') ?? '');
  const podVelicina = jeVelicina(podrazumevano.velicina) ? podrazumevano.velicina : PODRAZUMEVANA_VELICINA;
  const podPolje = poljeSorta(podrazumevano.sort);
  const polja = sortPolja ?? (podPolje ? [podPolje] : []);
  const sort = uzmi(params, 'sort');

  return {
    filteri,
    sort: sort !== null && jeDozvoljenSort(sort, polja) ? sort : podrazumevano.sort,
    strana: strana !== undefined && strana <= MAX_STRANA ? strana : 1,
    velicina: velicina !== undefined && jeVelicina(velicina) ? velicina : podVelicina,
  };
}

function uTekst(v: Exclude<FilterValue, null>): string {
  return typeof v === 'string' ? v : String(v);
}

/**
 * Upit -> query parametri za `router.navigate`. Vrednosti jednake podrazumevanim se izostavljaju (čist URL);
 * filter postavljen na `null` kad podrazumevana vrednost nije `null` ide kao prazan parametar (`grupa=`).
 */
export function toQueryParams<F extends Record<string, FilterValue>>(q: ListQuery<F>, podrazumevano: ListQuery<F>): Params {
  const params: Params = {};
  for (const [kljuc, v] of Object.entries(q.filteri) as [string, FilterValue][]) {
    const pod = (podrazumevano.filteri as Record<string, FilterValue>)[kljuc] ?? null;
    if (v === pod) {
      continue;
    }
    params[kljuc] = v === null ? '' : uTekst(v);
  }
  if (q.sort !== podrazumevano.sort) {
    params['sort'] = q.sort;
  }
  if (q.strana !== 1) {
    params['strana'] = String(q.strana);
  }
  if (q.velicina !== podrazumevano.velicina) {
    params['velicina'] = String(q.velicina);
  }
  return params;
}

/**
 * Upit -> parametri za `GET api/<lista>/pretraga`: `page` (0-based), `size`, `sort` i filteri koji nisu `null`,
 * pod imenom iz `mapa` (npr. `predmet` -> `predmetId`) ili pod svojim imenom.
 */
export function toHttpParams<F extends Record<string, FilterValue>>(
  q: ListQuery<F>,
  mapa: Partial<Record<keyof F, string>>,
): HttpParams {
  let params = new HttpParams()
    .set('page', String(q.strana - 1))
    .set('size', String(q.velicina))
    .set('sort', q.sort);
  for (const [kljuc, v] of Object.entries(q.filteri) as [keyof F & string, FilterValue][]) {
    if (v !== null) {
      params = params.set(mapa[kljuc] ?? kljuc, uTekst(v));
    }
  }
  return params;
}
