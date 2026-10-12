// Slike za slanje: prepoznavanje formata po magičnim bajtovima (isto kao `MedijService` na serveru) i smanjivanje u
// pregledaču (canvas) za slike veće od 10 MB ili u formatu koji server ne prima. Koristi API-je pregledača
// (`createImageBitmap`, `OffscreenCanvas` ili `<canvas>`), pa ga lokalna provera uvoza (Node) ne učitava.

export type MimeSlike = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const MB = 1024 * 1024;
/** Granica servera (`spring.servlet.multipart.max-file-size=10MB`). */
const MAX_IZLAZ = 10 * MB;
/** Prvi pokušaj cilja malo ispod granice; svaki sledeći je 0,8 puta manji po stranici. */
const CILJ = 9.5 * MB;
const KORAK = 0.8;
const POKUSAJA = 5;
const KVALITET_JPEG = 0.9;

function pocinje(b: Uint8Array, od: number, ocekivano: readonly number[]): boolean {
  if (b.length < od + ocekivano.length) return false;
  return ocekivano.every((x, i) => b[od + i] === x);
}

/** Format slike po prvim bajtovima, kao `MedijService.mime` na serveru; `null` = server je ne prima. */
export function mimeSlike(b: Uint8Array): MimeSlike | null {
  if (pocinje(b, 0, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (pocinje(b, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (pocinje(b, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || pocinje(b, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (pocinje(b, 0, [0x52, 0x49, 0x46, 0x46]) && pocinje(b, 8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

/** Ime sa novom ekstenzijom (`foto.jpeg` -> `foto.jpg`, `crtez` -> `crtez.png`). */
function saEkstenzijom(ime: string, png: boolean): string {
  const tacka = ime.lastIndexOf('.');
  return `${tacka > 0 ? ime.slice(0, tacka) : ime}.${png ? 'png' : 'jpg'}`;
}

type Kontekst2d = Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData'>;
interface Platno2d { kontekst: Kontekst2d; uBlob(tip: string, kvalitet?: number): Promise<Blob>; }

function napraviPlatno(w: number, h: number): Platno2d {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const kontekst = c.getContext('2d') as Kontekst2d | null;
    if (!kontekst) throw new Error('Pregledač ne može da crta sliku.');
    return { kontekst, uBlob: (type, quality) => c.convertToBlob({ type, quality }) };
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const kontekst = c.getContext('2d');
  if (!kontekst) throw new Error('Pregledač ne može da crta sliku.');
  return {
    kontekst,
    uBlob: (type, quality) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Slika nije kodirana.'))), type, quality)),
  };
}

/** Najduža stranica uzorka za proveru providnosti (64 x 64 = 16 KB piksela umesto celog platna). */
const UZORAK = 64;

/**
 * Da li slika ima providne piksele, po umanjenom uzorku (najviše 64 px po stranici): pri umanjivanju se providnost
 * proseči, pa i mali providan deo daje alfa < 255 u svom pikselu uzorka.
 */
function imaProvidnost(slika: ImageBitmap): boolean {
  const k = Math.min(1, UZORAK / Math.max(1, slika.width, slika.height));
  const w = Math.max(1, Math.round(slika.width * k));
  const h = Math.max(1, Math.round(slika.height * k));
  const platno = napraviPlatno(w, h);
  platno.kontekst.drawImage(slika, 0, 0, w, h);
  const podaci = platno.kontekst.getImageData(0, 0, w, h).data;
  for (let i = 3; i < podaci.length; i += 4) {
    if (podaci[i] < 255) return true;
  }
  return false;
}

/**
 * Slika za server (najviše 10 MB, PNG ili JPEG). Izlaz je PNG kad je izvor PNG ili GIF, JPEG kad je izvor JPEG; za ostale
 * formate (WebP, BMP, ...) PNG kad uzorak ima providnost, inače JPEG kvaliteta 0,9; ime dobija `.png`/`.jpg`. Stranice se množe faktorom `sqrt(9,5 MB / veličina)` (najviše 1: slika se ne
 * uvećava), pa sa 0,8 po pokušaju dok izlaz ne bude <= 10 MB; posle 5 pokušaja -> greška. Neispravna slika ili format
 * koji pregledač ne zna da dekodira -> greška (`createImageBitmap`).
 */
export async function smanjiSliku(b: Uint8Array, ime: string): Promise<{ bajtovi: Uint8Array; ime: string }> {
  const slika = await createImageBitmap(new Blob([b as Uint8Array<ArrayBuffer>]));
  try {
    const izvor = mimeSlike(b);
    const png = izvor === 'image/png' || izvor === 'image/gif' ? true : izvor === 'image/jpeg' ? false : imaProvidnost(slika);
    let faktor = Math.min(1, Math.sqrt(CILJ / Math.max(1, b.length)));
    for (let i = 0; i < POKUSAJA; i++, faktor *= KORAK) {
      const w = Math.max(1, Math.round(slika.width * faktor));
      const h = Math.max(1, Math.round(slika.height * faktor));
      const platno = napraviPlatno(w, h);
      platno.kontekst.drawImage(slika, 0, 0, w, h);
      const blob = await platno.uBlob(png ? 'image/png' : 'image/jpeg', png ? undefined : KVALITET_JPEG);
      if (blob.size <= MAX_IZLAZ) {
        return { bajtovi: new Uint8Array(await blob.arrayBuffer()), ime: saEkstenzijom(ime, png) };
      }
    }
    throw new Error(`Slika ${ime} je i posle smanjivanja veća od 10 MB.`);
  } finally {
    slika.close();
  }
}
