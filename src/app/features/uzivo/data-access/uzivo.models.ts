import type { Platno, Potez, Tema } from './platno.models';

export type { Tema } from './platno.models';
export type TipSlajda = 'INFO' | 'PITANJE' | 'PLATNO' | 'ZADATAK';
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
  | 'QR' | 'ZAVRSI'
  /** Zadatak slajd: prekidač rešenja (uključenje posle zatvaranja) i broj različitih varijanti za sledeće otvaranje (u CEKA). */
  | 'RESENJE' | 'BROJ_VARIJANTI';

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
  /** Samo ZADATAK (inače `null`; stari odgovori i fixture-i bez polja). */
  zadatak?: ZadatakSlajdaInfo | null;
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
export interface SlajdCmd {
  tip: TipSlajda; naslov: string | null; sadrzaj: string | null; slikaId: string | null; beleske: string | null; postepeno: boolean;
  pitanje: PitanjeCmd | null; platno: Platno | null; prelaz: Prelaz | null;
  /** Obavezan za ZADATAK, `null` za ostale tipove. */
  zadatak?: ZadatakSlajda | null;
}
/** Uvoz više slajdova odjednom (PowerPoint): `posle` = id slajda posle kog se ubacuju, `null` = na kraj. */
export interface UvozSlajdovaCmd { posle: number | null; slajdovi: SlajdCmd[]; }
export interface PredavanjeZaPokretanje { id: number; rb: number; datum: string; tema: string | null; zavrseno: boolean | null; grupa: GrupaKratko | null; }
/** `boduje` (samo uz predavanje): run upisuje prisustvo i rešene zadatke; traži prijavu studenata (409 dok je nema). */
export interface PokreniCmd { cuvanje: boolean; grupaId: number | null; predavanjeId: number | null; boduje?: boolean; }
export interface PredavanjeKratko { id: number; rb: number; datum: string; tema: string | null; }
export interface IzvodjenjeInfo {
  id: number; prezentacija: { id: number; naziv: string; predmetId: number }; kod: string; status: StatusIzvodjenja;
  cuvanje: boolean; grupa: GrupaKratko | null; predavanje: PredavanjeKratko | null; pocetak: string; kraj: string | null;
  brojUcesnika: number; brojPitanja: number;
  /** Bodovan run (upisuje prisustvo i rešene zadatke). */
  boduje?: boolean;
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
/** `varijantaId` i `tacno` važe za trenutnu Zadatak rundu (dodeljena varijanta i ishod), inače `null`. */
export interface UcesnikStanje {
  id: number; ime: string; poeni: number; povezan: boolean; odgovorio: boolean; varijantaId?: number | null; tacno?: boolean | null;
}
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
  /** Zadatak slajd (`null` van njega). */
  zadatak?: NastavnickiZadatak | null;
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
  rangLista: RangStavka[] | null; zadatak?: JavniZadatak | null;
}
export interface LicniOdgovor { rundaId: number; primljen: boolean; tacno: boolean | null; poeni: number | null; }
export interface LicnoStanje {
  verzija: number; ucesnikId: number; ime: string; poeni: number; mesto: number | null; brojUcesnika: number;
  izbacen: boolean; odgovor: LicniOdgovor | null; zadatak?: LicniZadatak | null;
}
export interface PocetnoStanje { javno: JavnoStanje; licno: LicnoStanje; }
export interface UcesnikInfo { ucesnikId: number; ime: string; izvodjenjeId: number; }
/** `prijavaObavezna` (bodovan run): bez prijavljenog studenta telefon ide na `nalog?nazad=uzivo/<kod>`. */
/** `godinaUpisa`: godina upisa grupe predavanja izvođenja (predlog godine na `/nalog`), `null` bez predavanja ili grupe. */
export interface JavnoIzvodjenjeInfo {
  naziv: string; prijavaObavezna?: boolean; prijavljenStudent?: boolean; godinaUpisa?: number | null;
}
/**
 * Odgovor sa telefona. Za zadatak `polja`: BROJ i TEKST string, JEDAN_TACAN lista sa jednim id-jem opcije, VISE_TACNIH lista
 * id-jeva; `varijantaId` se ne šalje (server uzima dodelu).
 */
