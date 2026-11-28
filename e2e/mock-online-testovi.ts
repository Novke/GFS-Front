import type {
  GrupaTesta, IspravkaCmd, IzvorStavke, NoviOnlineTestCmd, Rezim, SablonCmd, StanjeOnline, StanjePrimerka,
} from '../src/app/features/testovi/data-access/online.models';
import type { CuvanjeCmd, DogadjajCmd, FazaTesta, UlazCmd } from '../src/app/features/nalog/data-access/testovi-studenta.models';

/*
 * Mok online testova (plan online testova, faze 1 i 2, odeljci 4 i 5): šabloni, pravljenje, priprema, tok, konzola, rezultati,
 * ispravke i objava (nastavnik, `api/sabloni-testa*`, `api/test/online*`, `api/test/:id/online/*`, `api/test/:id/objava`), i
 * strana studenta (`api/public/nalog/testovi*`, `api/public/nalog/predmeti/:id/testovi`, prijava računara
 * `api/public/nalog/racunar/*`). Pravila kao na serveru, koliko e2e proverava:
 * - student vidi test tek od ULAZ, zadatke tek posle „Pokreni“ i ulaska; nikad ključ ni rešenje pre objave sa `tacni`;
 * - čuvanje sa `rev`: drugačiji `rev` je 409 `Zastarela izmena.`, posle predaje 409 `Test je predat.`;
 * - `drugiUredjaj` (postavlja test): ulaz bez `preuzmi` je 409 `Test je otvoren na drugom uređaju.`;
 * - zahtev računara: odobren zahtev na sledećem čitanju prijavljuje studenta sa načinom RACUNAR i troši se.
 * Rute registruje `mock-api.ts` (`online.nastavnickeRute`, `online.studentskeRute`).
 */

interface Odgovor { status?: number; telo?: unknown }
type Rukovalac = (z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>) => Odgovor;
type Ruta = (sablon: string, h: Rukovalac) => void;

/** Ono što mok online testova čita iz ostatka moka. */
export interface OkruzenjeOnline {
  studentPrijavljen(): boolean;
  /** Prijava studenta iz fiksture (`nalogStudenta`) sa načinom uređaja (zahtev računara). */
  prijaviStudenta(nacin: 'KOD' | 'RACUNAR'): void;
  nacinStudenta(): 'KOD' | 'LTI' | 'RACUNAR';
  /** Id prijavljenog studenta u `studenti` (Ana, GD1). */
  idStudenta(): number;
  student(id: number): { id: number; ime: string; prezime: string; indeks: string; godina: number | null; grupaId: number | null } | null;
  studentiGrupe(grupaId: number): number[];
  predmet(id: number): string;
  grupa(id: number): string;
  tipTesta(id: number): string;
  /** Red u `podaci.testovi` (lista i detalj testa), da online test ima isti id i u spisku. */
  dodajTest(t: { id: number; datum: string; tipTestaId: number; predmetId: number; grupaId: number; studentIds: number[] }): void;
  azurirajTest(id: number, izmena: { stanjeOnline?: StanjeOnline; objavljeno?: string | null; objavaTacni?: boolean; pregledan?: boolean }): void;
}

interface StavkaM {
  naziv: string; poeni: number; broj: number; nivoi: number[]; istiTip: boolean; rucno: boolean; izvori: number[];
}
interface SablonM {
  id: number; predmetId: number; tipTestaId: number | null; naziv: string; opis: string | null; trajanjeMin: number; rezim: Rezim;
  brojGrupa: number; pragProlaza: number | null; arhiviran: boolean; izmenjeno: string; stavke: StavkaM[];
}
interface PrimerakM {
  primerakId: number; studentId: number; grupaTesta: GrupaTesta | null; stanje: StanjePrimerka;
  uneto: Record<number, Record<string, unknown>>; rev: Record<number, number>; sacuvano: Record<number, string>;
  rucni: Record<number, number | null>; predato: string | null; prepisivao: boolean; produzenjeMin: number; usao: string | null;
  dogadjaji: { vreme: string; vrsta: string; detalj: string | null }[];
}
interface TestM {
  testId: number; predmetId: number; grupaId: number; tipTestaId: number; datum: string; stanje: StanjeOnline; rezim: Rezim;
  brojGrupa: number; trajanjeMin: number; sablonId: number | null; ulazniKod: string | null; ulazOtvoren: string | null;
  pokrenuta: string | null; rokMs: number | null; zatvorena: string | null; objavljeno: string | null; objavaTacni: boolean;
  pregledan: boolean; primerci: PrimerakM[];
  ispravke: { id: number; varijantaId: number; polje: string; vrsta: string; vrednost: string | null; kreirano: string }[];
}

/** Dva zadatka svakog primerka (isti za sve grupe testa; mok ne izvlači). */
const ZADACI = [
  {
    rb: 1, naziv: 'Binarni u dekadni', maxPoena: 3, varijantaId: 801, tipId: 2, tip: '2 → 10', nivo: 2, svgId: 'svg-ot-1', resenjeSvgId: 'svg-ot-r1',
    polje: { kljuc: 'a', oznaka: 'a', tip: 'BROJ' as const, opcije: null }, tacno: { broj: 13, prihvatljivi: null, tacna: null, tacne: null },
  },
  {
    rb: 2, naziv: 'Tačna tvrdnja', maxPoena: 2, varijantaId: 802, tipId: 3, tip: '16 → 2', nivo: 1, svgId: 'svg-ot-2', resenjeSvgId: null,
    polje: { kljuc: 'a', oznaka: 'a', tip: 'JEDAN_TACAN' as const, opcije: [{ id: 1, tekst: 'Prva' }, { id: 2, tekst: 'Druga' }] },
    tacno: { broj: null, prihvatljivi: null, tacna: 2, tacne: null },
  },
];
const MAX_POENA = ZADACI.reduce((z, x) => z + x.maxPoena, 0);
const GRUPE: GrupaTesta[] = ['A', 'B', 'C', 'D'];

