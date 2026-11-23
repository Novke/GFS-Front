/*
 * DTO-i brze ankete, nastavnička strana (spec brze ankete, sekcija 5; imena polja kao na serveru). Vremena su lokalna
 * (`LocalDateTime`, `yyyy-MM-ddTHH:mm:ss[.SSSSSS]`), `rokMs`/`sadaMs` epoch ms (odbrojavanje). Nijedan odgovor ne nosi ko je
 * za šta glasao: samo brojeve.
 */

/** Ko glasa: čekirani na predavanju (`NA_CASU`) ili cela grupa do roka (`GRUPA`). */
export type PublikaAnkete = 'NA_CASU' | 'GRUPA';

/** Boja pločice prečice (6, iz tokena teme; vidi `BOJE_PRECICA`). */
export type BojaPrecice = 'PLAVA' | 'ZELENA' | 'LJUBICASTA' | 'VISNJA' | 'TIRKIZNA' | 'OKER';

export type IzvorAnkete = 'NASTAVNIK' | 'CLAUDE';

export interface FolderAnkete {
  id: number;
  naziv: string;
  rb: number;
  brojSablona: number;
}

/** Sačuvano pitanje (šablon); prečica je šablon sa `precica = true`, poređana po `precicaRb`. */
export interface SablonAnkete {
  id: number;
  /** `null` = bez foldera. */
  folderId: number | null;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: PublikaAnkete;
  /** Samo `NA_CASU`: sama se zatvara posle ovoliko sekundi (`null` = dok je nastavnik ne zatvori). */
  trajanjeSekunde: number | null;
  /** Samo `GRUPA`: podrazumevani rok od pokretanja, u satima (1..336). */
  rokSati: number | null;
  precica: boolean;
  precicaRb: number | null;
  /** Jedan emoji. */
  ikonica: string | null;
  boja: BojaPrecice | null;
  kratakNaziv: string | null;
  /** Dodir prečice pokreće odmah, bez ekrana provere. */
  pokreniOdmah: boolean;
  rb: number;
  brojPokretanja: number;
  poslednjePokretanje: string | null;
}

/** `GET ankete/sabloni`: svi folderi i svi šabloni. */
export interface AnketeSabloniInfo {
  folderi: FolderAnkete[];
  sabloni: SablonAnkete[];
}

/** `POST ankete/sabloni` i `PUT ankete/sabloni/{id}` (cela zamena). */
export interface SablonAnketeCmd {
  folderId: number | null;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: PublikaAnkete;
  trajanjeSekunde: number | null;
  rokSati: number | null;
  precica: boolean;
  ikonica: string | null;
  boja: BojaPrecice | null;
  kratakNaziv: string | null;
  pokreniOdmah: boolean;
}

/** `POST ankete`: `NA_CASU` traži `predavanjeId`, `GRUPA` `grupaId` (ili iz predavanja) i `rok` (lokalno vreme). */
export interface PokreniAnketuCmd {
  sablonId: number | null;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: PublikaAnkete;
  predavanjeId: number | null;
  grupaId: number | null;
  trajanjeSekunde: number | null;
  rok: string | null;
}

/** Jedna anketa sa brojevima (nastavnik i projektor); `glasovi[i]` = broj glasova za `opcije[i]`. */
export interface AnketaDetails {
  id: number;
  sablonId: number | null;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: PublikaAnkete;
  predavanjeId: number | null;
  grupaId: number | null;
  grupaNaziv: string | null;
  predmetNaziv: string | null;
  otvoreno: string;
  rok: string | null;
  rokMs: number | null;
  /** Efektivno vreme zatvaranja (prvo od ručnog, roka i kraja predavanja); `null` dok je otvorena bez roka. */
  zatvoreno: string | null;
  otvorena: boolean;
  rezultatPrikazan: boolean;
  izvor: IzvorAnkete;
  glasovi: number[];
  /** Broj studenata koji su glasali (za više odgovora manji od zbira `glasovi`). */
  brojGlasalo: number;
  /** Broj studenata koji smeju da glasaju. */
  brojMogucih: number;
  sadaMs: number;
}

/** Red istorije (`GET ankete`, najnovije prvo). `pobednik` je `null` kod nerešenog ili bez glasova. */
export interface AnketaInfo {
  id: number;
  pitanje: string;
  publika: PublikaAnkete;
  otvoreno: string;
  zatvoreno: string | null;
  otvorena: boolean;
  brojGlasalo: number;
  brojMogucih: number;
  pobednik: string | null;
  predmetNaziv: string | null;
  grupaNaziv: string | null;
}

/**
 * Odakle je panel otvoren (konzola, daljinski, stranica predavanja). `predavanjeId` bez grupe ne daje publiku "na času"
 * (server traži grupu predavanja); bez predavanja i grupe ankete nema.
 */
export interface KontekstAnkete {
  predavanjeId: number | null;
  grupaId: number | null;
  grupaNaziv: string | null;
  predmetNaziv: string | null;
  /** Broj čekiranih na predavanju (`null` = nepoznato ili nema predavanja). */
  brojCekiranih: number | null;
}
