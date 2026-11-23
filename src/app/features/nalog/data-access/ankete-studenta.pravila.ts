import { glasovaTekst, opisRoka, trake } from '../../../shared/util/ankete';
import { AnketaStudentu } from './ankete-studenta.models';

/*
 * Čista pravila brze ankete na strani studenta (spec brze ankete 6.3): koja anketa sama iskače, kartice Čas i Početna,
 * izbor odgovora i tekstovi kartica.
 */

/** Sama iskače prva otvorena anketa na koju student nije glasao i koju nije sklonio ("Kasnije"); inače ništa. */
export function zaIskakanje(ankete: readonly AnketaStudentu[], sklonjene: readonly number[]): AnketaStudentu | null {
  return ankete.find(a => a.otvorena && a.mojGlas === null && !sklonjene.includes(a.id)) ?? null;
}

/** Kartice taba Čas: sve (prvo pokazani rezultati, pa otvorene). Početna: samo ankete za celu grupu. */
export function kartice(ankete: readonly AnketaStudentu[], mesto: 'cas' | 'pocetna'): AnketaStudentu[] {
  const lista = mesto === 'pocetna' ? ankete.filter(a => a.publika === 'GRUPA') : [...ankete];
  return lista.filter(a => a.otvorena || a.rezultat !== null).sort((a, b) => Number(a.rezultat === null) - Number(b.rezultat === null));
}

/** "Rezultat ankete", "Anketa za grupu · do sutra u 20:00" ili "Anketa na času". */
export function oznakaKartice(a: AnketaStudentu): string {
  if (a.rezultat !== null && !a.otvorena) {
    return 'Rezultat ankete';
  }
  if (a.publika === 'GRUPA') {
    return a.rokMs !== null ? `Anketa za grupu · do ${opisRoka(a.rokMs, a.sadaMs)}` : 'Anketa za grupu';
  }
  return 'Anketa na času';
}

/** Ishod pokazanog rezultata: `Da, 10 min · 14 od 23 glasa`, nerešeno ili bez glasova. */
export function ishodRezultata(a: AnketaStudentu): string | null {
  const r = a.rezultat;
  if (!r) {
    return null;
  }
  if (r.brojGlasalo === 0) {
    return 'Još nema glasova';
  }
  const p = trake(a.opcije, r.glasovi, r.brojGlasalo).find(t => t.pobednik);
  return p ? `${p.tekst} · ${p.broj} od ${glasovaTekst(r.brojGlasalo)}` : `Nerešeno · ${glasovaTekst(r.brojGlasalo)}`;
}

/** Kućica (više odgovora): uključi ili isključi, rastuće. */
export function prebaciIzbor(izbor: readonly number[], i: number): number[] {
  return izbor.includes(i) ? izbor.filter(x => x !== i) : [...izbor, i].sort((a, b) => a - b);
}

/** Šta se šalje: jedan odgovor tačno jedan, više bar jedan (serverska pravila); inače `null`. */
export function izborZaSlanje(izbor: readonly number[], a: Pick<AnketaStudentu, 'viseOdgovora' | 'opcije'>): number[] | null {
  const ispravni = [...new Set(izbor)].filter(i => Number.isInteger(i) && i >= 0 && i < a.opcije.length).sort((x, y) => x - y);
  if (ispravni.length === 0 || (!a.viseOdgovora && ispravni.length !== 1)) {
    return null;
  }
  return ispravni;
}

/** Isti izbor (glas se ne šalje ponovo). */
export function istiIzbor(a: readonly number[] | null, b: readonly number[] | null): boolean {
  return !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
}
