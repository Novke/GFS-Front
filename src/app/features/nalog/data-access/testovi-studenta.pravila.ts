import type { FazaTesta, PoljeTesta, UnetoPolja, ZadatakTesta } from './testovi-studenta.models';

/*
 * Čista pravila online testa na nalogu studenta (bez Angular-a i HTTP-a): popunjenost, sat, ponavljanje čuvanja, kopija
 * nesačuvanog u `sessionStorage`. Front ne ocenjuje: nema povratne informacije tačno/netačno (plan, odstupanja).
 */

/** Zadržavanje pre automatskog čuvanja zadatka (plan 6: ~800 ms). */
export const ZADRZAVANJE_CUVANJA_MS = 800;
/** Čekaonica pita na 5 s (spec 17), kartica testa na Početnoj i Času na 20 s. */
export const CEKAONICA_MS = 5_000;
export const KARTICA_TESTA_MS = 20_000;
/** Na RACUNAR sesiji se ekran „Predato“ sam odjavljuje posle 2 min (spec 11). */
export const SAMOSTALNA_ODJAVA_MS = 120_000;
/** Server prima izmenu do 10 s posle roka (spec 12); posle toga front čita stanje. */
export const POSLE_ROKA_MS = 11_000;

/** Ponavljanje posle greške mreže ili 429: 2, 4, 8, pa najviše 15 s. */
export function odlaganjePonovo(pokusaj: number): number {
  return Math.min(15_000, 2_000 * 2 ** Math.max(0, pokusaj - 1));
}

/** Polje je popunjeno kad tekst nije prazan, odnosno kad je izabrana bar jedna opcija. */
export function popunjenoPolje(p: Pick<PoljeTesta, 'tip'>, v: UnetoPolja | undefined | null): boolean {
  if (p.tip === 'BROJ' || p.tip === 'TEKST') return typeof v === 'string' && v.trim().length > 0;
  if (p.tip === 'JEDAN_TACAN') return typeof v === 'number' || (Array.isArray(v) && v.length > 0);
  return Array.isArray(v) && v.length > 0;
}

export type Popunjenost = 'prazno' | 'zapoceto' | 'popunjeno';

/** Oznaka zadatka u spisku: prazno, započeto, popunjeno (zadatak bez polja je uvek „prazno“: radi se na papiru). */
export function popunjenost(z: Pick<ZadatakTesta, 'polja'>, uneto: Record<string, UnetoPolja> | null | undefined): Popunjenost {
  const n = z.polja.filter(p => popunjenoPolje(p, uneto?.[p.kljuc])).length;
  return n === 0 ? 'prazno' : n === z.polja.length ? 'popunjeno' : 'zapoceto';
}

/** Broj praznih polja na celom testu (za „Predaj“). */
export function praznihPolja(zadaci: readonly Pick<ZadatakTesta, 'polja' | 'zadatakId'>[], uneto: (zadatakId: number) => Record<string, UnetoPolja> | null): number {
  return zadaci.reduce((z, t) => z + t.polja.filter(p => !popunjenoPolje(p, uneto(t.zadatakId)?.[p.kljuc])).length, 0);
}

/** Jednakost dva unosa (redosled ključeva nebitan; liste po redu). */
export function istiUnos(a: Record<string, UnetoPolja> | null | undefined, b: Record<string, UnetoPolja> | null | undefined): boolean {
  const ka = Object.keys(a ?? {}).filter(k => !prazno(a![k]));
  const kb = Object.keys(b ?? {}).filter(k => !prazno(b![k]));
  if (ka.length !== kb.length) return false;
  return ka.every(k => JSON.stringify(a![k]) === JSON.stringify(b?.[k]));
}

function prazno(v: UnetoPolja | undefined): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Pomak serverskog sata: `serverVremeMs - sada` u trenutku prijema (pozitivan kad server žuri). */
export function pomakSata(serverVremeMs: number, sada: number): number {
  return serverVremeMs - sada;
}

/** Preostalo vreme do roka po serverskom satu; `null` bez roka, nikad negativno. */
export function preostaloMs(rokMs: number | null, pomak: number, sada: number): number | null {
  return rokMs === null ? null : Math.max(0, rokMs - (sada + pomak));
}

/** `31:12`, `1:05:09`; `0:00` na isteku. */
export function formatSata(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Vreme iz serverskog `LocalDateTime` (`2026-12-09T10:41:07.123`) kao `10:41:07` (ili `10:41` bez sekundi). */
export function vremeIzIso(iso: string | null | undefined, saSekundama = true): string {
  const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso ?? '');
  if (!m) return '';
  return saSekundama ? `${m[1]}:${m[2]}:${m[3] ?? '00'}` : `${m[1]}:${m[2]}`;
}

/** Ključ kopije nesačuvanog odgovora u `sessionStorage` (po testu i zadatku). */
export function kljucKopije(testId: number, zadatakId: number): string {
  return `gfs-test-${testId}-${zadatakId}`;
}

/** Faza u kojoj strana pokazuje zadatke. */
export function radi(f: FazaTesta | undefined): boolean {
  return f === 'U_TOKU';
}

/** Tekst faze na kartici testa. */
export function opisFaze(f: FazaTesta): string {
  switch (f) {
    case 'ULAZ': return 'Ulaz je otvoren';
    case 'CEKANJE': return 'Čeka se početak';
    case 'U_TOKU': return 'Test je u toku';
    case 'PREDATO': return 'Predato';
    case 'ZAVRSEN': return 'Završen';
  }
}

/** Poeni sa najviše dve decimale, zarez kao decimalni znak: `5`, `2,5`, `0,33`. */
export function formatPoena(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  return String(Math.round(p * 100) / 100).replace('.', ',');
}
