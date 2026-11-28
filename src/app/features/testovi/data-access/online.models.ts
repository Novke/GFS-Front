import type { OdgovorPolja, PoljeZadatka as PoljeSeme, TipPoljaZadatka } from '../../uzivo/ui/polja-zadatka';

/*
 * Online testovi, nastavnik (plan `2026-11-28-online-testovi-faze-1-2.md`, odeljak 4 u `Novke/GFS-deploy`): DTO-i tačno po
 * ugovoru API-ja (imena polja kao na serveru). Putanje: `sabloni-testa/*` i `test/{id}/online/*`, `test/{id}/objava`.
 * Tipovi polja banke dolaze iz `features/uzivo/ui/polja-zadatka` (re-eksport tipova, jer `gfs/granice-featurea` zabranjuje
 * uvoz tuđeg `data-access`-a).
 */

export type { OdgovorPolja, TipPoljaZadatka };

/** Polje šeme zadatka (kao u banci) plus poeni polja i oznaka konačnog rezultata (spec 6.2); `null` = podrazumevano. */
export type PoljeZadatka = PoljeSeme & { poeni?: number | null; konacno?: boolean | null };

export type Rezim = 'GRUPE' | 'POJEDINACNO';
export type GrupaTesta = 'A' | 'B' | 'C' | 'D';
export type StanjeOnline = 'PRIPREMA' | 'ULAZ' | 'U_TOKU' | 'ZAVRSEN';
export type NacinTesta = 'PAPIR' | 'ONLINE';

// ------------------------------------------------------------------------------------------------ 4.1 šabloni

export interface SablonCmd {
  predmetId: number;
  tipTestaId: number | null;
  naziv: string;
  opis: string | null;
  /** 5-300 */
  trajanjeMin: number;
  rezim: Rezim;
  /** 1-4 */
  brojGrupa: number;
  pragProlaza: number | null;
  /** 1-30 */
  stavke: StavkaSablonaCmd[];
}

export interface StavkaSablonaCmd {
  naziv: string;
  /** ceo broj 1-100, po izvučenom zadatku */
  poeni: number;
  /** 1-20 */
  broj: number;
  /** `[]` = svi nivoi */
  nivoi: number[];
  istiTip: boolean;
  rucno: boolean;
  /** 1-10 čvorova banke namene TEST istog predmeta (unija) */
  izvori: number[];
}

export interface SablonInfo {
  id: number;
  predmetId: number;
  tipTestaId: number | null;
  tipTesta: string | null;
  naziv: string;
  trajanjeMin: number;
  rezim: Rezim;
  brojGrupa: number;
  maxPoena: number;
  brojStavki: number;
  arhiviran: boolean;
  izmenjeno: string;
}

export interface IzvorStavke { grupaId: number; naziv: string; putanja: string[]; obrisan: boolean; }
/** `poNivou`: tačno tri broja (nivo 1, 2, 3). */
export interface KandidatiStavke { ukupno: number; poNivou: [number, number, number]; tipova: number; }

export interface StavkaSablona {
  id: number | null;
  rb: number;
  naziv: string;
  poeni: number;
  broj: number;
  nivoi: number[];
  istiTip: boolean;
  rucno: boolean;
  izvori: IzvorStavke[];
  kandidati: KandidatiStavke;
  upozorenja: string[];
}

export interface SablonDetails extends Omit<SablonInfo, 'brojStavki'> {
  opis: string | null;
  pragProlaza: number | null;
  stavke: StavkaSablona[];
  upozorenja: string[];
}

// ------------------------------------------------------------------------------------------------ 4.2 pravljenje i priprema

export interface StudentKratko { id: number; ime: string; prezime: string; indeks: string; godina: number; stariji: boolean; }
export interface KandidatiStudenti { grupa: StudentKratko[]; stariji: StudentKratko[]; }

export interface NoviOnlineTestCmd {
  sablonId: number;
  grupaId: number;
  tipTestaId: number;
  /** YYYY-MM-DD */
  datum: string;
  trajanjeMin: number;
  rezim: Rezim;
  brojGrupa: number;
  /** 1-300 */
  studentIds: number[];
}

