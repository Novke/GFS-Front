// Čiste funkcije animacija (F17, odluka 21): dodavanje (ceo sloj, jedan pasus ili po pasusima), izmena usklađena sa
// serverom (smer koji efekat dozvoljava, POJAVI traje 0, vremena 0-10 000 ms u celim ms), brisanje, redosled, brojevi
// grupa i trajanje grupe (pregled F18). Bez Angulara. Nepromenjen rezultat je isti objekat `p` (nema praznog koraka).
import type { Animacija, Efekat, Okidac, Platno, Sloj, Smer, VrstaAnimacije } from '../data-access/platno.models';
import { grupaZaKorak, grupe } from '../data-access/platno-koraci';
import { noviId } from './komande';

export const NAZIVI_EFEKATA: Record<Efekat, string> = {
  POJAVI: 'Pojavi', FADE: 'Postepeno', ULET: 'Ulet', PODELI: 'Podeli', BRISANJE: 'Brisanje', ZUM: 'Zum', ISCRTAJ: 'Iscrtaj',
};
export const NAZIVI_SMEROVA: Record<Smer, string> = {
  LEVO: 'Sleva', DESNO: 'Zdesna', GORE: 'Odozgo', DOLE: 'Odozdo', HORIZONTALNO: 'Vodoravno', VERTIKALNO: 'Uspravno',
};
export const NAZIVI_OKIDACA: Record<Okidac, string> = {
  KLIK: 'Na klik', SA_PRETHODNIM: 'Sa prethodnim', POSLE_PRETHODNOG: 'Posle prethodnog',
};
const STRANE: readonly Smer[] = ['LEVO', 'DESNO', 'GORE', 'DOLE'];
/** Smerovi koje server dozvoljava po efektu (prvi u listi nije nužno podrazumevani: `podrazumevaniSmer`). */
export const SMEROVI: Record<Efekat, readonly Smer[]> = {
  POJAVI: [], FADE: [], ULET: STRANE, PODELI: ['HORIZONTALNO', 'VERTIKALNO'], BRISANJE: STRANE, ZUM: [], ISCRTAJ: STRANE,
};
export const PODRAZUMEVANO_TRAJANJE = 500;
const EFEKTI = Object.keys(NAZIVI_EFEKATA) as Efekat[];

/** Efekti za sloj: ISCRTAJ samo za CRTEZ. */
export function efektiZa(s: Sloj): Efekat[] {
  return s.tip === 'CRTEZ' ? EFEKTI : EFEKTI.filter((e) => e !== 'ISCRTAJ');
}

/** Kao server (`normalizuj`): ULET -> DOLE, BRISANJE/ISCRTAJ -> LEVO, PODELI -> VERTIKALNO, ostali bez smera. */
export function podrazumevaniSmer(e: Efekat): Smer | null {
  return e === 'ULET' ? 'DOLE' : e === 'PODELI' ? 'VERTIKALNO' : SMEROVI[e].length ? 'LEVO' : null;
}

const imaTekst = (s: Sloj, i: number) => s.tip === 'TEKST' && !!s.pasusi[i]?.delovi.some((d) => d.tekst.trim());

/** Nova animacija na kraj liste (FADE, KLIK, 500 ms); nepostojeći sloj ili pasus -> isti dokument i prazan id. */
export function dodajAnimaciju(
  p: Platno, slojId: string, vrsta: VrstaAnimacije, efekat: Efekat = 'FADE', pasus: number | null = null,
): { platno: Platno; id: string } {
  const s = p.slojevi.find((x) => x.id === slojId);
  if (!s || (pasus !== null && (s.tip !== 'TEKST' || !s.pasusi[pasus]))) return { platno: p, id: '' };
  const id = noviId(p, 'a');
  const a: Animacija = {
    id, slojId, pasus, vrsta, efekat, smer: podrazumevaniSmer(efekat), okidac: 'KLIK',
    trajanjeMs: efekat === 'POJAVI' ? 0 : PODRAZUMEVANO_TRAJANJE, kasnjenjeMs: 0,
  };
  return { platno: { ...p, animacije: [...p.animacije, a] }, id };
}

