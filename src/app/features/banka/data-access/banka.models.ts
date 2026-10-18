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
 * Jedno polje šeme odgovora grupe. `odstupanje` i `odstupanjeTip` važe za BROJ, `zanemariVelicinu` i `zanemariRazmake` za
 * TEKST, `opcije` za JEDAN_TACAN i VISE_TACNIH (za ostale tipove `null`). Server normalizuje podrazumevane vrednosti.
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
/** Težina lista (zajednička svim varijantama grupe). */
export const TEZINE = [1, 2, 3, 4, 5] as const;

/** Jedan korak putanje grupe (od korena do same grupe). */
export interface GrupaPutanja {
  id: number;
  naziv: string;
}

/**
 * Čvor stabla (`GET banka/stablo`), deca po `rb`. Brojači: `brojVarijanti` sve (i arhivirane), `brojAktivnih`, `brojNacrta`,
 * `brojGresaka` = render GRESKA u bilo kom statusu; za unutrašnji čvor zbir celog podstabla.
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
}

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

/** Varijanta u listi grupe; `svgId` i `resenjeSvgId` poslednjeg uspelog rendera ostaju i posle neuspelog dok novi ne uspe. */
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
}

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
}

/**
 * `POST banka/grupe/{id}/varijante` i `PUT banka/varijante/{id}` (puna zamena). `odgovori` moraju pokriti svako polje šeme
 * grupe; `izvor` važi samo pri kreiranju (`null` = RUCNO).
 */
export interface VarijantaCmd {
  naziv: string | null;
  tekst: string;
  resenje: string | null;
  odgovori: Record<string, OdgovorPolja>;
  prilozi: PrilogCmd[];
  izvor?: IzvorVarijante | null;
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

/** Filteri `GET banka/pretraga`; `q` ima bar 2 znaka. */
export interface BankaFilter {
  predmetId: number;
  namena?: Namena | null;
  q?: string | null;
  status?: StatusVarijante | null;
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
