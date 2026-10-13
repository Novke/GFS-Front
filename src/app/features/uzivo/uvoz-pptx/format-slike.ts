// Format slike po magičnim bajtovima, bez API-ja pregledača: koriste ga pretvaranje (i lokalna provera u Node-u) i slanje.

export type MimeSlike = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

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

/**
 * Slika koju slanje ume da pošalje: format servera (`mimeSlike`), ili BMP, koji pregledač dekodira pa `smanjiSliku` pretvara.
 * Ostalo (SVG, PDF, prazan deo, EMF/WMF/TIFF pod bilo kojim imenom) uvoz preskače pri pretvaranju (`OBJEKAT_PRESKOCEN`),
 * umesto da slanje odbije ceo uvoz.
 */
export function slikaZaSlanje(b: Uint8Array): boolean {
  return mimeSlike(b) !== null || pocinje(b, 0, [0x42, 0x4d]);
}
