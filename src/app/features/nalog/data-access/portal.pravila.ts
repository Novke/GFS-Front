import { HttpErrorResponse } from '@angular/common/http';

import { API_URL } from '../../../core/api/api-url';
import { javnoNazad, nazadIzUrla } from '../../../shared/util/nazad';
import { decimalni } from '../../uzivo/ui/format';
import { sledeciUpitMs, sledeciUpitVanCasaMs } from './cas.pravila';
import { OcenaStudenta, PredmetStudenta, TipAktivnosti, TipVezbanja } from './portal.models';

/*
 * Čista pravila naloga studenta, faze 2 i 3 (tabovi, traka "Prezentacija je počela", predmeti, vežbanje, ocena). Bez Angular
 * servisa i bez HTTP-a.
 */

/** Slika zadatka, rešenja ili slajda: isti javni medij kao na času (`api/public/mediji/<uuid>`). */
export const medijUrl = (id: string) => `${API_URL}/public/mediji/${encodeURIComponent(id)}`;

export const status = (e: unknown) => (e instanceof HttpErrorResponse ? e.status : -1);

/**
 * Prijava sa povratkom na trenutnu stranu naloga (`/nalog/predmet/3?k=istorija` -> `nalog?nazad=nalog/predmet/3?k=istorija`).
 * Putanja koju `javnoNazad` ne pušta (kodirani znaci, nepoznat prefiks) daje samo `nalog`: posle prijave tab Početna.
 */
export function putanjaPrijave(url: string): string {
  const nazad = javnoNazad(nazadIzUrla(url));
  return nazad ? `nalog?nazad=${nazad}` : 'nalog';
}

/** Tab Čas (`/nalog/cas`, i `/nalog/cas/<token>` iz QR-a): on sam prati čas, pa ljuska ne pita i ne crta traku. */
export function jeTabCas(url: string): boolean {
  const putanja = url.split(/[?#]/u, 1)[0];
  return putanja === '/nalog/cas' || putanja.startsWith('/nalog/cas/');
}

/**
 * Sledeći upit trake (spec 12.1): na času 10 s ± 2 s kao `/nalog/cas` (30 telefona iza jedne NAT adrese se ne poravna),
 * van časa 30 s dok je predavanje grupe u toku (`uToku`), inače 60 s; `slucajno` iz `[0, 1)`.
 */
export function sledeciUpitTrakeMs(naCasu: boolean, slucajno: number, uToku = false): number {
  return naCasu ? sledeciUpitMs(slucajno) : sledeciUpitVanCasaMs(uToku);
}

/** Aktivnost na predavanju kako je student vidi (bez bodova): `null` = nije bio. */
export function opisAktivnosti(a: TipAktivnosti | null | undefined): string {
  switch (a) {
    case 'PRISUSTVO':
      return 'Prisutan';
    case 'ZADATAK':
      return 'Prisutan · rešio zadatak';
    case 'SA_ZVEZDICOM':
      return 'Prisutan · zadatak sa zvezdicom';
    default:
      return 'Nije bio';
  }
}

/** `★★` za nivo 2; van 1-3 prazno. */
export function zvezdice(nivo: number | null | undefined): string {
  return typeof nivo === 'number' && nivo >= 1 && nivo <= 3 ? '★'.repeat(nivo) : '';
}

/** Tekst čitača ekrana za nivo: "nivo 2 od 3". */
export function nivoZaCitac(nivo: number): string {
  return `nivo ${nivo} od 3`;
}

/** Sopstveni učinak na tipu: `3 od 5 tačno` (od proverenih), ili `još nisi proveravao`. */
export function ucinak(t: Pick<TipVezbanja, 'provereno' | 'tacno'>): string {
  return t.provereno > 0 ? `${t.tacno} od ${t.provereno} tačno` : 'još nisi proveravao';
}

/** Kartica predmeta: `Prisutan na 5 od 7 · 3 tipa za vežbanje`. */
export function opisPredmeta(p: PredmetStudenta): string {
  const delovi = [`Prisutan na ${p.prisutan} od ${p.predavanja}`];
  if (p.tipovaZaVezbanje > 0) {
    delovi.push(`${p.tipovaZaVezbanje} ${tipova(p.tipovaZaVezbanje)} za vežbanje`);
  }
  return delovi.join(' · ');
}

/** `1 tip`, `2 tipa`, `5 tipova`, `21 tip`, `12 tipova`. */
export function tipova(n: number): string {
  const d = n % 10;
  const s = n % 100;
  if (d === 1 && s !== 11) {
    return 'tip';
  }
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'tipa' : 'tipova';
}

/** Poeni sa najviše dve decimale i zarezom; `null` (nije polagao) je `—`. */
export function poeni(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? decimalni(n) : '—';
}

/** Ocena za prikaz: objavljen predlog (`8`) ili `—` kad predloga nema (npr. nije položio predispitne). */
export function predlogOcene(o: OcenaStudenta): string {
  const p = o.ocena?.predlogOcene;
  return typeof p === 'number' ? String(p) : '—';
}

/** Kartice strane predmeta (`?k=`): nepoznata vrednost je Materijali. */
export type KarticaPredmeta = 'materijali' | 'istorija' | 'ocena';

export function karticaIzUpita(v: string | null | undefined): KarticaPredmeta {
  return v === 'istorija' || v === 'ocena' ? v : 'materijali';
}

/** Id iz rute (`predmet/:id`): samo pozitivan ceo broj, inače `null` (stranica tada kaže "nije pronađeno" bez zahteva). */
export function idIzRute(v: string | null | undefined): number | null {
  return typeof v === 'string' && /^[1-9]\d{0,17}$/u.test(v) ? Number(v) : null;
}

/** Nivo iz upita vežbanja (`?nivo=2`): 1-3, inače `null` (svi nivoi). */
export function nivoIzUpita(v: string | null | undefined): number | null {
  return v === '1' || v === '2' || v === '3' ? Number(v) : null;
}
