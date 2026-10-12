// Minimalni PNG dekoder i koder (čist TS, uz fflate za zlib, bez canvas-a): za pojaseve formula (odluka 5: slika formule
// se seče po redovima mastila, po jedan pojas za svaki pasus). Dekoder zna 8-bitne slike tipova boje 0/2/3/4/6 bez
// prepletanja (sve slike formula i crteža u PowerPointu su takve); sve ostalo ili pokvareno -> `null`, pa se pozivalac
// vraća na jedan sloj. Fajl je tuđ: veličine iz zaglavlja su ograničene pre alokacije, zlib se raspakuje u bafer tačne
// veličine (bomba ne može da ga naduva).
import { unzlibSync, zlibSync } from 'fflate';

/** Slika u RGBA, 4 bajta po pikselu, red po red. */
export interface Rgba { sirina: number; visina: number; piksli: Uint8Array; }

const POTPIS = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * Najviše piksela koje dekoder prihvata (4 M; najveća slika formule ili tabele u uzorku ima ~1,2 M). Proverava se iz
 * zaglavlja pre ikakve alokacije; vrh memorije je tada ~4 x 4 MB za RGBA plus isto toliko za raspakovane redove.
 */
const MAX_PIKSELA = 4_194_304;
/** Bajtova po pikselu po tipu boje (8 bita po kanalu). */
const BAJTOVA_PO_PIKSELU: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Mastilo: alfa iznad ovoga; na neprovidnoj pozadini još i bar jedan kanal ispod `BELO`. */
const PRAG_ALFE = 20;
const BELO = 245;
/** Pojas čiji je niz mastila niži od ovog udela medijane nizova nije verovatan red formule (npr. crta razlomka). */
const NAJMANJI_UDEO_MEDIJANE = 0.25;

const CRC_TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (polinom `0xEDB88320`, kao u PNG specifikaciji, pril. D). */
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABELA[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 8-bitni PNG bez prepletanja (tipovi boje 0, 2, 3, 4, 6) u RGBA; bilo šta drugo ili pokvareno -> `null`. */
export function dekodirajPng(b: Uint8Array): Rgba | null {
  try {
    return dekodiraj(b);
  } catch {
    return null;   // neispravan zlib tok i slično
  }
}

function dekodiraj(b: Uint8Array): Rgba | null {
  if (b.length < 8 || POTPIS.some((x, i) => b[i] !== x)) return null;
  let sirina = 0;
  let visina = 0;
  let tip = -1;
  let paleta: Uint8Array | null = null;
  let providnost: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= b.length;) {
    const duzina = u32(b, i);
    const ime = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const kraj = i + 8 + duzina;
    if (kraj > b.length) return null;
    const d = b.subarray(i + 8, kraj);
    if (ime === 'IHDR') {
      // dubina 8, kompresija 0, filter 0, bez prepletanja
      if (tip >= 0 || d.length < 13 || d[8] !== 8 || d[10] !== 0 || d[11] !== 0 || d[12] !== 0) return null;
      sirina = u32(d, 0);
      visina = u32(d, 4);
      tip = d[9];
    } else if (ime === 'PLTE') {
      paleta = d;
    } else if (ime === 'tRNS') {
      providnost = d;
    } else if (ime === 'IDAT') {
      idat.push(d);
    } else if (ime === 'IEND') {
      break;
    }
    i = kraj + 4;   // + CRC (ne proverava se: oštećenje hvata zlib ili dužina podataka)
  }
  const bpp = BAJTOVA_PO_PIKSELU[tip];
  if (!bpp || sirina < 1 || visina < 1 || sirina * visina > MAX_PIKSELA || idat.length === 0) return null;
  if (tip === 3 && !paleta) return null;

  const spojen = new Uint8Array(idat.reduce((z, d) => z + d.length, 0));
  let p = 0;
  for (const d of idat) {
    spojen.set(d, p);
    p += d.length;
  }
  const red = sirina * bpp;
  const ocekivano = visina * (red + 1);
  const sirovo = unzlibSync(spojen, { out: new Uint8Array(ocekivano) });
  if (sirovo.length < ocekivano) return null;

  const ispravljeno = new Uint8Array(visina * red);
  for (let y = 0; y < visina; y++) {
    const filter = sirovo[y * (red + 1)];
    if (filter > 4) return null;
    const ulaz = y * (red + 1) + 1;
    const izlaz = y * red;
    for (let x = 0; x < red; x++) {
      const a = x >= bpp ? ispravljeno[izlaz + x - bpp] : 0;
      const u = y > 0 ? ispravljeno[izlaz - red + x] : 0;
      const c = y > 0 && x >= bpp ? ispravljeno[izlaz - red + x - bpp] : 0;
      const v = sirovo[ulaz + x];
      ispravljeno[izlaz + x] = filter === 0 ? v
        : filter === 1 ? v + a
          : filter === 2 ? v + u
            : filter === 3 ? v + ((a + u) >> 1)
              : v + paeth(a, u, c);
    }
  }
  return uRgba(ispravljeno, sirina, visina, tip, paleta, providnost);
}

