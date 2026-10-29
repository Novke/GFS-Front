/**
 * Čitač QR-a za skener taba Čas (spec „Aplikacija i obaveštenja“ 4.5): `BarcodeDetector` gde ga browser ima (Chrome na
 * Androidu), inače `jsqr` (lenji chunk, učitava se tek na dodir „Skeniraj“, bez CDN-a). Čita kadar kamere ili fotografiju.
 */

export type IzvorSlike = HTMLVideoElement | ImageBitmap | HTMLImageElement;
export type CitacQr = (izvor: IzvorSlike) => Promise<string[]>;

interface Detektor {
  detect(izvor: IzvorSlike): Promise<{ rawValue: string }[]>;
}
interface DetektorKlasa {
  new (o: { formats: string[] }): Detektor;
  getSupportedFormats(): Promise<string[]>;
}
type JsQr = (data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: string }) => { data: string } | null;

function dimenzije(izvor: IzvorSlike): [number, number] {
  if (izvor instanceof HTMLVideoElement) {
    return [izvor.videoWidth, izvor.videoHeight];
  }
  if (izvor instanceof HTMLImageElement) {
    return [izvor.naturalWidth, izvor.naturalHeight];
  }
  return [izvor.width, izvor.height];
}

async function izDetektora(): Promise<CitacQr | null> {
  const Klasa = (globalThis as { BarcodeDetector?: DetektorKlasa }).BarcodeDetector;
  if (!Klasa) {
    return null;
  }
  try {
    if (!(await Klasa.getSupportedFormats()).includes('qr_code')) {
      return null;
    }
    const d = new Klasa({ formats: ['qr_code'] });
    return async izvor => (await d.detect(izvor)).map(r => r.rawValue);
  } catch {
    return null;
  }
}

/** `jsqr` je UMD sa `exports.default`; esbuild ga zavisno od oznake modula daje kao `default` ili `default.default`. */
async function jsQr(): Promise<JsQr> {
  const m = (await import('jsqr')) as unknown as { default: unknown };
  const f = typeof m.default === 'function' ? m.default : (m.default as { default: unknown }).default;
  return f as JsQr;
}

/** Najveća strana slike za `jsqr` (kadar kamere ~720p bi bio spor na starom telefonu). */
export const NAJVECA_STRANA = 800;

export async function napraviCitac(dokument: Document): Promise<CitacQr> {
  const detektor = await izDetektora();
  if (detektor) {
    return detektor;
  }
  const citaj = await jsQr();
  const platno = dokument.createElement('canvas');
  const ctx = platno.getContext('2d', { willReadFrequently: true });
  return async izvor => {
    const [w, h] = dimenzije(izvor);
    if (!ctx || !w || !h) {
      return [];
    }
    const k = Math.min(1, NAJVECA_STRANA / Math.max(w, h));
    platno.width = Math.round(w * k);
    platno.height = Math.round(h * k);
    ctx.drawImage(izvor, 0, 0, platno.width, platno.height);
    const slika = ctx.getImageData(0, 0, platno.width, platno.height);
    const r = citaj(slika.data, platno.width, platno.height, { inversionAttempts: 'attemptBoth' });
    return r ? [r.data] : [];
  };
}
