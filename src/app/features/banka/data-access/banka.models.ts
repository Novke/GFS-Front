import { API_URL } from '../../../core/api/api-url';

/*
 * Zrcala DTO-a banke zadataka (`dto/banka/*` u GFSSystem, ključevi isti kao na serveru). `LocalDateTime` stiže kao ISO
 * string bez zone. Polja koja server ume da izostavi iz komande su `| null` i uvek se šalju, jer su `PUT` komande puna
 * zamena (izostavljeno je prazno); izuzetak su `polja` grupe, gde `null` znači "šema ostaje".
 */

export type Namena = 'PREDAVANJE' | 'TEST';
export type TipPolja = 'BROJ' | 'TEKST' | 'JEDAN_TACAN' | 'VISE_TACNIH';
/** Kako se meri odstupanje polja tipa BROJ (`entity/uzivo/OdstupanjeTip`). */
export type OdstupanjeTip = 'APSOLUTNO' | 'PROCENAT';
export type StatusVarijante = 'NACRT' | 'AKTIVNA' | 'ARHIVIRANA';
export type RenderStatus = 'CEKA' | 'OK' | 'GRESKA';
/** Ko je napravio grupu, varijantu ili isključenu temu: Novica u UI-ju (`RUCNO`) ili Klod kroz MCP (`CLAUDE`). */
export type IzvorVarijante = 'RUCNO' | 'CLAUDE';
/** Deo varijante u kome je LaTeX greška; `linija` je relativna na taj deo. */
export type RenderDeo = 'tekst' | 'resenje';

/** Otpremljen medij (`POST banka/prilozi`); SVG rendera i slike se služe sa `api/public/mediji/{id}`. */
export interface MedijInfo {
  id: string;
  naziv: string;
  mime: string;
  velicina: number;
}

/** `api/public/mediji/<id>`, relativno na `<base href>` (SVG rendera varijante, `VarijantaInfo.svgId`). */
export function svgUrl(id: string): string {
  return `${API_URL}/public/mediji/${id}`;
}

// ------------------------------------------------------------------------------------------------ šema polja

/** Ponuđeni odgovor polja; `id` je stabilan u grupi (tačan odgovor varijante ga pominje), tekst sme da ima `$formule$`. */
export interface PoljeOpcija {
  id: number;
  tekst: string;
}

/**
 * Jedno polje šeme odgovora grupe. `odstupanje` i `odstupanjeTip` važe za BROJ, `zanemariVelicinu`, `zanemariRazmake` i
 * `zanemariVodeceNule` za TEKST, `opcije` za JEDAN_TACAN i VISE_TACNIH (za ostale tipove `null`). Server normalizuje
 * podrazumevane vrednosti.
 */
export interface Polje {
  kljuc: string;
  oznaka: string;
  tip: TipPolja;
  odstupanje: number | null;
  odstupanjeTip: OdstupanjeTip | null;
  jedinica: string | null;
  zanemariVelicinu: boolean | null;
  zanemariRazmake: boolean | null;
  opcije: PoljeOpcija[] | null;
  /**
   * TEKST: `01111111` je isto što i `1111111` (`true`); `null`/izostavljeno = isključeno (server tako čuva i `false`). Samo gde
   * nula ispred ne menja rezultat, nikad za komplement ili zapis fiksne širine.
   */
  zanemariVodeceNule?: boolean | null;
}

/** Tačan odgovor varijante za jedno polje: postavljeno je tačno ono svojstvo koje tip polja traži, ostala su `null`. */
export interface OdgovorPolja {
  /** BROJ. */
  broj: number | null;
  /** TEKST. */
  prihvatljivi: string[] | null;
  /** JEDAN_TACAN: id opcije. */
  tacna: number | null;
  /** VISE_TACNIH: ids opcija. */
  tacne: number[] | null;
}

// ------------------------------------------------------------------------------------------------ grupe

