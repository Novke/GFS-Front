// Čista geometrija editora platna (jedinice platna 960 x 540, rotacija u stepenima oko centra, smer kazaljke):
// izbor i pogađanje slojeva, ručke rotiranog okvira, rotacija, vođice pri pomeranju i krajevi linije. Bez Angular-a i
// bez biblioteka; svaki rezultat koji ide u dokument je u granicama servera (`PlatnoPP`) i ima najviše 2 decimale.
import type { OblikSloj, Sloj, Tacka } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';

export const SIRINA_PLATNA = 960;
export const VISINA_PLATNA = 540;
export const MIN_VELICINA = 1; // širina i visina sloja posle ručke (server: > 0)
export const MAX_VELICINA = 2880;
export const MIN_XY = -960;
export const MAX_XY = 1920;
/** Najmanja širina i visina koju `ogranici` ostavlja (server traži > 0 posle zaokruživanja na 2 decimale). */
const NAJMANJE = 0.01;
/** Šum zaokruživanja pri poređenju sa ivicom pravougaonika izbora (rotacija 90° daje 1e-14). */
const EPS = 1e-6;

/** Položaj, veličina i rotacija sloja (jedinice platna; rotacija u stepenima, oko centra, smer kazaljke). */
export interface Kutija { x: number; y: number; sirina: number; visina: number; rotacija: number; }
/** Pravougaonik poravnat sa osama (obuhvat). */
export interface Obuhvat { x: number; y: number; sirina: number; visina: number; }
/** Ručke: strane sveta (S = gore, J = dole, I = desno, Z = levo). U DOM-u `data-rucka="JI"` (kuka za testove). */
export type Rucka = 'SZ' | 'S' | 'SI' | 'I' | 'JI' | 'J' | 'JZ' | 'Z';
export interface Vodjica { osa: 'x' | 'y'; poz: number; od: number; do: number; }

const RAD = Math.PI / 180;
const ogr = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function rotiraj(t: Tacka, stepeni: number): Tacka {
  const a = stepeni * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: t.x * cos - t.y * sin, y: t.x * sin + t.y * cos };
}

export function kutijaSloja(s: Sloj): Kutija {
  return { x: s.x, y: s.y, sirina: s.sirina, visina: s.visina, rotacija: s.rotacija };
}

export function centar(k: Kutija): Tacka {
  return { x: k.x + k.sirina / 2, y: k.y + k.visina / 2 };
}

/** Tačka platna -> lokalne koordinate sloja (centar = 0,0, ose sloja, bez rotacije). */
export function uLokalne(k: Kutija, t: Tacka): Tacka {
  const c = centar(k);
  return rotiraj({ x: t.x - c.x, y: t.y - c.y }, -k.rotacija);
}

/** Lokalne koordinate sloja -> tačka platna. */
export function uSvetske(k: Kutija, l: Tacka): Tacka {
  const c = centar(k);
  const r = rotiraj(l, k.rotacija);
  return { x: c.x + r.x, y: c.y + r.y };
}

/** Uglovi okvira na platnu: SZ, SI, JI, JZ (pre rotacije). */
export function uglovi(k: Kutija): [Tacka, Tacka, Tacka, Tacka] {
  const w = k.sirina / 2;
  const h = k.visina / 2;
  return [uSvetske(k, { x: -w, y: -h }), uSvetske(k, { x: w, y: -h }), uSvetske(k, { x: w, y: h }), uSvetske(k, { x: -w, y: h })];
}

function obuhvatTacaka(tacke: readonly Tacka[]): Obuhvat {
  const xs = tacke.map((t) => t.x);
  const ys = tacke.map((t) => t.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, sirina: Math.max(...xs) - x, visina: Math.max(...ys) - y };
}

/** Obuhvat rotiranog okvira (poravnat sa osama; nije zaokružen, služi za izbor i vođice). */
export function obuhvat(k: Kutija): Obuhvat {
  return obuhvatTacaka(uglovi(k));
}