const ok = (telo: unknown): Odgovor => ({ telo });
const greska = (status: number, reason: string): Odgovor => ({ status, telo: { reason, time: new Date().toISOString() } });
const NEMA = () => greska(404, 'Nije pronađeno.');
const dva = (n: number) => String(n).padStart(2, '0');
const lokalno = (d = new Date()) =>
  `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}T${dva(d.getHours())}:${dva(d.getMinutes())}:${dva(d.getSeconds())}`;
const danas = () => lokalno().slice(0, 10);
const zadatakId = (p: PrimerakM, rb: number) => p.primerakId * 10 + rb;

/** Polje kakvo vidi student (bez ključa), sa delom poena. */
function poljeTesta(z: (typeof ZADACI)[number]) {
  return {
    ...z.polje, odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null, zanemariRazmake: null,
    poeniPolja: z.maxPoena,
  };
}

function tacnoUneto(z: (typeof ZADACI)[number], v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  return z.polje.tip === 'BROJ' ? Number(String(v).replace(',', '.')) === z.tacno.broj : Number(v) === z.tacno.tacna;
}

export class MockOnlineTestovi {
  /** Ulazni kod koji mok daje kad nastavnik uključi „Ulazni kod“. */
  static readonly KOD_ULAZA = '4821';
  /** Token iz QR-a strane `/r` (32 znaka) i četvorocifren broj ispod. */
  static readonly TOKEN_RACUNARA = 'RacunarToken0123456789abcdefghij';
  static readonly BROJ_RACUNARA = '4417';

  readonly sabloni: SablonM[] = [{
    id: 1, predmetId: 1, tipTestaId: 1, naziv: 'Kolokvijum 1 – online', opis: null, trajanjeMin: 45, rezim: 'GRUPE', brojGrupa: 2,
    pragProlaza: null, arhiviran: false, izmenjeno: '2026-11-20T10:00:00',
    stavke: [{ naziv: 'Konverzije', poeni: 3, broj: 1, nivoi: [], istiTip: false, rucno: false, izvori: [2] },
      { naziv: 'Tvrdnje', poeni: 2, broj: 1, nivoi: [1, 2], istiTip: false, rucno: false, izvori: [3] }],
  }];
  readonly testovi = new Map<number, TestM>();
  /** Test zadat drugom uređaju (ulaz bez `preuzmi` je 409). */
  drugiUredjaj = false;
  /** Zahtev strane `/r`: `null` dok računar ne zatraži. */
  zahtev: { stanje: 'CEKA' | 'ODOBREN' | 'ISTEKAO'; broj: string } | null = null;
  /** Meki znaci studenta (`dogadjaj`), redom. */
  readonly dogadjaji: { vrsta: string; trajanjeMs: number | null }[] = [];
  private sledeciId = 900;

  constructor(private readonly o: OkruzenjeOnline) {}

  /** Online test za grupu 1 (predmet 1, tip 1) u datom stanju; prijavljeni student (Ana) je među studentima. */
  napravi(stanje: StanjeOnline = 'PRIPREMA', izmena: Partial<Pick<TestM, 'ulazniKod' | 'objavljeno' | 'objavaTacni'>> = {}): number {
    const t = this.novTest({ sablonId: 1, grupaId: 1, tipTestaId: 1, datum: danas(), trajanjeMin: 45, rezim: 'GRUPE', brojGrupa: 2,
      studentIds: this.o.studentiGrupe(1).slice(0, 4) }, 1);
    Object.assign(t, izmena);
    if (stanje !== 'PRIPREMA') this.otvori(t, t.ulazniKod !== null);
    if (stanje === 'U_TOKU' || stanje === 'ZAVRSEN') this.pokreni(t);
    if (stanje === 'ZAVRSEN') this.zavrsi(t);
    this.o.azurirajTest(t.testId, { stanjeOnline: t.stanje, objavljeno: t.objavljeno, objavaTacni: t.objavaTacni });
    return t.testId;
  }

  /** Primerak prijavljenog studenta (stanje, uneto) za proveru u testu. */
  primerakStudenta(testId: number): PrimerakM | null {
    return this.testovi.get(testId)?.primerci.find(p => p.studentId === this.o.idStudenta()) ?? null;
  }

  /** Nastavnik je pritisnuo „Pokreni“ (test iz čekaonice). */
  pokreniTest(testId: number): void {
    const t = this.testovi.get(testId)!;
    this.pokreni(t);
    this.o.azurirajTest(t.testId, { stanjeOnline: t.stanje });
  }

  /** Izmena sa druge kartice istog uređaja: server već ima `rev` i vrednost za zadatak `rb` prijavljenog studenta. */
  izmenaSaStrane(testId: number, rb: number, rev: number, uneto: Record<string, unknown>): number {
    const p = this.primerakStudenta(testId)!;
    const id = zadatakId(p, rb);
    p.rev[id] = rev;
    p.uneto[id] = uneto;
    p.sacuvano[id] = lokalno();
    return id;
  }

  /** Unos prijavljenog studenta po rednom broju zadatka (provera u testu). */
  unetoStudenta(testId: number, rb: number): Record<string, unknown> | null {
    const p = this.primerakStudenta(testId);
    return p ? (p.uneto[zadatakId(p, rb)] ?? null) : null;
  }

  /** Student je već predao (rezultat): `uneto` po rednom broju zadatka. */
  predaoStudent(testId: number, uneto: Record<number, unknown>): void {
    const p = this.primerakStudenta(testId)!;
    p.stanje = 'PREDAO';
    p.predato = lokalno();
    for (const [rb, v] of Object.entries(uneto)) p.uneto[zadatakId(p, Number(rb))] = { a: v };
  }