/** Granice grupe kao na serveru (`BankaPP.MAX_NAZIV_GRUPE`, `GrupaZadatakaService.MAX_OPIS`, `BankaPP.MAX_UPUTSTVO`). */
export const MAX_NAZIV_GRUPE = 120;
export const MAX_OPIS_GRUPE = 5000;
export const MAX_UPUTSTVO_GRUPE = 5000;
/** Težina tipa: ocena lista (zajednička svim varijantama grupe). Nije nivo varijante ({@link NIVOI}). */
export const TEZINE = [1, 2, 3, 4, 5] as const;
export { NIVOI } from '../../../shared/ui/nivo.component';
/** Nivo koji nova varijanta dobija bez izbora (server isto tako). */
export const PODRAZUMEVANI_NIVO = 2;

/** Jedan korak putanje grupe (od korena do same grupe). */
export interface GrupaPutanja {
  id: number;
  naziv: string;
}

/**
 * Čvor stabla (`GET banka/stablo`), deca po `rb`. Brojači: `brojVarijanti` sve (i arhivirane), `brojAktivnih`, `brojNacrta`,
 * `brojGresaka` = render GRESKA u bilo kom statusu, `brojClaudeNacrta` = Klodovi nacrti; za unutrašnji čvor zbir celog podstabla.
 * `iskljucena`: grupa ili neki predak ima isključenu temu (Klod ih ne nudi); `iskljucenjeId` je id teme najbližeg takvog čvora
 * (sopstvena pre pretka), `null` kad nije isključena.
 */
export interface GrupaCvor {
  id: number;
  naziv: string;
  rb: number;
  tezina: number | null;
  /** Nema podgrupa (i kad nema varijanti): samo list prima varijante. */
  list: boolean;
  brojVarijanti: number;
  brojAktivnih: number;
  brojNacrta: number;
  brojGresaka: number;
  deca: GrupaCvor[];
  izvor: IzvorVarijante;
  brojClaudeNacrta: number;
  iskljucena: boolean;
  iskljucenjeId: number | null;
}

/** Detalj grupe; `serija` je Klodova serija koja ju je napravila (`null` za ručnu), `iskljucena` kao u {@link GrupaCvor}. */
export interface GrupaDetails {
  id: number;
  predmetId: number;
  roditeljId: number | null;
  namena: Namena;
  naziv: string;
  opis: string | null;
  rb: number;
  tezina: number | null;
  uputstvo: string | null;
  polja: Polje[];
  putanja: GrupaPutanja[];
  list: boolean;
  brojVarijanti: number;
  brojAktivnih: number;
  brojNacrta: number;
  brojGresaka: number;
  izmenjeno: string;
  izvor: IzvorVarijante;
  serija: string | null;
  iskljucena: boolean;
  iskljucenjeId: number | null;
}

/**
 * `POST banka/grupe` (nova) i `PUT banka/grupe/{id}` (puna zamena naziva, opisa, težine i uputstva). `predmetId` i `namena`
 * samo za koren, `roditeljId` za podgrupu (podgrupa nasleđuje predmet i namenu); izmena ih ne šalje. `polja`: kod nove
 * grupe `null` = bez polja; kod izmene `null` = šema i odgovori varijanti ostaju, `[]` briše šemu.
 */
export interface GrupaCmd {
  predmetId?: number | null;
  roditeljId?: number | null;
  namena?: Namena | null;
  naziv: string;
  opis: string | null;
  tezina: number | null;
  uputstvo: string | null;
  polja: Polje[] | null;
}

/** `POST banka/grupe/{id}/premesti`: novi roditelj (`null` = koren) i mesto među braćom (`rb` od 1, `null` = na kraj). */
export interface PremestiCmd {
  roditeljId: number | null;
  rb: number | null;
}

// ------------------------------------------------------------------------------------------------ varijante

export interface RenderGreskaInfo {
  /** Relativna na tekst nastavnika (od 1) ili `null` kad se ne zna. */
  linija: number | null;
  poruka: string;
}