export function obuhvatSvih(kutije: readonly Kutija[]): Obuhvat | null {
  return kutije.length === 0 ? null : obuhvatTacaka(kutije.flatMap((k) => uglovi(k)));
}

/** U granice servera (x, y u [-960, 1920], veličina u (0, 2880]), 2 decimale. Ne povećava postojeći mali sloj. */
export function ogranici(k: Kutija): Kutija {
  return {
    x: z(ogr(k.x, MIN_XY, MAX_XY)),
    y: z(ogr(k.y, MIN_XY, MAX_XY)),
    sirina: z(ogr(k.sirina, NAJMANJE, MAX_VELICINA)),
    visina: z(ogr(k.visina, NAJMANJE, MAX_VELICINA)),
    rotacija: normalizujUgao(k.rotacija),
  };
}

export function pomeriKutiju(k: Kutija, dx: number, dy: number): Kutija {
  return ogranici({ ...k, x: k.x + dx, y: k.y + dy });
}

const SMER: Record<Rucka, { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }> = {
  SZ: { sx: -1, sy: -1 }, S: { sx: 0, sy: -1 }, SI: { sx: 1, sy: -1 }, I: { sx: 1, sy: 0 },
  JI: { sx: 1, sy: 1 }, J: { sx: 0, sy: 1 }, JZ: { sx: -1, sy: 1 }, Z: { sx: -1, sy: 0 },
};

/**
 * Položaj novog okvira je linearan po širini i visini: x = x0 + ax * w + bx * h, y = y0 + ay * w + by * h (sidro, odnosno
 * centar kod `odCentra`, je fiksno, a strana sidra na kojoj je okvir je zadata).
 */
interface LinearanPolozaj { x0: number; ax: number; bx: number; y0: number; ay: number; by: number; }

/** Najmanja rezerva pri poređenju sa granicom (šum pokretnog zareza; `ogranici` posle steže ostatak). */
const SUM = 1e-9;

/**
 * Najveće t u [od, 1] za koje su x i y okvira (w + t * dw, h + t * dh) u [-960, 1920]; null ako takvog t nema.
 * Svaki uslov je linearan po t, pa je dozvoljeni skup interval.
 */
