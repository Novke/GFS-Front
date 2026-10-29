import type { SlajdDetails } from '../data-access/uzivo.models';

/*
 * Ulazni tip renderera slajda (`app-slajd-prikaz`, `app-zadatak-prikaz`) i tipovi koje on nosi, samo tipovi (bez koda u
 * paketu). Uži od `SlajdDetails`: renderer ne čita beleške, `postepeno` (dolazi kao poseban ulaz) ni prelaz, pa ih pozivalac
 * i nema zašto da šalje. Studentski pregled prezentacije (`features/nalog`, spec studentskog dela 6.1 i 12.9 tačka 11) gradi
 * slajd bez beleški iz `api/public/nalog/prezentacije/{id}` i uvozi ovaj tip umesto `uzivo.models` (tuđ `data-access`).
 */
export type SlajdZaPrikaz = Pick<SlajdDetails, 'id' | 'tip' | 'naslov' | 'sadrzaj' | 'slika' | 'pitanje' | 'platno' | 'zadatak'>;

export type {
  MedijInfo, OdstupanjeTip, OpcijaDetails, PitanjeDetails, Tema, TekstPrikaz, TipPitanja, TipSlajda,
} from '../data-access/uzivo.models';
export type { Platno } from '../data-access/platno.models';
