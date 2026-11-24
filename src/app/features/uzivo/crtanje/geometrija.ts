// Geometrija crteža: SVG putanje za 7 tipova, Shift ograničenja, proređivanje olovke i granice servera. Čiste funkcije
// (testiraju se u jsdom-u bez pregledača); prikaz kešira putanje po objektu elementa.
import {
  ElementCrteza, MAX_BAJTOVA, MAX_DEBLJINA, MAX_ELEMENATA, MAX_KOORDINATA, MAX_TACAKA_OLOVKE, MIN_DEBLJINA, TipElementa,
} from './crtanje.models';

export const naDesetinu = (v: number): number => Math.round(v * 10) / 10;

/** Koordinata u granicama servera (±2000), na jednu decimalu. */
export function uGranice(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return naDesetinu(Math.min(MAX_KOORDINATA, Math.max(-MAX_KOORDINATA, v)));
}

/** Jedna putanja elementa: linija (`fill: none`) ili popunjen vrh strelice. */
export interface PutanjaSvg {
  d: string;
  sirina: number;
  /** `stroke-dasharray` isprekidane linije, inače `null`. */
  crtice: string | null;
  /** Vrh strelice: popunjen trougao u boji elementa. */
  popunjeno: boolean;
}

const n = (v: number) => String(naDesetinu(v));

/**
 * Olovka glatko kroz sredine tačaka: od prve tačke kvadratnim krivama sa kontrolnom tačkom u svakoj tački i krajem u
 * sredini do sledeće, pa pravo do poslednje. Jedna tačka je tačka (kratka linija, okrugli krajevi).
 */
export function putanjaOlovke(t: readonly number[]): string {
  if (t.length < 2) return '';
  let d = `M${n(t[0])} ${n(t[1])}`;
  if (t.length < 4) return `${d}l0.01 0`;
  for (let i = 2; i + 3 < t.length; i += 2) {
    d += `Q${n(t[i])} ${n(t[i + 1])} ${n((t[i] + t[i + 2]) / 2)} ${n((t[i + 1] + t[i + 3]) / 2)}`;
  }
  return `${d}L${n(t[t.length - 2])} ${n(t[t.length - 1])}`;
}

/** Razmak crtica isprekidane linije za debljinu (kao maketa: crtica 2,2 d, razmak 2,6 d, najmanje kao za d = 2). */
export function crticeZa(debljina: number): string {
  const d = Math.max(debljina, 2);
  return `${n(d * 2.2)} ${n(d * 2.6)}`;
}

/** Vrh strelice: dužina i polovina ugla (radijani). */
const VRH_UGAO = 0.42;
export const duzinaVrha = (debljina: number): number => Math.max(16, debljina * 4);

