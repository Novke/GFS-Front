// Provera imena fajla i poruke o celom fajlu. Bez uvoza (ni fflate-a): koristi je i dijalog "Nova prezentacija"
// iz glavnog chunk-a uživo, a ostatak uvoza se učitava dinamičkim import()-om.

export const PORUKE_FAJLA = {
  ostecen: 'Fajl je prevelik ili oštećen.',
  ppt: 'Ovo je stari PowerPoint format (.ppt). Otvori ga u PowerPointu, sačuvaj kao .pptx i uvezi taj fajl.',
  lozinka: 'Fajl je zaštićen lozinkom. Ukloni lozinku u PowerPointu (Datoteka > Informacije > Zaštiti prezentaciju), sačuvaj i uvezi ponovo.',
  makro: 'Prezentacija sa makroima (.pptm) se ne uvozi. Sačuvaj je kao .pptx (bez makroa) i uvezi taj fajl.',
  nijePptx: 'Ovo nije PowerPoint prezentacija (.pptx).',
  bezSlajdova: 'Prezentacija nema nijedan slajd.',
} as const;

/** Greška celog fajla; `message` je poruka za korisnika, tehnički detalj (npr. putanja dela) je samo u `cause`. */
export class GreskaUvoza extends Error {
  override name = 'GreskaUvoza';
}

/** Stari binarni formati (prezentacija, prikaz, šablon) dobijaju istu poruku kao `.ppt`. */
const STARI = new Set(['ppt', 'pps', 'pot']);
const MAKRO = new Set(['pptm', 'ppsm', 'potm']);
const PPTX = new Set(['pptx', 'ppsx', 'potx']);

/** Poruka za korisnika kad se fajl ovog imena ne uvozi, inače `null`. */
export function proveriImeFajla(ime: string): string | null {
  const ekstenzija = /\.([^./\\]+)$/.exec(ime.trim().toLowerCase())?.[1] ?? '';
  if (STARI.has(ekstenzija)) return PORUKE_FAJLA.ppt;
  if (MAKRO.has(ekstenzija)) return PORUKE_FAJLA.makro;
  return PPTX.has(ekstenzija) ? null : PORUKE_FAJLA.nijePptx;
}