/** Ispravljeni redovi u RGBA; `tRNS` je alfa palete (tip 3) ili boja-ključ (tipovi 0 i 2, donji bajt 16-bitne vrednosti). */
function uRgba(px: Uint8Array, sirina: number, visina: number, tip: number, paleta: Uint8Array | null,
               trns: Uint8Array | null): Rgba | null {
  const n = sirina * visina;
  const piksli = new Uint8Array(n * 4);
  const kljucSive = tip === 0 && trns && trns.length >= 2 ? trns[1] : -1;
  const kljucRgb = tip === 2 && trns && trns.length >= 6 ? [trns[1], trns[3], trns[5]] : null;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    switch (tip) {
      case 0: {
        const g = px[i];
        piksli[o] = piksli[o + 1] = piksli[o + 2] = g;
        piksli[o + 3] = g === kljucSive ? 0 : 255;
        break;
      }
      case 2: {
        const s = i * 3;
        piksli[o] = px[s];
        piksli[o + 1] = px[s + 1];
        piksli[o + 2] = px[s + 2];
        piksli[o + 3] = kljucRgb && px[s] === kljucRgb[0] && px[s + 1] === kljucRgb[1] && px[s + 2] === kljucRgb[2] ? 0 : 255;
        break;
      }
      case 3: {
        const k = px[i];
        if (k * 3 + 2 >= paleta!.length) return null;
        piksli[o] = paleta![k * 3];
        piksli[o + 1] = paleta![k * 3 + 1];
        piksli[o + 2] = paleta![k * 3 + 2];
        piksli[o + 3] = trns && k < trns.length ? trns[k] : 255;
        break;
      }
      case 4: {
        const s = i * 2;
        piksli[o] = piksli[o + 1] = piksli[o + 2] = px[s];
        piksli[o + 3] = px[s + 1];
        break;
      }
      default:
        piksli.set(px.subarray(i * 4, i * 4 + 4), o);
    }
  }
  return { sirina, visina, piksli };
}

function deoPng(ime: string, podaci: Uint8Array): Uint8Array {
  const z = new Uint8Array(12 + podaci.length);
  const dv = new DataView(z.buffer);
  dv.setUint32(0, podaci.length);
  for (let i = 0; i < 4; i++) z[4 + i] = ime.charCodeAt(i);
  z.set(podaci, 8);
  dv.setUint32(8 + podaci.length, crc32(z.subarray(4, 8 + podaci.length)));
  return z;
}

/** RGBA, 8 bita (tip boje 6), filter 0 u svakom redu, jedan IDAT (`zlibSync`). */
export function kodirajPng(r: Rgba): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, r.sirina);
  dv.setUint32(4, r.visina);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const red = r.sirina * 4;
  const sirovo = new Uint8Array(r.visina * (red + 1));   // bajt filtera 0 na početku reda
  for (let y = 0; y < r.visina; y++) sirovo.set(r.piksli.subarray(y * red, (y + 1) * red), y * (red + 1) + 1);
  const delovi = [Uint8Array.from(POTPIS), deoPng('IHDR', ihdr), deoPng('IDAT', zlibSync(sirovo)), deoPng('IEND', new Uint8Array(0))];
  const z = new Uint8Array(delovi.reduce((s, d) => s + d.length, 0));
  let p = 0;
  for (const d of delovi) {
    z.set(d, p);
    p += d.length;
  }
  return z;
}

