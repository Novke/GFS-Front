// Crtež rukom kao SVG (spec 4.4 ISCRTAJ, plan faze 5 odluke 7 i 9). Čiste funkcije, bez Angular-a.
import type { VrstaAnimacije } from '../data-access/platno.models';

/** Kapija W1: `false` vraća prikaz slike i staro ISCRTAJ ponašanje (kao BRISANJE), ako vizuelna provera to traži. */
export const CRTEZ_KAO_VEKTOR = true;
/** Najkraći deo iscrtavanja jednog poteza (jedan kadar), kad ukupno trajanje to dozvoljava. */
export const NAJKRACI_POTEZ_MS = 16;

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

export interface DeoIscrtavanja { indeks: number; pocetakMs: number; trajanjeMs: number; }

/**
 * Raspored iscrtavanja unutar `trajanjeMs`: potezi jedan za drugim (ULAZ redom zapisa, IZLAZ obrnuto), svaki dobija
 * `NAJKRACI_POTEZ_MS` (ili ravnomeran deo kad je ukupno kraće) plus ostatak srazmerno dužini; potezi dužine 0 dele
 * ostatak ravnomerno kad su svi takvi. Granice delova se zaokružuju na ceo ms, pa je zbir trajanja tačno `trajanjeMs`.
 */
export function planIscrtavanja(duzine: readonly number[], trajanjeMs: number, vrsta: VrstaAnimacije): DeoIscrtavanja[] {
  const n = duzine.length;
  if (n === 0) return [];
  const redosled = vrsta === 'IZLAZ' ? [...duzine.keys()].reverse() : [...duzine.keys()];
  if (trajanjeMs <= 0) return redosled.map((indeks) => ({ indeks, pocetakMs: 0, trajanjeMs: 0 }));
  const najmanje = trajanjeMs >= n * NAJKRACI_POTEZ_MS ? NAJKRACI_POTEZ_MS : trajanjeMs / n;
  const ostatak = trajanjeMs - najmanje * n;
  const ukupno = duzine.reduce((a, b) => a + b, 0);
  let t = 0;
  return redosled.map((indeks) => {
    const d = najmanje + (ukupno > 0 ? (ostatak * duzine[indeks]) / ukupno : ostatak / n);
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
