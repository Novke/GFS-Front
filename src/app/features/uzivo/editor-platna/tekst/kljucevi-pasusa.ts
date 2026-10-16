// Ključevi pasusa (odluka 17): animacije pasusa prate pasus po stabilnom ključu, ne po ProseMirror-ovom mapiranju pozicija
// (posle Ctrl+Z u sesiji akumulirano mapiranje i dalje kaže "obrisano", a istorija vraća čvor SA ključem). `pasusiUDok`
// daje svakom pasusu `p<i>`; Enter ostavlja ključ delu koji drži sadržaj (`podeliPasus`), spajanje zadržava gornji, a
// nov pasus (Enter, lepljenje) i duplikat (prevlačenje teksta unutar uređivača) dobijaju `n<k>` kroz `dodeliKljuceve`.
import type { Node as PmCvor } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Platno } from '../../data-access/platno.models';
import type { AtributiPasusa } from './pm-sema';

/** Ključevi pasusa dokumenta, redom (null za pasus bez ključa). */
export function kljuceviPasusa(dok: PmCvor): (string | null)[] {
  const k: (string | null)[] = [];
  dok.forEach((c) => k.push((c.attrs as AtributiPasusa).kljuc));
  return k;
}

/** Za svaki ključ početnog stanja (indeks = stari indeks pasusa): indeks pasusa sa tim ključem u krajnjem, ili null. */
export function mapaPoKljucevima(pocetni: readonly (string | null)[], krajnji: PmCvor): (number | null)[] {
  const indeks = new Map<string, number>();
  kljuceviPasusa(krajnji).forEach((k, i) => {
    if (k !== null && !indeks.has(k)) indeks.set(k, i);
  });
  return pocetni.map((k) => (k === null ? null : indeks.get(k) ?? null));
}

/** Animacije pasusa sloja `slojId` posle uređivanja; animacija pasusa koji više ne postoji se uklanja (`uklonjeno`). */
export function preslikajAnimacije(
  p: Platno, slojId: string, mapa: readonly (number | null)[],
): { platno: Platno; uklonjeno: number } {
  let uklonjeno = 0;
  const animacije = p.animacije.flatMap((a) => {
    if (a.slojId !== slojId || a.pasus === null) return [a];
    const n = mapa[a.pasus];
    if (n === null || n === undefined) {
      uklonjeno++;
      return [];
    }
    return [n === a.pasus ? a : { ...a, pasus: n }];
  });
  const promena = uklonjeno > 0 || animacije.some((a, i) => a !== p.animacije[i]);
  return { platno: promena ? { ...p, animacije } : p, uklonjeno };
}

/**
 * Transakcija (bez istorije) koja pasusima bez ključa i duplikatima daje nove ključeve `n<k>`; null kad nema šta. Atributi
 * se menjaju samo kroz `setNodeMarkup` sa novim objektom (podrazumevani objekti šeme su deljeni i zamrznuti).
 */
export function dodeliKljuceve(state: EditorState, brojac: { n: number }): Transaction | null {
  const videni = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.forEach((c, pos) => {
    const k = (c.attrs as AtributiPasusa).kljuc;
    if (k !== null && !videni.has(k)) {
      videni.add(k);
      return;
    }
    tr ??= state.tr.setMeta('addToHistory', false);
    const kljuc = `n${++brojac.n}`;
    videni.add(kljuc);
    tr.setNodeMarkup(pos, undefined, { ...c.attrs, kljuc });
  });
  return tr;
}
