import type { Platno, Potez, Tema } from './platno.models';

export type { Tema } from './platno.models';
export type TipSlajda = 'INFO' | 'PITANJE' | 'PLATNO';
export type TipPitanja = 'JEDAN_TACAN' | 'VISE_TACNIH' | 'ANKETA' | 'TACNO_NETACNO' | 'KRATAK_TEKST' | 'BROJ' | 'SKALA';
export type TelefonPrikaz = 'DUGMAD' | 'PITANJE';
export type OdstupanjeTip = 'APSOLUTNO' | 'PROCENAT';
export type TekstPrikaz = 'LISTA' | 'OBLAK';
export type StatusIzvodjenja = 'AKTIVNO' | 'ZAVRSENO';
export type Prikaz = 'PRIJAVA' | 'SLAJD' | 'KRAJ';
export type Faza = 'CEKA' | 'OTVORENO' | 'ZATVORENO';
export type Ekran = 'NORMALAN' | 'CRN' | 'BEO';
/** Prelaz na slajd (faza 5, odluka 11): FADE "Postepeno", GURANJE (Push), BRISANJE (Wipe). */
export type TipPrelaza = 'FADE' | 'GURANJE' | 'BRISANJE';
/** Strana sa koje dolazi novi slajd (kao `smer` ULET-a); FADE nema smer. */
export type SmerPrelaza = 'LEVO' | 'DESNO' | 'GORE' | 'DOLE';
/** Prelaz pri ulasku na slajd bilo kog tipa (`null` = bez prelaza); `trajanjeMs` 100-5000. */
export interface Prelaz { efekat: TipPrelaza; smer: SmerPrelaza | null; trajanjeMs: number; }
export type TipKomande = 'SLEDECI' | 'PRETHODNI' | 'IDI_NA' | 'OTVORI_ZATVORI' | 'REZULTATI' | 'TACAN' | 'RANG_LISTA'
  | 'PONOVI' | 'TAJMER' | 'TAJMER_PLUS' | 'TAJMER_MINUS' | 'TELEFON_PRIKAZ' | 'DETALJI' | 'EKRAN_CRN' | 'EKRAN_BEO'
  | 'QR' | 'ZAVRSI';

export interface MedijInfo { id: string; naziv: string; mime: string; velicina: number; }
export interface PredmetKratko { id: number; naziv: string; }
export interface GrupaKratko { id: number; naziv: string; }
export interface OpcijaDetails { id: number; rb: number; tekst: string; tacna: boolean; }
export interface PitanjeDetails {
  id: number; tip: TipPitanja; tekst: string; slika: MedijInfo | null; vremeSekunde: number | null;
  opcije: OpcijaDetails[]; brojTacno: number | null; brojOdstupanje: number | null; odstupanjeTip: OdstupanjeTip | null;
  jedinica: string | null; tekstPrikaz: TekstPrikaz | null; prihvatljiviOdgovori: string[] | null;
  skalaMinOznaka: string | null; skalaMaxOznaka: string | null;
}
export interface SlajdDetails {
  id: number; rb: number; tip: TipSlajda; naslov: string | null; sadrzaj: string | null; slika: MedijInfo | null;
  beleske: string | null; postepeno: boolean; pitanje: PitanjeDetails | null; platno: Platno | null;
  /** PUT je puna zamena: komanda bez prelaza ga briše, pa svaki PUT nosi postojeći (`slajdUCmd`). */
  prelaz: Prelaz | null;
}
/**
 * Potezi jednog CRTEZ sloja (`GET slajdovi/{id}/potezi`, redom slojeva). Snimak izvođenja ih ne nosi (`CrtezSloj.potezi`
 * je tamo `null`); `sirina`/`visina` su veličina sloja u dokumentu, `potezi` je `null` kad crtež nema vektor (samo slika).
 */
