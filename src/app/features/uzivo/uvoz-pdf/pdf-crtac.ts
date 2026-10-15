// Adapter nad pdf.js (faza 5d, odluke 15-18): otvaranje PDF-a u pregledaču i crtanje strane u sliku. Ne uvozi pdfjs-dist:
// biblioteku daje `ucitajPdfJs` (`pdf-ucitavanje.ts`, samo dinamički kroz `UCITAJ_PDFJS`), pa se ovde testira lažnim API-jem.
// PDF nikad ne ide na server, a aplikacija nikad ne traži lozinku (`onPassword` se ne postavlja: pdf.js odbije sa
// `PasswordException`).
import type { MimeSlike } from '../uvoz-pptx/format-slike';
import type { CrtacPdf, CrtezStrane } from './slanje-pdf';
import { MAX_PDF_BAJTOVA, PRAG_PNG, velicinaPlatna } from './strane';

/** Lokalni podaci pdf.js-a (`angular.json` ih kopira u `assets/pdfjs/`); nikad CDN. Svaka putanja se završava sa `/`. */
export interface PutanjePdf { standardFontDataUrl: string; cMapUrl: string; iccUrl: string; wasmUrl: string; }

/** Deo `PDFPageProxy` koji adapter koristi. */
export interface PdfStrana {
  getViewport(p: { scale: number }): { width: number; height: number };
  render(p: { canvas: HTMLCanvasElement; viewport: unknown; background: string }): { promise: Promise<void> };
  cleanup(): void;
}

/** `PDFDocumentProxy` u 6.4.299 NEMA `destroy()` (ima ga samo zadatak učitavanja), pa ga ni ovaj tip ne nudi. */
export interface PdfDokument { numPages: number; getPage(broj: number): Promise<PdfStrana>; }

/** Zadatak učitavanja (`PDFDocumentLoadingTask`): jedino mesto za oslobađanje dokumenta i radnika (`destroy`). */
export interface PdfZadatak { promise: Promise<PdfDokument>; destroy(): Promise<void>; }

/** Deo modula `pdfjs-dist/legacy/build/pdf.mjs` koji adapter koristi. */
export interface PdfJs {
  getDocument(p: { data: Uint8Array; cMapPacked: boolean; enableXfa: boolean; useSystemFonts: boolean } & PutanjePdf): PdfZadatak;
}

/** Platno za crtanje jedne strane; `oslobodi` vraća memoriju (canvas 0 x 0). */
export interface Platno2d { canvas: HTMLCanvasElement; uBlob(tip: string, kvalitet?: number): Promise<Blob>; oslobodi(): void; }

export const PORUKE_PDF = {
  nijePdf: 'Fajl nije ispravan PDF.',
  lozinka: 'PDF je zaključan lozinkom. Sačuvaj ga ponovo bez lozinke i pokušaj opet.',
  prevelik: 'PDF je prevelik (najviše 100 MB).',
  bezStrana: 'PDF nema nijednu stranu.',
  neocekivano: 'PDF nije pročitan zbog neočekivane greške. Proveri da li se otvara u drugom programu i pokušaj ponovo.',
  strana: (n: number) => `Strana ${n} nije nacrtana.`,
} as const;

/** Greška sa porukom za korisnika (srpski), spremna za prikaz u dijalogu. */
export class GreskaPdf extends Error {
  override readonly name = 'GreskaPdf';
}

/** Putanje podataka pdf.js-a relativno na `<base href>` (nikad `/assets` od korena). */
export function putanjePdf(base: string = document.baseURI): PutanjePdf {
  const u = (p: string) => new URL(`assets/pdfjs/${p}/`, base).href;
  return { standardFontDataUrl: u('standard_fonts'), cMapUrl: u('cmaps'), iccUrl: u('iccs'), wasmUrl: u('wasm') };
}

const imeGreske = (e: unknown): unknown => (e as { name?: unknown } | null)?.name;

/** pdf.js odbija zaključan PDF sa `PasswordException` (bez `onPassword` nikad ne pita), neispravan sa `InvalidPDFException`. */
export function porukaOtvaranja(e: unknown): string {
  const ime = imeGreske(e);
  if (ime === 'PasswordException') return PORUKE_PDF.lozinka;
  if (ime === 'InvalidPDFException') return PORUKE_PDF.nijePdf;
  return PORUKE_PDF.neocekivano;
}

/** PNG; kad je veći od 3 MB -> WebP 0,9; kad pregledač ne ume WebP (`blob.type`) -> JPEG 0,9 (odluka 17). */
export async function kodiraj(p: Pick<Platno2d, 'uBlob'>): Promise<{ blob: Blob; mime: MimeSlike }> {
  const png = await p.uBlob('image/png');
  if (png.size <= PRAG_PNG) return { blob: png, mime: 'image/png' };
  const webp = await p.uBlob('image/webp', 0.9);
  if (webp.type === 'image/webp') return { blob: webp, mime: 'image/webp' };
  return { blob: await p.uBlob('image/jpeg', 0.9), mime: 'image/jpeg' };
}

