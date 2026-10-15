import { Animacija, Platno } from './platno.models';
import { Prikaz, TipSlajda } from './uzivo.models';

/** Ključ vidljivosti: id sloja, ili `${slojId}#${indeksPasusa}` za pasus. */
export type KljucVidljivosti = string;

export function kljucPasusa(slojId: string, pasus: number): KljucVidljivosti {
  return `${slojId}#${pasus}`;
}

function kljucAnimacije(a: Animacija): KljucVidljivosti {
  return a.pasus === null ? a.slojId : kljucPasusa(a.slojId, a.pasus);
}

/** Grupe: [0] = animacije pre prve KLIK (puštaju se same pri ulasku), [k] = k-ta KLIK + SA/POSLE_PRETHODNOG iza nje. */
export function grupe(p: Platno): Animacija[][] {
  const rezultat: Animacija[][] = [[]];
  for (const a of p.animacije) {
    if (a.okidac === 'KLIK') {
      rezultat.push([a]);
    } else {
      rezultat[rezultat.length - 1].push(a);
    }
  }
  return rezultat;
}

/** Broj koraka = broj KLIK animacija (isto kao backend `TokIzvodjenja.brojKoraka`). */
export function brojKoraka(p: Platno): number {
  return p.animacije.filter((a) => a.okidac === 'KLIK').length;
}

/**
 * Vidljivost posle koraka k (k >= 0: odigrane grupe 0..k; k = -1: početno stanje pre grupe 0).
 * Ključevi koji nisu u mapi su vidljivi.
 */
export function stanjeSlojeva(p: Platno, k: number): ReadonlyMap<KljucVidljivosti, boolean> {
  const stanje = new Map<KljucVidljivosti, boolean>();
  const videne = new Set<KljucVidljivosti>();
  for (const a of p.animacije) {
    const kljuc = kljucAnimacije(a);
    if (!videne.has(kljuc)) {
      videne.add(kljuc);
      stanje.set(kljuc, a.vrsta !== 'ULAZ');
    }
  }
  const sve = grupe(p);
  for (let i = 0; i <= k && i < sve.length; i++) {
    for (const a of sve[i]) {
      stanje.set(kljucAnimacije(a), a.vrsta === 'ULAZ');
    }
  }
  return stanje;
}

export interface ZakazanaAnimacija {
  animacija: Animacija;
  kljuc: KljucVidljivosti;
  pocetakMs: number;
  trajanjeMs: number;
}

/** Šta se animira pri prelazu k-1 -> k (k = 0: grupa 0), sa vremenom početka od trenutka okidanja. */
export function grupaZaKorak(p: Platno, k: number, smanjenoKretanje = false): ZakazanaAnimacija[] {
  const grupa = grupe(p)[k];
  if (k < 0 || !grupa) {
    return [];
  }
  const rezultat: ZakazanaAnimacija[] = [];
  let okidanjePrethodne = 0;
  let najkasnijiKraj = 0;
  for (const a of grupa) {
    const okidanje = rezultat.length === 0 ? 0 : a.okidac === 'POSLE_PRETHODNOG' ? najkasnijiKraj : okidanjePrethodne;
    const trajanjeMs = smanjenoKretanje ? 0 : a.trajanjeMs;
    const pocetakMs = okidanje + a.kasnjenjeMs;
    rezultat.push({ animacija: a, kljuc: kljucAnimacije(a), pocetakMs, trajanjeMs });
    okidanjePrethodne = okidanje;
    najkasnijiKraj = Math.max(najkasnijiKraj, pocetakMs + trajanjeMs);
  }
  return rezultat;
}

export interface StanjePrelaza {
  verzija: number;
  prikaz: Prikaz;
  indeks: number;
  slajdId: number | null;
  tip: TipSlajda | null;
  korak: number;
}

/** Koju grupu animirati pri prelazu `pre -> sada`, ili null (crta se krajnje stanje). */
export function animacijaPrelaza(pre: StanjePrelaza | null, sada: StanjePrelaza): number | null {
  if (sada.prikaz !== 'SLAJD' || sada.tip !== 'PLATNO' || pre === null || sada.verzija <= pre.verzija) {
    return null;
  }
  if (sada.slajdId === pre.slajdId) {
    return sada.korak === pre.korak + 1 ? sada.korak : null;
  }
  return napredNaSlajd(pre, sada) ? 0 : null;
}

/**
 * Tačno jedan slajd napred (prijava -> prvi slajd ili indeks + 1), korak 0, novija verzija, drugi slajd: tada se pušta
 * grupa 0 PLATNO slajda i prelaz slajda bilo kog tipa (faza 5, odluka 12).
 */
export function napredNaSlajd(pre: StanjePrelaza | null, sada: StanjePrelaza): boolean {
  if (sada.prikaz !== 'SLAJD' || pre === null || sada.verzija <= pre.verzija || sada.slajdId === pre.slajdId || sada.korak !== 0) {
    return false;
  }
  return (pre.prikaz === 'PRIJAVA' && sada.indeks === 0) || (pre.prikaz === 'SLAJD' && sada.indeks === pre.indeks + 1);
}
