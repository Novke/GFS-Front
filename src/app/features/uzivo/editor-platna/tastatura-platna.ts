// Prečice editora platna (odluka 24) kao čiste funkcije, bez Angular-a: okvir platna (`.uz-ep-platno`, F4b) ih zove iz
// svog `keydown`-a; Ctrl+S (`jeSnimanje`) obrađuje PRE provere `uPoljuZaUnos` i pušta ga do stranice. Poništi/ponovi
// (`jePonistavanje`) obrađuje koren editora, pa rade i kad je fokus u panelu ili traci.
import type { SmerZ } from './komande';

export type KomandaTastature =
  | { tip: 'OBRISI' | 'KOPIRAJ' | 'NALEPI' | 'DUPLIRAJ' | 'PONISTI' | 'PONOVI' | 'PONISTI_IZBOR' | 'IZABERI_SVE' | 'UREDI' }
  | { tip: 'Z'; smer: SmerZ }
  | { tip: 'POMERI'; dx: number; dy: number };

type Taster = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Ctrl+S / Cmd+S (okvir ga obrađuje pre provere polja, odluka 24). */
export function jeSnimanje(e: Taster): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's';
}

/** Prečice editora (odluka 24): slova iz `key` (QWERTZ), zagrade iz `code`; AltGr (Ctrl+Alt) nije prečica. */
export function komandaTastature(e: Taster): KomandaTastature | null {
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (e.code === 'BracketRight') return { tip: 'Z', smer: e.shiftKey ? 'NA_VRH' : 'NAPRED' };
    if (e.code === 'BracketLeft') return { tip: 'Z', smer: e.shiftKey ? 'NA_DNO' : 'NAZAD' };
    switch (k) {
      case 'z': return { tip: e.shiftKey ? 'PONOVI' : 'PONISTI' };
      case 'y': return { tip: 'PONOVI' };
      case 'c': return { tip: 'KOPIRAJ' };
      case 'v': return { tip: 'NALEPI' };
      case 'd': return { tip: 'DUPLIRAJ' };
      case 'a': return { tip: 'IZABERI_SVE' };
      default: return null;
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const korak = e.shiftKey ? 10 : 1;
  switch (k) {
    case 'Delete': case 'Backspace': return { tip: 'OBRISI' };
    case 'Escape': return { tip: 'PONISTI_IZBOR' };
    case 'Enter': case 'F2': return { tip: 'UREDI' };
    case 'ArrowLeft': return { tip: 'POMERI', dx: -korak, dy: 0 };
    case 'ArrowRight': return { tip: 'POMERI', dx: korak, dy: 0 };
    case 'ArrowUp': return { tip: 'POMERI', dx: 0, dy: -korak };
    case 'ArrowDown': return { tip: 'POMERI', dx: 0, dy: korak };
    default: return null;
  }
}

/** Poništi ili ponovi (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y): jedine prečice koje rade i van okvira platna. */
export function jePonistavanje(k: KomandaTastature): boolean {
  return k.tip === 'PONISTI' || k.tip === 'PONOVI';
}

/** Polja za unos i kontrole sa sopstvenim tasterima (odluka 24): editor ih ne presreće. */
const SOPSTVENI_TASTERI = 'input, textarea, select, [contenteditable="true"], .cdk-overlay-container, '
  + '[role="menu"], [role="menuitem"], [role="dialog"], [role="tab"], [role="tablist"], [role="combobox"], '
  + '[role="listbox"], [role="option"], [role="radio"], [role="slider"]';

export function uPoljuZaUnos(cilj: EventTarget | null): boolean {
  const el = cilj instanceof Element ? cilj : null;
  return !!el?.closest(SOPSTVENI_TASTERI);
}

/**
 * Zatvoren `mat-select` (dugme izbornika, `role="combobox"`): Ctrl+Z/Y mu ništa ne znače, pa ih koren editora sme da
 * obradi (posle izbora vrste ili crtice fokus ostaje na njemu). Otvoren izbornik i ostale kontrole zadržavaju svoje tastere.
 */
export function zatvorenIzbornik(cilj: EventTarget | null): boolean {
  const el = cilj instanceof Element ? cilj : null;
  return !!el?.matches('.mat-mdc-select[role="combobox"]') && el.getAttribute('aria-expanded') !== 'true';
}
