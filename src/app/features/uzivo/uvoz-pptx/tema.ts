// Tema fajla (boje, fontovi, debljine linija), mapa boja, boje DrawingML-a sa modifikatorima i zamena fontova
// fontovima platna. Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import { FONTOVI_PLATNA } from '../ui/platno-fontovi';
import { presetBoja } from './preset-boje';
import { brojAtr, deca, dete, NS } from './xml';

export interface TemaFajla {
  /** Ključevi `dk1`, `lt1`, `dk2`, `lt2`, `accent1..6`, `hlink`, `folHlink`; vrednost `#RRGGBB`. */
  boje: Readonly<Record<string, string>>;
  fontNaslova: string;
  fontTela: string;
  /** Debljine iz `a:lnStyleLst` u pt (za `a:lnRef idx`). */
  debljineLinija: readonly number[];
}

/** Office 2013+ tema (iste boje kao tema fabrike F1), Calibri Light / Calibri, linije 0,5 / 1 / 1,5 pt. */
export const PODRAZUMEVANA_TEMA: TemaFajla = Object.freeze({
  boje: Object.freeze({
    dk1: '#000000', lt1: '#FFFFFF', dk2: '#44546A', lt2: '#E7E6E6',
    accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
    hlink: '#0563C1', folHlink: '#954F72',
  }),
  fontNaslova: 'Calibri Light',
  fontTela: 'Calibri',
  debljineLinija: Object.freeze([0.5, 1, 1.5]),
});

const KLJUCEVI_TEME = new Set(Object.keys(PODRAZUMEVANA_TEMA.boje));

/** Podrazumevani `p:clrMap` (kao u Office masteru). */
const PODRAZUMEVANA_MAPA: Readonly<Record<string, string>> = Object.freeze({
  bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2',
  accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
  hlink: 'hlink', folHlink: 'folHlink',
});

const EMU_PO_PT = 12700;
const HEX6 = /^[0-9A-Fa-f]{6}$/;

/** Tema iz `ppt/theme/themeN.xml`; `null`, neispravan koren ili tema bez `a:themeElements` -> `PODRAZUMEVANA_TEMA`. */
export function procitajTemu(doc: Document | null): TemaFajla {
  const koren = doc?.documentElement;
  if (!koren || koren.namespaceURI !== NS.a || koren.localName !== 'theme') return PODRAZUMEVANA_TEMA;
  const elementi = dete(koren, NS.a, 'themeElements');
  if (!elementi) return PODRAZUMEVANA_TEMA;

  const boje: Record<string, string> = { ...PODRAZUMEVANA_TEMA.boje };
  const sema = dete(elementi, NS.a, 'clrScheme');
  if (sema) {
    const k: KontekstBoja = { tema: PODRAZUMEVANA_TEMA, mapaBoja: PODRAZUMEVANA_MAPA };
    for (const el of Array.from(sema.children)) {
      if (el.namespaceURI !== NS.a || !KLJUCEVI_TEME.has(el.localName)) continue;
      const b = bojaIz(el, k);
      if (b) boje[el.localName] = b.hex;
    }
  }

  const fontovi = dete(elementi, NS.a, 'fontScheme');
  const font = (ime: 'majorFont' | 'minorFont', podr: string) => {
    const latin = fontovi && dete(fontovi, NS.a, ime);
    const t = (latin && dete(latin, NS.a, 'latin'))?.getAttribute('typeface')?.trim();
    return t && !t.startsWith('+') ? t : podr;
  };

  const lnStil = dete(elementi, NS.a, 'fmtScheme');
  const linije = lnStil && dete(lnStil, NS.a, 'lnStyleLst');
  const debljine = linije ? deca(linije, NS.a, 'ln').map((ln) => Math.round(brojAtr(ln, 'w', 0) / EMU_PO_PT * 100) / 100) : [];

  return {
    boje,
    fontNaslova: font('majorFont', PODRAZUMEVANA_TEMA.fontNaslova),
    fontTela: font('minorFont', PODRAZUMEVANA_TEMA.fontTela),
    debljineLinija: debljine.length > 0 ? debljine : PODRAZUMEVANA_TEMA.debljineLinija,
  };
}

function prepisiMapu(m: Record<string, string>, el: Element | null): void {
  if (!el) return;
  for (const a of Array.from(el.attributes)) {
    if (a.namespaceURI == null && Object.hasOwn(PODRAZUMEVANA_MAPA, a.name) && KLJUCEVI_TEME.has(a.value)) m[a.name] = a.value;
  }
}

