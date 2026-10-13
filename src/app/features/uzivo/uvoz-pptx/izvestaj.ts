// Izveštaj uvoza: upozorenja, greške slajdova, statistika i tekst izveštaja.
import type { Efekat, TipSloja } from '../data-access/platno.models';

export type KodUpozorenja =
  | 'EFEKAT_ZAMENJEN' | 'EFEKAT_PRIBLIZAN' | 'PODELI_SMER' | 'ANIMACIJA_PRESKOCENA' | 'KLIK_IZGUBLJEN'
  | 'FONT_ZAMENJEN' | 'OBJEKAT_PRESKOCEN' | 'OBLIK_PRIBLIZAN' | 'SENKA' | 'TABULATORI' | 'TEKST_PRIBLIZAN'
  | 'STIL_TABELE' | 'FORMULA_ZA_PROVERU' | 'FORMULA_ODJEDNOM' | 'CRTEZ_BEZ_POTEZA' | 'BELESKE_SKRACENE'
  | 'SLIKA_SMANJENA' | 'SKRIVEN_SLAJD' | 'PRELAZ_SLAJDA' | 'FORMAT_SLAJDA' | 'GRANICA';

/** `slajd` = redni broj u PPTX-u (1-based); `null` za ceo fajl. */
export interface Upozorenje { slajd: number | null; kod: KodUpozorenja; poruka: string; }
export interface GreskaSlajda { slajd: number; poruka: string; }

export interface Statistika {
  slojevi: Record<TipSloja, number>;
  animacije: Record<Efekat, number>;
  beleske: number;
  efekataPptx: number;
  klikoviPptx: number;
  koraci: number;
}

// Record (ne niz) da bi nov tip sloja ili efekat u modelu bio greška kompajliranja dok se ne doda ovde.
const NULE_SLOJEVA: Readonly<Record<TipSloja, number>> = { TEKST: 0, SLIKA: 0, OBLIK: 0, TABELA: 0, FORMULA: 0, CRTEZ: 0 };
const NULE_ANIMACIJA: Readonly<Record<Efekat, number>> = { POJAVI: 0, FADE: 0, ULET: 0, PODELI: 0, BRISANJE: 0, ZUM: 0, ISCRTAJ: 0 };

export function praznaStatistika(): Statistika {
  return {
    slojevi: { ...NULE_SLOJEVA }, animacije: { ...NULE_ANIMACIJA },
    beleske: 0, efekataPptx: 0, klikoviPptx: 0, koraci: 0,
  };
}

function saberiMape<K extends string>(a: Readonly<Record<K, number>>, b: Readonly<Record<K, number>>): Record<K, number> {
  const z: Record<K, number> = { ...a };
  for (const k of Object.keys(b) as K[]) z[k] = (z[k] ?? 0) + b[k];
  return z;
}

/** Zbir dve statistike (nova vrednost; ulazi se ne menjaju). */
export function saberi(a: Statistika, b: Statistika): Statistika {
  return {
    slojevi: saberiMape(a.slojevi, b.slojevi),
    animacije: saberiMape(a.animacije, b.animacije),
    beleske: a.beleske + b.beleske,
    efekataPptx: a.efekataPptx + b.efekataPptx,
    klikoviPptx: a.klikoviPptx + b.klikoviPptx,
    koraci: a.koraci + b.koraci,
  };
}

/** Deo `RezultatUvoza` (uvoz.ts) koji izveštaj čita; strukturni tip da modul ne zavisi od uvoz.ts. */
export interface UlazIzvestaja {
  imeFajla: string;
  ukupnoSlajdova: number;
  slajdovi: readonly { indeks: number; statistika: Statistika }[];
  greske: readonly GreskaSlajda[];
  upozorenja: readonly Upozorenje[];
}

const sNN = (n: number) => `s${String(n).padStart(2, '0')}`;

/** `a 3, b 1` iz mape, opadajuće po broju (jednaki: redosledom ključeva), samo vrednosti > 0. */
function raspodela(m: Readonly<Record<string, number>>): string {
  const stavke = Object.entries(m).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return stavke.length === 0 ? '' : ` (${stavke.map(([k, n]) => `${k} ${n}`).join(', ')})`;
}

const zbir = (m: Readonly<Record<string, number>>) => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Tekst izveštaja za kopiranje. `izbor` (opseg slajdova PPTX-a, uključivo) ograničava slajdove, greške i upozorenja
 * uvoza; `dodatna` su upozorenja slanja (ne filtriraju se). Upozorenja idu redom slajdova (stabilno: redom nastanka),
 * ona bez slajda na kraju sa `—:`.
 */
export function izvestajKaoTekst(r: UlazIzvestaja, izbor?: { od: number; do: number }, dodatna: readonly Upozorenje[] = []): string {
  const u = (n: number | null) => n === null || !izbor || (n >= izbor.od && n <= izbor.do);
  const slajdovi = r.slajdovi.filter((s) => u(s.indeks));
  const s = slajdovi.reduce((a, b) => saberi(a, b.statistika), praznaStatistika());
  const indeksi = slajdovi.map((x) => x.indeks);
  const opseg = indeksi.length > 0 ? ` (${sNN(Math.min(...indeksi))}-${sNN(Math.max(...indeksi))})` : '';
  const greske = r.greske.filter((g) => u(g.slajd));
  const upozorenja = [...r.upozorenja.filter((x) => u(x.slajd)), ...dodatna]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.slajd ?? Infinity) - (b.x.slajd ?? Infinity) || a.i - b.i)
    .map((e) => e.x);
  return [
    `Uvoz: ${r.imeFajla}`,
    `Slajdovi: ${slajdovi.length} od ${r.ukupnoSlajdova}${opseg}`,
    `Slojevi: ${zbir(s.slojevi)}${raspodela(s.slojevi)}`,
    `Animacije: ${zbir(s.animacije)}${raspodela(s.animacije)}; koraci: ${s.koraci} (PowerPoint klikova: ${s.klikoviPptx})`,
    `Beleške: ${s.beleske}`,
    `Greške: ${greske.length}`,
    ...greske.map((g) => `${sNN(g.slajd)}: ${g.poruka}`),
    `Upozorenja (${upozorenja.length}):`,
    ...upozorenja.map((x) => `${x.slajd === null ? '—' : sNN(x.slajd)}: ${x.poruka}`),
  ].join('\n');
}