/** Jedna KLIK animacija po nepraznom pasusu TEKST sloja (prazan ili samo razmaci se preskaču). */
export function dodajPoPasusima(p: Platno, slojId: string, vrsta: VrstaAnimacije, efekat?: Efekat): { platno: Platno; ids: string[] } {
  const s = p.slojevi.find((x) => x.id === slojId);
  const ids: string[] = [];
  if (s?.tip !== 'TEKST') return { platno: p, ids };
  let r = p;
  s.pasusi.forEach((_, i) => {
    if (!imaTekst(s, i)) return;
    const d = dodajAnimaciju(r, slojId, vrsta, efekat, i);
    r = d.platno;
    ids.push(d.id);
  });
  return { platno: r, ids };
}

const stegni = (n: number) => Math.round(Math.min(10_000, Math.max(0, n)));
const POLJA = ['vrsta', 'efekat', 'smer', 'okidac', 'trajanjeMs', 'kasnjenjeMs'] as const;

/** Izmena usklađena sa serverom (Review Focus 2); bez stvarne promene (ili bez animacije) isti dokument. */
export function izmeniAnimaciju(p: Platno, id: string, izmena: Partial<Omit<Animacija, 'id' | 'slojId' | 'pasus'>>): Platno {
  let promena = false;
  const animacije = p.animacije.map((a) => {
    if (a.id !== id) return a;
    const n = { ...a, ...izmena };
    // Smer mora da odgovara efektu, POJAVI traje 0 (PlatnoPP odbija drugačije, Review Focus 2).
    if (!SMEROVI[n.efekat].includes(n.smer as Smer)) n.smer = podrazumevaniSmer(n.efekat);
    if (n.efekat === 'POJAVI') n.trajanjeMs = 0;
    else if (a.efekat === 'POJAVI' && izmena.trajanjeMs === undefined) n.trajanjeMs = PODRAZUMEVANO_TRAJANJE;
    n.trajanjeMs = stegni(n.trajanjeMs);
    n.kasnjenjeMs = stegni(n.kasnjenjeMs);
    if (POLJA.every((k) => n[k] === a[k])) return a;
    promena = true;
    return n;
  });
  return promena ? { ...p, animacije } : p;
}

export function obrisiAnimaciju(p: Platno, id: string): Platno {
  const animacije = p.animacije.filter((a) => a.id !== id);
  return animacije.length === p.animacije.length ? p : { ...p, animacije };
}

/** Animacija na `indeks` (stegnut u listu) redosleda izvršavanja; isti indeks ili nepostojeći id -> `p`. */
export function premestiAnimaciju(p: Platno, id: string, indeks: number): Platno {
  const od = p.animacije.findIndex((a) => a.id === id);
  const na = Math.min(p.animacije.length - 1, Math.max(0, indeks));
  if (od < 0 || od === na) return p;
  const animacije = p.animacije.filter((a) => a.id !== id);
  animacije.splice(na, 0, p.animacije[od]);
  return { ...p, animacije };
}

/** Id animacije -> broj grupe (0 = pušta se sama pri ulasku, k = k-ti klik). */
export function brojeviGrupa(p: Platno): Map<string, number> {
  const m = new Map<string, number>();
  grupe(p).forEach((g, k) => g.forEach((a) => m.set(a.id, k)));
  return m;
}

/** Id sloja -> rastući jedinstveni brojevi grupa njegovih animacija (značke na platnu, F18). */
export function grupeNaSlojevima(p: Platno): Map<string, number[]> {
  const m = new Map<string, number[]>();
  grupe(p).forEach((g, k) => g.forEach((a) => {
    const l = m.get(a.slojId) ?? [];
    if (l.at(-1) !== k) l.push(k);
    m.set(a.slojId, l);
  }));
  return m;
}

/** Trajanje grupe k u ms (kraj poslednje animacije: početak + trajanje); prazna ili nepostojeća grupa -> 0. */
export function trajanjeGrupe(p: Platno, k: number): number {
  return Math.max(0, ...grupaZaKorak(p, k).map((z) => z.pocetakMs + z.trajanjeMs));
}