/**
 * Mapa boja (`bg1` -> `lt1`, ...): `p:clrMap` mastera, pa redom `p:clrMapOvr/a:overrideClrMapping` layouta i slajda
 * (`a:masterClrMapping` ne menja ništa). Nepoznate vrednosti se zanemaruju.
 */
export function mapaBoja(master: Document | null, ...prepisi: (Document | null)[]): Record<string, string> {
  const m: Record<string, string> = { ...PODRAZUMEVANA_MAPA };
  if (master?.documentElement) prepisiMapu(m, dete(master.documentElement, NS.p, 'clrMap'));
  for (const d of prepisi) {
    const ovr = d?.documentElement ? dete(d.documentElement, NS.p, 'clrMapOvr') : null;
    prepisiMapu(m, ovr && dete(ovr, NS.a, 'overrideClrMapping'));
  }
  return m;
}

export interface KontekstBoja { tema: TemaFajla; mapaBoja: Readonly<Record<string, string>>; phClr?: string; }
/** `hex` = `#RRGGBB` velikim slovima, `alfa` 0..1. */
export interface Boja { hex: string; alfa: number; }

type Rgb = [number, number, number];

const ELEMENTI_BOJE = new Set(['srgbClr', 'schemeClr', 'prstClr', 'sysClr', 'scrgbClr', 'hslClr']);
const SISTEMSKE: Readonly<Record<string, string>> = { windowText: '#000000', window: '#FFFFFF' };

const uLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const uSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const ogranici = (c: number) => (Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0);

