import { TipKomande } from './data-access/uzivo.models';

export type LokalnaAkcija = 'CEO_EKRAN' | 'KONZOLA' | 'POMOC';
export type TasterAkcija = { komanda: TipKomande; vrednost?: number } | { lokalno: LokalnaAkcija };
type Taster = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;

export function uPoljuZaUnos(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

/** Mapa iz spec-a 6.4. `G` + cifre + Enter vodi `GotoBafer`; ovde ga ne obrađujemo. */
export function tasterUAkciju(e: Taster, brojSlajdova: number): TasterAkcija | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight': case 'PageDown': case 'Enter': return { komanda: 'SLEDECI' };
    case 'ArrowLeft': case 'PageUp': return { komanda: 'PRETHODNI' };
    case 'Home': return { komanda: 'IDI_NA', vrednost: -1 };
    case 'End': return { komanda: 'IDI_NA', vrednost: Math.max(brojSlajdova - 1, -1) };
    case ' ': return { komanda: 'REZULTATI' };
    case 'c': case 'C': return { komanda: 'TACAN' };
    case 'l': case 'L': return { komanda: 'RANG_LISTA' };
    case 'o': case 'O': return { komanda: 'OTVORI_ZATVORI' };
    case 'r': case 'R': return { komanda: 'PONOVI' };
    case 't': case 'T': return { komanda: 'TAJMER' };
    case '+': case '=': return { komanda: 'TAJMER_PLUS' };
    case '-': return { komanda: 'TAJMER_MINUS' };
    case 'm': case 'M': return { komanda: 'TELEFON_PRIKAZ' };
    case 'd': case 'D': return { komanda: 'DETALJI' };
    case 'q': case 'Q': return { komanda: 'QR' };
    case 'b': case 'B': case '.': return { komanda: 'EKRAN_CRN' };
    case 'w': case 'W': return { komanda: 'EKRAN_BEO' };
    case 'f': case 'F': return { lokalno: 'CEO_EKRAN' };
    case 'p': case 'P': return { lokalno: 'KONZOLA' };
    case '?': return { lokalno: 'POMOC' };
    default: return null;
  }
}

/** `G`, pa cifre, pa `Enter` -> IDI_NA (broj - 1). Esc ili 3 s bez tastera poništava. */
export class GotoBafer {
  private aktivan = false; private cifre = ''; private poslednji = 0;
  constructor(private readonly sada: () => number = () => Date.now()) {}
  /** Vraća: 'progutao' (taster pripada G režimu), akciju (gotovo), ili null (nije G režim). */
  obradi(key: string): 'progutao' | TasterAkcija | null {
    const t = this.sada();
    if (this.aktivan && t - this.poslednji > 3000) this.ponisti();
    if (!this.aktivan) {
      if (key === 'g' || key === 'G') { this.aktivan = true; this.cifre = ''; this.poslednji = t; return 'progutao'; }
      return null;
    }
    this.poslednji = t;
    if (/^\d$/.test(key) && this.cifre.length < 3) { this.cifre += key; return 'progutao'; }
    if (key === 'Enter' && this.cifre) { const n = Number(this.cifre); this.ponisti(); return { komanda: 'IDI_NA', vrednost: n - 1 }; }
    this.ponisti();
    return key === 'Escape' ? 'progutao' : null;
  }
  get unos(): string | null { return this.aktivan ? this.cifre : null; }
  private ponisti(): void { this.aktivan = false; this.cifre = ''; }
}
