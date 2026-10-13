// Zajednički tipovi modula uvoza ("Ugovor modula uvoza"): kutija u EMU, transformacija u jedinice platna, kontekst slajda.
// Čisti tipovi i funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { KodUpozorenja } from './izvestaj';
import type { Paket } from './paket';
import type { TemaFajla } from './tema';

/** 1 pt = 12 700 EMU. */
export const EMU_PO_PT = 12700;

export { zaokruziKaoServer } from '../data-access/platno-provera';

/** Zaokruživanje izlaza na 2 decimale (Math.round; za vrednosti koje server ne proverava zbirno, v. `zaokruziKaoServer`). */
export function zaokruzi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Položaj i veličina u EMU, `rot` u stepenima (smer kazaljke). */
export interface Kutija { x: number; y: number; w: number; h: number; rot: number; }

/** EMU -> pt, pa uklapanje u 960 x 540: `x_jed = emu / 12700 * s + ox`. */
export interface Transformacija { s: number; ox: number; oy: number; }

export interface KontekstSlajda {
  readonly paket: Paket;
  /** Redni broj slajda u PPTX-u (1-based), isti kao `Upozorenje.slajd`. */
  readonly indeks: number;
  readonly slajd: { putanja: string; doc: Document };
  readonly layout: { putanja: string; doc: Document } | null;
  readonly master: { putanja: string; doc: Document } | null;
  readonly tema: TemaFajla;
  readonly mapaBoja: Readonly<Record<string, string>>;
  /** `p:defaultTextStyle` iz glavnog dela. */
  readonly defaultTextStyle: Element | null;
  /** `ppt/tableStyles.xml` (veza `tableStyles` glavnog dela). */
  readonly tabelaStilova: Document | null;
  readonly t: Transformacija;
  /** `#RRGGBB` pozadine slajda (na početku `bg1`; F12 je prepisuje pravom pozadinom). */
  pozadina: string;
  /**
   * Popuna grupe koju deca sa `a:grpFill` preuzimaju (`#RRGGBB` ili `null`); F12 je postavlja dok obilazi decu
   * `p:grpSp` i vraća prethodnu vrednost posle grupe. Nema je -> deca sa `grpFill` su bez popune.
   */
  popunaGrupe?: string | null;
  upozori(kod: KodUpozorenja, poruka: string): void;
  /** Registruje sliku paketa, vraća ključ medija (`pptx:<putanja>`); spoljna veza, nema veze ili dela -> `null`. */
  medijIzVeze(odDela: string, rId: string): string | null;
  /** Registruje generisanu sliku (pojas formule), vraća ključ `gen:<n>`. */
  noviMedij(ime: string, bajtovi: Uint8Array): string;
}

/** Kutija (EMU) u položaj sloja (jedinice platna, 2 decimale). */
export function uSloj(k: Kutija, t: Transformacija): { x: number; y: number; sirina: number; visina: number; rotacija: number } {
  return {
    x: zaokruzi(k.x / EMU_PO_PT * t.s + t.ox),
    y: zaokruzi(k.y / EMU_PO_PT * t.s + t.oy),
    sirina: zaokruzi(k.w / EMU_PO_PT * t.s),
    visina: zaokruzi(k.h / EMU_PO_PT * t.s),
    rotacija: zaokruzi(k.rot),
  };
}

/** Medij koji uvoz šalje: bajtovi se raspakuju (ili prave) tek na zahtev. */
export interface MedijUvoza { kljuc: string; ime: string; bajtovi: () => Uint8Array | null; }