function izHex(hex: string): Rgb {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!HEX6.test(h)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

function uHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.round(ogranici(c) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** RGB -> HSL (h u stepenima 0..360, s i l 0..1). */
function uHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function izHsl([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const kanal = (t: number) => {
    const u = ((t % 1) + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const hn = h / 360;
  return [kanal(hn + 1 / 3), kanal(hn), kanal(hn - 1 / 3)];
}

/** Osnovna boja elementa (bez modifikatora) kao `#RRGGBB`, ili `null`. */
function osnovna(el: Element, k: KontekstBoja): string | null {
  const val = el.getAttribute('val')?.trim() ?? '';
  switch (el.localName) {
    case 'srgbClr':
      return HEX6.test(val) ? `#${val.toUpperCase()}` : null;
    case 'schemeClr': {
      if (val === 'phClr') return k.phClr ? uHex(izHex(k.phClr)) : null;
      // clrMap mapira bg1/tx1/bg2/tx2 (i, po ECMA-376, accent1..6/hlink/folHlink, u praksi na same sebe).
      const kljuc = Object.hasOwn(PODRAZUMEVANA_MAPA, val) ? (k.mapaBoja[val] ?? PODRAZUMEVANA_MAPA[val]) : val;
      return Object.hasOwn(k.tema.boje, kljuc) ? k.tema.boje[kljuc] : null;
    }
    case 'prstClr':
      return presetBoja(val);
    case 'sysClr': {
      const poslednja = el.getAttribute('lastClr')?.trim() ?? '';
      if (HEX6.test(poslednja)) return `#${poslednja.toUpperCase()}`;
      return Object.hasOwn(SISTEMSKE, val) ? SISTEMSKE[val] : null;
    }
    case 'scrgbClr':
      return uHex(['r', 'g', 'b'].map((a) => uSrgb(ogranici(brojAtr(el, a, 0) / 100000))) as Rgb);
    case 'hslClr':
      return uHex(izHsl([brojAtr(el, 'hue', 0) / 60000, ogranici(brojAtr(el, 'sat', 0) / 100000), ogranici(brojAtr(el, 'lum', 0) / 100000)]));
    default:
      return null;
  }
}

/**
 * Boja iz prvog deteta-boje elementa (`srgbClr|schemeClr|prstClr|sysClr|scrgbClr|hslClr`), sa modifikatorima tog
 * deteta. Nema boje, nepoznata šema/preset ili `phClr` bez `k.phClr` -> `null`.
 */
export function bojaIz(roditelj: Element | null, k: KontekstBoja): Boja | null {
  if (!roditelj) return null;
  const el = Array.from(roditelj.children).find((d) => d.namespaceURI === NS.a && ELEMENTI_BOJE.has(d.localName));
  if (!el) return null;
  const hex = osnovna(el, k);
  if (!hex) return null;
  const mods = Array.from(el.children)
    .filter((d) => d.namespaceURI === NS.a)
    .map((d) => ({ ime: d.localName, val: brojAtr(d, 'val', 0) }));
  return primeniModifikatore(hex, mods);
}

/**
 * Modifikatori boje redom kako su u XML-u (`val` u 1/1000 %): `tint`/`shade` u linearnom RGB-u, `lumMod`/`lumOff`/
 * `satMod`/`satOff` u HSL-u, `alpha` -> `alfa`, `gray`, `inv`, `comp`; ostali se zanemaruju.
 */
export function primeniModifikatore(hex: string, mods: readonly { ime: string; val: number }[]): Boja {
  let rgb = izHex(hex);
  let alfa = 1;
  const hsl = (f: (h: Rgb) => Rgb) => {
    const [h, s, l] = f(uHsl(rgb));
    rgb = izHsl([h, ogranici(s), ogranici(l)]);
  };
  for (const { ime, val } of mods) {
    const f = val / 100000;
    switch (ime) {
      case 'tint':
        rgb = rgb.map((c) => uSrgb(ogranici(f) * uLin(c) + (1 - ogranici(f)))) as Rgb;
        break;
      case 'shade':
        rgb = rgb.map((c) => uSrgb(ogranici(f) * uLin(c))) as Rgb;
        break;
      case 'lumMod': hsl(([h, s, l]) => [h, s, l * f]); break;
      case 'lumOff': hsl(([h, s, l]) => [h, s, l + f]); break;
      case 'satMod': hsl(([h, s, l]) => [h, s * f, l]); break;
      case 'satOff': hsl(([h, s, l]) => [h, s + f, l]); break;
      case 'comp': hsl(([h, s, l]) => [(h + 180) % 360, s, l]); break;
      case 'alpha': alfa = ogranici(f); break;
      case 'inv':
        rgb = rgb.map((c) => 1 - c) as Rgb;
        break;
      case 'gray': {
        const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        rgb = [y, y, y];
        break;
      }
    }
    rgb = rgb.map(ogranici) as Rgb;
  }
  return { hex: uHex(rgb), alfa };
}

/** Boja sa alfom preko neprovidne pozadine (`#RRGGBB`); model platna nema providnost boje. */
export function pomesaj(boja: Boja, pozadina: string): string {
  const a = ogranici(boja.alfa);
  const p = izHex(pozadina);
  return uHex(izHex(boja.hex).map((c, i) => a * c + (1 - a) * p[i]) as Rgb);
}

const APTOS = /^aptos( display| narrow)?$/i;
// "mono" samo kao zasebna reč (Andale Mono, DejaVu Sans Mono), ne Monotype Corsiva/Sorts; "consol" pokriva Consolas i
// Lucida Console.
const MONO = /\bmono\b|monospace|consol|courier/i;
const SERIF = /serif|times|roman|georgia|garamond|book|cambria/i;
const SANS = /\bsans\b/i;

/**
 * Font platna za ime iz PPTX-a: `+mj-*` -> font naslova teme, `+mn-*` i prazno -> font tela; naziv ili `zamenjuje`
 * iz kataloga (bez obzira na velika slova) i `Calibri Light` -> bez upozorenja; ostalo -> Carlito/Tinos/Caladea/Cousine
 * uz upozorenje (pozivalac ga prijavljuje kao `FONT_ZAMENJEN`).
 */
export function zamenaFonta(ime: string | null, tema: TemaFajla): { font: string; upozorenje: string | null } {
  let n = (ime ?? '').trim();
  if (/^\+mj-/i.test(n)) n = tema.fontNaslova.trim();
  else if (n === '' || /^\+mn-/i.test(n)) n = tema.fontTela.trim();
  if (n === '' || n.startsWith('+')) n = PODRAZUMEVANA_TEMA.fontTela;

  const malo = n.toLowerCase();
  const izKataloga = FONTOVI_PLATNA.find((f) => f.naziv.toLowerCase() === malo)
    ?? FONTOVI_PLATNA.find((f) => f.zamenjuje.some((z) => z.toLowerCase() === malo));
  if (izKataloga) return { font: izKataloga.naziv, upozorenje: null };
  if (malo === 'calibri light') return { font: 'Carlito', upozorenje: null };
  if (APTOS.test(n)) return { font: 'Carlito', upozorenje: `Font '${n}' zamenjen fontom Carlito (metrike nisu iste).` };

  // "Sans Serif" u imenu (npr. Microsoft Sans Serif) je bezserifni font; monospace ostaje monospace (poravnanje koda).
  const font = malo === 'cambria math' ? 'Caladea'
    : MONO.test(n) ? 'Cousine'
      : SERIF.test(n) && !SANS.test(n) ? 'Tinos'
        : 'Carlito';
  return { font, upozorenje: `Font '${n}' zamenjen fontom ${font}.` };
}
