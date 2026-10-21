/*
 * DTO-i javnog naloga studenta (`api/public/nalog/*`, spec prijave 5.1). Imena polja su kao na serveru. Bez uvoza.
 */

/** Odgovor na `POST api/public/nalog/kod`: uvek isti oblik, i za nepostojeći indeks (maska je tada lažna, ali stalna). */
export interface KodOdgovor {
  /** "Ako nalog postoji, kod je poslat." */
  poruka: string;
  /** Maska mejla, npr. `n***@gmail.com`. */
  maska: string;
}

/** `GET api/public/nalog/stanje` (anonimno). */
export interface StanjeNaloga {
  prijavljen: boolean;
}

/** Prijavljeni uređaj studenta (`KOD` = kod na mejl, `LTI` = Moodle). Datumi su `LocalDateTime` bez zone. */
export interface UredjajInfo {
  id: number;
  opis: string;
  nacin: 'KOD' | 'LTI';
  prviUlaz: string;
  poslednjiUlaz: string;
  /** Ovaj pregledač. */
  trenutni: boolean;
}

/** `GET api/public/nalog/ja` (`StudentJaInfo`): samo uz kolačić studenta, inače 401. */
export interface StudentJa {
  indeks: string;
  ime: string;
  prezime: string;
  maskaMejla: string | null;
  uredjaji: UredjajInfo[];
  moodlePovezan: boolean;
}

/** `POST api/public/nalog/pomoc`: uvek "Javili smo nastavniku." (stvarno obaveštenje najviše 1/h po indeksu). */
export interface PomocOdgovor {
  poruka: string;
}

/** `GET api/public/lti/povezivanje`: ime Moodle naloga iz ulaska (`null` kad ga Moodle nije podelio). */
export interface PovezivanjeOdgovor {
  ime: string | null;
}

/** `POST api/public/nalog/odjava-svuda`. */
export interface OdjavaSvudaOdgovor {
  odjavljeno: number;
}

/** Tekstovi koje server šalje (spec prijave 5.1); front ih koristi kad odgovor nema svoj tekst. */
export const PORUKA_KOD_POSLAT = 'Ako nalog postoji, kod je poslat.';
export const PORUKA_POMOC = 'Javili smo nastavniku.';

/** `POST api/public/lti/povezi` 410 i 409 (spec prijave 8.3, odluka R6): front ih koristi kad odgovor nema svoj tekst. */
export const PORUKA_POVEZIVANJE_ISTEKLO = 'Povezivanje je isteklo. Otvori GFS ponovo iz Moodle-a.';
export const PORUKA_VEC_POVEZAN = 'Ovaj Moodle nalog je već povezan sa drugim studentom. Javi se nastavniku.';
