import type { OdgovorPolja, PoljeZadatka } from '../../uzivo/ui/polja-zadatka';
import type { MedijInfo, PitanjeDetails, Platno, Tema, TipSlajda } from '../../uzivo/ui/slajd-za-prikaz';

/*
 * DTO-i naloga studenta, faze 2 i 3 (`api/public/nalog/*`, spec studentskog dela 5, 6 i 12). Imena polja su kao na serveru
 * (`dto/portal`). Studentu se nikad ne kaže "banka": tip zadatka je `tipId`, tema je koren. Datumi su `LocalDate(Time)` bez zone.
 */

export type { OdgovorPolja, PoljeZadatka };

export type TipAktivnosti = 'PRISUSTVO' | 'ZADATAK' | 'SA_ZVEZDICOM';

/** Tab "Predmeti": prisutan x od y, broj tipova za vežbanje, da li je ocena objavljena. */
export interface PredmetStudenta {
  id: number;
  naziv: string;
  prisutan: number;
  predavanja: number;
  tipovaZaVezbanje: number;
  ocenaObjavljena: boolean;
}

/** Predavanje u istoriji: `aktivnost` `null` = nije bio; `svojaGrupa` false kad sluša sa drugom grupom (ponavlja). */
export interface PredavanjeStudenta {
  id: number;
  datum: string;
  redniBroj: number;
  tema: string | null;
  grupa: string | null;
  svojaGrupa: boolean;
  aktivnost: TipAktivnosti | null;
  cekiranU: string | null;
}

export interface PrisustvoStudenta {
  prisutan: number;
  ukupno: number;
  predavanja: PredavanjeStudenta[];
}

/** Tip otvoren za vežbanje: `poNivou` su tačno tri broja (★, ★★, ★★★); `papir` = bez polja (rad na papiru). */
export interface TipVezbanja {
  tipId: number;
  naziv: string;
  putanja: string[];
  poNivou: number[];
  ukupno: number;
  papir: boolean;
  provereno: number;
  tacno: number;
}

export interface TemaVezbanja {
  naziv: string;
  tipovi: TipVezbanja[];
}

/** Izvučen zadatak: polja **bez** tačnih odgovora; prazna polja = rad na papiru. */
export interface ZadatakVezbanja {
  pokusajId: number;
  tipId: number;
  tip: string;
  tema: string;
  nivo: number;
  svgId: string;
  polja: PoljeZadatka[];
}

/** Ishod provere: ukupno i po polju, bez tačnih vrednosti. */
export interface ProveraVezbanja {
  tacno: boolean;
  ishod: Record<string, boolean>;
}

/** "Prikaži rešenje": SVG rešenja (`null` = nije uneto) i tačne vrednosti po polju. */
export interface ResenjeVezbanja {
  resenjeSvgId: string | null;
  tacneVrednosti: Record<string, OdgovorPolja>;
}

/** Sopstveni zadatak sa časa (samo završena izvođenja). `ishod`/`tacno` `null` bez odgovora ili za rad na papiru. */
export interface MojZadatak {
  rundaId: number;
  vreme: string | null;
  prezentacijaId: number | null;
  prezentacija: string | null;
  slajdId: number | null;
  slajd: string | null;
  tip: string | null;
  svgId: string;
  resenjeSvgId: string | null;
  polja: PoljeZadatka[];
  uneto: Record<string, string> | null;
  ishod: Record<string, boolean> | null;
  tacno: boolean | null;
  tacneVrednosti: Record<string, OdgovorPolja> | null;
  tipId: number | null;
  vezbanjeOtvoreno: boolean;
}

export interface PrezentacijaStudenta {
  id: number;
  naziv: string;
  odrzana: string | null;
  slajdova: number;
}

export interface TipZaVezbanje {
  tipId: number;
  naziv: string;
}

export interface ZadatakPregleda {
  naziv: string | null;
  moji: MojZadatak[];
  tipovi: TipZaVezbanje[];
}

export interface OdgovorPregleda {
  tekst: string | null;
  tacno: boolean | null;
}

/**
 * Slajd u pregledu: samo slajd koji je grupa videla u završenom izvođenju, bez beleški. `pitanje` je iz snimka runde sa časa
 * grupe i tada nosi tačan odgovor (`tacanPoznat`); bez runde je trenutno pitanje bez tačnog odgovora (`tacanPoznat: false`,
 * nijedna opcija tačna) i strana ne nudi "Prikaži tačan odgovor".
 */
export interface SlajdPregleda {
  id: number;
  rb: number;
  tip: TipSlajda;
  naslov: string | null;
  sadrzaj: string | null;
  slika: MedijInfo | null;
  pitanje: PitanjeDetails | null;
  platno: Platno | null;
  zadatak: ZadatakPregleda | null;
  mojOdgovor: OdgovorPregleda | null;
  tacanPoznat: boolean;
}

export interface PregledPrezentacije {
  id: number;
  naziv: string;
  tema: Tema | null;
  predmetId: number;
  slajdovi: SlajdPregleda[];
}

export interface PoeniTesta {
  naziv: string;
  poeni: number | null;
}

export interface SnimakOcene {
  predlogOcene: number | null;
  ukupno: number;
  poeniPredispitne: number;
  poeniAktivnost: number;
  poeniDomaci: number;
  testovi: PoeniTesta[];
}

/** `objavljeno: false` i ništa drugo dok nastavnik ne objavi. */
export interface OcenaStudenta {
  objavljeno: boolean;
  objavljenoU: string | null;
  ocena: SnimakOcene | null;
}

/** Podešavanja naloga (tab "Ja"); isti oblik za čitanje i izmenu. */
export interface PodesavanjaNaloga {
  /** Javi mi mejlom kad je čas otkazan (i kad se otkazan čas ipak održava). */
  mejlOtkazanCas: boolean;
}
