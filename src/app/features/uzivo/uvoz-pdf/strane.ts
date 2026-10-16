// Strane PDF-a kao slajdovi (faza 5d, odluke 17 i 18): granice uvoza, veličina crtanja, naziv strane, PLATNO slajd za
// stranu i poruka za izabran opseg. Čiste funkcije, bez pdf.js i bez API-ja pregledača.
import type { SlikaSloj, Tema } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { MAX_SLAJDOVA } from '../data-access/slajd-pravila';
import type { SlajdCmd } from '../data-access/uzivo.models';
import { TEME } from '../ui/teme';

/** Najviše izabranih strana u jednom uvozu. */
export const MAX_STRANA = 200;
/** Najveći PDF koji se otvara (PDF nikad ne ide na server). */
export const MAX_PDF_BAJTOVA = 100 * 1024 * 1024;
/** PNG strane veći od ovoga se kodira kao WebP (ili JPEG) 0,9. */
export const PRAG_PNG = 3 * 1024 * 1024;
/**
 * Slika strane i posle sažimanja veća od ovoga je greška te strane. Ista granica kao `MAX_SLIKA` u `uvoz-pptx/slanje.ts`
 * (server: `spring.servlet.multipart.max-file-size=10MB`); ovde je kopija da `strane.ts` ostane bez RxJS-a i Angulara,
 * a `strane.spec.ts` proverava da su jednake.
 */
export const MAX_SLIKA_STRANE = 10 * 1024 * 1024;

/** `od`/`do` = brojevi strana PDF-a (od 1), uključivo; `posle` = id slajda posle kog se ubacuju (`null` = na kraj). */
export interface IzborStrana { od: number; do: number; posle: number | null; }

const SLIKA = { sirina: 1920, visina: 1080 };
const PLATNO = { sirina: 960, visina: 540 };
/** Naziv sloja na serveru (`PlatnoPP`), u kodnim tačkama. */
const MAX_NAZIV = 60;

/** Uvećanje strane (pt) da stane u 1920 x 1080 (contain): 16:9 -> 1920 x 1080, 4:3 -> 1440 x 1080, A4 -> 764 x 1080. */
export function razmeraCrtanja(sirina: number, visina: number): number {
  return Math.min(SLIKA.sirina / sirina, SLIKA.visina / visina);
}

/** Veličina platna za crtanje strane u pikselima (bar 1 x 1). */
export function velicinaPlatna(sirina: number, visina: number): { w: number; h: number } {
  const r = razmeraCrtanja(sirina, visina);
  return { w: Math.max(1, Math.round(sirina * r)), h: Math.max(1, Math.round(visina * r)) };
}

/** `<ime fajla bez .pdf> - str. N`, najviše 60 znakova (naziv sloja na serveru); dugo ime se skraćuje sa "…". */
export function nazivStrane(imeFajla: string, broj: number): string {
  const osnova = imeFajla.replace(/\.pdf$/i, '').trim() || 'PDF';
  const sufiks = ` - str. ${broj}`;
  const mesto = MAX_NAZIV - [...sufiks].length;
  const znaci = [...osnova];
  return (znaci.length > mesto ? `${znaci.slice(0, mesto - 1).join('')}…` : osnova) + sufiks;
}

/**
 * PLATNO slajd strane (spec 3, odluka 17): pozadina = boja pozadine teme (trake oko strane koja nije 16:9), jedan
 * zaključan SLIKA sloj `s1` contain u 960 x 540 (nastavnik crta svoje slojeve preko njega), bez animacija i beležaka.
 * `medijKljuc` je ključ slike pre slanja (heš); slanje ga menja id-jem servera (`zameniMedije`).
 */
export function slajdStrane(medijKljuc: string, strana: { sirina: number; visina: number }, naziv: string, tema: Tema): SlajdCmd {
  const k = Math.min(PLATNO.sirina / strana.sirina, PLATNO.visina / strana.visina);
  const sirina = z(strana.sirina * k);
  const visina = z(strana.visina * k);
  const sloj: SlikaSloj = {
    id: 's1', tip: 'SLIKA', naziv, x: z((PLATNO.sirina - sirina) / 2), y: z((PLATNO.visina - visina) / 2), sirina, visina,
    rotacija: 0, providnost: 1, zakljucan: true, senka: null, medijId: medijKljuc, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 },
  };
  return {
    tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null,
    platno: { verzija: 1, pozadina: { boja: TEME[tema].pozadina, medijId: null }, slojevi: [sloj], animacije: [] },
    prelaz: null,
  };
}

/** Poruka kad izabran opseg ne može da se uveze (dugme "Uvezi" je tada onemogućeno), inače `null`. */
export function porukaOpsega(od: number, doStr: number, ukupno: number, postojecih: number): string | null {
  if (!Number.isInteger(od) || !Number.isInteger(doStr) || od < 1 || doStr > ukupno || od > doStr) {
    return `Izaberi strane od 1 do ${ukupno}.`;
  }
  const broj = doStr - od + 1;
  if (broj > MAX_STRANA) return `Najviše ${MAX_STRANA} strana odjednom. Izaberi manji opseg.`;
  const mesta = MAX_SLAJDOVA - postojecih;
  if (mesta <= 0) return `Prezentacija već ima ${MAX_SLAJDOVA} slajdova.`;
  if (broj > mesta) return `Broj slajdova koji još staju: ${mesta}. Izaberi manji opseg.`;
  return null;
}