/** Opisani pravougaonik oblika iz dve tačke prevlačenja. */
export function okvir(t: readonly number[]): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = t;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** SVG putanje elementa (prazno kad nema dovoljno tačaka). */
export function putanjeElementa(e: ElementCrteza): PutanjaSvg[] {
  const t = e.tacke;
  const sirina = e.debljina;
  if (e.tip === 'OLOVKA') {
    const d = putanjaOlovke(t);
    return d ? [{ d, sirina, crtice: null, popunjeno: false }] : [];
  }
  if (t.length !== 4) return [];
  const [x1, y1, x2, y2] = t;
  switch (e.tip) {
    case 'LINIJA':
    case 'ISPREKIDANA':
      return [{ d: `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, sirina, crtice: e.tip === 'ISPREKIDANA' ? crticeZa(sirina) : null, popunjeno: false }];
    case 'STRELICA': {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const l = duzinaVrha(sirina);
      // telo staje malo pre vrha, da debela linija ne viri preko šiljka
      const bx = x2 - l * 0.8 * Math.cos(a), by = y2 - l * 0.8 * Math.sin(a);
      const lx = x2 - l * Math.cos(a - VRH_UGAO), ly = y2 - l * Math.sin(a - VRH_UGAO);
      const dx = x2 - l * Math.cos(a + VRH_UGAO), dy = y2 - l * Math.sin(a + VRH_UGAO);
      return [
        { d: `M${n(x1)} ${n(y1)}L${n(bx)} ${n(by)}`, sirina, crtice: null, popunjeno: false },
        { d: `M${n(x2)} ${n(y2)}L${n(lx)} ${n(ly)}L${n(dx)} ${n(dy)}Z`, sirina: Math.max(2, sirina / 2), crtice: null, popunjeno: true },
      ];
    }
    case 'PRAVOUGAONIK': {
      const o = okvir(t);
      return [{ d: `M${n(o.x)} ${n(o.y)}H${n(o.x + o.w)}V${n(o.y + o.h)}H${n(o.x)}Z`, sirina, crtice: null, popunjeno: false }];
    }
    case 'KRUG':
    case 'ELIPSA': {
      const o = okvir(t);
      const rx = o.w / 2, ry = o.h / 2, cx = o.x + rx, cy = o.y + ry;
      const d = `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
      return [{ d, sirina, crtice: null, popunjeno: false }];
    }
  }
  return [];
}

const kes = new WeakMap<ElementCrteza, PutanjaSvg[]>();
/** `putanjeElementa` zapamćene po objektu: strana se menja dodavanjem, stari elementi ostaju isti objekti. */
export function putanjeKes(e: ElementCrteza): PutanjaSvg[] {
  let p = kes.get(e);
  if (!p) {
    p = putanjeElementa(e);
    kes.set(e, p);
  }
  return p;
}

const LINIJE: readonly TipElementa[] = ['LINIJA', 'ISPREKIDANA', 'STRELICA'];

/**
 * Kraj prevlačenja oblika od (x1, y1) do pokazivača (x, y): `KRUG` je uvek u kvadratu; uz `Shift` linije idu na 45°,
 * pravougaonik je kvadrat, a elipsa krug. Kvadrat ima stranicu veće razlike, u smeru pokazivača.
 */
export function krajOblika(tip: TipElementa, x1: number, y1: number, x: number, y: number, shift: boolean): [number, number] {
  if (tip === 'KRUG' || (shift && (tip === 'PRAVOUGAONIK' || tip === 'ELIPSA'))) {
    const s = Math.max(Math.abs(x - x1), Math.abs(y - y1));
    return [naDesetinu(x1 + Math.sign(x - x1 || 1) * s), naDesetinu(y1 + Math.sign(y - y1 || 1) * s)];
  }
  if (shift && LINIJE.includes(tip)) {
    const ugao = Math.round(Math.atan2(y - y1, x - x1) / (Math.PI / 4)) * (Math.PI / 4);
    const l = Math.hypot(x - x1, y - y1);
    return [naDesetinu(x1 + l * Math.cos(ugao)), naDesetinu(y1 + l * Math.sin(ugao))];
  }
  return [x, y];
}

/** Gusto zbijene tačke olovke se proređuju: nova tačka ulazi samo ako je od poslednje udaljena bar 1 jedinicu. */
export const MIN_RAZMAK_TACAKA = 1;
export function dodajTacku(tacke: number[], x: number, y: number): boolean {
  const k = tacke.length;
  if (k >= 2 && Math.hypot(x - tacke[k - 2], y - tacke[k - 1]) < MIN_RAZMAK_TACAKA) return false;
  tacke.push(x, y);
  return true;
}

/** Oblik (ne olovka) kraći od 4 jedinice se odbacuje (slučajan klik). */
export const MIN_OBLIK = 4;
export function premali(e: ElementCrteza): boolean {
  if (e.tip === 'OLOVKA') return e.tacke.length < 2;
  const [x1, y1, x2, y2] = e.tacke;
  return Math.hypot(x2 - x1, y2 - y1) < MIN_OBLIK;
}

/** Element u granicama servera: boja velikim slovima, debljina 1–40, koordinate ±2000 na desetinu. */
export function normalizuj(e: ElementCrteza): ElementCrteza {
  const debljina = Number.isFinite(e.debljina) ? Math.min(MAX_DEBLJINA, Math.max(MIN_DEBLJINA, e.debljina)) : MIN_DEBLJINA;
  return { tip: e.tip, boja: e.boja.toUpperCase(), debljina, tacke: e.tacke.map(uGranice) };
}

/** Olovka duža od 5000 tačaka se deli na više elemenata (svaki naredni počinje u poslednjoj tački prethodnog). */
export function podeliOlovku(e: ElementCrteza): ElementCrteza[] {
  if (e.tip !== 'OLOVKA' || e.tacke.length <= MAX_TACAKA_OLOVKE * 2) return [e];
  const delovi: ElementCrteza[] = [];
  const korak = (MAX_TACAKA_OLOVKE - 1) * 2;
  for (let i = 0; i < e.tacke.length - 2; i += korak) {
    delovi.push({ ...e, tacke: e.tacke.slice(i, Math.min(e.tacke.length, i + MAX_TACAKA_OLOVKE * 2)) });
  }
  return delovi;
}

/** Gotov element za stranu: normalizovan i podeljen; prazno kad je premali. */
export function gotovElement(e: ElementCrteza): ElementCrteza[] {
  const g = normalizuj(e);
  return premali(g) ? [] : podeliOlovku(g);
}

/** Da li strana staje u granice servera (broj elemenata i veličina tela). */
export function staje(elementi: readonly ElementCrteza[]): boolean {
  if (elementi.length > MAX_ELEMENATA) return false;
  // telo je `{"elementi":[...]}`; JSON.stringify je ovde jeftin u odnosu na mrežu, a poziva se samo pri izmeni
  return JSON.stringify({ elementi }).length <= MAX_BAJTOVA;
}