export interface IzvuciCmd {
  stavkaId: number;
  /** `null` = sve grupe / svi studenti */
  grupaTesta: GrupaTesta | null;
  mesto: number | null;
  /** „Izaberi tip“ */
  tipId: number | null;
  /** „Izaberi nivo“ (menja za ceo test) */
  nivo: number | null;
  /** „Izaberi varijantu“ (samo GRUPE, jedna grupa i mesto) */
  varijantaId: number | null;
}

export interface SmenaTesta {
  id: number;
  ulazniKod: string | null;
  ulazOtvoren: string | null;
  pokrenuta: string | null;
  rokMs: number | null;
  zatvorena: string | null;
}

export interface ZadatakIzbora {
  stavkaId: number;
  mesto: number;
  varijantaId: number;
  tipId: number;
  tip: string;
  nivo: number;
  svgId: string;
  resenjeSvgId: string | null;
  polja: PoljeZadatka[];
  odgovori: Record<string, OdgovorPolja>;
  maxPoena: number;
  studenata: number;
}

export interface GrupaIzbora {
  /** `null` u POJEDINACNO */
  grupaTesta: GrupaTesta | null;
  studenata: number;
  zadaci: ZadatakIzbora[];
}

export interface StavkaTesta {
  id: number;
  rb: number;
  naziv: string;
  poeni: number;
  broj: number;
  nivoi: number[];
  izabraniNivo: number | null;
  istiTip: boolean;
  rucno: boolean;
  izvori: IzvorStavke[];
  /** listovi unije, za „Izaberi tip“ */
  tipovi: { tipId: number; naziv: string }[];
}

export interface OnlineTest {
  testId: number;
  tipTesta: string;
  predmetId: number;
  predmet: string;
  grupaId: number;
  grupa: string;
  datum: string;
  stanje: StanjeOnline;
  rezim: Rezim;
  brojGrupa: number;
  trajanjeMin: number;
  maxPoena: number;
  pragProlaza: number | null;
  pregledan: boolean;
  objavljeno: string | null;
  objavaTacni: boolean;
  sablonId: number | null;
  smena: SmenaTesta;
  serverVremeMs: number;
  stavke: StavkaTesta[];
  /**
   * GRUPE: po grupi testa; POJEDINACNO: jedna „grupa“ `null` sa svim različitim varijantama po mestima (zadaci istog mesta
   * se ponavljaju sa svojim brojem studenata).
   */
  izbor: GrupaIzbora[];
  studenti: number;
  upozorenja: string[];
}

// ------------------------------------------------------------------------------------------------ 4.3 tok i konzola

export type StanjePrimerka = 'NIJE_USAO' | 'CEKA' | 'RADI' | 'PREDAO' | 'PONISTEN';

export interface StudentKonzole {
  primerakId: number;
  studentId: number;
  ime: string;
  prezime: string;
  indeks: string;
  grupaTesta: string | null;
  stanje: StanjePrimerka;
  popunjeno: number;
  ukupnoPolja: number;
  rokMs: number | null;
  produzenjeMin: number;
  predato: string | null;
  /** aktivni uređaj je RACUNAR */
  racunar: boolean;
  promenaUredjaja: number;
  napustanja: number;
  napustanjaSekundi: number;
  drugaMreza: boolean;
  prepisivao: boolean;
  poeni: number | null;
}

export interface KonzolaTesta {
  testId: number;
  stanje: StanjeOnline;
  smena: SmenaTesta;
  serverVremeMs: number;
  maxPoena: number;
  usli: number;
  predalo: number;
  ukupno: number;
  studenti: StudentKonzole[];
}

// ------------------------------------------------------------------------------------------------ 4.4 rezultati i ispravke

export interface ZadatakRezultata { rb: number; poeni: number | null; maxPoena: number; rucno: boolean; }

export interface StudentRezultata {
  primerakId: number;
  studentId: number;
  ime: string;
  prezime: string;
  indeks: string;
  grupaTesta: string | null;
  stanje: StanjePrimerka;
  poeni: number | null;
  zadaci: ZadatakRezultata[];
  prepisivao: boolean;
  znaci: string[];
}