/** Podrazumevano platno (`NAPRAVI_PLATNO_PDF`): `<canvas>` van dokumenta. */
export function platnoIzDokumenta(w: number, h: number): Platno2d {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return {
    canvas,
    uBlob: (tip, kvalitet) => new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Slika nije kodirana.'))), tip, kvalitet)),
    oslobodi: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/**
 * Radnik pdf.js-a je spreman kad pošalje prvu poruku (`ready` iz `WorkerMessageHandler.initializeFromPort`). pdf.js tu
 * poruku za radnika iz `workerPort` ne čeka, pa bi radnik koji nije krenuo (404 posle novog izdanja, CSP, greška u modulu)
 * ostavio `getDocument` da visi zauvek; ovako učitavanje odbije i radnik se gasi (sledeći pokušaj pravi novog).
 */
export function spremanRadnik<R extends EventTarget & { terminate(): void }>(radnik: R): Promise<R> {
  return new Promise<R>((res, rej) => {
    const kraj = () => {
      radnik.removeEventListener('message', poruka);
      radnik.removeEventListener('error', greska);
    };
    const poruka = () => {
      kraj();
      res(radnik);
    };
    const greska = () => {
      kraj();
      radnik.terminate();
      rej(new Error('Radnik za PDF nije pokrenut.'));
    };
    radnik.addEventListener('message', poruka);
    radnik.addEventListener('error', greska);
  });
}

/**
 * Otvara PDF i vraća crtač strana (`CrtacPdf`, F12). Greške otvaranja su `GreskaPdf` sa porukom za korisnika; zadatak
 * učitavanja se tada gasi odmah, a inače kroz `zatvori()` (zove ga pozivalac, u `finally`). `bajtovi` pdf.js predaje
 * radniku (transfer): posle poziva su prazni, pa ih pozivalac ne koristi ponovo.
 *
 * `zatvori()` usred crtanja (F14: "Otkaži") prekida render (`RenderingCancelledException`); takva strana odbija sa
 * `GreskaPdf`, ali bez `console.warn` (konzola posle "Otkaži" ostaje čista). Ista tišina važi za svaku grešku crtanja
 * posle zatvaranja (npr. "Transport destroyed" za `getPage`).
 */
export async function otvoriPdf(pdfjs: PdfJs, bajtovi: Uint8Array, putanje: PutanjePdf,
                                napraviPlatno: (w: number, h: number) => Platno2d = platnoIzDokumenta): Promise<CrtacPdf> {
  if (bajtovi.length > MAX_PDF_BAJTOVA) throw new GreskaPdf(PORUKE_PDF.prevelik);
  const zadatak = pdfjs.getDocument({ data: bajtovi, cMapPacked: true, enableXfa: false, useSystemFonts: false, ...putanje });
  let zatvoren = false;
  const ugasi = () => {
    zatvoren = true;
    return zadatak.destroy().catch(() => undefined);
  };
  let dok: PdfDokument;
  try {
    dok = await zadatak.promise;
  } catch (e) {
    await ugasi();
    const poruka = porukaOtvaranja(e);
    if (poruka === PORUKE_PDF.neocekivano) console.warn('PDF nije otvoren.', e);
    throw new GreskaPdf(poruka);
  }
  if (dok.numPages < 1) {
    await ugasi();
    throw new GreskaPdf(PORUKE_PDF.bezStrana);
  }
  return {
    brojStrana: dok.numPages,
    async nacrtaj(broj: number): Promise<CrtezStrane> {
      let strana: PdfStrana | null = null;
      let platno: Platno2d | null = null;
      try {
        strana = await dok.getPage(broj);
        const osnova = strana.getViewport({ scale: 1 });
        // pdf.js ispravlja loš MediaBox, pa je ovo odbrana: bez nje bi platno bilo NaN x NaN.
        if (!(osnova.width > 0 && osnova.height > 0 && Number.isFinite(osnova.width) && Number.isFinite(osnova.height))) {
          throw new Error(`Strana ${broj} nema ispravnu veličinu.`);
        }
        const { w, h } = velicinaPlatna(osnova.width, osnova.height);
        platno = napraviPlatno(w, h);
        await strana.render({ canvas: platno.canvas, viewport: strana.getViewport({ scale: w / osnova.width }), background: '#FFFFFF' }).promise;
        const { blob, mime } = await kodiraj(platno);
        return { bajtovi: new Uint8Array(await blob.arrayBuffer()), mime, sirina: osnova.width, visina: osnova.height };
      } catch (e) {
        if (!zatvoren && imeGreske(e) !== 'RenderingCancelledException') console.warn(`Strana ${broj} nije nacrtana.`, e);
        throw new GreskaPdf(PORUKE_PDF.strana(broj));
      } finally {
        platno?.oslobodi();
        try {
          strana?.cleanup();
        } catch {
          // Oslobađanje keša strane (i posle `destroy`) ne menja ishod crtanja.
        }
      }
    },
    zatvori: ugasi,
  };
}
