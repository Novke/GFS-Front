/**
 * Pravila javne forme kao na serveru (`PrijavaPP`), da student grešku vidi ispod polja, a ne tek posle slanja.
 * Čiste funkcije bez Angulara: sve što forma proverava i normalizuje je ovde.
 */

export type Polje = 'ime' | 'prezime' | 'indeks' | 'godina' | 'email' | 'brojTelefona' | 'datumRodjenja' | 'opstina';

/** Token je url-safe; sve drugo (npr. `a%2F..%2F..`) je nepostojeći link, ne ide u putanju zahteva. */
export const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const INDEKS = /^[A-Z0-9/.-]{2,20}$/;
const TELEFON = /^[0-9 +\-/]{6,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const PORUKE: Record<Polje, string> = {
  ime: 'Unesi ime.',
  prezime: 'Unesi prezime.',
  indeks: 'Unesi indeks latinicom (2-20 znakova, npr. GD12).',
  godina: 'Unesi godinu upisa.',
  email: 'Unesi ispravan email.',
  brojTelefona: 'Unesi broj telefona (6-20 cifara, može +, -, /, razmak).',
  datumRodjenja: 'Unesi ispravan datum rođenja.',
  opstina: 'Opština može imati najviše 100 znakova.',
};

/** Kao `IndeksUtil.normalizuj` na serveru: bez razmaka (i neprekidivih), velikim slovima ("gd 12" -> "GD12"). */
export function normalizujIndeks(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

export function imeBezViskaRazmaka(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

/** Lokalni (ne UTC) datum kao `yyyy-MM-dd`: "danas" za `max` polja datuma. */
export function lokalniDatum(d: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

export interface Granice {
  /** Najveća dozvoljena godina upisa (iduća godina). */
  maxGodina: number;
  /** Danas, `yyyy-MM-dd`. */
  danas: string;
}

/** Poruka ako vrednost polja ne prolazi pravila servera, inače `null`. */
export function greskaPolja(polje: Polje, vrednost: string | number | null | undefined, g: Granice): string | null {
  const tekst = typeof vrednost === 'string' ? vrednost : '';
  switch (polje) {
    case 'ime':
    case 'prezime': {
      const s = imeBezViskaRazmaka(tekst);
      return s.length > 0 && s.length <= 60 ? null : PORUKE[polje];
    }
    case 'indeks':
      if (!tekst.trim()) {
        return 'Unesi indeks (2-20 znakova).';
      }
      return INDEKS.test(normalizujIndeks(tekst)) ? null : PORUKE.indeks;
    case 'godina':
      if (typeof vrednost !== 'number') {
        return PORUKE.godina;
      }
      return Number.isInteger(vrednost) && vrednost >= 2000 && vrednost <= g.maxGodina
        ? null
        : `Unesi godinu upisa (2000-${g.maxGodina}).`;
    case 'email': {
      const s = tekst.trim();
      return s.length <= 120 && EMAIL.test(s) ? null : PORUKE.email;
    }
    case 'brojTelefona':
      return TELEFON.test(tekst.trim()) ? null : PORUKE.brojTelefona;
    case 'datumRodjenja':
      return !tekst || (DATUM.test(tekst) && tekst >= '1920-01-01' && tekst <= g.danas) ? null : PORUKE.datumRodjenja;
    case 'opstina':
      return tekst.trim().length <= 100 ? null : PORUKE.opstina;
  }
}