  /** Telefon je odobrio zahtev (prijava računara bez drugog pregledača u testu). */
  odobriZahtev(): void {
    if (this.zahtev) this.zahtev.stanje = 'ODOBREN';
  }

  // ------------------------------------------------------------------------------------------- stanje

  private novTest(cmd: NoviOnlineTestCmd, predmetId: number): TestM {
    const testId = this.sledeciId++;
    const grupe = cmd.rezim === 'GRUPE' ? GRUPE.slice(0, cmd.brojGrupa) : [null];
    const t: TestM = {
      testId, predmetId, grupaId: cmd.grupaId, tipTestaId: cmd.tipTestaId, datum: cmd.datum, stanje: 'PRIPREMA', rezim: cmd.rezim,
      brojGrupa: cmd.rezim === 'GRUPE' ? cmd.brojGrupa : 1, trajanjeMin: cmd.trajanjeMin, sablonId: cmd.sablonId, ulazniKod: null,
      ulazOtvoren: null, pokrenuta: null, rokMs: null, zatvorena: null, objavljeno: null, objavaTacni: false, pregledan: false,
      primerci: [], ispravke: [],
    };
    cmd.studentIds.forEach((s, i) => t.primerci.push(this.primerak(s, grupe[i % grupe.length])));
    this.testovi.set(testId, t);
    this.o.dodajTest({ id: testId, datum: cmd.datum, tipTestaId: cmd.tipTestaId, predmetId, grupaId: cmd.grupaId, studentIds: cmd.studentIds });
    this.o.azurirajTest(testId, { stanjeOnline: 'PRIPREMA' });
    return t;
  }

  private primerak(studentId: number, grupaTesta: GrupaTesta | null): PrimerakM {
    return {
      primerakId: this.sledeciId++, studentId, grupaTesta, stanje: 'NIJE_USAO', uneto: {}, rev: {}, sacuvano: {}, rucni: {},
      predato: null, prepisivao: false, produzenjeMin: 0, usao: null, dogadjaji: [],
    };
  }

  private otvori(t: TestM, kod: boolean): void {
    t.stanje = 'ULAZ';
    t.ulazniKod = kod ? MockOnlineTestovi.KOD_ULAZA : null;
    t.ulazOtvoren = lokalno();
  }

  private pokreni(t: TestM): void {
    t.stanje = 'U_TOKU';
    t.pokrenuta = lokalno();
    t.rokMs = Date.now() + t.trajanjeMin * 60_000;
    t.primerci.filter(p => p.stanje === 'CEKA').forEach(p => (p.stanje = 'RADI'));
  }

  private zavrsi(t: TestM): void {
    t.stanje = 'ZAVRSEN';
    t.zatvorena = lokalno();
    t.primerci.filter(p => p.stanje === 'RADI').forEach(p => {
      p.stanje = 'PREDAO';
      p.predato = lokalno();
    });
  }

  private rok(t: TestM, p: PrimerakM): number | null {
    return t.rokMs === null ? null : t.rokMs + p.produzenjeMin * 60_000;
  }

  private poeniZadatka(t: TestM, p: PrimerakM, z: (typeof ZADACI)[number]): number | null {
    if (p.stanje !== 'PREDAO' && t.stanje !== 'ZAVRSEN') return null;
    const id = zadatakId(p, z.rb);
    if (p.rucni[id] !== undefined && p.rucni[id] !== null) return p.rucni[id];
    const ponisteno = t.ispravke.some(i => i.varijantaId === z.varijantaId && i.vrsta === 'PONISTI');
    if (ponisteno) return 0;
    return tacnoUneto(z, p.uneto[id]?.['a']) ? z.maxPoena : 0;
  }

  private poeni(t: TestM, p: PrimerakM): number | null {
    if (p.stanje === 'PONISTEN') return 0;
    const delovi = ZADACI.map(z => this.poeniZadatka(t, p, z));
    return delovi.some(x => x === null) ? null : delovi.reduce<number>((a, b) => a + (b ?? 0), 0);
  }

  private popunjeno(p: PrimerakM): number {
    return ZADACI.filter(z => {
      const v = p.uneto[zadatakId(p, z.rb)]?.['a'];
      return v !== undefined && v !== null && v !== '';
    }).length;
  }

  // ------------------------------------------------------------------------------------------- nastavnik: DTO-i

  private izvor(id: number): IzvorStavke {
    return { grupaId: id, naziv: id === 2 ? '2 → 10' : id === 3 ? '16 → 2' : `Tip ${id}`, putanja: ['Konverzije brojeva'], obrisan: false };
  }

  private sablonInfo(s: SablonM) {
    return {
      id: s.id, predmetId: s.predmetId, tipTestaId: s.tipTestaId, tipTesta: s.tipTestaId === null ? null : this.o.tipTesta(s.tipTestaId),
      naziv: s.naziv, trajanjeMin: s.trajanjeMin, rezim: s.rezim, brojGrupa: s.brojGrupa,
      maxPoena: s.stavke.reduce((z, x) => z + x.poeni * x.broj, 0), brojStavki: s.stavke.length, arhiviran: s.arhiviran, izmenjeno: s.izmenjeno,
    };
  }

  private sablonDetails(s: SablonM, id: number | null = s.id) {
    const info: Partial<ReturnType<MockOnlineTestovi['sablonInfo']>> = this.sablonInfo(s);
    delete info.brojStavki;
    return {
      ...info, id: id ?? 0, opis: s.opis, pragProlaza: s.pragProlaza,
      stavke: s.stavke.map((x, i) => ({
        id: id === null ? null : i + 1, rb: i + 1, naziv: x.naziv, poeni: x.poeni, broj: x.broj, nivoi: x.nivoi, istiTip: x.istiTip,
        rucno: x.rucno, izvori: x.izvori.map(v => this.izvor(v)),
        kandidati: { ukupno: 6 * x.izvori.length, poNivou: [2, 2, 2].map(n => n * x.izvori.length) as [number, number, number], tipova: x.izvori.length },
        upozorenja: x.broj > 6 * x.izvori.length ? ['Nema dovoljno zadataka za ovaj broj.'] : [],
      })),
      upozorenja: [],
    };
  }