/** Prilog varijante: ime kojim ga LaTeX zove i medij. PDF prilog se javno ne servira, vidi se samo kroz renderovani SVG. */
export interface PrilogInfo {
  ime: string;
  medij: MedijInfo;
}

/** Prilog u komandi: ime (`^[a-z0-9_-]{1,60}$`, ne `dokument`) i id medija iz `POST banka/prilozi`. */
export interface PrilogCmd {
  ime: string;
  medijId: string;
}

/**
 * Varijanta u listi grupe; `svgId` i `resenjeSvgId` poslednjeg uspelog rendera ostaju i posle neuspelog dok novi ne uspe.
 * `ikadOdobrena`: bila je aktivna bar jednom (ostaje i posle vraćanja u nacrt); `zamenjuje`: id varijante koju ova kopija
 * menja (Klod ne menja odobrenu varijantu na mestu, nego pravi kopiju; odobravanje kopije arhivira original); `serija`: Klodova
 * serija koja ju je napravila ili izmenila, `null` za ručnu.
 */
export interface VarijantaInfo {
  id: number;
  grupaId: number;
  rb: number;
  naziv: string | null;
  status: StatusVarijante;
  izvor: IzvorVarijante;
  renderStatus: RenderStatus;
  svgId: string | null;
  resenjeSvgId: string | null;
  izmenjeno: string;
  ikadOdobrena: boolean;
  zamenjuje: number | null;
  serija: string | null;
  /** Nivo varijante, 1-3 ({@link NIVOI}). */
  nivo: number;
}

/** Puna varijanta; `ikadOdobrena`, `zamenjuje` i `serija` kao u {@link VarijantaInfo}. */
export interface VarijantaDetails {
  id: number;
  grupaId: number;
  putanja: GrupaPutanja[];
  rb: number;
  naziv: string | null;
  tekst: string;
  resenje: string | null;
  odgovori: Record<string, OdgovorPolja>;
  /** Šema polja grupe. */
  polja: Polje[];
  prilozi: PrilogInfo[];
  status: StatusVarijante;
  izvor: IzvorVarijante;
  renderStatus: RenderStatus;
  svgId: string | null;
  resenjeSvgId: string | null;
  renderGreska: RenderGreskaInfo | null;
  renderDeo: RenderDeo | null;
  kreirano: string;
  izmenjeno: string;
  ikadOdobrena: boolean;
  zamenjuje: number | null;
  serija: string | null;
  /** Nivo varijante, 1-3 ({@link NIVOI}); menja se samo kroz `PATCH banka/varijante/{id}/nivo`. */
  nivo: number;
}

/**
 * `POST banka/grupe/{id}/varijante` i `PUT banka/varijante/{id}` (puna zamena). `odgovori` moraju pokriti svako polje šeme
 * grupe; `izvor` i `nivo` važe samo pri kreiranju (`izvor` `null` = RUCNO, `nivo` izostavljen = 2); `PUT` ih ignoriše, pa
 * editor postojeće varijante `nivo` ne šalje (nivo se menja kroz `PATCH`, {@link NivoCmd}).
 */
export interface VarijantaCmd {
  naziv: string | null;
  tekst: string;
  resenje: string | null;
  odgovori: Record<string, OdgovorPolja>;
  prilozi: PrilogCmd[];
  izvor?: IzvorVarijante | null;
  nivo?: number | null;
}

/** `PATCH banka/varijante/{id}/nivo`: ključ je obavezan, nivo 1-3; ne renderuje i ne menja status. */
export interface NivoCmd {
  nivo: number;
}

// ------------------------------------------------------------------------------------------------ render

/** `POST banka/render-proba`: render bez čuvanja, sa preambulom predmeta; rešenje i prilozi su opcioni. */
export interface RenderProbaCmd {
  predmetId: number;
  tekst: string;
  resenje?: string | null;
  prilozi?: PrilogCmd[] | null;
}

/**
 * Ishod render-probe: SVG zadatka i rešenja kao tekst kad je `ok`, inače greška i deo u kome je; kad je pao samo deo
 * `resenje`, `svg` je ipak SVG zadatka (`resenjeSvg` je `null`).
 */
