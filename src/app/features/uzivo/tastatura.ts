import { TipKomande } from './data-access/uzivo.models';

/**
 * Lokalne akcije prozora (server ih ne zna). `CRTANJE` (`D`) uključuje ili gasi crtanje (samo konzola; publika ga
 * preskače); `ALAT` (`1`-`7`, `vrednost` 0-6), `PONISTI` (Ctrl+Z), `VRATI` (Ctrl+Y, Ctrl+Shift+Z) i `ESC` važe samo dok
 * konzola crta ({@link tasterCrtanja}). `ANKETA` (taster A) otvara panel brze ankete samo u konzoli; publika ga preskače.
 */
export type LokalnaAkcija = 'CEO_EKRAN' | 'KONZOLA' | 'POMOC' | 'ANKETA' | 'CRTANJE' | 'ALAT' | 'PONISTI' | 'VRATI' | 'ESC';
export type TasterAkcija = { komanda: TipKomande; vrednost?: number } | { lokalno: LokalnaAkcija; vrednost?: number };
type Taster = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'> & { code?: string; shiftKey?: boolean };

export function uPoljuZaUnos(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true;
}

/**
 * Taster za prečicu: `e.key`, osim kad je to slovo van ASCII-ja (srpska ćirilica: `ц` na mestu `C`), a fizički taster
 * je slovo (`e.code` = `KeyC`): tada slovo latinične tastature na istom mestu, pa prečice rade i na ćiriličnom
 * rasporedu. ASCII tasteri (i drugi latinični rasporedi, npr. Dvorak) ostaju po `e.key`, a `š`, `đ`, `č`... nisu na
 * `Key*` tasterima, pa se ne preslikavaju.
 */
export function kljucPrecice(e: Pick<Taster, 'key' | 'code'>): string {
  const k = e.key;
  if (k.length === 1 && k.charCodeAt(0) > 0x7f) {
    const slovo = /^Key([A-Z])$/.exec(e.code ?? '');
    if (slovo) return k === k.toLowerCase() ? slovo[1].toLowerCase() : slovo[1];
  }
  return k;
}

/**
 * Mapa iz spec-a 6.4. `G` + cifre + Enter vodi `GotoBafer`; ovde ga ne obrađujemo. Slova i na ćirilici (`kljucPrecice`).
 * `Shift+R` je rešenje zadatka; `R` bez Shift-a (i veliko pod Caps Lock-om) ostaje ponavljanje, pa Caps Lock ne pali rešenje.
 * Crtanje (plan crtanja, dopune): `D` je crtanje (lokalno), `Shift+D` dozvola „Detalja”, `Shift+M` prikaz na telefonu;
 * samo `M` (i `M` pod Caps Lock-om) ne radi ništa.
 */
export function tasterUAkciju(e: Taster, brojSlajdova: number): TasterAkcija | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (kljucPrecice(e)) {
    case 'ArrowRight': case 'PageDown': case 'Enter': return { komanda: 'SLEDECI' };
    case 'ArrowLeft': case 'PageUp': return { komanda: 'PRETHODNI' };
    case 'Home': return { komanda: 'IDI_NA', vrednost: -1 };
    case 'End': return { komanda: 'IDI_NA', vrednost: Math.max(brojSlajdova - 1, -1) };
    case ' ': return { komanda: 'REZULTATI' };
    case 'c': case 'C': return { komanda: 'TACAN' };
    case 'l': case 'L': return { komanda: e.shiftKey ? 'RANG_PREDAVANJA' : 'RANG_LISTA' };
    case 'o': case 'O': return { komanda: 'OTVORI_ZATVORI' };
    case 'r': case 'R': return { komanda: e.shiftKey ? 'RESENJE' : 'PONOVI' };
    case 't': case 'T': return { komanda: 'TAJMER' };
    case '+': case '=': return { komanda: 'TAJMER_PLUS' };
    case '-': return { komanda: 'TAJMER_MINUS' };
    case 'm': case 'M': return e.shiftKey ? { komanda: 'TELEFON_PRIKAZ' } : null;
    case 'd': case 'D': return e.shiftKey ? { komanda: 'DETALJI' } : { lokalno: 'CRTANJE' };
    case 'q': case 'Q': return { komanda: 'QR' };
    case 'k': case 'K': return { komanda: 'FAJLOVI' };
    case 'b': case 'B': case '.': return { komanda: 'EKRAN_CRN' };
    case 'w': case 'W': return { komanda: 'EKRAN_BEO' };
    case 'f': case 'F': return { lokalno: 'CEO_EKRAN' };
    case 'p': case 'P': return { lokalno: 'KONZOLA' };
    case 'a': case 'A': return { lokalno: 'ANKETA' };
    case '?': return { lokalno: 'POMOC' };
    default: return null;
  }
}

/**
 * Tasteri samo dok konzola crta: `1`-`7` alat (redom `ALATI_CRTANJA`), `Ctrl+Z` poništi, `Ctrl+Y` i `Ctrl+Shift+Z` vrati
 * (i `Cmd` na Mac-u, i na ćirilici), `Esc` (prekid oblika u nastajanju ili kraj crtanja). `G` + cifre ima prednost
 * (`TastaturaIzvodjenja` prvo pita `GotoBafer`).
 */
export function tasterCrtanja(e: Taster): TasterAkcija | null {
  if (e.altKey) return null;
  if (e.ctrlKey || e.metaKey) {
    const k = kljucPrecice(e).toLowerCase();
    if (k === 'z') return { lokalno: e.shiftKey ? 'VRATI' : 'PONISTI' };
    if (k === 'y') return { lokalno: 'VRATI' };
    return null;
  }
  if (/^[1-7]$/.test(e.key)) return { lokalno: 'ALAT', vrednost: Number(e.key) - 1 };
  if (e.key === 'Escape') return { lokalno: 'ESC' };
  return null;
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