  private izSablonCmd(cmd: SablonCmd, s: Partial<SablonM> = {}): SablonM | Odgovor {
    if (!cmd.naziv?.trim()) return greska(400, 'Unesi naziv šablona.');
    if (!Array.isArray(cmd.stavke) || cmd.stavke.length < 1 || cmd.stavke.length > 30) return greska(400, 'Šablon ima od 1 do 30 stavki.');
    if (cmd.stavke.some(x => !x.izvori?.length)) return greska(400, 'Svaka stavka mora imati izvor iz banke.');
    return {
      id: s.id ?? this.sledeciId++, predmetId: cmd.predmetId, tipTestaId: cmd.tipTestaId, naziv: cmd.naziv.trim(), opis: cmd.opis,
      trajanjeMin: cmd.trajanjeMin, rezim: cmd.rezim, brojGrupa: cmd.brojGrupa, pragProlaza: cmd.pragProlaza, arhiviran: s.arhiviran ?? false,
      izmenjeno: lokalno(), stavke: cmd.stavke.map(x => ({ ...x })),
    };
  }

  private onlineTest(t: TestM) {
    const sablon = this.sabloni.find(s => s.id === t.sablonId);
    const grupe = t.rezim === 'GRUPE' ? GRUPE.slice(0, t.brojGrupa) : [null];
    return {
      testId: t.testId, tipTesta: this.o.tipTesta(t.tipTestaId), predmetId: t.predmetId, predmet: this.o.predmet(t.predmetId),
      grupaId: t.grupaId, grupa: this.o.grupa(t.grupaId), datum: t.datum, stanje: t.stanje, rezim: t.rezim, brojGrupa: t.brojGrupa,
      trajanjeMin: t.trajanjeMin, maxPoena: MAX_POENA, pragProlaza: null, pregledan: t.pregledan, objavljeno: t.objavljeno,
      objavaTacni: t.objavaTacni, sablonId: t.sablonId,
      smena: { id: t.testId, ulazniKod: t.ulazniKod, ulazOtvoren: t.ulazOtvoren, pokrenuta: t.pokrenuta, rokMs: t.rokMs, zatvorena: t.zatvorena },
      serverVremeMs: Date.now(),
      stavke: (sablon?.stavke ?? []).map((x, i) => ({
        id: i + 1, rb: i + 1, naziv: x.naziv, poeni: x.poeni, broj: x.broj, nivoi: x.nivoi, izabraniNivo: null, istiTip: x.istiTip,
        rucno: x.rucno, izvori: x.izvori.map(v => this.izvor(v)), tipovi: x.izvori.map(v => ({ tipId: v, naziv: this.izvor(v).naziv })),
      })),
      izbor: grupe.map(g => ({
        grupaTesta: g, studenata: t.primerci.filter(p => p.grupaTesta === g).length,
        zadaci: ZADACI.map((z, i) => ({
          stavkaId: i + 1, mesto: 1, varijantaId: z.varijantaId, tipId: z.tipId, tip: z.tip, nivo: z.nivo, svgId: z.svgId,
          resenjeSvgId: z.resenjeSvgId, polja: [{ ...poljeTesta(z), poeniPolja: undefined }], odgovori: { a: z.tacno }, maxPoena: z.maxPoena,
          studenata: t.primerci.filter(p => p.grupaTesta === g).length,
        })),
      })),
      studenti: t.primerci.length,
      upozorenja: [],
    };
  }

  private konzola(t: TestM) {
    const studenti = t.primerci.map(p => {
      const s = this.o.student(p.studentId);
      return {
        primerakId: p.primerakId, studentId: p.studentId, ime: s?.ime ?? '?', prezime: s?.prezime ?? '?', indeks: s?.indeks ?? '?',
        grupaTesta: p.grupaTesta, stanje: p.stanje, popunjeno: this.popunjeno(p), ukupnoPolja: ZADACI.length, rokMs: this.rok(t, p),
        produzenjeMin: p.produzenjeMin, predato: p.predato, racunar: false, promenaUredjaja: 0,
        napustanja: p.dogadjaji.filter(d => d.vrsta === 'NAPUSTIO').length, napustanjaSekundi: 0, drugaMreza: false,
        prepisivao: p.prepisivao, poeni: this.poeni(t, p),
      };
    });
    return {
      testId: t.testId, stanje: t.stanje,
      smena: { id: t.testId, ulazniKod: t.ulazniKod, ulazOtvoren: t.ulazOtvoren, pokrenuta: t.pokrenuta, rokMs: t.rokMs, zatvorena: t.zatvorena },
      serverVremeMs: Date.now(), maxPoena: MAX_POENA, usli: t.primerci.filter(p => p.stanje !== 'NIJE_USAO').length,
      predalo: t.primerci.filter(p => p.stanje === 'PREDAO').length, ukupno: t.primerci.length, studenti,
    };
  }