export interface RenderProbaInfo {
  ok: boolean;
  svg: string | null;
  resenjeSvg: string | null;
  greska: RenderGreskaInfo | null;
  deo: RenderDeo | null;
}

/**
 * `POST banka/predmeti/{id}/renderuj-sve`: `renderovano` uspelih i `neuspelo` neuspelih rendera u ovom pozivu (neuspela
 * varijanta zadržava status i SVG poslednjeg uspelog rendera, dobija samo `renderStatus: GRESKA` i grešku); `preostalo`
 * varijanti sa zastarelim renderom čeka sledeći poziv (zvati dok nije 0).
 */
export interface RenderujSveInfo {
  renderovano: number;
  neuspelo: number;
  preostalo: number;
}

// ------------------------------------------------------------------------------------------------ preambula i pretraga

/** `GET|PUT predmeti/{id}/latex-preambula`: `preambula` je `null` dok predmet koristi podrazumevanu. */
export interface PreambulaInfo {
  preambula: string | null;
  podrazumevana: boolean;
  podrazumevanaPreambula: string;
}

export interface PreambulaCmd {
  preambula: string | null;
}

/**
 * Filteri `GET banka/pretraga`; `q` ima bar 2 znaka, `serija` 3-60 malih slova, cifara ili crtica (inače 400). Svaki je opcion
 * na serveru (`BankaFilter`): `predmetId: null` traži kroz sve predmete, nepoznat predmet daje praznu stranu (ne 404).
 */
export interface BankaFilter {
  predmetId: number | null;
  namena?: Namena | null;
  q?: string | null;
  status?: StatusVarijante | null;
  izvor?: IzvorVarijante | null;
  serija?: string | null;
  /** 1-3 ili izostavljeno = svi nivoi. */
  nivo?: number | null;
}

export interface BankaPretragaStavka {
  varijantaId: number;
  grupaId: number;
  grupaNaziv: string;
  putanja: GrupaPutanja[];
  naziv: string | null;
  status: StatusVarijante;
  renderStatus: RenderStatus;
  /** Prvih 160 znakova teksta. */
  isecak: string;
  izvor: IzvorVarijante;
  serija: string | null;
  nivo: number;
}

// ------------------------------------------------------------------------------------------------ serije Kloda

/**
 * `GET banka/serije?predmetId=`: jedna serija (oznaka jednog Klodovog posla, npr. `uvoz-kol1-2024`) predmeta sa brojevima,
 * najnovije prve. `nacrta` = Klodovi nacrti, `odobrenih` = varijante serije koje su bar jednom odobrene, `grupa`, `prezentacija`
 * i `slajdova` napravljenih u seriji; `poslednja` je vreme poslednjeg upisa serije.
 */
export interface SerijaInfo {
  serija: string;
  nacrta: number;
  odobrenih: number;
  grupa: number;
  prezentacija: number;
  slajdova: number;
  poslednja: string;
}

/** Vrsta stavke poništavanja serije (A2 dodaje `IZMENA_SLAJDA`). */
export type VrstaPonistavanja = 'VARIJANTA' | 'GRUPA' | 'SLAJD' | 'PREZENTACIJA';

/** Jedna obrisana (ili preskočena) stavka; `razlog` ima samo preskočena (npr. "Grupa nije prazna."). */
export interface StavkaPonistavanja {
  vrsta: VrstaPonistavanja;
  id: number;
  naziv: string | null;
  razlog: string | null;
}

/**
 * `POST banka/serije/{serija}/odbaci`: obrisani neodobreni Klodovi nacrti i prazne Klodove grupe serije, i šta je preskočeno
 * (odobreno, ručno, neprazno). `potvrdjeno: false` (samo MCP proba) znači da je `obrisano` spisak onoga što bi se obrisalo.
 */
export interface PonistavanjeInfo {
  potvrdjeno: boolean;
  obrisano: StavkaPonistavanja[];
  preskoceno: StavkaPonistavanja[];
}

