/**
 * Pravila javne forme kao na serveru (`PrijavaPP`), da student grešku vidi ispod polja, a ne tek posle slanja.
 * Čiste funkcije bez Angulara. Indeks u tri dela i godina su u `shared/forms/indeks-polja` (isto kao na `/nalog`),
 * telefon u `telefon.ts`; ovde su ostala polja.
 */

export type Polje = 'ime' | 'prezime' | 'email' | 'datumRodjenja' | 'opstina';

/** Token je url-safe; sve drugo (npr. `a%2F..%2F..`) je nepostojeći link, ne ide u putanju zahteva. */
export const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const PORUKE: Record<Polje, string> = {
  ime: 'Unesi ime.',
  prezime: 'Unesi prezime.',
  email: 'Unesi ispravan email.',
  datumRodjenja: 'Unesi ispravan datum rođenja.',
  opstina: 'Opština može imati najviše 100 znakova.',
};

export function imeBezViskaRazmaka(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

/** Lokalni (ne UTC) datum kao `yyyy-MM-dd`: "danas" za `max` polja datuma. */
export function lokalniDatum(d: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

export interface Granice {
  /** Danas, `yyyy-MM-dd`. */
  danas: string;
}

/** Poruka ako vrednost polja ne prolazi pravila servera, inače `null`. */
export function greskaPolja(polje: Polje, vrednost: string | null | undefined, g: Granice): string | null {
  const tekst = typeof vrednost === 'string' ? vrednost : '';
  switch (polje) {
    case 'ime':
    case 'prezime': {
      const s = imeBezViskaRazmaka(tekst);
      return s.length > 0 && s.length <= 60 ? null : PORUKE[polje];
    }
    case 'email': {
      const s = tekst.trim();
      return s.length <= 120 && EMAIL.test(s) ? null : PORUKE.email;
    }
    case 'datumRodjenja':
      return !tekst || (DATUM.test(tekst) && tekst >= '1920-01-01' && tekst <= g.danas) ? null : PORUKE.datumRodjenja;
    case 'opstina':
      return tekst.trim().length <= 100 ? null : PORUKE.opstina;
  }
}

/** Link za dugme posle prijave: isto pravilo kao Početna naloga (`shared/util/wa-link`). */
export { waLinkZaPrikaz } from '../../shared/util/wa-link';