  private rezultati(t: TestM) {
    return {
      testId: t.testId, maxPoena: MAX_POENA, pragProlaza: null,
      stavke: ZADACI.map(z => {
        const poeni = t.primerci.map(p => this.poeniZadatka(t, p, z)).filter((x): x is number => x !== null);
        return {
          rb: z.rb, naziv: z.naziv, maxPoena: z.maxPoena, prosek: poeni.length ? poeni.reduce((a, b) => a + b, 0) / poeni.length : null,
          tacnost: poeni.length ? poeni.filter(x => x === z.maxPoena).length / poeni.length : null,
        };
      }),
      studenti: t.primerci.map(p => {
        const s = this.o.student(p.studentId);
        return {
          primerakId: p.primerakId, studentId: p.studentId, ime: s?.ime ?? '?', prezime: s?.prezime ?? '?', indeks: s?.indeks ?? '?',
          grupaTesta: p.grupaTesta, stanje: p.stanje, poeni: this.poeni(t, p),
          zadaci: ZADACI.map(z => ({ rb: z.rb, poeni: this.poeniZadatka(t, p, z), maxPoena: z.maxPoena, rucno: p.rucni[zadatakId(p, z.rb)] != null })),
          prepisivao: p.prepisivao, znaci: p.dogadjaji.some(d => d.vrsta === 'NAPUSTIO') ? ['Napuštao stranu'] : [],
        };
      }),
    };
  }

  private primerakNastavnika(t: TestM, p: PrimerakM) {
    const s = this.o.student(p.studentId);
    return {
      primerakId: p.primerakId, studentId: p.studentId, ime: s?.ime ?? '?', prezime: s?.prezime ?? '?', indeks: s?.indeks ?? '?',
      grupaTesta: p.grupaTesta, stanje: p.stanje, usao: p.usao, predato: p.predato, nacinPredaje: p.predato ? 'STUDENT' : null,
      poeni: this.poeni(t, p), maxPoena: MAX_POENA,
      zadaci: ZADACI.map(z => {
        const id = zadatakId(p, z.rb);
        const auto = this.poeniZadatka(t, p, z);
        return {
          zadatakId: id, rb: z.rb, naziv: z.naziv, tip: z.tip, nivo: z.nivo, varijantaId: z.varijantaId, svgId: z.svgId,
          resenjeSvgId: z.resenjeSvgId, polja: [{ ...poljeTesta(z), poeniPolja: undefined }], odgovori: { a: z.tacno }, uneto: p.uneto[id] ?? null,
          ocena: { a: { udeo: tacnoUneto(z, p.uneto[id]?.['a']) ? 1 : 0, izvor: 'AUTO' } }, maxPoena: z.maxPoena, autoPoeni: auto,
          rucniPoeni: p.rucni[id] ?? null, poeni: auto, napomena: null, sacuvano: p.sacuvano[id] ?? null,
        };
      }),
      dogadjaji: p.dogadjaji,
    };
  }

  private odgovori(t: TestM) {
    return {
      varijante: ZADACI.map(z => {
        const grupe = new Map<string, number>();
        let prazno = 0;
        t.primerci.forEach(p => {
          const v = p.uneto[zadatakId(p, z.rb)]?.['a'];
          if (v === undefined || v === null || v === '') prazno++;
          else grupe.set(String(v), (grupe.get(String(v)) ?? 0) + 1);
        });
        const prihvaceni = new Set(t.ispravke.filter(i => i.varijantaId === z.varijantaId && i.vrsta === 'PRIHVATI').map(i => i.vrednost));
        return {
          varijantaId: z.varijantaId, stavkaRb: z.rb, naziv: z.naziv, tip: z.tip, nivo: z.nivo,
          grupeTesta: t.rezim === 'GRUPE' ? GRUPE.slice(0, t.brojGrupa) : [], svgId: z.svgId, resenjeSvgId: z.resenjeSvgId,
          primeraka: t.primerci.length,
          polja: [{
            kljuc: 'a', oznaka: 'a', tip: z.polje.tip, poeni: z.maxPoena, konacno: true, opcije: z.polje.opcije, tacno: z.tacno,
            ponisteno: t.ispravke.some(i => i.varijantaId === z.varijantaId && i.vrsta === 'PONISTI'), prazno,
            grupe: [...grupe].map(([kljuc, broj]) => ({
              kljuc, prikaz: z.polje.opcije?.find(o => String(o.id) === kljuc)?.tekst ?? kljuc, broj,
              tacno: tacnoUneto(z, kljuc) || prihvaceni.has(kljuc), prihvacen: prihvaceni.has(kljuc),
            })),
          }],
        };
      }),
      ispravke: t.ispravke,
    };
  }

  // ------------------------------------------------------------------------------------------- student: DTO-i

  private faza(t: TestM, p: PrimerakM): FazaTesta {
    if (t.stanje === 'ZAVRSEN') return 'ZAVRSEN';
    if (p.stanje === 'PREDAO' || p.stanje === 'PONISTEN') return 'PREDATO';
    if (p.stanje === 'NIJE_USAO') return 'ULAZ';
    return p.stanje === 'CEKA' ? 'CEKANJE' : 'U_TOKU';
  }

  private polaganje(t: TestM, p: PrimerakM) {
    const s = this.o.student(p.studentId);
    const faza = this.faza(t, p);
    return {
      testId: t.testId, naziv: this.o.tipTesta(t.tipTestaId), predmet: this.o.predmet(t.predmetId), faza, ime: s?.ime ?? '?',
      prezime: s?.prezime ?? '?', indeks: s?.indeks ?? '?', grupaTesta: p.grupaTesta, rokMs: faza === 'U_TOKU' ? this.rok(t, p) : null,
      serverVremeMs: Date.now(), maxPoena: MAX_POENA,
      zadaci: faza === 'U_TOKU' || faza === 'PREDATO'
        ? ZADACI.map(z => {
            const id = zadatakId(p, z.rb);
            return {
              zadatakId: id, rb: z.rb, naziv: z.naziv, maxPoena: z.maxPoena, svgId: z.svgId, rucno: false, polja: [poljeTesta(z)],
              uneto: (p.uneto[id] as Record<string, string | number | number[]> | undefined) ?? null, rev: p.rev[id] ?? 0,
              sacuvano: p.sacuvano[id] ?? null,
            };
          })
        : null,
      predato: p.predato, racunar: this.o.nacinStudenta() === 'RACUNAR',
    };
  }