function najveceT(p: LinearanPolozaj, w: number, h: number, dw: number, dh: number, od: number): number | null {
  let lo = od;
  let hi = 1;
  const uslovi: [number, number][] = [
    [p.x0 + p.ax * w + p.bx * h, p.ax * dw + p.bx * dh],
    [p.y0 + p.ay * w + p.by * h, p.ay * dw + p.by * dh],
  ];
  for (const [v0, v1] of uslovi) {
    if (Math.abs(v1) < 1e-12) {
      if (v0 < MIN_XY - SUM || v0 > MAX_XY + SUM) return null;
      continue;
    }
    const a = (MIN_XY - v0) / v1;
    const b = (MAX_XY - v0) / v1;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return lo <= hi + SUM ? Math.max(lo, hi) : null;
}

/**
 * Nova kutija kad se ručka `rucka` prevuče na `pokazivac` (tačka platna). Suprotna tačka (sidro) ostaje na istom mestu
 * na platnu i kad je sloj rotiran; prevlačenje preko sidra ne okreće sloj (model nema preslikavanje), nego ga stavlja sa
 * druge strane sidra. `odnos` (Shift, samo ugaone ručke) čuva odnos strana, `odCentra` (Ctrl) menja veličinu oko centra.
 * Širina i visina su u [1, 2880] (sa `odnos` se odnos čuva i na granicama kad god je to moguće). Kad bi okvir prešao
 * granice položaja servera (x, y u [-960, 1920]), sloj se smanjuje (ne klizi), pa sidro, odnosno centar, ostaje na mestu.
 */
export function promeniVelicinu(k: Kutija, rucka: Rucka, pokazivac: Tacka, o: { odnos?: boolean; odCentra?: boolean } = {}): Kutija {
  const { sx, sy } = SMER[rucka];
  const l = uLokalne(k, pokazivac);
  const sidro = o.odCentra ? { x: 0, y: 0 } : { x: -sx * k.sirina / 2, y: -sy * k.visina / 2 };
  const puta = o.odCentra ? 2 : 1;
  let w = sx === 0 ? k.sirina : Math.abs(l.x - sidro.x) * puta;
  let h = sy === 0 ? k.visina : Math.abs(l.y - sidro.y) * puta;
  const saOdnosom = !!o.odnos && sx !== 0 && sy !== 0 && k.sirina > 0 && k.visina > 0;
  if (saOdnosom) {
    const najmanje = Math.max(MIN_VELICINA / k.sirina, MIN_VELICINA / k.visina);
    const najvise = Math.min(MAX_VELICINA / k.sirina, MAX_VELICINA / k.visina);
    const f = ogr(Math.max(w / k.sirina, h / k.visina), najmanje, Math.max(najmanje, najvise));
    w = k.sirina * f;
    h = k.visina * f;
  }
  w = ogr(w, MIN_VELICINA, MAX_VELICINA);
  h = ogr(h, MIN_VELICINA, MAX_VELICINA);
  // Strana sidra na kojoj je pokazivač (0 = tačno na sidru: zadrži prvobitnu stranu).
  const px = sx === 0 ? 0 : (Math.sign(l.x - sidro.x) || sx);
  const py = sy === 0 ? 0 : (Math.sign(l.y - sidro.y) || sy);
  // Centar u lokalnim osama je sidro + (px * w / 2, py * h / 2) (kod `odCentra` 0), pa je na platnu
  // c = A + R(px * w / 2, py * h / 2), a x = c.x - w / 2, y = c.y - h / 2.
  const A = uSvetske(k, sidro);
  const cos = Math.cos(k.rotacija * RAD);
  const sin = Math.sin(k.rotacija * RAD);
  const p: LinearanPolozaj = o.odCentra
    ? { x0: A.x, ax: -0.5, bx: 0, y0: A.y, ay: 0, by: -0.5 }
    : { x0: A.x, ax: (cos * px - 1) / 2, bx: -sin * py / 2, y0: A.y, ay: sin * px / 2, by: (cos * py - 1) / 2 };
  const menjaW = sx !== 0;
  const menjaH = sy !== 0;
  // Prvo se promenljive strane smanjuju zajedno ka najmanjem okviru uz sidro: sa `odnos` ka (0, 0) (t * w, t * h, odnos
  // ostaje, t >= 1 / strana zbog minimuma 1), inače ka (1, 1), pa strana koja je već 1 ostaje 1 ...
  const baza = saOdnosom ? 0 : MIN_VELICINA;
  const w0 = menjaW ? baza : w;
  const h0 = menjaH ? baza : h;
  const t = najveceT(p, w0, h0, w - w0, h - h0, saOdnosom ? Math.max(MIN_VELICINA / w, MIN_VELICINA / h) : 0);
  if (t !== null && t < 1) {
    const zeljeno = { w, h };
    w = w0 + t * (w - w0);
    h = h0 + t * (h - h0);
    // ... pa se bez `odnos` svaka strana vraća ka željenoj koliko granice dozvoljavaju (bez rotacije: svaka posebno).
    if (!saOdnosom && menjaW && menjaH) {
      w += (najveceT(p, w, h, zeljeno.w - w, 0, 0) ?? 0) * (zeljeno.w - w);
      h += (najveceT(p, w, h, 0, zeljeno.h - h, 0) ?? 0) * (zeljeno.h - h);
    }
  }
  // t === null: ni najmanji okvir uz sidro nije u granicama (sidro je daleko van [-960, 1920]); tada `ogranici` steže položaj.
  const c = { x: p.x0 + (p.ax + 0.5) * w + p.bx * h, y: p.y0 + p.ay * w + (p.by + 0.5) * h };
  return ogranici({ x: c.x - w / 2, y: c.y - h / 2, sirina: w, visina: h, rotacija: k.rotacija });
}

/** Ugao rotacije iz položaja pokazivača (ručka je iznad centra: 0°); `korak` (Shift: 15) zaokružuje. */
export function ugaoRotacije(k: Kutija, pokazivac: Tacka, korak?: number): number {
  const c = centar(k);
  let u = Math.atan2(pokazivac.y - c.y, pokazivac.x - c.x) / RAD + 90;
  if (korak) u = Math.round(u / korak) * korak;
  return normalizujUgao(u);
}

/** Ugao u [0, 360), 2 decimale (359,999 je 0). */
export function normalizujUgao(u: number): number {
  const n = z(((u % 360) + 360) % 360);
  return n >= 360 ? 0 : n;
}

const LINIJSKI: ReadonlySet<string> = new Set(['LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA']);

/** Krajevi linije na platnu (`od`/`do` su relativni u okviru sloja, koji može biti rotiran; null = sredine bočnih ivica). */
export function krajeviLinije(s: OblikSloj): [Tacka, Tacka] {
  const k = kutijaSloja(s);
  const od = s.od ?? { x: 0, y: s.visina / 2 };
  const kraj = s.do ?? { x: s.sirina, y: s.visina / 2 };
  const lok = (t: Tacka) => ({ x: t.x - s.sirina / 2, y: t.y - s.visina / 2 });
  return [uSvetske(k, lok(od)), uSvetske(k, lok(kraj))];
}

/**
 * Nova kutija oko krajeva sa marginom `max(6, 3 * debljina)` (vrhovi strelica staju), rotacija 0. Krajevi se prvo
 * ograničavaju na [-960 + m, 1920 - m], pa je okvir u granicama servera i obuhvata oba kraja.
 */
export function linijaIzKrajeva(s: OblikSloj, a: Tacka, b: Tacka): OblikSloj {
  const m = Math.max(6, 3 * (s.ivica?.debljina ?? 1));
  const kraj = (t: Tacka): Tacka => ({ x: z(ogr(t.x, MIN_XY + m, MAX_XY - m)), y: z(ogr(t.y, MIN_XY + m, MAX_XY - m)) });
  const p = kraj(a);
  const q = kraj(b);
  const k = ogranici({
    x: Math.min(p.x, q.x) - m, y: Math.min(p.y, q.y) - m,
    sirina: Math.abs(p.x - q.x) + 2 * m, visina: Math.abs(p.y - q.y) + 2 * m, rotacija: 0,
  });
  return { ...s, ...k, od: { x: z(p.x - k.x), y: z(p.y - k.y) }, do: { x: z(q.x - k.x), y: z(q.y - k.y) } };
}

/** Ugao (0 = udesno, smer kazaljke, kao rotacija sloja) i dužina duži a -> b; put tastaturom za linije (F6). */
export function ugaoIDuzina(a: Tacka, b: Tacka): { ugao: number; duzina: number } {
  return { ugao: normalizujUgao(Math.atan2(b.y - a.y, b.x - a.x) / RAD), duzina: z(Math.hypot(b.x - a.x, b.y - a.y)) };
}

export function krajIzUgla(a: Tacka, ugao: number, duzina: number): Tacka {
  return { x: z(a.x + Math.cos(ugao * RAD) * duzina), y: z(a.y + Math.sin(ugao * RAD) * duzina) };
}

function rastojanjeDoDuzi(t: Tacka, a: Tacka, b: Tacka): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 === 0 ? 0 : ogr(((t.x - a.x) * dx + (t.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(t.x - (a.x + u * dx), t.y - (a.y + u * dy));
}

/** Linija se pogađa blizu duži (pola debljine plus tolerancija), ostalo unutar rotiranog okvira (plus tolerancija). */
export function pogadja(s: Sloj, t: Tacka, tolerancija: number): boolean {
  if (s.tip === 'OBLIK' && LINIJSKI.has(s.oblik)) {
    const [a, b] = krajeviLinije(s);
    return rastojanjeDoDuzi(t, a, b) <= (s.ivica?.debljina ?? 0) / 2 + tolerancija;
  }
  const l = uLokalne(kutijaSloja(s), t);
  return Math.abs(l.x) <= s.sirina / 2 + tolerancija && Math.abs(l.y) <= s.visina / 2 + tolerancija;
}

/** Gornji (poslednji u nizu) sloj na tački, osim onih u `preskoci`. */
export function slojNaTacki(slojevi: readonly Sloj[], t: Tacka, tolerancija: number, preskoci?: ReadonlySet<string>): Sloj | null {
  for (let i = slojevi.length - 1; i >= 0; i--) {
    const s = slojevi[i];
    if (!preskoci?.has(s.id) && pogadja(s, t, tolerancija)) return s;
  }
  return null;
}

/** Id-jevi slojeva (redom z-ose) čiji je obuhvat ceo unutar pravougaonika (kao PowerPoint), osim onih u `preskoci`. */
export function uPravougaoniku(slojevi: readonly Sloj[], pravougaonik: Obuhvat, preskoci?: ReadonlySet<string>): string[] {
  const p = obuhvatTacaka([
    { x: pravougaonik.x, y: pravougaonik.y },
    { x: pravougaonik.x + pravougaonik.sirina, y: pravougaonik.y + pravougaonik.visina },
  ]); // pravougaonik prevučen nagore ili ulevo ima negativnu širinu ili visinu
  return slojevi
    .filter((s) => {
      if (preskoci?.has(s.id)) return false;
      const o = obuhvat(kutijaSloja(s));
      return o.x >= p.x - EPS && o.y >= p.y - EPS
        && o.x + o.sirina <= p.x + p.sirina + EPS && o.y + o.visina <= p.y + p.visina + EPS;
    })
    .map((s) => s.id);
}

/**
 * Vođice: ivice i centri pomerenog obuhvata prianjaju uz ivice i centar platna i drugih obuhvata kad su bliže od
 * `prag`; po osi najbliža (pri jednakom rastojanju prva: platno, pa `ostali` redom). `vodjice` su linije za crtanje
 * (od-do pokriva oba obuhvata ili celo platno).
 */
export function prianjanje(pomereno: Obuhvat, ostali: readonly Obuhvat[], prag: number): { dx: number; dy: number; vodjice: Vodjica[] } {
  const platno: Obuhvat = { x: 0, y: 0, sirina: SIRINA_PLATNA, visina: VISINA_PLATNA };
  const pozicije = (o: 'x' | 'y', b: Obuhvat) =>
    (o === 'x' ? [b.x, b.x + b.sirina / 2, b.x + b.sirina] : [b.y, b.y + b.visina / 2, b.y + b.visina]);
  const osa = (o: 'x' | 'y') => {
    let najbolje: { d: number; cilj: number; izvor: Obuhvat } | null = null;
    for (const izvor of [platno, ...ostali]) {
      for (const cilj of pozicije(o, izvor)) {
        for (const moja of pozicije(o, pomereno)) {
          const d = cilj - moja;
          if (Math.abs(d) <= prag && (!najbolje || Math.abs(d) < Math.abs(najbolje.d))) najbolje = { d, cilj, izvor };
        }
      }
    }
    return najbolje;
  };
  const vodjica = (o: 'x' | 'y', n: { cilj: number; izvor: Obuhvat }): Vodjica => {
    const a = o === 'x'
      ? [pomereno.y, pomereno.y + pomereno.visina, n.izvor.y, n.izvor.y + n.izvor.visina]
      : [pomereno.x, pomereno.x + pomereno.sirina, n.izvor.x, n.izvor.x + n.izvor.sirina];
    return { osa: o, poz: z(n.cilj), od: z(Math.min(...a)), do: z(Math.max(...a)) };
  };
  const nx = osa('x');
  const ny = osa('y');
  return {
    dx: nx ? z(nx.d) : 0,
    dy: ny ? z(ny.d) : 0,
    vodjice: [...(nx ? [vodjica('x', nx)] : []), ...(ny ? [vodjica('y', ny)] : [])],
  };
}