export interface OdgovorCmd {
  rundaId: number; opcije?: number[]; broj?: string; tekst?: string; skala?: number; polja?: Record<string, string | number[]>;
}
export interface PitanjeSnimak {
  pitanjeId: number; slajdId: number | null; tip: TipPitanja; tekst: string; slikaId: string | null; vremeSekunde: number | null;
  opcije: { id: number; rb: number; tekst: string; tacna: boolean }[]; brojTacno: number | null; brojOdstupanje: number | null;
  odstupanjeTip: OdstupanjeTip | null; jedinica: string | null; tekstPrikaz: TekstPrikaz | null;
  prihvatljiviOdgovori: string[] | null; skalaMinOznaka: string | null; skalaMaxOznaka: string | null;
}
/** Runda u pregledu; za Zadatak rundu `pitanje` i `rezultat` su `null`, a sve je u `zadatak`. */
export interface RezultatPitanja {
  rundaId: number; slajdId: number | null; rbSlajda: number | null; redniBroj: number; pitanje: PitanjeSnimak | null;
  rezultat: Rezultat | null; brojOdgovora: number; procenatTacnih: number | null; zadatak?: PregledZadatka | null;
}
/** `takmicenje`: podešavanje izvođenja zapamćeno pri pokretanju (pregled po tome prikazuje poene i rang-listu). */
export interface IzvodjenjeRezultati {
  izvodjenje: IzvodjenjeInfo; takmicenje: boolean; pitanja: RezultatPitanja[]; rangLista: RangStavka[];
}

// ------------------------------------------------------------------ Zadatak slajd (banka zadataka na času)
/*
 * Tipovi banke (`dto/banka`) koje Zadatak slajd nosi, ogledani ovde jer `features/uzivo` ne sme da uvozi banka `data-access`
 * (`gfs/granice-featurea`); ključevi isti kao na serveru.
 */
/** Jedan korak putanje grupe (od korena do same grupe). */
export interface GrupaPutanja { id: number; naziv: string; }
export type TipPoljaZadatka = 'BROJ' | 'TEKST' | 'JEDAN_TACAN' | 'VISE_TACNIH';
/**
 * Polje šeme odgovora grupe: `odstupanje`/`odstupanjeTip` za BROJ, `zanemariVelicinu`/`zanemariRazmake` za TEKST, `opcije` za
 * JEDAN_TACAN i VISE_TACNIH (tekst opcije sme da ima `$formule$`). Šema bez polja = rad na papiru.
 */
export interface PoljeZadatka {
  kljuc: string; oznaka: string; tip: TipPoljaZadatka; odstupanje: number | null; odstupanjeTip: OdstupanjeTip | null;
  jedinica: string | null; zanemariVelicinu: boolean | null; zanemariRazmake: boolean | null; opcije: { id: number; tekst: string }[] | null;
}
/** Tačan odgovor jednog polja: postavljeno je samo svojstvo tipa polja (BROJ `broj`, TEKST `prihvatljivi`, JEDAN `tacna`, VISE `tacne`). */
export interface OdgovorPolja { broj: number | null; prihvatljivi: string[] | null; tacna: number | null; tacne: number[] | null; }
/** Zadatak na slajdu (komanda): `vremeSekunde` 5-600 ili `null` (bez tajmera), `brojVarijanti` 1-50 ili `null` (sve aktivne). */
export interface ZadatakSlajda { grupaId: number | null; vremeSekunde: number | null; brojVarijanti: number | null; }
/**
 * Zadatak na slajdu sa opisom sa servera. `grupaId` je `null` kad je grupa obrisana; `brojAktivnihVarijanti` = kandidati (AKTIVNE
 * sa SVG-om u listovima koji se izvlače); `polja` je šema lista (`null` za unutrašnji čvor); `upozorenja` su tekstovi servera, redom.
 */
