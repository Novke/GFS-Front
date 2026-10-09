import { GrupaInfo, PredmetInfo, TipTestaInfo } from './reference.api';

/** `1 ispitanik`, `2 ispitanika`, `5 ispitanika`, `21 ispitanik`, `11 ispitanika`. */
export function brojIspitanika(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'ispitanik' : 'ispitanika'}`;
}

/** `1 polaganje`, `2 polaganja`, `5 polaganja`, `21 polaganje`. */
export function brojPolaganja(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'polaganje' : 'polaganja'}`;
}

/** Varijanta (grupa) testa; ogleda backend enum `TestGrupa`. Test sa `brojGrupa = n` ima prvih `n`. */
export type TestGrupa = 'A' | 'B' | 'C' | 'D';
export const VARIJANTE: readonly TestGrupa[] = ['A', 'B', 'C', 'D'];

/**
 * Red liste testova; ogleda backend `dto/test/TestListItem`. `prosek` je `null` kad nijedno polaganje nema upisane poene;
 * `procenatProlaznosti` (0-100, računa server po pragu, lista nema polaganja) je `null` i kad test nema prag prolaza.
 * Na detalju i u statistici prolaz računa front (`jePolozio` u `test.store.ts`, isto pravilo).
 */
export interface TestListItem {
  id: number;
  datum: string | null;
  tipTesta: TipTestaInfo | null;
  maxPoena: number | null;
  /** Prag prolaza u poenima; `null` = test nema prolaznost. */
  pragProlaza: number | null;
  pregledan: boolean | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  brojPolaganja: number;
  prosek: number | null;
  procenatProlaznosti: number | null;
}

/** Status liste: `za-evidentiranje` -> `pregledan=false`, `evidentiran` -> `pregledan=true`, `null` = svi. */
export type StatusTesta = 'za-evidentiranje' | 'evidentiran';

/** Filteri liste testova; ime filtera je ime query parametra u URL-u. `tip` je id tipa testa; `od` i `do` su `YYYY-MM-DD`. */
export interface TestoviFilteri extends Record<string, string | number | boolean | null> {
  predmet: number | null;
  grupa: number | null;
  godina: number | null;
  status: StatusTesta | null;
  tip: number | null;
  od: string | null;
  do: string | null;
}

/** Polja sorta koja backend prihvata za `test/pretraga` (`TestService.SORT_POLJA`). */
export const TESTOVI_SORT_POLJA = ['datum', 'maxPoena'];

/**
 * Student u polaganju; ogleda backend `dto/student/StudentInfo`. `godina` je tamo primitivni `int`, pa student bez
 * godine upisa stiže kao `0` (prikazuje se bez godine).
 */
export interface TestStudentInfo {
  id: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  godina: number | null;
  email?: string | null;
  brojTelefona?: string | null;
}

/**
 * Ogleda `TestPolaganjeInfo`. Tek dodat ispitanik nema ni varijantu ni poene (`null`). Sačuvano `polozio` se nigde ne
 * koristi (ni kao oznaka po studentu): prolaz se uvek izvodi iz `pragProlaza` testa (`jePolozio`).
 */
export interface TestPolaganjeInfo {
  id: number;
  student: TestStudentInfo;
  grupa: TestGrupa | null;
  ostvareniPoeni: number | null;
  prepisivao: boolean | null;
  polozio: boolean | null;
  napomene: string | null;
}

/** Ogleda `TestStatistikaPoGrupiInfo`; `procenatProlaznosti` je `null` kad test nema prag prolaza. */
export interface TestStatistikaPoGrupiInfo {
  grupa: TestGrupa;
  brojPolaganja: number | null;
  prosecniPoeni: number | null;
  procenatProlaznosti: number | null;
}

/**
 * Ogleda `TestStatistikaInfo` (računa se samo u `GET test/{id}`). Sva polja se tretiraju kao opciona: prolaznost
 * (`brojPolozenih`, `brojPalih`, `procenatProlaznosti`) je `null` bez praga prolaza ili bez polaganja sa poenima. Front iz
 * nje prikazuje broj, prosek, min, max i standardnu devijaciju; prolaz (ukupno i po varijantama) računa sam (`jePolozio`,
 * isto pravilo kao server).
 */
export interface TestStatistikaInfo {
  ukupnoPolaganja: number | null;
  prosecniPoeni: number | null;
  minPoeni: number | null;
  maxPoeni: number | null;
  standardnaDevijacija: number | null;
  brojPolozenih: number | null;
  brojPalih: number | null;
  procenatProlaznosti: number | null;
  statistikaPoGrupi: TestStatistikaPoGrupiInfo[] | null;
}

/** Ogleda `TestDetails`. `statistika` šalje samo `GET test/{id}`; izmene (`PUT`, `PATCH`, `POST`) je vraćaju kao `null`. */
export interface TestDetails {
  id: number;
  tipTesta: TipTestaInfo | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  datum: string | null;
  maxPoena: number | null;
  /** Prag prolaza u poenima; `null` = test nema prolaznost. Menja se samo kroz `PATCH test/{id}/prag-prolaza`. */
  pragProlaza: number | null;
  pregledan: boolean | null;
  grupe: TestGrupa[] | null;
  polaganja: TestPolaganjeInfo[] | null;
  statistika: TestStatistikaInfo | null;
}

/** Ogleda `TestInfo` (odgovor `POST test`). */
export interface TestInfo {
  id: number;
  tipTesta: TipTestaInfo | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  datum: string | null;
  maxPoena: number | null;
  pragProlaza: number | null;
  grupe: TestGrupa[] | null;
  pregledan: boolean | null;
  posecenost: number | null;
}

/**
 * `POST test`. Tip je postojeći (`tipTestaId`); nov tip se prvo pravi kroz `POST test/tip` (server za
 * `tipTestaId = null` ne stiže do `novTipTesta`). `brojGrupa` 1-4 daje varijante A..D, `maxPoena` 1-100, opcioni
 * `pragProlaza` 0-maxPoena (u poenima; `null` = bez praga).
 */
export interface CreateTestCmd {
  tipTestaId: number;
  predmetId: number;
  grupaId: number;
  datum: string;
  brojGrupa: number;
  maxPoena: number;
  pragProlaza?: number | null;
}

/** `PATCH test/{id}/prag-prolaza`: postavlja (0-maxPoena) ili briše (`null`) prag; dozvoljeno i na evidentiranom testu. */
export interface PragProlazaCmd {
  pragProlaza: number | null;
}

/** `PUT test/{id}` (zaglavlje): sva tri polja su obavezna; prag prolaza se ovde ne šalje (`PragProlazaCmd`). */
export interface UpdateTestCmd {
  datum: string;
  maxPoena: number;
  tipTestaId: number;
}

/** `PATCH test/{id}/polaganje`: student mora već biti dodat (`POST test/{id}/polaganje`). */
export interface EvidentirajPolaganjeCmd {
  studentId: number;
  grupa: TestGrupa;
  ostvareniPoeni: number;
  prepisivao: boolean;
  napomene: string | null;
}

/** `POST test/tip`: naziv najmanje 2 znaka. */
export interface CreateTipTestaCmd {
  naziv: string;
  predmetId: number;
}