  private rezultatStudenta(t: TestM, p: PrimerakM) {
    const poeni = this.poeni(t, p);
    return {
      testId: t.testId, tipTesta: this.o.tipTesta(t.tipTestaId), predmet: this.o.predmet(t.predmetId), datum: t.datum, poeni,
      maxPoena: MAX_POENA, polozio: null, tacniPrikazani: t.objavaTacni,
      zadaci: ZADACI.map(z => {
        const v = p.uneto[zadatakId(p, z.rb)]?.['a'] ?? null;
        return {
          rb: z.rb, naziv: z.naziv, svgId: z.svgId, resenjeSvgId: t.objavaTacni ? z.resenjeSvgId : null, poeni: this.poeniZadatka(t, p, z),
          maxPoena: z.maxPoena,
          polja: [{ kljuc: 'a', oznaka: 'a', tip: z.polje.tip, opcije: z.polje.opcije, jedinica: null, uneto: v, udeo: tacnoUneto(z, v) ? 1 : 0,
            tacno: t.objavaTacni ? z.tacno : null }],
        };
      }),
    };
  }

  // ------------------------------------------------------------------------------------------- rute

  nastavnickeRute(get: Ruta, post: Ruta, put: Ruta, patch: Ruta, del: Ruta): void {
    const sablon = (p: Record<string, string>) => this.sabloni.find(s => s.id === Number(p['id']));
    const test = (p: Record<string, string>) => this.testovi.get(Number(p['id']));
    const saTestom = (h: (t: TestM, z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>) => Odgovor): Rukovalac =>
      (z, p) => {
        const t = test(p);
        return t ? h(t, z, p) : greska(404, 'Test ne postoji.');
      };
    const saPrimerkom = (h: (t: TestM, pr: PrimerakM, z: { telo: unknown }) => Odgovor): Rukovalac =>
      saTestom((t, z, p) => {
        const pr = t.primerci.find(x => x.primerakId === Number(p['pid']));
        return pr ? h(t, pr, z) : greska(404, 'Primerak ne postoji.');
      });
    const osvezi = (t: TestM) => this.o.azurirajTest(t.testId, { stanjeOnline: t.stanje, objavljeno: t.objavljeno, objavaTacni: t.objavaTacni });

    // šabloni (4.1); `provera` pre `:id`
    get('sabloni-testa', z => {
      const predmet = z.query.get('predmetId');
      const arhivirani = z.query.get('arhivirani') === 'true';
      return ok(this.sabloni
        .filter(s => predmet === null || s.predmetId === Number(predmet))
        .filter(s => arhivirani || !s.arhiviran)
        .map(s => this.sablonInfo(s)));
    });
    post('sabloni-testa/provera', z => {
      const s = this.izSablonCmd(z.telo as SablonCmd, { id: 0 });
      return 'stavke' in s ? ok(this.sablonDetails(s, null)) : s;
    });
    post('sabloni-testa', z => {
      const s = this.izSablonCmd(z.telo as SablonCmd);
      if (!('stavke' in s)) return s;
      this.sabloni.push(s);
      return { status: 201, telo: this.sablonDetails(s) };
    });
    get('sabloni-testa/:id', (_z, p) => {
      const s = sablon(p);
      return s ? ok(this.sablonDetails(s)) : NEMA();
    });
    put('sabloni-testa/:id', (z, p) => {
      const s = sablon(p);
      if (!s) return NEMA();
      const nov = this.izSablonCmd(z.telo as SablonCmd, s);
      if (!('stavke' in nov)) return nov;
      Object.assign(s, nov);
      return ok(this.sablonDetails(s));
    });
    post('sabloni-testa/:id/kopija', (_z, p) => {
      const s = sablon(p);
      if (!s) return NEMA();
      const k: SablonM = { ...structuredClone(s), id: this.sledeciId++, naziv: `${s.naziv} (kopija)`, izmenjeno: lokalno() };
      this.sabloni.push(k);
      return { status: 201, telo: this.sablonDetails(k) };
    });
    patch('sabloni-testa/:id/arhiviran', (z, p) => {
      const s = sablon(p);
      if (!s) return NEMA();
      s.arhiviran = (z.telo as { arhiviran: boolean }).arhiviran;
      return ok(this.sablonDetails(s));
    });
    del('sabloni-testa/:id', (_z, p) => {
      const i = this.sabloni.findIndex(s => s.id === Number(p['id']));
      if (i < 0) return NEMA();
      this.sabloni.splice(i, 1);
      return { status: 204 };
    });

    // pravljenje i priprema (4.2)
    get('test/online/kandidati-studenti', z => {
      const grupaId = Number(z.query.get('grupaId'));
      const kratko = (id: number, stariji: boolean) => {
        const s = this.o.student(id)!;
        return { id: s.id, ime: s.ime, prezime: s.prezime, indeks: s.indeks, godina: s.godina ?? 0, stariji };
      };
      return ok({
        grupa: this.o.studentiGrupe(grupaId).map(id => kratko(id, false)),
        stariji: grupaId === 1 ? this.o.studentiGrupe(3).slice(0, 2).map(id => kratko(id, true)) : [],
      });
    });
    post('test/online', z => {
      const cmd = z.telo as NoviOnlineTestCmd;
      const s = this.sabloni.find(x => x.id === cmd.sablonId);
      if (!s) return greska(404, 'Šablon ne postoji.');
      if (!cmd.studentIds?.length) return greska(400, 'Izaberi bar jednog studenta.');
      return { status: 201, telo: this.onlineTest(this.novTest(cmd, s.predmetId)) };
    });
    get('test/:id/online', saTestom(t => ok(this.onlineTest(t))));
    post('test/:id/online/izvuci', saTestom(t => (t.stanje === 'PRIPREMA' || t.stanje === 'ULAZ' ? ok(this.onlineTest(t)) : greska(409, 'Test je već počeo.'))));
    post('test/:id/online/studenti', saTestom((t, z) => {
      const id = (z.telo as { studentId: number }).studentId;
      if (!t.primerci.some(p => p.studentId === id)) t.primerci.push(this.primerak(id, t.rezim === 'GRUPE' ? 'A' : null));
      return ok(this.onlineTest(t));
    }));
    del('test/:id/online/studenti/:sid', saTestom((t, _z, p) => {
      t.primerci = t.primerci.filter(x => x.studentId !== Number(p['sid']));
      return ok(this.onlineTest(t));
    }));

    // tok i konzola (4.3)
    post('test/:id/online/otvori-ulaz', saTestom((t, z) => {
      if (t.stanje !== 'PRIPREMA') return greska(409, 'Ulaz je već otvoren.');
      this.otvori(t, (z.telo as { ulazniKod: boolean }).ulazniKod);
      osvezi(t);
      return ok(this.onlineTest(t));
    }));
    post('test/:id/online/pokreni', saTestom(t => {
      if (t.stanje !== 'ULAZ') return greska(409, 'Prvo otvori ulaz.');
      this.pokreni(t);
      osvezi(t);
      return ok(this.onlineTest(t));
    }));
    post('test/:id/online/zavrsi', saTestom(t => {
      if (t.stanje !== 'U_TOKU') return greska(409, 'Test nije u toku.');
      this.zavrsi(t);
      osvezi(t);
      return ok(this.onlineTest(t));
    }));
    get('test/:id/online/konzola', saTestom(t => ok(this.konzola(t))));
    post('test/:id/online/produzi', saTestom((t, z) => {
      const cmd = z.telo as { minuti: number; primerakId: number | null };
      t.primerci.filter(p => cmd.primerakId === null || p.primerakId === cmd.primerakId).forEach(p => (p.produzenjeMin += cmd.minuti));
      return ok(this.konzola(t));
    }));
    post('test/:id/online/primerci/:pid/vrati', saPrimerkom((t, p) => {
      p.stanje = 'RADI';
      p.predato = null;
      return ok(this.konzola(t));
    }));
    post('test/:id/online/primerci/:pid/ponisti', saPrimerkom((t, p) => {
      p.stanje = 'PONISTEN';
      return ok(this.konzola(t));
    }));
    patch('test/:id/online/primerci/:pid/prepisivao', saPrimerkom((t, p, z) => {
      p.prepisivao = (z.telo as { prepisivao: boolean }).prepisivao;
      return ok(this.konzola(t));
    }));

    // rezultati, ispravke, objava (4.4)
    get('test/:id/online/rezultati', saTestom(t => ok(this.rezultati(t))));
    get('test/:id/online/primerci/:pid', saPrimerkom((t, p) => ok(this.primerakNastavnika(t, p))));
    put('test/:id/online/zadaci/:zid/rucni-poeni', saTestom((t, z, p) => {
      const zid = Number(p['zid']);
      const pr = t.primerci.find(x => Math.floor(zid / 10) === x.primerakId);
      if (!pr) return NEMA();
      pr.rucni[zid] = (z.telo as { poeni: number | null }).poeni;
      return ok(this.primerakNastavnika(t, pr));
    }));
    get('test/:id/online/odgovori', saTestom(t => ok(this.odgovori(t))));
    post('test/:id/online/ispravke', saTestom((t, z) => {
      const cmd = z.telo as IspravkaCmd;
      t.ispravke.push({ id: this.sledeciId++, varijantaId: cmd.varijantaId, polje: cmd.polje, vrsta: cmd.vrsta, vrednost: cmd.vrednost, kreirano: lokalno() });
      return ok(this.odgovori(t));
    }));
    del('test/:id/online/ispravke/:iid', saTestom((t, _z, p) => {
      t.ispravke = t.ispravke.filter(i => i.id !== Number(p['iid']));
      return ok(this.odgovori(t));
    }));
    post('test/:id/objava', (z, p) => {
      const t = test(p);
      const tacni = (z.telo as { tacni?: boolean } | null)?.tacni ?? false;
      if (t) {
        t.objavljeno = lokalno();
        t.objavaTacni = tacni;
        osvezi(t);
      } else {
        this.o.azurirajTest(Number(p['id']), { objavljeno: lokalno(), objavaTacni: tacni });
      }
      return { status: 204 };
    });
    del('test/:id/objava', (_z, p) => {
      const t = test(p);
      if (t) {
        t.objavljeno = null;
        t.objavaTacni = false;
        osvezi(t);
      } else {
        this.o.azurirajTest(Number(p['id']), { objavljeno: null, objavaTacni: false });
      }
      return { status: 204 };
    });
  }

