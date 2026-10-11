// Izveštaj uvoza: upozorenja, greške slajdova i statistika (izvestajKaoTekst dolazi u F11).
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