/** `tacnost` 0-1 */
export interface StavkaRezultata { rb: number; naziv: string; maxPoena: number; prosek: number | null; tacnost: number | null; }

export interface RezultatiTesta {
  testId: number;
  maxPoena: number;
  pragProlaza: number | null;
  /** po rb zadatka u primerku */
  stavke: StavkaRezultata[];
  studenti: StudentRezultata[];
}

export interface OcenaPoljaNastavnik { udeo: number; izvor: 'AUTO' | 'ISPRAVKA'; }

export interface ZadatakPrimerka {
  zadatakId: number;
  rb: number;
  naziv: string;
  tip: string;
  nivo: number;
  varijantaId: number;
  svgId: string;
  resenjeSvgId: string | null;
  polja: PoljeZadatka[];
  odgovori: Record<string, OdgovorPolja>;
  uneto: Record<string, unknown> | null;
  ocena: Record<string, OcenaPoljaNastavnik>;
  maxPoena: number;
  autoPoeni: number | null;
  rucniPoeni: number | null;
  poeni: number | null;
  napomena: string | null;
  sacuvano: string | null;
}

export interface DogadjajTesta { vreme: string; vrsta: string; detalj: string | null; }

export interface PrimerakNastavnika {
  primerakId: number;
  studentId: number;
  ime: string;
  prezime: string;
  indeks: string;
  grupaTesta: string | null;
  stanje: StanjePrimerka;
  usao: string | null;
  predato: string | null;
  nacinPredaje: string | null;
  poeni: number | null;
  maxPoena: number;
  zadaci: ZadatakPrimerka[];
  dogadjaji: DogadjajTesta[];
}

/** `prihvacen`: tačan zbog ispravke PRIHVATI. */
export interface GrupaOdgovora { kljuc: string; prikaz: string; broj: number; tacno: boolean; prihvacen: boolean; }

export interface PoljeOdgovora {
  kljuc: string;
  oznaka: string;
  tip: TipPoljaZadatka;
  poeni: number;
  konacno: boolean;
  opcije: PoljeZadatka['opcije'];
  /** važeći ključ (posle KLJUC ispravke) */
  tacno: OdgovorPolja;
  ponisteno: boolean;
  prazno: number;
  grupe: GrupaOdgovora[];
}

export interface VarijantaOdgovora {
  varijantaId: number;
  stavkaRb: number;
  naziv: string;
  tip: string;
  nivo: number;
  grupeTesta: string[];
  svgId: string;
  resenjeSvgId: string | null;
  primeraka: number;
  polja: PoljeOdgovora[];
}

export type VrstaIspravke = 'PRIHVATI' | 'PONISTI' | 'KLJUC';

export interface IspravkaTesta { id: number; varijantaId: number; polje: string; vrsta: VrstaIspravke; vrednost: string | null; kreirano: string; }

export interface OdgovoriTesta {
  varijante: VarijantaOdgovora[];
  /** samo nevraćene */
  ispravke: IspravkaTesta[];
}

export interface IspravkaCmd {
  varijantaId: number;
  polje: string;
  vrsta: VrstaIspravke;
  /** PRIHVATI: `kljuc` iz GrupaOdgovora; KLJUC: JSON OdgovorPolja kao string; PONISTI: null */
  vrednost: string | null;
}

/** Čvor stabla banke namene TEST (izbor izvora stavke); deo `GrupaCvor` iz `GET banka/stablo`. */
export interface CvorBankeTesta {
  id: number;
  naziv: string;
  list: boolean;
  brojAktivnih: number;
  iskljucena: boolean;
  deca: CvorBankeTesta[];
}

/** Varijanta tipa za „Izaberi varijantu“ (deo `VarijantaInfo` iz `GET banka/grupe/{id}/varijante?status=AKTIVNA`). */
export interface VarijantaZaIzbor { id: number; rb: number; naziv: string | null; svgId: string | null; nivo: number; renderStatus: string; }