export interface PoteziSloja { slojId: string; medijId: string; sirina: number; visina: number; potezi: Potez[] | null; }
export interface PrezentacijaInfo {
  id: number; naziv: string; opis: string | null; predmet: PredmetKratko; brojSlajdova: number; brojPitanja: number;
  izmenjeno: string; tema: Tema; takmicenje: boolean; telefonPrikaz: TelefonPrikaz; detaljiDozvoljeni: boolean;
  brojIzvodjenja: number; aktivnoIzvodjenjeId: number | null;
}
export interface PrezentacijaDetails extends PrezentacijaInfo { slajdovi: SlajdDetails[]; }
export interface CreatePrezentacijaCmd { predmetId: number; naziv: string; opis?: string | null; tema?: Tema | null; }
export interface UpdatePrezentacijaCmd { naziv: string; opis: string | null; tema: Tema; takmicenje: boolean; telefonPrikaz: TelefonPrikaz; detaljiDozvoljeni: boolean; }
export interface OpcijaCmd { tekst: string; tacna: boolean; }
export interface PitanjeCmd {
  tip: TipPitanja; tekst: string; slikaId: string | null; vremeSekunde: number | null; opcije: OpcijaCmd[];
  brojTacno: number | null; brojOdstupanje: number | null; odstupanjeTip: OdstupanjeTip | null; jedinica: string | null;
  tekstPrikaz: TekstPrikaz | null; prihvatljiviOdgovori: string[]; skalaMinOznaka: string | null; skalaMaxOznaka: string | null;
}
export interface SlajdCmd { tip: TipSlajda; naslov: string | null; sadrzaj: string | null; slikaId: string | null; beleske: string | null; postepeno: boolean; pitanje: PitanjeCmd | null; platno: Platno | null; prelaz: Prelaz | null; }
/** Uvoz više slajdova odjednom (PowerPoint): `posle` = id slajda posle kog se ubacuju, `null` = na kraj. */
export interface UvozSlajdovaCmd { posle: number | null; slajdovi: SlajdCmd[]; }
export interface PredavanjeZaPokretanje { id: number; rb: number; datum: string; tema: string | null; zavrseno: boolean | null; grupa: GrupaKratko | null; }
export interface PokreniCmd { cuvanje: boolean; grupaId: number | null; predavanjeId: number | null; }
export interface PredavanjeKratko { id: number; rb: number; datum: string; tema: string | null; }
export interface IzvodjenjeInfo {
  id: number; prezentacija: { id: number; naziv: string; predmetId: number }; kod: string; status: StatusIzvodjenja;
  cuvanje: boolean; grupa: GrupaKratko | null; predavanje: PredavanjeKratko | null; pocetak: string; kraj: string | null;
  brojUcesnika: number; brojPitanja: number;
}
export interface KomandaCmd { tip: TipKomande; vrednost?: number | null; }
export interface RezultatOpcija { id: number; tekst: string | null; broj: number; tacna: boolean | null; }
export interface BrojStavka { vrednost: number; broj: number; }
export interface RezultatBrojevi { medijana: number | null; uOdstupanju: number | null; najcesce: BrojStavka[]; }
export interface RezultatTekst { kljuc: string; tekst: string; broj: number; sakriven: boolean; tacan: boolean | null; }
export interface RezultatSkala { raspodela: number[]; prosek: number | null; }
export interface Rezultat {
  tip: TipPitanja; ukupno: number; opcije: RezultatOpcija[] | null; brojevi: RezultatBrojevi | null;
  tekstovi: RezultatTekst[] | null; skala: RezultatSkala | null;
}
export interface RangStavka { mesto: number; ucesnikId: number | null; ime: string; poeni: number; }
export interface RundaInfo { id: number; redniBroj: number; rokMs: number | null; preostaloMs: number | null; tajmerRadi: boolean; }
export interface UcesnikStanje { id: number; ime: string; poeni: number; povezan: boolean; odgovorio: boolean; }
/**
 * Snimak za nastavnika. `rezultat` i `rangLista` su nastavnički (tačnost i poeni trenutne runde uživo, samo konzola);
 * projektor prikazuje `javniRezultat` i `javnaRangLista`, koje server gradi istim kodom kao `JavnoStanje.rezultat` i
 * `JavnoStanje.rangLista` (null dok nisu prikazani).
 */