/** Redovi `[od, doReda)` kao nova slika iste širine. */
export function isecRedove(r: Rgba, od: number, doReda: number): Rgba {
  const red = r.sirina * 4;
  return { sirina: r.sirina, visina: doReda - od, piksli: r.piksli.slice(od * red, doReda * red) };
}

/** Kolone `[od, doKolone)` svih redova kao nova slika iste visine. */
export function isecKolone(r: Rgba, od: number, doKolone: number): Rgba {
  const sirina = doKolone - od;
  const piksli = new Uint8Array(sirina * r.visina * 4);
  for (let y = 0; y < r.visina; y++) {
    piksli.set(r.piksli.subarray((y * r.sirina + od) * 4, (y * r.sirina + doKolone) * 4), y * sirina * 4);
  }
  return { sirina, visina: r.visina, piksli };
}

/** Slika ima bar jedan (skoro) providan piksel: pozadina je providna (slike formula iz PowerPointa su takve). */
function providnaPozadina(r: Rgba): boolean {
  for (let i = 3; i < r.piksli.length; i += 4) if (r.piksli[i] <= PRAG_ALFE) return true;
  return false;
}

/**
 * Pojasevi redova `[od, do)` za `broj` pasusa: bez rupa, pokrivaju celu visinu, granica je na sredini razmaka između dva
 * niza redova mastila. Mastilo: na providnoj pozadini (ima bar jedan piksel sa alfom <= 20) svaki piksel sa alfom > 20,
 * i beo (belo slovo na providnom); na neprovidnoj pozadini piksel koji nije (skoro) beo. Višak nizova se spaja po
 * najmanjem razmaku (prvi par kod jednakih). `null`: `broj` < 1, manje nizova od `broj`, ili neverovatna podela: posle
 * spajanja neki niz je niži od 25 % medijane visina nizova (crta razlomka ili tačka kao zaseban "red" znači da se nizovi
 * ne poklapaju sa pasusima). Niz nastao spajanjem je izuzet: njegovi delovi su već svedeni na isti pasus.
 */
export function pojaseviMastila(r: Rgba, broj: number): [number, number][] | null {
  if (!(broj >= 1)) return null;
  const samoAlfa = providnaPozadina(r);
  const imaMastila = (y: number) => {
    for (let x = 0; x < r.sirina; x++) {
      const i = (y * r.sirina + x) * 4;
      if (r.piksli[i + 3] <= PRAG_ALFE) continue;
      if (samoAlfa || !(r.piksli[i] > BELO && r.piksli[i + 1] > BELO && r.piksli[i + 2] > BELO)) return true;
    }
    return false;
  };
  const nizovi: [number, number][] = [];
  let pocetak = -1;
  for (let y = 0; y <= r.visina; y++) {
    const ima = y < r.visina && imaMastila(y);
    if (ima && pocetak < 0) pocetak = y;
    if (!ima && pocetak >= 0) {
      nizovi.push([pocetak, y]);
      pocetak = -1;
    }
  }
  const spojen = nizovi.map(() => false);
  while (nizovi.length > broj) {   // spoji dva susedna niza sa najmanjim razmakom
    let k = 0;
    for (let i = 1; i < nizovi.length - 1; i++) {
      if (nizovi[i + 1][0] - nizovi[i][1] < nizovi[k + 1][0] - nizovi[k][1]) k = i;
    }
    nizovi.splice(k, 2, [nizovi[k][0], nizovi[k + 1][1]]);
    spojen.splice(k, 2, true);
  }
  if (nizovi.length !== broj) return null;
  const visine = nizovi.map(([a, b]) => b - a);
  const poredjane = [...visine].sort((a, b) => a - b);
  const sredina = poredjane.length >> 1;
  const medijana = poredjane.length % 2 ? poredjane[sredina] : (poredjane[sredina - 1] + poredjane[sredina]) / 2;
  if (visine.some((v, i) => !spojen[i] && v < NAJMANJI_UDEO_MEDIJANE * medijana)) return null;
  return nizovi.map((n, i) => [
    i === 0 ? 0 : Math.floor((nizovi[i - 1][1] + n[0]) / 2),
    i === broj - 1 ? r.visina : Math.floor((n[1] + nizovi[i + 1][0]) / 2),
  ]);
}