export interface ZadatakSlajdaInfo {
  grupaId: number | null; vremeSekunde: number | null; brojVarijanti: number | null; grupaNaziv: string | null;
  putanja: GrupaPutanja[]; list: boolean; brojAktivnihVarijanti: number; polja: PoljeZadatka[] | null; iskljucena: boolean;
  iskljucenePodgrupe: GrupaPutanja[]; upozorenja: string[];
}
/** Izvučena varijanta trenutne runde (konzola): slika zadatka i rešenja i brojevi dodela, odgovora i tačnih. */
export interface VarijantaRunde {
  varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; dodeljeno: number; odgovorilo: number;
  tacnih: number;
}
/**
 * Rezultat jednog polja varijante: `vrednosti` (BROJ, TEKST; grupisane, najviše 10) ili `opcije` (JEDAN_TACAN, VISE_TACNIH).
 * U javnom rezultatu `vrednosti` su `null` dok rezultati nisu prikazani, a `tacno` (i `tacan`/`tacna` unutra) dok `TACAN` nije vidljiv.
 */
export interface RezultatPolja {
  kljuc: string; oznaka: string; tip: TipPoljaZadatka; jedinica: string | null; vrednosti: RezultatTekst[] | null;
  opcije: RezultatOpcija[] | null; tacno: OdgovorPolja | null;
}
/** Rezultat varijante; `tacnih` je `null` dok `TACAN` nije vidljiv, `resenjeSvgId` dok `RESENJE` nije uključen (javni rezultat). */
export interface RezultatVarijante {
  varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; dodeljeno: number; odgovorilo: number;
  tacnih: number | null; polja: RezultatPolja[];
}
/** Rezultat Zadatak runde po varijanti; `odgovoriPrikazani` false = bez brojeva i traka (brojevi su 0, vrednosti `null`). */
export interface ZadatakRezultat { ukupno: number; varijante: RezultatVarijante[]; odgovoriPrikazani: boolean; }
/**
 * Zadatak u nastavničkom snimku (`null` van Zadatak slajda). `izmenaBrojaVarijanti`: izbor iz konzole za ovu rundu (`null` = kao na
 * slajdu, `0` = sve); `brojZaOtvaranje` = koliko će se izvući; `varijante` `null` dok runde nema; `rezultat` je konzolin (sve vidljivo),
 * `javniRezultat` projektorov (po pravilima vidljivosti, `null` dok nijedan od rezultata, `TACAN` i `RESENJE` nije uključen).
 */
export interface NastavnickiZadatak {
  slajd: ZadatakSlajdaInfo; izmenaBrojaVarijanti: number | null; brojZaOtvaranje: number; resenjePrikazano: boolean;
  varijante: VarijantaRunde[] | null; rezultat: ZadatakRezultat | null; javniRezultat: ZadatakRezultat | null;
}
/** Zadatak u javnom snimku: samo faza, rok i brojevi, bez sadržaja; `brojVarijanti` u CEKA koliko će se izvući, posle koliko jeste. */
export interface JavniZadatak {
  faza: Faza; rundaId: number | null; rokMs: number | null; preostaloMs: number | null; brojVarijanti: number;
  grupaNaziv: string | null; resenjePrikazano: boolean;
}
/**
 * Svoja varijanta na telefonu (`null` u CEKA i bez dodele; nikad podaci druge varijante). `ishod` i `tacno` posle zatvaranja kad je
 * odgovorio; `tacneVrednosti` samo uz vidljiv `TACAN`, `resenjeSvgId` samo uz `RESENJE`.
 */
export interface LicniZadatak {
  rundaId: number; varijantaId: number; svgId: string; polja: PoljeZadatka[]; faza: Faza; primljen: boolean;
  ishod: Record<string, boolean> | null; tacno: boolean | null; tacneVrednosti: Record<string, OdgovorPolja> | null;
  resenjeSvgId: string | null;
}
/** Učesnik Zadatak runde u pregledu izvođenja: dodeljena varijanta i ishod po polju i ukupno. */
export interface UcesnikZadatka {
  ucesnikId: number; ime: string; varijantaId: number | null; varijantaNaziv: string | null; odgovorio: boolean;
  tacno: boolean | null; polja: Record<string, boolean> | null;
}
/** Zadatak runda u pregledu (sve vidljivo); `slajdId` iz snimka ostaje i kad slajda više nema (`RezultatPitanja.slajdId` je tada `null`). */
export interface PregledZadatka {
  slajdId: number; grupaNaziv: string; putanja: GrupaPutanja[]; rezultat: ZadatakRezultat; ucesnici: UcesnikZadatka[];
}

export const medijUrl = (id: string) => `api/public/mediji/${encodeURIComponent(id)}`;