export interface NastavnickoStanje {
  izvodjenje: IzvodjenjeInfo; verzija: number; serverVremeMs: number; prikaz: Prikaz; korak: number; brojStavki: number;
  indeks: number; brojSlajdova: number; trenutniSlajd: SlajdDetails | null; sledeciSlajd: SlajdDetails | null;
  faza: Faza | null; runda: RundaInfo | null; rezultatiPrikazani: boolean; tacanPrikazan: boolean;
  rangListaPrikazana: boolean; ekran: Ekran; qrPrikazan: boolean; telefonPrikaz: TelefonPrikaz; detaljiDozvoljeni: boolean;
  takmicenje: boolean; tema: Tema; rezultat: Rezultat | null; brojOdgovora: number; brojPovezanih: number;
  ucesnici: UcesnikStanje[]; rangLista: RangStavka[]; javniRezultat: Rezultat | null; javnaRangLista: RangStavka[] | null;
  /** Početak izvođenja, epoch ms (server računa iz `izvodjenje.pocetak` u svojoj zoni); osnova štoperice. */
  pocetakMs: number;
}
export interface JavnaOpcija { id: number; tekst: string | null; }
export interface JavnoPitanje {
  tip: TipPitanja; faza: Faza; rundaId: number | null; brojOpcija: number | null; opcije: JavnaOpcija[] | null;
  tekst: string | null; slikaId: string | null; jedinica: string | null; skalaMinOznaka: string | null;
  skalaMaxOznaka: string | null; rokMs: number | null; preostaloMs: number | null;
  tacneOpcije: number[] | null; tacanBroj: number | null; prihvatljiviOdgovori: string[] | null;
}
export interface JavnoStanje {
  izvodjenjeId: number; verzija: number; serverVremeMs: number; status: StatusIzvodjenja; naziv: string; kod: string;
  prikaz: Prikaz; slajdTip: TipSlajda | null; ekran: Ekran; takmicenje: boolean; telefonPrikaz: TelefonPrikaz;
  detaljiDozvoljeni: boolean; brojUcesnika: number; pitanje: JavnoPitanje | null; rezultat: Rezultat | null;
  rangLista: RangStavka[] | null;
}
export interface LicniOdgovor { rundaId: number; primljen: boolean; tacno: boolean | null; poeni: number | null; }
export interface LicnoStanje {
  verzija: number; ucesnikId: number; ime: string; poeni: number; mesto: number | null; brojUcesnika: number;
  izbacen: boolean; odgovor: LicniOdgovor | null;
}
export interface PocetnoStanje { javno: JavnoStanje; licno: LicnoStanje; }
export interface UcesnikInfo { ucesnikId: number; ime: string; izvodjenjeId: number; }
export interface JavnoIzvodjenjeInfo { naziv: string; }
export interface OdgovorCmd { rundaId: number; opcije?: number[]; broj?: string; tekst?: string; skala?: number; }
export interface PitanjeSnimak {
  pitanjeId: number; slajdId: number | null; tip: TipPitanja; tekst: string; slikaId: string | null; vremeSekunde: number | null;
  opcije: { id: number; rb: number; tekst: string; tacna: boolean }[]; brojTacno: number | null; brojOdstupanje: number | null;
  odstupanjeTip: OdstupanjeTip | null; jedinica: string | null; tekstPrikaz: TekstPrikaz | null;
  prihvatljiviOdgovori: string[] | null; skalaMinOznaka: string | null; skalaMaxOznaka: string | null;
}
export interface RezultatPitanja {
  rundaId: number; slajdId: number | null; rbSlajda: number | null; redniBroj: number; pitanje: PitanjeSnimak;
  rezultat: Rezultat; brojOdgovora: number; procenatTacnih: number | null;
}
/** `takmicenje`: podešavanje izvođenja zapamćeno pri pokretanju (pregled po tome prikazuje poene i rang-listu). */
export interface IzvodjenjeRezultati {
  izvodjenje: IzvodjenjeInfo; takmicenje: boolean; pitanja: RezultatPitanja[]; rangLista: RangStavka[];
}
export const medijUrl = (id: string) => `api/public/mediji/${encodeURIComponent(id)}`;