  studentskeRute(get: Ruta, post: Ruta, put: Ruta): void {
    const student = (h: Rukovalac): Rukovalac => (z, p) => (this.o.studentPrijavljen() ? h(z, p) : greska(401, 'Potrebna je prijava.'));
    const moj = (h: (t: TestM, pr: PrimerakM, z: { telo: unknown }, p: Record<string, string>) => Odgovor): Rukovalac =>
      student((z, p) => {
        const t = this.testovi.get(Number(p['id']));
        const pr = t?.primerci.find(x => x.studentId === this.o.idStudenta());
        return t && pr && t.stanje !== 'PRIPREMA' ? h(t, pr, z, p) : NEMA();
      });

    get('public/nalog/testovi', student(() => ok([...this.testovi.values()]
      .filter(t => t.stanje === 'ULAZ' || t.stanje === 'U_TOKU')
      .flatMap(t => {
        const pr = t.primerci.find(x => x.studentId === this.o.idStudenta());
        return pr ? [{
          testId: t.testId, naziv: this.o.tipTesta(t.tipTestaId), predmet: this.o.predmet(t.predmetId), datum: t.datum,
          trajanjeMin: t.trajanjeMin, faza: this.faza(t, pr), trebaKod: t.ulazniKod !== null,
        }] : [];
      }))));
    post('public/nalog/testovi/:id/ulaz', moj((t, pr, z) => {
      const cmd = z.telo as UlazCmd;
      if (t.stanje === 'ZAVRSEN') return greska(409, 'Vreme je isteklo.');
      if (t.ulazniKod !== null && cmd.kod !== t.ulazniKod) return greska(403, 'Pogrešan ulazni kod.');
      if (this.drugiUredjaj && !cmd.preuzmi) return greska(409, 'Test je otvoren na drugom uređaju.');
      this.drugiUredjaj = false;
      if (pr.stanje === 'NIJE_USAO') {
        pr.stanje = t.stanje === 'U_TOKU' ? 'RADI' : 'CEKA';
        pr.usao = lokalno();
      }
      return ok(this.polaganje(t, pr));
    }));
    get('public/nalog/testovi/:id', moj((t, pr) => ok(this.polaganje(t, pr))));
    put('public/nalog/testovi/:id/zadaci/:zid', moj((t, pr, z, p) => {
      const zid = Number(p['zid']);
      if (!ZADACI.some(x => zadatakId(pr, x.rb) === zid)) return NEMA();
      if (this.drugiUredjaj) return greska(409, 'Test je otvoren na drugom uređaju.');
      if (pr.stanje === 'PREDAO' || pr.stanje === 'PONISTEN') return greska(409, 'Test je predat.');
      const rok = this.rok(t, pr);
      if (t.stanje === 'ZAVRSEN' || (rok !== null && Date.now() > rok + 10_000)) return greska(409, 'Vreme je isteklo.');
      const cmd = z.telo as CuvanjeCmd;
      if ((pr.rev[zid] ?? 0) !== cmd.rev) return greska(409, 'Zastarela izmena.');
      pr.uneto[zid] = cmd.uneto;
      pr.rev[zid] = cmd.rev + 1;
      pr.sacuvano[zid] = lokalno();
      return ok({ rev: pr.rev[zid], sacuvano: pr.sacuvano[zid] });
    }));
    post('public/nalog/testovi/:id/predaj', moj((t, pr) => {
      if (pr.stanje !== 'RADI') return greska(409, 'Test je predat.');
      pr.stanje = 'PREDAO';
      pr.predato = lokalno();
      return ok(this.polaganje(t, pr));
    }));
    post('public/nalog/testovi/:id/dogadjaj', moj((_t, pr, z) => {
      const cmd = z.telo as DogadjajCmd;
      this.dogadjaji.push({ vrsta: cmd.vrsta, trajanjeMs: cmd.trajanjeMs });
      pr.dogadjaji.push({ vreme: lokalno(), vrsta: cmd.vrsta, detalj: cmd.trajanjeMs === null ? null : `${Math.round(cmd.trajanjeMs / 1000)} s` });
      return { status: 204 };
    }));
    get('public/nalog/testovi/:id/rezultat', moj((t, pr) => (t.objavljeno ? ok(this.rezultatStudenta(t, pr)) : NEMA())));
    get('public/nalog/predmeti/:id/testovi', student((_z, p) => ok([...this.testovi.values()]
      .filter(t => t.predmetId === Number(p['id']) && t.objavljeno)
      .flatMap(t => {
        const pr = t.primerci.find(x => x.studentId === this.o.idStudenta());
        return pr ? [{
          testId: t.testId, datum: t.datum, tipTesta: this.o.tipTesta(t.tipTestaId), poeni: this.poeni(t, pr), maxPoena: MAX_POENA,
          polozio: null, racunaSe: true, online: true,
        }] : [];
      }))));

    // prijava računara (5.1): `zahtev` pre `:token`
    post('public/nalog/racunar/zahtev', () => {
      this.zahtev = { stanje: 'CEKA', broj: MockOnlineTestovi.BROJ_RACUNARA };
      const sada = Date.now();
      return ok({ token: MockOnlineTestovi.TOKEN_RACUNARA, broj: this.zahtev.broj, isticeMs: sada + 120_000, serverVremeMs: sada });
    });
    get('public/nalog/racunar/zahtev', () => {
      if (!this.zahtev) return ok({ stanje: 'ISTEKAO', broj: '' });
      const z = { ...this.zahtev };
      if (z.stanje === 'ODOBREN') {
        this.o.prijaviStudenta('RACUNAR');
        this.zahtev = null;
      }
      return ok(z);
    });
    get('public/nalog/racunar/:token', student((_z, p) => {
      if (p['token'] !== MockOnlineTestovi.TOKEN_RACUNARA || this.zahtev?.stanje !== 'CEKA') {
        return greska(410, 'Prijava je istekla. Osveži stranu na računaru.');
      }
      const s = this.o.student(this.o.idStudenta())!;
      return ok({ broj: this.zahtev.broj, ime: s.ime, prezime: s.prezime, indeks: s.indeks });
    }));
    post('public/nalog/racunar/:token/odobri', student((_z, p) => {
      if (this.o.nacinStudenta() === 'RACUNAR') return greska(403, 'Računar se odobrava sa telefona.');
      if (p['token'] !== MockOnlineTestovi.TOKEN_RACUNARA || this.zahtev?.stanje !== 'CEKA') {
        return greska(410, 'Prijava je istekla. Osveži stranu na računaru.');
      }
      this.zahtev.stanje = 'ODOBREN';
      return { status: 204 };
    }));
  }
}
