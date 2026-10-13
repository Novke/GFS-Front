import { mimeSlike, slikaZaSlanje } from './format-slike';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const sa = (zaglavlje: number[], velicina = 64) => {
  const b = new Uint8Array(velicina);
  b.set(zaglavlje);
  return b;
};
const tekst = (t: string) => new TextEncoder().encode(t);

describe('mimeSlike (magični bajtovi kao MedijService)', () => {
  it.each([
    [PNG, 'image/png'], [JPEG, 'image/jpeg'], [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'], [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], 'image/gif'],
    [WEBP, 'image/webp'], [[0x42, 0x4d], null], [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], null], [[], null],
  ])('%j -> %s', (zaglavlje, mime) => {
    expect(mimeSlike(sa(zaglavlje as number[], 16))).toBe(mime);
  });

  it('prekratak niz nije slika', () => {
    expect(mimeSlike(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(mimeSlike(new Uint8Array(0))).toBeNull();
  });
});

describe('slikaZaSlanje (pretvaranje preskače ostalo)', () => {
  it('formati servera i BMP (pregledač ga dekodira, slanje pretvara) se šalju', () => {
    for (const z of [PNG, JPEG, WEBP, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], [0x42, 0x4d]]) expect(slikaZaSlanje(sa(z, 16))).toBe(true);
  });

  it('SVG, PDF, EMF, prazan deo i smeće se ne šalju', () => {
    expect(slikaZaSlanje(tekst('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(false);
    expect(slikaZaSlanje(tekst('<?xml version="1.0"?><svg/>'))).toBe(false);
    expect(slikaZaSlanje(tekst('%PDF-1.4'))).toBe(false);
    expect(slikaZaSlanje(sa([0x01, 0x00, 0x00, 0x00], 16))).toBe(false); // EMF zaglavlje
    expect(slikaZaSlanje(new Uint8Array(0))).toBe(false);
    expect(slikaZaSlanje(new Uint8Array([0x42]))).toBe(false);
  });
});