// ------------------------------------------------------------------------------------------------ isključene teme

/** `POST predmeti/{id}/iskljucene-teme`: tema nad grupom (isključuje i celo podstablo) ili samo opis (`grupaId: null`). */
export interface IskljucenaTemaCmd {
  opis: string;
  grupaId: number | null;
}

/**
 * Isključena tema predmeta (`GET predmeti/{id}/iskljucene-teme`, najnovije prve): Klod je ne nudi. `putanja` je putanja grupe
 * (prazna kad tema nema grupu ili je grupa obrisana, pa je `grupaId` postao `null`).
 */
export interface IskljucenaTemaInfo {
  id: number;
  predmetId: number;
  opis: string;
  grupaId: number | null;
  putanja: GrupaPutanja[];
  izvor: IzvorVarijante;
  serija: string | null;
  kreirano: string;
}

// ------------------------------------------------------------------------------------------------ stablo

/** Čvor stabla sa tim id-jem (u celom podstablu) ili `null`. */
export function nadjiCvor(stablo: readonly GrupaCvor[], id: number | null): GrupaCvor | null {
  if (id === null) {
    return null;
  }
  for (const c of stablo) {
    const nadjen = c.id === id ? c : nadjiCvor(c.deca, id);
    if (nadjen) {
      return nadjen;
    }
  }
  return null;
}

/** Putanja od korena do čvora `id` (uključujući njega); prazna kad čvora nema. */
export function putanjaDo(stablo: readonly GrupaCvor[], id: number | null): GrupaPutanja[] {
  if (id === null) {
    return [];
  }
  for (const c of stablo) {
    if (c.id === id) {
      return [{ id: c.id, naziv: c.naziv }];
    }
    const dublje = putanjaDo(c.deca, id);
    if (dublje.length > 0) {
      return [{ id: c.id, naziv: c.naziv }, ...dublje];
    }
  }
  return [];
}

/** Prvi list stabla u redosledu prikaza (dubina prvo, po `rb`) ili `null` za prazno stablo. */
export function prviList(stablo: readonly GrupaCvor[]): GrupaCvor | null {
  for (const c of stablo) {
    const list = c.list ? c : prviList(c.deca);
    if (list) {
      return list;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- zadaci za vežbanje

/**
 * Stanje čvora banke za vežbanje u jednoj grupi studenata (`GET banka/grupe/{id}/otvoreno`, samo nastavnik). `OTVORENO`:
 * zapis na samom čvoru (`izvor` CAS = kraj izvođenja, RUCNO = Novica, `prviPut`); `PREKO_TEME`: otvoren predak `tema` (zatvara se
 * na toj temi); `DELIMICNO`: otvoren deo listova ispod čvora; `ZATVORENO`. `otvorenihListova` od `listova`: tipovi ispod čvora koje
 * grupa sme da vežba.
 */
export type StanjeOtvorenosti = 'OTVORENO' | 'PREKO_TEME' | 'DELIMICNO' | 'ZATVORENO';
export type IzvorOtvaranja = 'CAS' | 'RUCNO';

export interface OtvorenoZaGrupu {
  grupaId: number;
  naziv: string;
  godinaUpisa: number | null;
  stanje: StanjeOtvorenosti;
  izvor: IzvorOtvaranja | null;
  prviPut: string | null;
  tema: string | null;
  otvorenihListova: number;
  listova: number;
}

/** Statistika vežbanja jednog tipa (`GET predmeti/{id}/vezbanje/statistika`, samo zbirno, nikad po studentu). */
export interface StatistikaTipa {
  tipId: number;
  naziv: string;
  putanja: string[];
  studenata: number;
  pokusaja: number;
  provereno: number;
  prvaTacno: number;
  resenjeBezTacne: number;
}

/** Filteri statistike: grupa studenata i opseg dana (ISO `YYYY-MM-DD`, uključivo). */
export interface StatistikaFilter {
  grupa?: number | null;
  od?: string | null;
  do?: string | null;
}
