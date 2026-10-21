// Crtež rukom kao SVG (spec 4.4 ISCRTAJ, plan faze 5 odluke 7 i 9). Čiste funkcije, bez Angular-a.
import type { Potez, VrstaAnimacije } from '../data-access/platno.models';

/** Kapija W1: `false` vraća prikaz slike i staro ISCRTAJ ponašanje (kao BRISANJE), ako vizuelna provera to traži. */
export const CRTEZ_KAO_VEKTOR = true;
/** Najkraći deo iscrtavanja jednog poteza (jedan kadar), kad ukupno trajanje to dozvoljava. */
export const NAJKRACI_POTEZ_MS = 16;

/**
 * Najveća apsolutna koordinata nacrtivog poteza (jedinice sloja). Server traži samo konačne brojeve, pa ±1e308 prolazi, a
 * takva tačka daje `Infinity` u putanji i dužini; nijedan stvaran crtež nije ni blizu (platno je 960 x 540).
 */
export const MAX_KOORDINATA = 1e6;
const BOJA_POTEZA = /^#[0-9A-Fa-f]{6}$/;

const br = (v: number) => String(Math.round(v * 10) / 10);

/** SVG putanja poteza (`x0, y0, x1, y1, …`); jedna tačka je `M x y L x y` (okrugao kraj daje tačku). */
export function putanjaPoteza(tacke: readonly number[]): string {
  const n = Math.floor(tacke.length / 2);
  if (n === 0) return '';
  const d = [`M${br(tacke[0])} ${br(tacke[1])}`];
  if (n === 1) d.push(`L${br(tacke[0])} ${br(tacke[1])}`);
  for (let i = 1; i < n; i++) d.push(`L${br(tacke[2 * i])} ${br(tacke[2 * i + 1])}`);
  return d.join(' ');
}

/** Dužina izlomljene linije poteza u jedinicama sloja (jedna tačka: 0). */
export function duzinaPoteza(tacke: readonly number[]): number {
  let l = 0;
  for (let i = 2; i + 1 < tacke.length; i += 2) l += Math.hypot(tacke[i] - tacke[i - 2], tacke[i + 1] - tacke[i - 1]);
  return l;
}

/**
 * Potez koji može da se nacrta: bar jedna cela tačka, sve koordinate konačne i u `±MAX_KOORDINATA`, debljina konačna i
 * veća od 0, boja `#RRGGBB` (atribut `stroke` ne izvršava skript, ali `url(...)` bi bio referenca na resurs).
 */
export function nacrtivPotez(p: Potez): boolean {
  return Array.isArray(p.tacke) && p.tacke.length >= 2
    && p.tacke.every((v) => Number.isFinite(v) && Math.abs(v) <= MAX_KOORDINATA)
    && Number.isFinite(p.debljina) && p.debljina > 0
    && typeof p.boja === 'string' && BOJA_POTEZA.test(p.boja);
}

export interface PrikazPoteza { d: string; boja: string; debljina: number; duzina: number; }

/** Keš po nizu poteza: snimak i pomeranje u editoru daju nov objekat sloja, ali isti niz (`skalirajPoteze`, `{...s, x}`). */
const kesPutanja = new WeakMap<readonly Potez[], readonly PrikazPoteza[]>();

/**
 * Nacrtivi potezi crteža (neispravni se preskaču) sa SVG putanjom i dužinom, redom zapisa. Prazno = nema nijednog
 * nacrtivog poteza, pa prikaz crta sliku (jedno pravilo za `null`, `[]`, prazne tačke i neispravne brojeve).
 */
export function putanjeCrteza(potezi: readonly Potez[]): readonly PrikazPoteza[] {
  let r = kesPutanja.get(potezi);
  if (!r) {
    r = potezi.filter(nacrtivPotez).map((p) => ({
      d: putanjaPoteza(p.tacke), boja: p.boja, debljina: p.debljina, duzina: duzinaPoteza(p.tacke),
    }));
    kesPutanja.set(potezi, r);
  }
  return r;
}

export interface DeoIscrtavanja { indeks: number; pocetakMs: number; trajanjeMs: number; }

/**
 * Raspored iscrtavanja unutar `trajanjeMs`: potezi jedan za drugim (ULAZ redom zapisa, IZLAZ obrnuto), svaki dobija
 * `NAJKRACI_POTEZ_MS` (ili ravnomeran deo kad je ukupno kraće) plus ostatak srazmerno dužini; potezi dužine 0 dele
 * ostatak ravnomerno kad su svi takvi. Granice delova se zaokružuju na ceo ms, pa je zbir trajanja tačno `trajanjeMs`.
 * Nekonačna, NaN ili negativna dužina se broji kao 0, zbir koji prelije daje ravnomernu podelu, a nekonačno ili NaN
 * trajanje je 0: `Element.animate` sa NaN trajanjem baca izuzetak usred `pusti`.
 */
export function planIscrtavanja(duzine: readonly number[], trajanjeMs: number, vrsta: VrstaAnimacije): DeoIscrtavanja[] {
  const n = duzine.length;
  if (n === 0) return [];
  const redosled = vrsta === 'IZLAZ' ? [...duzine.keys()].reverse() : [...duzine.keys()];
  if (!(trajanjeMs > 0) || !Number.isFinite(trajanjeMs)) return redosled.map((indeks) => ({ indeks, pocetakMs: 0, trajanjeMs: 0 }));
  const najmanje = trajanjeMs >= n * NAJKRACI_POTEZ_MS ? NAJKRACI_POTEZ_MS : trajanjeMs / n;
  const ostatak = trajanjeMs - najmanje * n;
  const duz = duzine.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const zbir = duz.reduce((a, b) => a + b, 0);
  const ukupno = Number.isFinite(zbir) ? zbir : 0;
  let t = 0;
  return redosled.map((indeks) => {
    const d = najmanje + (ukupno > 0 ? (ostatak * duz[indeks]) / ukupno : ostatak / n);
    const deo = { indeks, pocetakMs: Math.round(t), trajanjeMs: Math.round(t + d) - Math.round(t) };
    t += d;
    return deo;
  });
}

/** Kadrovi jednog poteza (`pathLength="1"`): pre svog dela nevidljiv, pa se crta (ULAZ) ili briše od kraja (IZLAZ). */
export function kadroviPoteza(vrsta: VrstaAnimacije): Keyframe[] {
  const crtica = { strokeDasharray: '1 1' };
  return vrsta === 'ULAZ'
    ? [
        { ...crtica, strokeDashoffset: '1', opacity: 0, offset: 0 },
        { ...crtica, strokeDashoffset: '1', opacity: 1, offset: 0.001 },
        { ...crtica, strokeDashoffset: '0', opacity: 1, offset: 1 },
      ]
    : [
        { ...crtica, strokeDashoffset: '0', opacity: 1, offset: 0 },
        { ...crtica, strokeDashoffset: '1', opacity: 1, offset: 0.999 },
        { ...crtica, strokeDashoffset: '1', opacity: 0, offset: 1 },
      ];
}
