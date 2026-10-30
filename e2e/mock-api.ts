import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page, Request, Route } from '@playwright/test';

import type {
  BankaPretragaStavka, GrupaCmd, IskljucenaTemaCmd, PremestiCmd, RenderProbaCmd, VarijantaCmd,
} from '../src/app/features/banka/data-access/banka.models';
import type { NajavaCmd } from '../src/app/features/nalog/data-access/casovi.models';
import type { LtiRegistracijaCmd, LtiRegistracijaInfo, LtiVrednostiZaMoodle } from '../src/app/features/podesavanja/data-access/lti.models';
import { poVezbama, type VrstaPrezentacije } from '../src/app/core/api/redosled-prezentacija';
import type { RasporedCmd, TerminCmd } from '../src/app/features/raspored/data-access/raspored.models';
import type { ZadatakSlajda } from '../src/app/features/uzivo/data-access/uzivo.models';
import { type BankaGrupa, type BankaPodaci, type BankaTema, type BankaVarijanta, MockBanka } from './mock-banka';
import { type FiksturaIzvodjenja, MockIzvodjenje } from './mock-izvodjenje';
import { MockPortal } from './mock-portal';
import { MockRaspored } from './mock-raspored';

/*
 * Mokovan backend za e2e: `page.route('**\/api/**')` odgovara po metodi i putanji iz izmišljenih podataka
 * (`e2e/fixtures/*.json`), sa stanjem po testu (izmene kroz PATCH/POST/DELETE ostaju do kraja testa). DTO-i ogledaju
 * backend isto kao `src/app/core/api/*`. Nepoznata ruta dobija 404 i upisuje se u `nepoznati`; fixture `mock`
 * (`e2e/fixture.ts`) tada obara test. Test može da zameni odgovor (`na`) ili da zadrži odgovor dok ga ne pusti (`zadrzi`).
 */

// ---------------------------------------------------------------------------------------------- podaci

type TipAktivnosti = 'PRISUSTVO' | 'ZADATAK' | 'SA_ZVEZDICOM';
type StatusPrijave = 'NA_CEKANJU' | 'PRIHVACENA' | 'ODBIJENA';

interface Predmet { id: number; naziv: string }
interface TipTesta { id: number; naziv: string; predmetId: number; aktivan: boolean }
interface Grupa { id: number; naziv: string; godinaUpisa: number | null; waLink?: string | null }
interface Student {
  id: number; ime: string; prezime: string; indeks: string; godina: number | null; email: string | null;
  brojTelefona: string | null; grupaId: number | null; datumRodjenja: string | null; opstina: string | null;
}
interface Beleska { id: number; studentId: number; tekst: string; kreirano: string; izmenjeno: string | null }
interface Aktivnost { id: number; studentId: number; tip: TipAktivnosti; napomene: string | null }
interface Predavanje {
  id: number; rb: number; datum: string | null; tema: string | null; zavrseno: boolean; predmetId: number;
  grupaId: number | null; posecenost: number | null; aktivnosti: Aktivnost[];
}
interface Polaganje {
  id: number; studentId: number; grupa: string | null; ostvareniPoeni: number | null; prepisivao: boolean; napomene: string | null;
}
interface Test {
  id: number; datum: string | null; tipTestaId: number; predmetId: number; grupaId: number | null; maxPoena: number;
  pragProlaza: number | null; pregledan: boolean; grupe: string[]; polaganja: Polaganje[];
}
interface Uradjen { id: number; studentId: number; bodovi: number | null; napomene: string; prepisivanje: boolean; oslobodjen: boolean }
interface Domaci {
  id: number; naslov: string | null; text: string | null; datum: string | null; pregledan: boolean; predmetId: number;
  grupaId: number | null; predavanjeId: number | null; uradjeni: Uradjen[];
}
interface Sesija {
  id: number; grupaId: number; token: string; aktivna: boolean; maxPrijava: number; napomena: string | null;
  kreirano: string; isticeZaDana: number;
}
interface Prijava {
  id: number; sesijaId: number; ime: string; prezime: string; indeks: string; godina: number; email: string; brojTelefona: string;
  datumRodjenja: string | null; opstina: string | null; status: StatusPrijave; podneto: string; obradjeno: string | null;
  studentId: number | null; napomena: string | null;
}
interface UzivoSlajd {
  id: number; rb: number; tip: string; naslov: string | null; sadrzaj: string | null; slika: unknown; beleske: string | null;
  postepeno: boolean; pitanje: unknown; platno: unknown; prelaz?: Prelaz | null;
  /** ZADATAK: samo izbor (`SlajdCmd.zadatak`); opis (`ZadatakSlajdaInfo`) mok računa pri svakom odgovoru, kao server. */
  zadatak?: ZadatakSlajda | null;
}
/** Prelaz na slajd (faza 5, Ugovor 4); slajd koji test doda bez polja front čita kao `null`. */
interface Prelaz { efekat: string; smer: string | null; trajanjeMs: number }

/** Kao `SlajdPP.normalizuj(Prelaz)`: bez efekta -> null, FADE bez smera, inače DESNO, trajanje 500. */
function normalizujPrelaz(p: Partial<Prelaz> | null | undefined): Prelaz | null {
  if (!p?.efekat) return null;
  return { efekat: p.efekat, smer: p.efekat === 'FADE' ? null : (p.smer ?? 'DESNO'), trajanjeMs: p.trajanjeMs ?? 500 };
}

/** Kao `SlajdPP.normalizuj`: zadatak (izbor grupe, vreme, broj različitih) nosi samo ZADATAK slajd. */
function zadatakIzCmd(cmd: { tip: string; zadatak?: ZadatakSlajda | null }): ZadatakSlajda | null {
  const z = cmd.tip === 'ZADATAK' ? cmd.zadatak : null;
  return z ? { grupaId: z.grupaId ?? null, vremeSekunde: z.vremeSekunde ?? null, brojVarijanti: z.brojVarijanti ?? null, nivo: z.nivo ?? null } : null;
}
interface UzivoPrezentacija {
  id: number; naziv: string; opis: string | null; predmet: { id: number; naziv: string }; tema: string; takmicenje: boolean;
  telefonPrikaz: string; detaljiDozvoljeni: boolean; slajdovi: UzivoSlajd[]; [ostalo: string]: unknown;
}
/** `prijavaObavezna`: bodovan run (bez prijavljenog studenta prijava je 403); fikstura bez polja = nebodovan. */
interface UzivoIzvodjenje { id: number; kod: string; naziv: string; status: 'AKTIVNO' | 'ZAVRSENO'; prijavaObavezna?: boolean }
/** `SlajdCmd` (telo `POST prezentacije/:id/slajdovi` i `PUT slajdovi/:id`); pitanje samo sa poljima koja mok čita. */
interface SlajdCmd {
  tip: string; naslov: string | null; sadrzaj: string | null; slikaId: string | null; beleske: string | null; postepeno: boolean;
  pitanje: ({ slikaId: string | null; opcije: { tekst: string; tacna: boolean }[] } & Record<string, unknown>) | null;
  platno: unknown;
  /** Kao server: PUT je puna zamena, pa komanda bez `prelaz` briše prelaz. */
  prelaz?: Partial<Prelaz> | null;
  zadatak?: ZadatakSlajda | null;
}
/** `MedijInfo` otpremljene slike (`POST mediji`). */
export interface Medij { id: string; naziv: string; mime: string; velicina: number }
/** `IzvodjenjeInfo` pokrenuto kroz `POST prezentacije/:id/izvodjenja` (ili postavljeno u testu). */
export interface IzvodjenjeNaPredavanju {
  id: number; kod: string; prezentacija: { id: number; naziv: string; predmetId: number }; status: 'AKTIVNO' | 'ZAVRSENO'; cuvanje: boolean;
  grupa: unknown; predavanje: { id: number; rb: number; datum: string | null; tema: string | null } | null; pocetak: string; kraj: string | null;
  brojUcesnika: number; brojPitanja: number; boduje: boolean;
}
interface Ucesnik { ucesnikId: number; ime: string; izvodjenjeId: number }
/** `ObavestenjeInfo` (`GET api/obavestenja`), kao backend. */
interface Obavestenje {
  id: number; vrsta: 'NE_STIZE_KOD' | 'PREVISE_KODOVA' | 'MNOGO_NAJAVA'; studentId: number | null; studentIme: string | null; indeks: string | null;
  podaci: Record<string, unknown> | null; kreirano: string; procitano: string | null; reseno: string | null;
}
/** `SesijaInfo` (`GET api/auth/sesije`): prijavljeni uređaji nastavnika. */
interface SesijaNastavnika { id: number; opis: string; kreirano: string; poslednjiUlaz: string; trenutna: boolean }
/** `UredjajInfo` i `StudentJaInfo` naloga studenta (`api/public/nalog/*`). */
interface UredjajStudenta { id: number; opis: string; nacin: 'KOD' | 'LTI'; prviUlaz: string; poslednjiUlaz: string; trenutni: boolean }
interface NalogStudenta {
  indeks: string; ime: string; prezime: string; maskaMejla: string | null; moodlePovezan: boolean; uredjaji: UredjajStudenta[];
  /** Grupa i generacija (tab Ja). */
  grupa?: string | null; generacija?: number | null;
  /** Godina upisa; bez nje u fiksturi važi početna godina tekuće školske godine (ono što forma predlaže). */
  godina?: number;
  /** Link WhatsApp grupe sopstvene grupe (Početna); fikstura ga nema, test ga postavlja. */
  waLink?: string | null;
}

/** Početna godina tekuće školske godine (1. 10. Y do 30. 9. Y+1 = Y), kao predlog forme na `/nalog`. */
export function tekucaSkolskaGodina(sada = new Date()): number {
  return sada.getMonth() >= 9 ? sada.getFullYear() : sada.getFullYear() - 1;
}
/** Nalog studenta na kartici (`GET api/studenti/:id/nalog`); `imaMejl` se računa iz mejla studenta. */
interface NalogNaKartici {
  studentId: number; uredjaji: Omit<UredjajStudenta, 'trenutni'>[]; moodle: { povezan: boolean; poslednjiUlaz: string | null };
  poslednjaPrijava: string | null;
}
interface KontrolnaTablaPodesavanje {
  sledece: { predmetId: number; grupaId: number; rb: number; brojStarijih: number };
  nedelja: { tip: 'PREDAVANJE' | 'DOMACI' | 'TEST'; id: number; naslov: string; predmetId: number; grupaId: number; danUNedelji: number }[];
}

export interface Podaci extends BankaPodaci {
  predmeti: Predmet[];
  tipoviTesta: TipTesta[];
  grupe: Grupa[];
  studenti: Student[];
  beleske: Beleska[];
  predavanja: Predavanje[];
  testovi: Test[];
  domaci: Domaci[];
  sesije: Sesija[];
  prijave: Prijava[];
  kontrolnaTabla: KontrolnaTablaPodesavanje;
  izvodjenja: UzivoIzvodjenje[];
  /** Prezentacije nastavnika (editor); izmene `PUT` ostaju u stanju testa. */
  prezentacije: UzivoPrezentacija[];
  /** Učesnici prijavljeni u ovom testu (kao da pregledač ima kolačić `gfs_uzivo`). */
  ucesnici: Ucesnik[];
  /** Obaveštenja za nastavnika (značka, padajuća lista, kartica "Obaveštenja"); `reseno` != null nisu otvorena. */
  obavestenja: Obavestenje[];
  /** Prijavljeni uređaji nastavnika (`trenutna` = ovaj pregledač). */
  sesijeNastavnika: SesijaNastavnika[];
  /** Jedini student sa nalogom (javna ruta `/nalog`); uređaj ovog pregledača se dodaje prijavom kodom. */
  nalogStudenta: NalogStudenta;
  /** Uređaji i Moodle veza studenata na kartici (sekcija "Nalog"); student bez reda nema ništa. */
  naloziStudenata: NalogNaKartici[];
  /** Registracije alata na Moodle-u (Podešavanja -> Moodle) i vrednosti za Moodle formu (`e2e/fixtures/lti.json`). */
  ltiRegistracije: LtiRegistracijaInfo[];
  ltiVrednosti: LtiVrednostiZaMoodle;
  /**
   * "Ime Prezime" prijavljenog studenta (kao kolačić `gfs_student`); `null` = student nije prijavljen. Isto stanje kao
   * `MockApi.studentPrijavljen` (javna ruta `/nalog`).
   */
  prijavljenStudent: string | null;
  // banka zadataka (`bankaGrupe`, `bankaVarijante`, `preambule`, `iskljuceneTeme`): vidi `BankaPodaci` u `mock-banka.ts`
}

/** PNG 1 x 1, providan. */
const PIKSEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const FIKSTURE = join(__dirname, 'fixtures');
const ucitaj = <T>(ime: string): T => JSON.parse(readFileSync(join(FIKSTURE, ime), 'utf8')) as T;

/** Sveža kopija izmišljenih podataka (svaki test ima svoju, pa izmene ne prelaze u druge testove). */
export function ucitajPodatke(): Podaci {
  const predmeti = ucitaj<{ predmeti: Predmet[]; tipoviTesta: TipTesta[] }>('predmeti.json');
  const studenti = ucitaj<{ studenti: Student[]; beleske: Beleska[] }>('studenti.json');
  const onboarding = ucitaj<{ sesije: Sesija[]; prijave: Prijava[] }>('onboarding.json');
  const banka = ucitaj<{
    grupe: BankaGrupa[]; varijante: BankaVarijanta[]; preambule: Record<number, string | null>; iskljuceneTeme: BankaTema[];
  }>('banka.json');
  const nalozi = ucitaj<{ obavestenja: Obavestenje[]; sesijeNastavnika: SesijaNastavnika[]; nalogStudenta: NalogStudenta; naloziStudenata: NalogNaKartici[] }>('nalozi.json');
  const lti = ucitaj<{ registracije: LtiRegistracijaInfo[]; vrednosti: LtiVrednostiZaMoodle }>('lti.json');
  return {
    predmeti: predmeti.predmeti,
    tipoviTesta: predmeti.tipoviTesta,
    grupe: ucitaj('grupe.json'),
    studenti: studenti.studenti,
    beleske: studenti.beleske,
    predavanja: ucitaj('predavanja.json'),
    testovi: ucitaj('testovi.json'),
    domaci: ucitaj('domaci.json'),
    sesije: onboarding.sesije,
    prijave: onboarding.prijave,
    kontrolnaTabla: ucitaj('kontrolna-tabla.json'),
    izvodjenja: ucitaj<{ izvodjenja: UzivoIzvodjenje[] }>('uzivo.json').izvodjenja,
    // server uvek šalje `prelaz` (i kad je null); fikstura ga ima na svakom slajdu, normalizacija je kao na serveru
    prezentacije: ucitaj<{ prezentacije: UzivoPrezentacija[] }>('prezentacije.json').prezentacije
      .map(x => ({ ...x, slajdovi: x.slajdovi.map(s => ({ ...s, prelaz: normalizujPrelaz(s.prelaz) })) })),
    ucesnici: [],
    obavestenja: nalozi.obavestenja,
    sesijeNastavnika: nalozi.sesijeNastavnika,
    nalogStudenta: nalozi.nalogStudenta,
    naloziStudenata: nalozi.naloziStudenata,
    ltiRegistracije: lti.registracije,
    ltiVrednosti: lti.vrednosti,
    prijavljenStudent: null,
    bankaGrupe: banka.grupe,
    bankaVarijante: banka.varijante,
    preambule: banka.preambule,
    iskljuceneTeme: banka.iskljuceneTeme,
  };
}

// ---------------------------------------------------------------------------------------------- rutiranje

export interface Zahtev {
  metod: string;
  /** Putanja posle `api/`, bez query-ja (npr. `predavanja/1/prisustvo`). */
  putanja: string;
  query: URLSearchParams;
  telo: unknown;
  /** Redni broj zahteva u testu (0, 1, 2, ...). */
  rb: number;
}

export interface Odgovor {
  status?: number;
  telo?: unknown;
}

export type Parametri = Record<string, string>;
/** `dalje()` daje podrazumevani odgovor moka (za zamene koje samo kasne ili menjaju deo odgovora). */
export type Rukovalac = (z: Zahtev, p: Parametri, dalje: () => Promise<Odgovor>) => Odgovor | Promise<Odgovor>;

interface Ruta {
  metod: string;
  sablon: RegExp;
  imena: string[];
  rukovalac: Rukovalac;
}

/**
 * `predavanja/:id/prisustvo/:sid` -> regex; `:param` je samo ceo broj, `:token` i `:serija` bilo koji segment (kako stigne,
 * URL-enkodovan).
 */
function napraviRutu(metod: string, sablon: string, rukovalac: Rukovalac): Ruta {
  const imena: string[] = [];
  const izraz = sablon
    .split('/')
    .map(deo => {
      if (!deo.startsWith(':')) {
        return deo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      imena.push(deo.slice(1));
      return deo === ':token' || deo === ':serija' ? '([^/]+)' : '(\\d+)';
    })
    .join('/');
  return { metod, sablon: new RegExp(`^${izraz}$`), imena, rukovalac };
}

function pogodi(rute: readonly Ruta[], z: Zahtev): { ruta: Ruta; p: Parametri } | null {
  for (const ruta of rute) {
    if (ruta.metod !== z.metod) {
      continue;
    }
    const m = ruta.sablon.exec(z.putanja);
    if (m) {
      return { ruta, p: Object.fromEntries(ruta.imena.map((ime, i) => [ime, m[i + 1]])) };
    }
  }
  return null;
}

const greska = (status: number, reason: string): Odgovor => ({ status, telo: { reason, time: new Date().toISOString() } });

/** Kao `PristupMatrica` na serveru: bez sesije nastavnika prolaze samo `public/*`, `auth/prijava` i `auth/ja`. */
const trazeSesiju = (putanja: string): boolean =>
  !(putanja === 'public' || putanja.startsWith('public/') || putanja === 'auth/prijava' || putanja === 'auth/ja');

/** Zadržan odgovor: `stigao` se razrešava kad zahtev stigne do moka, a odgovor ide tek posle `pusti()`. */
export interface Zadrzan {
  stigao: Promise<Zahtev>;
  pusti(): void;
}

// ---------------------------------------------------------------------------------------------- mok

export class MockApi {
  readonly podaci = ucitajPodatke();
  /** Nastavničko izvođenje 7 (daljinski, konzola): mašina stanja iz `mock-izvodjenje.ts`; STOMP (`api/ws`) mokuje spec. */
  readonly izvodjenje = new MockIzvodjenje(ucitaj<FiksturaIzvodjenja>('uzivo-izvodjenje.json'));
  /** Svi zahtevi ka `api/` redom kojim su stigli. */
  readonly zahtevi: Zahtev[] = [];
  /** Zahtevi za koje mok nema rutu (test ih proverava u `afterEach`). */
  readonly nepoznati: string[] = [];
  /** Izvođenja vezana za predavanja (`GET izvodjenja?predavanjeId`); pokretanje ih dodaje, test ih može postaviti. */
  readonly izvodjenjaPredavanja: IzvodjenjeNaPredavanju[] = [];
  /** Slike otpremljene kroz `POST mediji`, redom (id-jevi su UUID-i iz brojača, isti u svakom pokretanju). */
  readonly mediji: Medij[] = [];
  /** Banka zadataka (`/banka`): stablo, varijante, render i preambula nad `podaci.banka*`. */
  readonly banka = new MockBanka(this.podaci, id => this.predmet(id) !== null, this.mediji);
  /**
   * Nalog studenta, faze 2 i 3 (predmeti, vežbanje, pregled prezentacije, ocena) i nastavnički panel „Za vežbanje“ i statistika
   * (`mock-portal.ts`): studentske rute traže `studentPrijavljen`, panel samo čvorove banke za predavanja.
   */
  readonly portal = new MockPortal(() => this.studentPrijavljen,
    id => this.podaci.bankaGrupe.some(g => g.id === id && g.namena === 'PREDAVANJE'));
  /**
   * Sesija nastavnika (kao kolačić `gfs_nastavnik`). Podrazumevano je nastavnik prijavljen, pa specovi pre prijave rade kao
   * ranije. Bez nje mok odgovara kao server: svaki nastavnički API (sve osim `public/*`, `auth/prijava` i `auth/ja`) daje 401
   * `Potrebna je prijava.`, pre zamena (`na`) i podrazumevanih ruta. Test je menja direktno (istek usred rada) ili kroz
   * `POST auth/prijava` sa {@link MockApi.LOZINKA}.
   */
  prijavljen = true;
  /** Izmišljena lozinka koju mok prihvata za korisnika `nastavnik`. */
  static readonly LOZINKA = 'lozinka-za-e2e';
  /**
   * Kolačić studenta `gfs_student` (javna ruta `/nalog`): `false` dok se student ne prijavi kodom {@link MockApi.KOD_NALOGA}
   * za indeks iz `podaci.nalogStudenta`. Nezavisan od sesije nastavnika. Isti kolačić kao `podaci.prijavljenStudent` (uživo,
   * bodovan run): prijava kodom upisuje ime studenta iz `nalogStudenta`, odjava `null`, pa se oba pogleda nikad ne razilaze.
   */
  get studentPrijavljen(): boolean {
    return this.podaci.prijavljenStudent !== null;
  }
  set studentPrijavljen(da: boolean) {
    const n = this.podaci.nalogStudenta;
    this.podaci.prijavljenStudent = da ? `${n.ime} ${n.prezime}` : null;
  }
  /** Jedini kod koji mok prihvata pri prijavi studenta (kao da je stigao mejlom). */
  static readonly KOD_NALOGA = '246810';
  /** Kod koji vraća `kod-za-diktiranje` (izmišljen). */
  static readonly KOD_DIKTIRAN = '135790';
  /**
   * Kolačić `__Host-gfs_lti_par` (ulazak iz Moodle-a bez veze, 30 min): `POST public/lti/povezi` ga troši; bez njega 410 kao
   * server. Podrazumevano postoji (stranica `/nalog/moodle` posle preusmerenja).
   */
  moodlePar = true;
  /** Ime Moodle naloga iz ulaska (`GET public/lti/povezivanje`); `null` = Moodle ga nije podelio. Izmišljeno, nije stvaran nalog. */
  moodleIme: string | null = 'Pera Test';
  /**
   * Čekiranje (studentski portal, faza 1). Projektor dobija nov token na svaki `GET predavanja/:id/cekiranje` (kao server
   * na 10 s, ovde odmah, da test vidi promenu bez čekanja), `cekirani` vraća taj isti upit. Student: `skeniraj` bez sesije
   * daje ključ čekanja (`kljucevi`), sa sesijom upisuje `predavanjeId`; `izvodjenje` test postavlja kad "pokrene" prezentaciju.
   * `uToku`: današnje predavanje studentove grupe u toku (test ga postavlja); server ga šalje samo kad student nije na živom
   * času, pa ga mok tada i vraća.
   */
  readonly cekiranje = {
    tokena: 0,
    cekirani: [] as { studentId: number; ime: string; prezime: string; indeks: string; vreme: string; kasnio: boolean; istiTelefonKao: number | null }[],
    predavanjeId: null as number | null,
    cekiranU: null as string | null,
    izvodjenje: null as { kod: string; naziv: string } | null,
    uToku: null as { predmet: string | null; tema: string | null } | null,
    kljucevi: new Set<string>(),
  };
  /**
   * Raspored časova i najave odsustva (`mock-raspored.ts`). Podrazumevano prazan (nijedan period), pa Početna i `/nalog`
   * izgledaju kao ranije; spec ga puni sa `mock.raspored.primer()`. Obaveštenje `MNOGO_NAJAVA` ide u `podaci.obavestenja`
   * jednom po terminu (ključ kao na serveru, samo u moku), a otkazivanje termina ga rešava.
   */
  readonly raspored = new MockRaspored({
    predmet: id => this.predmet(id),
    grupa: id => this.grupa(id),
    studenti: () => this.podaci.studenti,
    predavanje: (predmetId, grupaId, datum) =>
      this.podaci.predavanja.filter(p => p.predmetId === predmetId && p.grupaId === grupaId && p.datum === datum)
        .reduce<number | null>((max, p) => (max === null || p.id > max ? p.id : max), null),
    mnogoNajava: (kljuc, podaci) => {
      if (this.kljuceviObavestenja.has(kljuc)) {
        return;
      }
      const id = this.sledeciId++;
      this.kljuceviObavestenja.set(kljuc, id);
      this.podaci.obavestenja.push({
        id, vrsta: 'MNOGO_NAJAVA', studentId: null, studentIme: null, indeks: null, podaci, kreirano: lokalnoVreme(new Date()),
        procitano: null, reseno: null,
      });
    },
    resiPoKljucu: kljuc => {
      const o = this.podaci.obavestenja.find(x => x.id === this.kljuceviObavestenja.get(kljuc));
      if (o) {
        o.reseno ??= lokalnoVreme(new Date());
      }
    },
  });
  /** Ključ obaveštenja (`MNOGO_NAJAVA:<stavka>:<datum>`) -> id; server ga drži u koloni `kljuc`, API ga ne vraća. */
  private readonly kljuceviObavestenja = new Map<string, number>();
  private readonly zamene: Ruta[] = [];
  private readonly rute: Ruta[];
  private sledeciId = 10_000;

  constructor() {
    this.rute = this.podrazumevaneRute();
  }

  /** Zamena odgovora za jednu rutu (ima prednost pred podrazumevanom; poslednja dodata prva). */
  na(metod: string, sablon: string, rukovalac: Rukovalac): void {
    this.zamene.unshift(napraviRutu(metod, sablon, rukovalac));
  }

  /** Zadržava odgovor sledećeg zahteva na ruti dok test ne pozove `pusti()` (posle toga ruta radi normalno). */
  zadrzi(metod: string, sablon: string): Zadrzan {
    let javiStigao!: (z: Zahtev) => void;
    let pusti!: () => void;
    const stigao = new Promise<Zahtev>(r => (javiStigao = r));
    const pusten = new Promise<void>(r => (pusti = r));
    let iskoriscen = false;
    this.na(metod, sablon, async (z, _p, dalje) => {
      if (iskoriscen) {
        return dalje();
      }
      iskoriscen = true;
      javiStigao(z);
      await pusten;
      return dalje();
    });
    return { stigao, pusti };
  }

  /** Zahtevi na putanju (tačan string ili regex), opciono samo jedne metode. */
  zahteviZa(putanja: string | RegExp, metod?: string): Zahtev[] {
    return this.zahtevi.filter(
      z => (metod === undefined || z.metod === metod) && (typeof putanja === 'string' ? z.putanja === putanja : putanja.test(z.putanja)),
    );
  }

  /**
   * Brojač zahteva `GET slajdovi/:id/potezi` za jedan slajd (projektor i konzola traže poteze jednom po slajdu, pa
   * posle greške tek za 10 s; plan faze 5 odluka 8). Broji i zahteve na koje je test odgovorio zamenom (`na`).
   */
  brojZahtevaPoteza(slajdId: number): number {
    return this.zahteviZa(`slajdovi/${slajdId}/potezi`, 'GET').length;
  }

  async instaliraj(page: Page): Promise<void> {
    // okruženje (Dockerfile ga pravi u slici; lokalni dist ga nema): bez oznake STAGING
    await page.route('**/assets/env.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"env":"prod"}' }));
    await page.route('**/api/**', (route, request) => this.obradi(route, request));
    // slike slojeva platna: jedan providan piksel za svaki medij, a za SVG rendera banke njegov (probni) SVG (ruta je kasnije
    // dodata, pa ima prednost pred `api/**`)
    await page.route('**/api/public/mediji/*', route => {
      const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
      const svg = this.banka.svgovi.get(id);
      return svg === undefined
        ? route.fulfill({ status: 200, contentType: 'image/png', body: PIKSEL_PNG })
        : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
    });
  }

  private async obradi(route: Route, request: Request): Promise<void> {
    const url = new URL(request.url());
    const i = url.pathname.indexOf('/api/');
    const putanja = url.pathname.slice(i + '/api/'.length);
    let telo: unknown;
    try {
      telo = request.postDataJSON();
    } catch {
      telo = request.postData();
    }
    const z: Zahtev = { metod: request.method(), putanja, query: url.searchParams, telo, rb: this.zahtevi.length };
    this.zahtevi.push(z);

    const izbor = pogodi(this.zamene, z) ?? pogodi(this.rute, z);
    let odgovor: Odgovor;
    if (!this.prijavljen && trazeSesiju(putanja)) {
      odgovor = greska(401, 'Potrebna je prijava.');
    } else if (!izbor) {
      this.nepoznati.push(`${z.metod} api/${putanja}${url.search}`);
      odgovor = greska(404, 'Mok nema ovu rutu.');
    } else {
      const podrazumevano = pogodi(this.rute, z);
      const dalje = async (): Promise<Odgovor> =>
        podrazumevano ? podrazumevano.ruta.rukovalac(z, podrazumevano.p, () => Promise.resolve(greska(404, 'Nema.'))) : greska(404, 'Nema.');
      odgovor = await izbor.ruta.rukovalac(z, izbor.p, dalje);
    }
    const status = odgovor.status ?? 200;
    try {
      await route.fulfill(
        status === 204 || odgovor.telo === undefined
          ? { status }
          : { status, contentType: 'application/json', body: JSON.stringify(odgovor.telo) },
      );
    } catch {
      // stranica je zatvorena dok je odgovor čekao (kraj testa): nema kome da se odgovori
    }
  }

  // -------------------------------------------------------------------------------------------- DTO-i

  private predmet(id: number | null): Predmet | null {
    return this.podaci.predmeti.find(p => p.id === id) ?? null;
  }

  private grupa(id: number | null) {
    const g = this.podaci.grupe.find(x => x.id === id);
    return g ? { id: g.id, naziv: g.naziv, godinaUpisa: g.godinaUpisa, brojStudenata: this.studentiGrupe(g.id).length } : null;
  }

  private student(id: number): Student | undefined {
    return this.podaci.studenti.find(s => s.id === id);
  }

  private studentiGrupe(grupaId: number): Student[] {
    return this.podaci.studenti.filter(s => s.grupaId === grupaId);
  }

  private studentListItem(s: Student) {
    return {
      id: s.id, ime: s.ime, prezime: s.prezime, indeks: s.indeks, godina: s.godina, email: s.email,
      brojTelefona: s.brojTelefona, grupa: this.grupa(s.grupaId),
    };
  }

  private studentInfo(s: Student) {
    return {
      id: s.id, ime: s.ime, prezime: s.prezime, godina: s.godina ?? 0, indeks: s.indeks, brojTelefona: s.brojTelefona,
      email: s.email, datumRodjenja: s.datumRodjenja, opstina: s.opstina,
    };
  }

  private tipTesta(id: number) {
    const t = this.podaci.tipoviTesta.find(x => x.id === id);
    return t ? { id: t.id, naziv: t.naziv, aktivan: t.aktivan } : null;
  }

  private predavanjeListItem(p: Predavanje) {
    const uGrupi = new Set(p.grupaId === null ? [] : this.studentiGrupe(p.grupaId).map(s => s.id));
    const prisutni = new Set(p.aktivnosti.map(a => a.studentId));
    return {
      id: p.id, rb: p.rb, datum: p.datum, tema: p.tema, zavrseno: p.zavrseno, predmet: this.predmet(p.predmetId),
      grupa: this.grupa(p.grupaId), brojPrisutnih: prisutni.size,
      brojStarijihPrisutnih: p.grupaId === null ? 0 : [...prisutni].filter(id => !uGrupi.has(id)).length,
      brojStudenata: uGrupi.size,
    };
  }

  private predavanjeDetails(p: Predavanje) {
    const g = this.grupa(p.grupaId);
    return {
      id: p.id, rb: p.rb, datum: p.datum, tema: p.tema, posecenost: p.posecenost,
      grupa: g ? { id: g.id, naziv: g.naziv, godinaUpisa: g.godinaUpisa } : null,
      predmet: { id: p.predmetId, naziv: this.predmet(p.predmetId)?.naziv ?? '' },
      aktivnosti: p.aktivnosti.map(a => {
        const s = this.student(a.studentId);
        return { id: a.id, student: { id: a.studentId, ime: s?.ime ?? '', prezime: s?.prezime ?? '', indeks: s?.indeks ?? '' }, tip: a.tip, napomene: a.napomene };
      }),
      zavrseno: p.zavrseno,
    };
  }

  private prolazi(t: Test, p: Polaganje): boolean {
    return t.pragProlaza !== null && !p.prepisivao && (p.ostvareniPoeni ?? -1) >= t.pragProlaza;
  }

  private testListItem(t: Test) {
    const saPoenima = t.polaganja.filter(p => p.ostvareniPoeni !== null);
    const prosek = saPoenima.length ? saPoenima.reduce((z, p) => z + (p.ostvareniPoeni ?? 0), 0) / saPoenima.length : null;
    return {
      id: t.id, datum: t.datum, tipTesta: this.tipTesta(t.tipTestaId), maxPoena: t.maxPoena, pragProlaza: t.pragProlaza,
      pregledan: t.pregledan, predmet: this.predmet(t.predmetId), grupa: this.grupa(t.grupaId), brojPolaganja: t.polaganja.length,
      prosek,
      procenatProlaznosti: t.pragProlaza === null || !saPoenima.length
        ? null
        : (saPoenima.filter(p => this.prolazi(t, p)).length * 100) / saPoenima.length,
    };
  }

  private testDetails(t: Test, saStatistikom: boolean) {
    const poeni = t.polaganja.map(p => p.ostvareniPoeni).filter((p): p is number => p !== null);
    const prosek = poeni.length ? poeni.reduce((a, b) => a + b, 0) / poeni.length : null;
    const polozilo = t.polaganja.filter(p => p.ostvareniPoeni !== null && this.prolazi(t, p)).length;
    return {
      id: t.id, tipTesta: this.tipTesta(t.tipTestaId), predmet: this.predmet(t.predmetId), grupa: this.grupa(t.grupaId),
      datum: t.datum, maxPoena: t.maxPoena, pragProlaza: t.pragProlaza, pregledan: t.pregledan, grupe: t.grupe,
      polaganja: t.polaganja.map(p => {
        const s = this.student(p.studentId);
        return {
          id: p.id, student: s ? this.studentInfo(s) : null, grupa: p.grupa, ostvareniPoeni: p.ostvareniPoeni,
          prepisivao: p.prepisivao, napomene: p.napomene,
        };
      }),
      statistika: saStatistikom
        ? {
            ukupnoPolaganja: poeni.length,
            prosecniPoeni: prosek,
            minPoeni: poeni.length ? Math.min(...poeni) : null,
            maxPoeni: poeni.length ? Math.max(...poeni) : null,
            standardnaDevijacija: prosek === null ? null : Math.sqrt(poeni.reduce((z, p) => z + (p - prosek) ** 2, 0) / poeni.length),
            brojPolozenih: t.pragProlaza === null || !poeni.length ? null : polozilo,
            brojPalih: t.pragProlaza === null || !poeni.length ? null : poeni.length - polozilo,
            procenatProlaznosti: t.pragProlaza === null || !poeni.length ? null : (polozilo * 100) / poeni.length,
            statistikaPoGrupi: [],
          }
        : null,
    };
  }

  private domaciListItem(d: Domaci) {
    const p = this.podaci.predavanja.find(x => x.id === d.predavanjeId);
    return {
      id: d.id, naslov: d.naslov, datum: d.datum, pregledan: d.pregledan, predmet: this.predmet(d.predmetId), grupa: this.grupa(d.grupaId),
      predavanje: p ? { id: p.id, rb: p.rb } : null,
      brojUradjenih: d.uradjeni.filter(u => !u.oslobodjen).length,
      brojStudenata: d.grupaId === null ? 0 : this.studentiGrupe(d.grupaId).length,
    };
  }

  private domaciDetails(d: Domaci) {
    const p = this.podaci.predavanja.find(x => x.id === d.predavanjeId);
    const g = this.grupa(d.grupaId);
    return {
      id: d.id, predmet: this.predmet(d.predmetId), naslov: d.naslov, text: d.text, datum: d.datum, pregledan: d.pregledan,
      grupa: g ? { id: g.id, naziv: g.naziv, godinaUpisa: g.godinaUpisa } : null,
      predavanje: p ? { id: p.id, rb: p.rb, tema: p.tema, datum: p.datum } : null,
      studenti: (d.grupaId === null ? [] : this.studentiGrupe(d.grupaId)).map(s => {
        const u = d.uradjeni.find(x => x.studentId === s.id);
        const a = p?.aktivnosti.find(x => x.studentId === s.id);
        return {
          studentId: s.id, domaciId: d.id, ime: s.ime, prezime: s.prezime, indeks: s.indeks, godina: s.godina,
          tip: a?.tip ?? null, predavanjaNapomene: a?.napomene ?? null, uradjenDomaciId: u?.id ?? null, bodovi: u?.bodovi ?? null,
          uradjenDomaciNapomene: u?.napomene ?? null, prepisivanje: u?.prepisivanje ?? null, oslobodjen: u?.oslobodjen ?? null,
        };
      }),
    };
  }

  /** Rok sesije je uvek u budućnosti (relativno na danas), pa je sesija iz fiksture otvorena bez obzira na datum testa. */
  private istice(s: Sesija): string {
    const d = new Date(Date.now() + s.isticeZaDana * 86_400_000);
    return lokalnoVreme(d);
  }

  private sesijaInfo(s: Sesija) {
    const prijave = this.podaci.prijave.filter(p => p.sesijaId === s.id);
    const otvorena = s.aktivna && s.isticeZaDana > 0 && prijave.length < s.maxPrijava;
    return {
      id: s.id, token: s.token, grupa: this.grupa(s.grupaId), aktivna: s.aktivna, otvorena, kreirano: s.kreirano, istice: this.istice(s),
      maxPrijava: s.maxPrijava, brojPrijava: prijave.length, brojNaCekanju: prijave.filter(p => p.status === 'NA_CEKANJU').length,
      napomena: s.napomena,
    };
  }

  private grupaPregled(g: Grupa) {
    const studenti = this.studentiGrupe(g.id);
    const predavanja = this.podaci.predavanja.filter(p => p.grupaId === g.id);
    const otvorena = this.podaci.sesije.map(s => this.sesijaInfo(s)).find(s => s.grupa?.id === g.id && s.otvorena) ?? null;
    const prisutnost = predavanja.length && studenti.length
      ? predavanja.reduce((z, p) => z + p.aktivnosti.filter(a => studenti.some(s => s.id === a.studentId)).length, 0) / (predavanja.length * studenti.length)
      : null;
    return {
      grupa: this.grupa(g.id),
      brojStudenata: studenti.length,
      brojPredavanja: predavanja.length,
      prosecnaPrisutnost: prisutnost,
      waLink: g.waLink ?? null,
      otvorenOnboarding: otvorena
        ? { id: otvorena.id, token: otvorena.token, istice: otvorena.istice, brojPrijava: otvorena.brojPrijava, brojNaCekanju: otvorena.brojNaCekanju, maxPrijava: otvorena.maxPrijava }
        : null,
      studenti: studenti.map(s => {
        const poslednji = this.podaci.testovi
          .filter(t => t.polaganja.some(p => p.studentId === s.id))
          .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))[0];
        const pol = poslednji?.polaganja.find(p => p.studentId === s.id);
        const domaci = this.podaci.domaci.filter(d => d.grupaId === g.id);
        return {
          student: this.studentInfo(s),
          prisutan: predavanja.filter(p => p.aktivnosti.some(a => a.studentId === s.id)).length,
          predavanja: predavanja.length,
          domaciUradjeno: domaci.filter(d => d.uradjeni.some(u => u.studentId === s.id)).length,
          domaciUkupno: domaci.length,
          poslednjiTest: poslednji && pol
            ? { testId: poslednji.id, tip: this.tipTesta(poslednji.tipTestaId)?.naziv ?? null, datum: poslednji.datum, poeni: pol.ostvareniPoeni, maxPoena: poslednji.maxPoena }
            : null,
        };
      }),
    };
  }

  private studentPregled(s: Student) {
    return {
      id: s.id, ime: s.ime, prezime: s.prezime, godina: s.godina, indeks: s.indeks, brojTelefona: s.brojTelefona, email: s.email,
      datumRodjenja: s.datumRodjenja, opstina: s.opstina, grupa: this.grupa(s.grupaId)?.naziv ?? null, grupaId: s.grupaId,
      aktivnosti: this.podaci.predavanja.flatMap(p =>
        p.aktivnosti.filter(a => a.studentId === s.id).map(a => ({ id: a.id, predavanjeId: p.id, tip: a.tip, napomene: a.napomene, datum: p.datum, tema: p.tema })),
      ),
      uradjeniDomaci: this.podaci.domaci.flatMap(d =>
        d.uradjeni.filter(u => u.studentId === s.id).map(u => ({
          id: u.id, domaciId: d.id, bodovi: u.bodovi, napomene: u.napomene, prepisivanje: u.prepisivanje, oslobodjen: u.oslobodjen, datum: d.datum, naslov: d.naslov,
        })),
      ),
      polaganja: this.podaci.testovi.flatMap(t =>
        t.polaganja.filter(p => p.studentId === s.id).map(p => ({
          id: p.id, testId: t.id, ostvareniPoeni: p.ostvareniPoeni, pragProlaza: t.pragProlaza,
          polozeno: t.pragProlaza === null || p.ostvareniPoeni === null ? null : this.prolazi(t, p),
          prepisivao: p.prepisivao, napomene: p.napomene, datum: t.datum, tipTesta: this.tipTesta(t.tipTestaId),
        })),
      ),
    };
  }

  private studentKartice(s: Student) {
    const predmetIds = new Set([
      ...this.podaci.predavanja.filter(p => p.aktivnosti.some(a => a.studentId === s.id) || p.grupaId === s.grupaId).map(p => p.predmetId),
      ...this.podaci.testovi.filter(t => t.polaganja.some(p => p.studentId === s.id)).map(t => t.predmetId),
    ]);
    return [...predmetIds].map(pid => {
      const predavanja = this.podaci.predavanja.filter(p => p.predmetId === pid && p.grupaId === s.grupaId);
      const aktivnosti = this.podaci.predavanja.filter(p => p.predmetId === pid).flatMap(p => p.aktivnosti.filter(a => a.studentId === s.id));
      const domaci = this.podaci.domaci.filter(d => d.predmetId === pid && d.grupaId === s.grupaId);
      const uradjeni = domaci.flatMap(d => d.uradjeni.filter(u => u.studentId === s.id));
      const testovi = this.podaci.testovi.filter(t => t.predmetId === pid && t.polaganja.some(p => p.studentId === s.id));
      return {
        predmet: this.predmet(pid),
        prisutan: aktivnosti.length,
        predavanja: predavanja.length,
        zadaci: aktivnosti.filter(a => a.tip === 'ZADATAK').length,
        zvezdice: aktivnosti.filter(a => a.tip === 'SA_ZVEZDICOM').length,
        domaciUradjeno: uradjeni.length,
        domaciUkupno: domaci.length,
        domaciProsek: uradjeni.length ? uradjeni.reduce((z, u) => z + (u.bodovi ?? 0), 0) / uradjeni.length : null,
        testovi: testovi.map(t => ({ tipTesta: this.tipTesta(t.tipTestaId), ostvarenoPoena: t.polaganja.find(p => p.studentId === s.id)?.ostvareniPoeni ?? null })),
        ukupno: 42.5,
        predlogOcene: null,
        doSledeceOcene: 8.5,
      };
    });
  }

  /**
   * `SlajdDetails` iz `SlajdCmd` (kao `SlajdMapper.uDetails`): `slika` je otpremljen medij sa `slikaId` (ili null),
   * pitanje dobija id-jeve (svoj i opcija) i redne brojeve opcija.
   */
  private slajdIzCmd(cmd: SlajdCmd, id: number): UzivoSlajd {
    const medij = (medijId: string | null) => this.mediji.find(m => m.id === medijId) ?? null;
    const { slikaId, ...q } = cmd.pitanje ?? { slikaId: null };
    return {
      id, rb: 0, tip: cmd.tip, naslov: cmd.naslov, sadrzaj: cmd.sadrzaj, slika: medij(cmd.slikaId), beleske: cmd.beleske,
      postepeno: cmd.postepeno, platno: cmd.platno, prelaz: normalizujPrelaz(cmd.prelaz), zadatak: zadatakIzCmd(cmd),
      pitanje: cmd.pitanje
        ? {
            ...q, id: this.sledeciId++, slika: medij(slikaId),
            opcije: cmd.pitanje.opcije.map((o, i) => ({ id: this.sledeciId++, rb: i + 1, tekst: o.tekst, tacna: o.tacna })),
          }
        : null,
    };
  }

  /** Slajd kako ga server šalje: ZADATAK dobija opis grupe nad trenutnim stanjem banke (`ZadaciSlajdova`, pri svakom čitanju). */
  private slajdOdgovor(s: UzivoSlajd): unknown {
    if (s.tip !== 'ZADATAK') return s;
    return { ...s, zadatak: this.banka.zadatakSlajda(s.zadatak ?? { grupaId: null, vremeSekunde: null, brojVarijanti: null, nivo: null }) };
  }

  private prezentacijaOdgovor(x: UzivoPrezentacija): unknown {
    return { ...x, ...this.redosledPrezentacije(x), slajdovi: x.slajdovi.map(s => this.slajdOdgovor(s)) };
  }

  /** Kao server (V21): `vezba` se čuva, vrsta i broj zadataka se računaju iz slajdova, puštanje iz izvođenja. */
  private redosledPrezentacije(x: UzivoPrezentacija) {
    const pitanja = x.slajdovi.filter(s => s.tip === 'PITANJE' || s.tip === 'ZADATAK').length;
    const zadaci = x.slajdovi.filter(s => s.tip === 'ZADATAK').length;
    const vrsta: VrstaPrezentacije = zadaci > 0 ? 'ZADACI' : pitanja > 0 ? 'PITANJA' : 'GRADIVO';
    const pocetci = this.izvodjenjaPredavanja.filter(i => i.prezentacija.id === x.id).map(i => i.pocetak).sort();
    return {
      vezba: (x['vezba'] as number | null | undefined) ?? null, vrsta, brojZadataka: zadaci,
      kreirano: (x['kreirano'] as string | undefined) ?? (x['izmenjeno'] as string | undefined) ?? '2026-10-01T10:00:00',
      poslednjePustanje: (x['poslednjePustanje'] as string | null | undefined) ?? pocetci.at(-1) ?? null,
    };
  }

  private kontrolnaTabla() {
    const k = this.podaci.kontrolnaTabla;
    const g = this.grupa(k.sledece.grupaId);
    const ponedeljak = new Date();
    ponedeljak.setDate(ponedeljak.getDate() - ((ponedeljak.getDay() + 6) % 7));
    const nezavrsena = this.podaci.predavanja.filter(p => !p.zavrseno);
    const testovi = this.podaci.testovi.filter(t => !t.pregledan);
    const domaci = this.podaci.domaci.filter(d => !d.pregledan);
    const prijave = this.podaci.sesije
      .map(s => this.sesijaInfo(s))
      .filter(s => s.otvorena && s.brojNaCekanju > 0)
      .map(s => ({ sesijaId: s.id, grupa: s.grupa, brojNaCekanju: s.brojNaCekanju, istice: s.istice }));
    // predlog iz rasporeda (spec najave odsustva 8) kad neki period pokriva danas, inače kao ranije iz fiksture
    const izRasporeda = this.raspored.sledece();
    const sg = izRasporeda ? this.grupa(izRasporeda.grupaId) : g;
    const sledece = izRasporeda
      ? {
        predmet: this.predmet(izRasporeda.predmetId), grupa: sg, rb: k.sledece.rb, brojStudenata: sg?.brojStudenata ?? 0,
        brojStarijih: 0, termin: izRasporeda.termin, izvor: izRasporeda.izvor,
      }
      : { predmet: this.predmet(k.sledece.predmetId), grupa: g, rb: k.sledece.rb, brojStudenata: g?.brojStudenata ?? 0, brojStarijih: k.sledece.brojStarijih };
    const raspored = this.raspored.tabla();
    return {
      sledece,
      ...(raspored ? { raspored } : {}),
      uToku: [],
      ceka: {
        testovi: testovi.map(t => this.testListItem(t)),
        domaci: domaci.map(d => this.domaciListItem(d)),
        prijave,
        nezavrsena: nezavrsena.map(p => this.predavanjeListItem(p)),
        brojTestova: testovi.length,
        brojDomacih: domaci.length,
        brojPrijava: prijave.reduce((z, p) => z + p.brojNaCekanju, 0),
        brojNezavrsenih: nezavrsena.length,
      },
      nedelja: k.nedelja.map(n => {
        const dan = new Date(ponedeljak);
        dan.setDate(ponedeljak.getDate() + n.danUNedelji - 1);
        return { tip: n.tip, id: n.id, datum: lokalniDatum(dan), naslov: n.naslov, predmet: this.predmet(n.predmetId), grupa: this.grupa(n.grupaId) };
      }),
    };
  }

  // -------------------------------------------------------------------------------------------- rute

  private podrazumevaneRute(): Ruta[] {
    const d = this.podaci;
    const r: Ruta[] = [];
    const get = (s: string, h: Rukovalac) => r.push(napraviRutu('GET', s, h));
    const post = (s: string, h: Rukovalac) => r.push(napraviRutu('POST', s, h));
    const patch = (s: string, h: Rukovalac) => r.push(napraviRutu('PATCH', s, h));
    const put = (s: string, h: Rukovalac) => r.push(napraviRutu('PUT', s, h));
    const del = (s: string, h: Rukovalac) => r.push(napraviRutu('DELETE', s, h));
    const ok = (telo: unknown): Odgovor => ({ telo });
    const nadji = <T extends { id: number }>(lista: T[], id: string, sta: string): T | Odgovor =>
      lista.find(x => x.id === Number(id)) ?? greska(404, `${sta} ne postoji.`);
    const jeOdgovor = (x: unknown): x is Odgovor => typeof x === 'object' && x !== null && 'status' in x;

    // sesija nastavnika (`api/auth/*`); prijava prima samo `nastavnik` / `MockApi.LOZINKA`
    get('auth/ja', () => (this.prijavljen ? ok({ uloga: 'NASTAVNIK', korisnik: 'nastavnik' }) : greska(401, 'Potrebna je prijava.')));
    post('auth/prijava', z => {
      const telo = z.telo as { korisnik?: unknown; lozinka?: unknown } | null;
      if (telo?.korisnik !== 'nastavnik' || telo.lozinka !== MockApi.LOZINKA) {
        return greska(401, 'Pogrešno korisničko ime ili lozinka.');
      }
      this.prijavljen = true;
      return { status: 204 };
    });
    post('auth/odjava', () => {
      this.prijavljen = false;
      return { status: 204 };
    });
    // prijavljeni uređaji nastavnika (meni korisnika); odjava ovog uređaja ide kroz `auth/odjava`
    get('auth/sesije', () => ok(d.sesijeNastavnika));
    del('auth/sesije/:id', (_z, p) => {
      const s = nadji(d.sesijeNastavnika, p['id'], 'Sesija');
      if (jeOdgovor(s)) {
        return s;
      }
      d.sesijeNastavnika = d.sesijeNastavnika.filter(x => x.id !== s.id);
      return { status: 204 };
    });
    post('auth/sesije/odjavi-sve', () => {
      const pre = d.sesijeNastavnika.length;
      d.sesijeNastavnika = d.sesijeNastavnika.filter(x => x.trenutna);
      return ok({ odjavljeno: pre - d.sesijeNastavnika.length });
    });

    // obaveštenja za nastavnika (spec prijave, sekcija 6): otvorena = nerešena; najnovija prva
    const otvorenaObavestenja = () => d.obavestenja.filter(o => o.reseno === null);
    get('obavestenja', z => {
      const lista = (z.query.get('stanje') === 'sva' ? [...d.obavestenja] : otvorenaObavestenja())
        .sort((a, b) => b.kreirano.localeCompare(a.kreirano));
      return strana(lista, z.query);
    });
    get('obavestenja/broj', () => {
      const otvorena = otvorenaObavestenja();
      return ok({ neprocitana: otvorena.filter(o => o.procitano === null).length, otvorena: otvorena.length });
    });
    post('obavestenja/procitaj-sve', () => {
      const neprocitana = d.obavestenja.filter(o => o.procitano === null);
      neprocitana.forEach(o => (o.procitano = lokalnoVreme(new Date())));
      return ok({ procitano: neprocitana.length });
    });
    post('obavestenja/:id/procitano', (_z, p) => {
      const o = nadji(d.obavestenja, p['id'], 'Obaveštenje');
      if (jeOdgovor(o)) {
        return o;
      }
      o.procitano ??= lokalnoVreme(new Date());
      return { status: 204 };
    });
    post('obavestenja/:id/reseno', (_z, p) => {
      const o = nadji(d.obavestenja, p['id'], 'Obaveštenje');
      if (jeOdgovor(o)) {
        return o;
      }
      o.reseno ??= lokalnoVreme(new Date());
      return { status: 204 };
    });

    // predmeti, grupe, tipovi testa
    get('predmeti', () => ok(d.predmeti));
    get('predmeti/:id', (_z, p) => {
      const x = nadji(d.predmeti, p['id'], 'Predmet');
      return jeOdgovor(x) ? x : ok(x);
    });
    get('predmeti/:id/tipovi', (z, p) =>
      ok(d.tipoviTesta.filter(t => t.predmetId === Number(p['id']) && (t.aktivan || z.query.get('svi') === 'true')).map(t => this.tipTesta(t.id))),
    );
    get('grupe', () => ok(d.grupe.map(g => this.grupa(g.id))));
    get('grupe/:id', (_z, p) => {
      const g = nadji(d.grupe, p['id'], 'Grupa');
      if (jeOdgovor(g)) {
        return g;
      }
      return ok({ ...this.grupa(g.id), studenti: this.studentiGrupe(g.id).map(s => this.studentInfo(s)) });
    });
    get('grupe/:id/pregled', (_z, p) => {
      const g = nadji(d.grupe, p['id'], 'Grupa');
      return jeOdgovor(g) ? g : ok(this.grupaPregled(g));
    });
    patch('grupe/:id/wa-link', (z, p) => {
      const g = nadji(d.grupe, p['id'], 'Grupa');
      if (jeOdgovor(g)) {
        return g;
      }
      const unos = ((z.telo as { waLink?: string | null } | null)?.waLink ?? '').trim();
      // isto pravilo kao WaLink na serveru (skraćeno): kanonski oblik ili 400
      const m = /^(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})\/?(?:[?#].*)?$/i.exec(unos);
      if (unos && !m) {
        return greska(400, 'Link mora biti poziv u WhatsApp grupu (https://chat.whatsapp.com/...). U WhatsApp-u: Info grupe → Pozovi putem linka.');
      }
      g.waLink = m ? `https://chat.whatsapp.com/${m[1]}` : null;
      return ok({ waLink: g.waLink });
    });
    get('grupe/:id/prisustvo', (z, p) => {
      const predmetId = Number(z.query.get('predmetId'));
      const predavanja = d.predavanja.filter(x => x.grupaId === Number(p['id']) && x.predmetId === predmetId);
      return ok({
        predavanja: predavanja.map(x => ({ id: x.id, rb: x.rb, datum: x.datum, tema: x.tema })),
        studenti: this.studentiGrupe(Number(p['id'])).map(s => ({
          student: this.studentInfo(s),
          tip: Object.fromEntries(predavanja.flatMap(x => x.aktivnosti.filter(a => a.studentId === s.id).map(a => [String(x.id), a.tip]))),
        })),
      });
    });
    get('grupe/:id/onboarding', (_z, p) => ok(d.sesije.filter(s => s.grupaId === Number(p['id'])).map(s => this.sesijaInfo(s))));
    get('onboarding/:id', (_z, p) => {
      const s = nadji(d.sesije, p['id'], 'Sesija');
      return jeOdgovor(s) ? s : ok({ sesija: this.sesijaInfo(s), prijave: d.prijave.filter(x => x.sesijaId === s.id).map(bezKljuca('sesijaId')), poruka: null });
    });

    // predavanja
    get('predavanja/pretraga', z => {
      const q = z.query;
      const lista = d.predavanja
        .filter(p => !q.has('predmetId') || p.predmetId === Number(q.get('predmetId')))
        .filter(p => !q.has('grupaId') || p.grupaId === Number(q.get('grupaId')))
        .filter(p => !q.has('zavrseno') || String(p.zavrseno) === q.get('zavrseno'))
        .filter(p => !q.has('q') || (p.tema ?? '').toLowerCase().includes((q.get('q') ?? '').toLowerCase()))
        .sort(poSortu(q.get('sort'), 'datum,desc'));
      return strana(lista.map(p => this.predavanjeListItem(p)), q);
    });
    get('predavanja/:id', (_z, p) => {
      const x = nadji(d.predavanja, p['id'], 'Predavanje');
      return jeOdgovor(x) ? x : ok(this.predavanjeDetails(x));
    });
    // čekiranje (nastavnik: projektor, stranica predavanja, Uživo QR): token se menja na svaki upit, završeno nema token
    get('predavanja/:id/cekiranje', (_z, p) => {
      const x = nadji(d.predavanja, p['id'], 'Predavanje');
      if (jeOdgovor(x)) {
        return x;
      }
      const c = this.cekiranje;
      const token = x.zavrseno ? null : `${x.id}.${String(++c.tokena).padStart(22, 'T')}`;
      return ok({ token, vaziDoMs: token ? Date.now() + 20_000 : null, serverVremeMs: Date.now(), datumNijeDanas: false, cekirani: c.cekirani });
    });
    const aktivnost = (izmeni: (p: Predavanje, sId: number) => Odgovor | null): Rukovalac => (z, p) => {
      const x = nadji(d.predavanja, p['id'], 'Predavanje');
      if (jeOdgovor(x)) {
        return x;
      }
      const sId = Number(p['sid'] ?? (z.telo as { id?: number } | null)?.id);
      if (!this.student(sId)) {
        return greska(404, 'Student ne postoji.');
      }
      if (x.zavrseno) {
        return greska(400, 'Predavanje je završeno.');
      }
      return izmeni(x, sId) ?? ok(this.predavanjeDetails(x));
    };
    const nadjiAkt = (p: Predavanje, sId: number) => p.aktivnosti.find(a => a.studentId === sId);
    patch('predavanja/:id/prisustvo', aktivnost((p, sId) => {
      if (nadjiAkt(p, sId)) {
        return greska(400, 'Student je već prisutan.');
      }
      p.aktivnosti.push({ id: this.sledeciId++, studentId: sId, tip: 'PRISUSTVO', napomene: null });
      return null;
    }));
    const postaviTip = (tip: TipAktivnosti) => (p: Predavanje, sId: number): Odgovor | null => {
      const a = nadjiAkt(p, sId);
      if (!a) {
        return greska(400, 'Student nije prisutan.');
      }
      a.tip = tip;
      return null;
    };
    patch('predavanja/:id/zadatak', aktivnost(postaviTip('ZADATAK')));
    patch('predavanja/:id/zvezdica', aktivnost(postaviTip('SA_ZVEZDICOM')));
    del('predavanja/:id/zadatak/:sid', aktivnost(postaviTip('PRISUSTVO')));
    del('predavanja/:id/prisustvo/:sid', aktivnost((p, sId) => {
      const a = nadjiAkt(p, sId);
      if (!a) {
        return greska(400, 'Student nije prisutan.');
      }
      p.aktivnosti = p.aktivnosti.filter(x => x !== a);
      return null;
    }));

    // testovi
    get('test/pretraga', z => {
      const q = z.query;
      const lista = d.testovi
        .filter(t => !q.has('predmetId') || t.predmetId === Number(q.get('predmetId')))
        .filter(t => !q.has('grupaId') || t.grupaId === Number(q.get('grupaId')))
        .filter(t => !q.has('tipTestaId') || t.tipTestaId === Number(q.get('tipTestaId')))
        .filter(t => !q.has('pregledan') || String(t.pregledan) === q.get('pregledan'))
        .sort(poSortu(q.get('sort'), 'datum,desc'));
      return strana(lista.map(t => this.testListItem(t)), q);
    });
    get('test/:id', (_z, p) => {
      const t = nadji(d.testovi, p['id'], 'Test');
      return jeOdgovor(t) ? t : ok(this.testDetails(t, true));
    });
    patch('test/:id/polaganje', (z, p) => {
      const t = nadji(d.testovi, p['id'], 'Test');
      if (jeOdgovor(t)) {
        return t;
      }
      const cmd = z.telo as { studentId: number; grupa: string; ostvareniPoeni: number; prepisivao: boolean; napomene: string | null };
      const pol = t.polaganja.find(x => x.studentId === cmd.studentId);
      if (!pol) {
        return greska(400, 'Student nije dodat na test.');
      }
      if (cmd.ostvareniPoeni > t.maxPoena || cmd.ostvareniPoeni < 0) {
        return greska(400, `Poeni moraju biti od 0 do ${t.maxPoena}.`);
      }
      Object.assign(pol, { grupa: cmd.grupa, ostvareniPoeni: cmd.ostvareniPoeni, prepisivao: cmd.prepisivao, napomene: cmd.napomene });
      return ok(this.testDetails(t, false));
    });

    // domaći
    get('domaci/pretraga', z => {
      const q = z.query;
      const lista = d.domaci
        .filter(x => !q.has('predmetId') || x.predmetId === Number(q.get('predmetId')))
        .filter(x => !q.has('grupaId') || x.grupaId === Number(q.get('grupaId')))
        .filter(x => !q.has('pregledan') || String(x.pregledan) === q.get('pregledan'))
        .sort(poSortu(q.get('sort'), 'datum,desc'));
      return strana(lista.map(x => this.domaciListItem(x)), q);
    });
    get('domaci/:id', (_z, p) => {
      const x = nadji(d.domaci, p['id'], 'Domaći');
      return jeOdgovor(x) ? x : ok(this.domaciDetails(x));
    });

    // studenti
    get('studenti/pretraga', z => {
      const q = z.query;
      const tekst = (q.get('q') ?? '').toLowerCase().replace(/\s+/g, '');
      const stariji = q.has('starijiOdGrupe') ? this.grupa(Number(q.get('starijiOdGrupe'))) : null;
      if (q.has('starijiOdGrupe') && !stariji) {
        return greska(404, 'Grupa ne postoji.');
      }
      const lista = d.studenti
        .filter(s => !q.has('grupaId') || s.grupaId === Number(q.get('grupaId')))
        .filter(s => !stariji || (this.grupa(s.grupaId)?.godinaUpisa ?? 9999) < (stariji.godinaUpisa ?? 0))
        .filter(s => !tekst || `${s.ime}${s.prezime}${s.prezime}${s.ime}${s.indeks}`.toLowerCase().includes(tekst))
        .sort((a, b) => a.prezime.localeCompare(b.prezime, 'sr') || a.ime.localeCompare(b.ime, 'sr'));
      return strana(lista.map(s => this.studentListItem(s)), q);
    });
    get('studenti/:id', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      return jeOdgovor(s) ? s : ok(this.studentPregled(s));
    });
    put('studenti/:id', (z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      Object.assign(s, z.telo);
      return ok(this.studentInfo(s));
    });
    // sekcija "Nalog" na kartici studenta (spec prijave, 5.3)
    const nalogKartice = (id: number): NalogNaKartici => {
      let n = d.naloziStudenata.find(x => x.studentId === id);
      if (!n) {
        n = { studentId: id, uredjaji: [], moodle: { povezan: false, poslednjiUlaz: null }, poslednjaPrijava: null };
        d.naloziStudenata.push(n);
      }
      return n;
    };
    get('studenti/:id/nalog', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      const n = nalogKartice(s.id);
      return ok({ imaMejl: !!s.email, uredjaji: n.uredjaji, moodle: n.moodle, poslednjaPrijava: n.poslednjaPrijava });
    });
    post('studenti/:id/nalog/posalji-kod', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      if (!s.email) {
        return greska(409, 'Student nema mejl.');
      }
      // kao server: slanje koda sa kartice rešava otvorena obaveštenja "Ne stiže mi kod" tog studenta
      d.obavestenja
        .filter(o => o.studentId === s.id && o.vrsta === 'NE_STIZE_KOD' && o.reseno === null)
        .forEach(o => (o.reseno = lokalnoVreme(new Date())));
      return { status: 204 };
    });
    // kod za diktiranje (plan C): radi i bez mejla, vraća kod jednom i rešava otvorena obaveštenja studenta
    post('studenti/:id/nalog/kod-za-diktiranje', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      d.obavestenja
        .filter(o => o.studentId === s.id && o.reseno === null)
        .forEach(o => (o.reseno = lokalnoVreme(new Date())));
      const istice = lokalnoVreme(new Date(Date.now() + 10 * 60_000));
      const indeks = s.indeks.replace(/\/\d{4}$/u, '');
      const javni = /^GD[1-9]\d{0,2}$/u.test(indeks);
      return ok({
        kod: MockApi.KOD_DIKTIRAN, istice, indeks, godina: s.godina ?? 0,
        upozorenje: javni ? null : 'Indeks studenta nije oblika GD + broj; ispravi ga na kartici pre diktiranja.',
      });
    });
    post('studenti/:id/nalog/opozovi-uredjaje', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      const n = nalogKartice(s.id);
      const opozvano = n.uredjaji.length;
      n.uredjaji = [];
      return ok({ opozvano });
    });
    del('studenti/:id/nalog/moodle', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      if (jeOdgovor(s)) {
        return s;
      }
      const n = nalogKartice(s.id);
      n.moodle = { povezan: false, poslednjiUlaz: null };
      n.uredjaji = n.uredjaji.filter(u => u.nacin !== 'LTI'); // B9: odjavljuju se i uređaji prijavljeni preko Moodle-a
      return { status: 204 };
    });
    get('studenti/:id/predmeti', (_z, p) => {
      const s = nadji(d.studenti, p['id'], 'Student');
      return jeOdgovor(s) ? s : ok(this.studentKartice(s));
    });
    get('studenti/:id/beleske', (_z, p) =>
      ok(d.beleske.filter(b => b.studentId === Number(p['id'])).map(bezKljuca('studentId'))),
    );

    // početna
    get('pregled/kontrolna-tabla', () => ok(this.kontrolnaTabla()));

    // javni upis (jedino što javna ruta sme da zove)
    const sesijaZaToken = (token: string) => d.sesije.find(s => s.token === token);
    get('public/upis/:token', (_z, p) => {
      const s = sesijaZaToken(p['token']);
      if (!s) {
        return greska(404, 'Link za prijavu ne postoji.');
      }
      const info = this.sesijaInfo(s);
      const g = this.grupa(s.grupaId);
      return ok({ grupaNaziv: g?.naziv ?? '', godinaUpisa: g?.godinaUpisa ?? 0, otvorena: info.otvorena, istice: info.istice });
    });
    post('public/upis/:token', (z, p) => {
      const s = sesijaZaToken(p['token']);
      if (!s) {
        return greska(404, 'Link za prijavu ne postoji.');
      }
      const cmd = z.telo as Omit<Prijava, 'id' | 'sesijaId' | 'status' | 'podneto' | 'obradjeno' | 'studentId' | 'napomena'>;
      const prijava: Prijava = {
        ...cmd, id: this.sledeciId++, sesijaId: s.id, status: 'NA_CEKANJU', podneto: lokalnoVreme(new Date()), obradjeno: null,
        studentId: null, napomena: null,
      };
      d.prijave.push(prijava);
      return { status: 201, telo: { id: prijava.id } };
    });

    // uživo, nastavnik (lista i editor prezentacija): lista, nova, brisanje, čitanje, izmena podešavanja (tema...),
    // čuvanje slajda, slike i uvoz slajdova (PowerPoint); nema aktivnih izvođenja
    // izvođenja vezana za predavanje (odeljak "Prezentacije na ovom predavanju"): ostaju u stanju testa, najnovije prvo
    get('izvodjenja', z => {
      const predavanjeId = z.query.get('predavanjeId');
      const status = z.query.get('status');
      return ok(this.izvodjenjaPredavanja
        .filter(i => (predavanjeId === null || i.predavanje?.id === Number(predavanjeId)) && (status === null || i.status === status))
        .sort((a, b) => b.pocetak.localeCompare(a.pocetak) || b.id - a.id));
    });
    // rang tačnosti (bez odgovora u mokovanim podacima: prazni rangovi); predavanje vraća svoja izvođenja sa pitanjima, kao server
    get('izvodjenja/:id/rang', () => ok([]));
    get('predavanja/:id/rang', (_z, p) => ok({
      predavanjeId: Number(p['id']), rang: [],
      izvodjenja: this.izvodjenjaPredavanja.filter(i => i.predavanje?.id === Number(p['id']) && i.brojPitanja > 0),
    }));
    get('studenti/:id/uzivo', () => ok({ ukupno: null, casovi: [] }));
    get('grupe/:id/uzivo', (_z, p) => ok({ grupaId: Number(p['id']), brojCasova: 0, rang: [] }));
    // pokretanje iz ekrana predavanja: kao server, jedno izvođenje u toku po prezentaciji (409), predavanje mora biti iz predmeta prezentacije
    post('prezentacije/:id/izvodjenja', (z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      if (jeOdgovor(x)) {
        return x;
      }
      const cmd = z.telo as { cuvanje: boolean; predavanjeId: number | null };
      if (x.aktivnoIzvodjenjeId != null) {
        return greska(409, 'Prezentacija je već u toku.');
      }
      const pr = cmd.predavanjeId == null ? null : d.predavanja.find(q => q.id === cmd.predavanjeId) ?? null;
      if (cmd.predavanjeId != null && !pr) {
        return greska(404, 'Predavanje nije pronađeno.');
      }
      if (pr && pr.predmetId !== x.predmet.id) {
        return greska(400, 'Predavanje nije iz predmeta ove prezentacije.');
      }
      const id = this.sledeciId++;
      const novo: IzvodjenjeNaPredavanju = {
        id, kod: String(100000 + id), prezentacija: { id: x.id, naziv: x.naziv, predmetId: x.predmet.id }, status: 'AKTIVNO', cuvanje: cmd.cuvanje,
        grupa: pr ? this.grupa(pr.grupaId) : null, predavanje: pr ? { id: pr.id, rb: pr.rb, datum: pr.datum, tema: pr.tema } : null,
        pocetak: lokalnoVreme(new Date()), kraj: null, brojUcesnika: 0, brojPitanja: 0, boduje: false,
      };
      this.izvodjenjaPredavanja.push(novo);
      x.aktivnoIzvodjenjeId = id;
      return { status: 201, telo: novo };
    });
    const info = (x: UzivoPrezentacija) => {
      const { slajdovi, ...ostalo } = x;
      // kao server: slajdovi sa rundama (PITANJE i ZADATAK)
      return {
        ...ostalo, brojSlajdova: slajdovi.length, brojPitanja: slajdovi.filter(s => s.tip === 'PITANJE' || s.tip === 'ZADATAK').length,
        ...this.redosledPrezentacije(x),
      };
    };
    // GET prezentacije/izbor: redosled kao server (RedosledPrezentacija.REDOSLED), predlog za grupu (zaGrupu) ili posle date (posle)
    get('prezentacije/izbor', z => {
      const predmetId = Number(z.query.get('predmetId'));
      const grupaId = z.query.get('grupaId') === null ? null : Number(z.query.get('grupaId'));
      const posle = z.query.get('posle') === null ? null : Number(z.query.get('posle'));
      if (!predmetId) {
        return greska(400, 'Predmet je obavezan.');
      }
      const pusteno = (id: number) => this.izvodjenjaPredavanja
        .filter(i => i.prezentacija.id === id && grupaId !== null && (i.grupa as { id?: number } | null)?.id === grupaId)
        .map(i => i.pocetak).sort().at(-1) ?? null;
      const uToku = (id: number) => d.prezentacije.find(x => x.id === id)?.['aktivnoIzvodjenjeId'] != null;
      const stavke = poVezbama(d.prezentacije.filter(x => x.predmet.id === predmetId).map(info))
        .map(p => ({ prezentacija: p, pustenoGrupi: pusteno(p.id) }));
      let predlog: number[];
      if (grupaId !== null) {
        const najdalja = Math.max(-1, ...stavke.filter(s => s.pustenoGrupi && s.prezentacija.vezba !== null).map(s => s.prezentacija.vezba!));
        const kandidati = stavke.filter(s => !s.pustenoGrupi && s.prezentacija.vezba !== null && !uToku(s.prezentacija.id));
        predlog = [
          ...kandidati.filter(s => s.prezentacija.vrsta === 'ZADACI' && s.prezentacija.vezba! < najdalja),
          ...kandidati.filter(s => s.prezentacija.vezba! >= najdalja),
        ].map(s => s.prezentacija.id).slice(0, 3);
      } else {
        const i = stavke.findIndex(s => s.prezentacija.id === posle);
        predlog = i < 0 || stavke[i].prezentacija.vezba === null ? [] : stavke.slice(i + 1)
          .filter(s => s.prezentacija.vezba !== null && !uToku(s.prezentacija.id)).map(s => s.prezentacija.id).slice(0, 3);
      }
      return ok({ stavke, predlog });
    });
    patch('prezentacije/:id/vezba', (z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      if (jeOdgovor(x)) {
        return x;
      }
      const v = (z.telo as { vezba?: unknown }).vezba;
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v))) {
        return greska(400, 'Neispravan format podataka.');
      }
      if (v !== null && (v < 0 || v > 99)) {
        return greska(400, 'Broj vežbe mora biti od 0 do 99.');
      }
      x['vezba'] = v;
      return ok(info(x));
    });
    get('prezentacije', z => {
      const predmetId = z.query.get('predmetId');
      return ok(d.prezentacije.filter(x => predmetId === null || x.predmet.id === Number(predmetId)).map(info));
    });
    post('prezentacije', z => {
      const cmd = z.telo as { predmetId: number; naziv: string; opis?: string | null; tema?: string | null; vezba?: number | null };
      const predmet = this.predmet(cmd.predmetId);
      if (!predmet) {
        return greska(404, 'Predmet ne postoji.');
      }
      const x: UzivoPrezentacija = {
        id: this.sledeciId++, naziv: cmd.naziv, opis: cmd.opis ?? null, predmet: { id: predmet.id, naziv: predmet.naziv },
        brojSlajdova: 0, brojPitanja: 0, izmenjeno: lokalnoVreme(new Date()), tema: cmd.tema ?? 'NACRT', takmicenje: false,
        telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false, brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi: [],
        vezba: cmd.vezba ?? null, kreirano: lokalnoVreme(new Date()),
      };
      d.prezentacije.push(x);
      return { status: 201, telo: x };
    });
    del('prezentacije/:id', (_z, p) => {
      const i = d.prezentacije.findIndex(x => x.id === Number(p['id']));
      if (i < 0) {
        return greska(404, 'Prezentacija ne postoji.');
      }
      d.prezentacije.splice(i, 1);
      return { status: 204 };
    });
    // multipart: mok ne raspakuje telo, samo ime fajla i tip iz zaglavlja dela (`filename="..."`, `Content-Type`)
    const otpremi = (z: Zahtev, tipovi: string): Odgovor => {
      const telo = typeof z.telo === 'string' ? z.telo : '';
      const m: Medij = {
        id: `00000000-0000-4000-8000-${(this.mediji.length + 1).toString(16).padStart(12, '0')}`,
        naziv: /filename="([^"]*)"/.exec(telo)?.[1] ?? 'slika', mime: new RegExp(`Content-Type: (${tipovi})`, 'i').exec(telo)?.[1] ?? 'image/png',
        velicina: telo.length,
      };
      this.mediji.push(m);
      return { status: 201, telo: m };
    };
    post('mediji', z => otpremi(z, 'image/[a-z]+'));
    post('prezentacije/:id/slajdovi/uvoz', (z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      if (jeOdgovor(x)) {
        return x;
      }
      const cmd = z.telo as { posle: number | null; slajdovi: (UzivoSlajd & { slikaId?: string | null })[] };
      if (!cmd.slajdovi?.length || cmd.slajdovi.length > 200) {
        return greska(400, 'Uvoz mora imati od 1 do 200 slajdova.');
      }
      if (x.slajdovi.length + cmd.slajdovi.length > 200) {
        return greska(400, `Prezentacija može imati najviše 200 slajdova (ima ${x.slajdovi.length}, uvozi se ${cmd.slajdovi.length}).`);
      }
      // kao backend: izostavljen `posle` je null (dodaje se na kraj)
      const posle = cmd.posle == null ? x.slajdovi.length - 1 : x.slajdovi.findIndex(s => s.id === cmd.posle);
      if (cmd.posle != null && posle < 0) {
        return greska(400, 'Slajd posle kog se dodaje nije u ovoj prezentaciji.');
      }
      const mesto = posle + 1;
      // kao backend: novi slajdovi dobijaju id, `slika` ostaje prazna (mok ne vodi medije), redni brojevi se prenumerišu
      const novi = cmd.slajdovi.map(s => {
        const slajd = { ...s, id: this.sledeciId++, rb: 0, slika: null, prelaz: normalizujPrelaz(s.prelaz) };
        delete slajd.slikaId;
        return slajd as UzivoSlajd;
      });
      x.slajdovi.splice(mesto, 0, ...novi);
      x.slajdovi.forEach((s, i) => (s.rb = i + 1));
      x.brojSlajdova = x.slajdovi.length;
      return { status: 201, telo: this.prezentacijaOdgovor(x) };
    });
    // dijalog "Pokreni" (prezentacija sa pitanjem): predavanja za izbor; mok ih nema (izbor "Uz predavanje" je onemogućen)
    get('prezentacije/:id/predavanja', (_z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      return jeOdgovor(x) ? x : ok([]);
    });
    get('prezentacije/:id', (_z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      return jeOdgovor(x) ? x : ok(this.prezentacijaOdgovor(x));
    });
    put('prezentacije/:id', (z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      if (jeOdgovor(x)) {
        return x;
      }
      const telo = { ...(z.telo as Record<string, unknown>) };
      delete telo['vezba']; // kao server: PUT ne menja broj vežbe
      Object.assign(x, telo);
      return ok(this.prezentacijaOdgovor(x));
    });
    put('slajdovi/:id', (z, p) => {
      for (const pr of d.prezentacije) {
        const i = pr.slajdovi.findIndex(s => s.id === Number(p['id']));
        if (i >= 0) {
          const cmd = { ...(z.telo as UzivoSlajd & { slikaId?: string | null }) };
          delete cmd.slikaId; // `slika` (MedijInfo) ostaje kakva je: mok ne vodi medije
          if (cmd.tip === 'ZADATAK') {
            const odbijeno = this.banka.proveriZadatak(pr.predmet.id, cmd.zadatak);
            if (odbijeno) return odbijeno;
          }
          // puna zamena prelaza (i zadatka) kao na serveru: PUT bez `prelaz` ga briše (regresija F16)
          pr.slajdovi[i] = { ...pr.slajdovi[i], ...cmd, prelaz: normalizujPrelaz(cmd.prelaz), zadatak: zadatakIzCmd(cmd) };
          return ok(this.slajdOdgovor(pr.slajdovi[i]));
        }
      }
      return greska(404, 'Slajd ne postoji.');
    });
    // nov slajd (editor: "+ Info", "+ Pitanje", "+ Platno", "Zadatak"): kao backend, na kraj ili odmah posle `?posle=`, prenumeracija
    post('prezentacije/:id/slajdovi', (z, p) => {
      const x = nadji(d.prezentacije, p['id'], 'Prezentacija');
      if (jeOdgovor(x)) {
        return x;
      }
      if (x.slajdovi.length >= 200) {
        return greska(400, 'Prezentacija može imati najviše 200 slajdova.');
      }
      const posle = z.query.get('posle');
      const i = posle === null ? x.slajdovi.length - 1 : x.slajdovi.findIndex(s => s.id === Number(posle));
      if (posle !== null && i < 0) {
        return greska(400, 'Slajd posle kog se dodaje nije u ovoj prezentaciji.');
      }
      const cmd = z.telo as SlajdCmd;
      if (cmd.tip === 'ZADATAK') {
        const odbijeno = this.banka.proveriZadatak(x.predmet.id, cmd.zadatak);
        if (odbijeno) return odbijeno;
      }
      const slajd = this.slajdIzCmd(cmd, this.sledeciId++);
      x.slajdovi.splice(i + 1, 0, slajd);
      x.slajdovi.forEach((s, rb) => (s.rb = rb + 1));
      return { status: 201, telo: this.slajdOdgovor(slajd) };
    });
    del('slajdovi/:id', (_z, p) => {
      for (const pr of d.prezentacije) {
        const i = pr.slajdovi.findIndex(s => s.id === Number(p['id']));
        if (i >= 0) {
          pr.slajdovi.splice(i, 1);
          pr.slajdovi.forEach((s, rb) => (s.rb = rb + 1));
          return { status: 204 };
        }
      }
      return greska(404, 'Slajd ne postoji.');
    });

    // banka zadataka (nastavnik, iza basic-auth-a): stablo i grupe, varijante, render, prilozi, preambula i pretraga (`mock-banka.ts`)
    const b = this.banka;
    get('banka/stablo', z => b.stablo(Number(z.query.get('predmetId')), z.query.get('namena')));
    post('banka/grupe', z => b.kreirajGrupu(z.telo as GrupaCmd));
    put('banka/grupe/redosled', z => {
      const roditelj = z.query.get('roditeljId');
      return b.redosled(Number(z.query.get('predmetId')), z.query.get('namena'), roditelj === null ? null : Number(roditelj), z.telo);
    });
    get('banka/grupe/:id', (_z, p) => b.grupaDetalji(Number(p['id'])));
    this.portal.nastavnickeRute(get, put, del);
    put('banka/grupe/:id', (z, p) => b.izmeniGrupu(Number(p['id']), z.telo as GrupaCmd));
    del('banka/grupe/:id', (_z, p) => b.obrisiGrupu(Number(p['id'])));
    post('banka/grupe/:id/premesti', (z, p) => b.premesti(Number(p['id']), z.telo as PremestiCmd));
    get('banka/grupe/:id/varijante', (z, p) => b.lista(Number(p['id']), z.query.get('status')));
    post('banka/grupe/:id/varijante', (z, p) => b.kreirajVarijantu(Number(p['id']), z.telo as VarijantaCmd));
    get('banka/varijante/:id', (_z, p) => b.varijantaDetalji(Number(p['id'])));
    put('banka/varijante/:id', (z, p) => b.izmeniVarijantu(Number(p['id']), z.telo as VarijantaCmd));
    del('banka/varijante/:id', (_z, p) => b.obrisiVarijantu(Number(p['id'])));
    patch('banka/varijante/:id/nivo', (z, p) => b.promeniNivo(Number(p['id']), z.telo as { nivo?: unknown } | null));
    post('banka/varijante/:id/odobri', (_z, p) => b.promeniStatus(Number(p['id']), 'AKTIVNA'));
    post('banka/varijante/:id/arhiviraj', (_z, p) => b.promeniStatus(Number(p['id']), 'ARHIVIRANA'));
    post('banka/varijante/:id/vrati-u-nacrt', (_z, p) => b.promeniStatus(Number(p['id']), 'NACRT'));
    post('banka/varijante/:id/render', (_z, p) => b.renderVarijante(Number(p['id'])));
    post('banka/varijante/:id/dupliraj', (_z, p) => b.dupliraj(Number(p['id'])));
    // živi pregled u editoru: `\foo` u tekstu ili rešenju je greška sa linijom, sve ostalo uspeva; 429/503 zamenom (`na`)
    post('banka/render-proba', z => b.renderProba(z.telo as RenderProbaCmd));
    post('banka/prilozi', z => otpremi(z, 'image/[a-z]+|application/pdf'));
    get('predmeti/:id/latex-preambula', (_z, p) => b.preambula(Number(p['id'])));
    put('predmeti/:id/latex-preambula', (z, p) => b.postaviPreambulu(Number(p['id']), z.telo as { preambula?: string | null } | null));
    post('banka/predmeti/:id/renderuj-sve', (_z, p) => b.renderujSve(Number(p['id'])));
    get('banka/pretraga', z => {
      const r = b.pretraga(z.query);
      return r.status ? r : strana(r.telo as BankaPretragaStavka[], z.query);
    });
    // Klodove serije (brojači i odbacivanje nacrta) i isključene teme predmeta
    get('banka/serije', z => b.serije(z.query.get('predmetId')));
    post('banka/serije/:serija/odbaci', (_z, p) => b.odbaciSeriju(decodeURIComponent(p['serija'])));
    get('predmeti/:id/iskljucene-teme', (_z, p) => b.iskljuceneTeme(Number(p['id'])));
    post('predmeti/:id/iskljucene-teme', (z, p) => b.iskljuciTemu(Number(p['id']), z.telo as IskljucenaTemaCmd | null));
    del('iskljucene-teme/:id', (_z, p) => b.ukljuciTemu(Number(p['id'])));

    // javni uživo (student): samo info po kodu, "ja" po kolačiću i prijava imenom; STOMP (`api/public/ws`) mokuje spec.
    // Bodovan run (`prijavaObavezna`) bez prijavljenog studenta: prijava 403; prijavljen student ulazi pod svojim imenom
    // (ukucano se ignoriše), kao `IdentitetStudenta` na serveru.
    const aktivnoZaKod = (kod: string) => d.izvodjenja.find(i => i.kod === kod && i.status === 'AKTIVNO');
    get('public/uzivo/:token', (_z, p) => {
      const i = aktivnoZaKod(p['token']);
      return i
        ? ok({ naziv: i.naziv, prijavaObavezna: !!i.prijavaObavezna, prijavljenStudent: d.prijavljenStudent !== null })
        : greska(404, 'Izvođenje sa tim kodom ne postoji ili je završeno.');
    });
    get('public/uzivo/:token/ja', (_z, p) => {
      const i = aktivnoZaKod(p['token']);
      const u = i && d.ucesnici.find(x => x.izvodjenjeId === i.id);
      return u ? ok(u) : greska(404, 'Nisi prijavljen na ovo izvođenje.');
    });
    post('public/uzivo/:token/prijava', (z, p) => {
      const i = aktivnoZaKod(p['token']);
      if (!i) {
        return greska(404, 'Izvođenje sa tim kodom ne postoji ili je završeno.');
      }
      if (i.prijavaObavezna && d.prijavljenStudent === null) {
        return greska(403, 'Potrebna je prijava studenta.');
      }
      const ime = d.prijavljenStudent ?? (z.telo as { ime: string }).ime;
      const ucesnik: Ucesnik = { ucesnikId: this.sledeciId++, ime, izvodjenjeId: i.id };
      d.ucesnici.push(ucesnik);
      return { status: 201, telo: ucesnik };
    });

    // raspored časova i termini (nastavnik, spec najave odsustva 3 i 6; `mock-raspored.ts`); `termini` pre `:id`
    const rs = this.raspored;
    get('rasporedi', () => ok(rs.lista()));
    post('rasporedi', z => rs.kreiraj(z.telo as RasporedCmd));
    get('rasporedi/termini', z => rs.termini(z.query.get('od'), z.query.get('dana')));
    post('rasporedi/termini/otkazi', z => rs.otkazi(z.telo as TerminCmd));
    post('rasporedi/termini/vrati', z => rs.vrati(z.telo as TerminCmd));
    get('rasporedi/:id', (_z, p) => rs.detalj(Number(p['id'])));
    put('rasporedi/:id', (z, p) => rs.izmeni(Number(p['id']), z.telo as RasporedCmd));
    del('rasporedi/:id', (_z, p) => rs.obrisi(Number(p['id'])));

    // nalog studenta (javno, spec prijave 5.1): isti odgovor na "kod" za svaki indeks; prijava samo kodom KOD_NALOGA za
    // indeks studenta iz fiksture; `ja` i odjave traže kolačić studenta (`studentPrijavljen`)
    const bezSesijeStudenta = () => greska(401, 'Potrebna je prijava.');
    get('public/nalog/stanje', () => ok({ prijavljen: this.studentPrijavljen }));
    post('public/nalog/kod', z => {
      const indeks = String((z.telo as { indeks?: unknown } | null)?.indeks ?? '');
      const maska = indeks === d.nalogStudenta.indeks ? d.nalogStudenta.maskaMejla : `${(indeks[0] ?? 'x').toLowerCase()}***@example.test`;
      return ok({ poruka: 'Ako nalog postoji, kod je poslat.', maska });
    });
    post('public/nalog/prijava', z => {
      const telo = z.telo as { indeks?: unknown; godina?: unknown; kod?: unknown } | null;
      // kao server: student je par (indeks, godina); telo bez godine je stari oblik (privremeno), bez provere godine
      const godina = d.nalogStudenta.godina ?? tekucaSkolskaGodina();
      const godinaOk = telo?.godina === undefined || telo.godina === godina;
      if (telo?.indeks !== d.nalogStudenta.indeks || !godinaOk || telo.kod !== MockApi.KOD_NALOGA) {
        return greska(401, 'Kod nije ispravan ili je istekao.');
      }
      this.studentPrijavljen = true;
      const n = d.nalogStudenta;
      n.uredjaji = [
        { id: this.sledeciId++, opis: 'Linux · Chrome', nacin: 'KOD', prviUlaz: lokalnoVreme(new Date()), poslednjiUlaz: lokalnoVreme(new Date()), trenutni: true },
        ...n.uredjaji.filter(u => !u.trenutni),
      ];
      return { status: 204 };
    });
    get('public/nalog/ja', () => (this.studentPrijavljen ? ok(d.nalogStudenta) : bezSesijeStudenta()));
    post('public/nalog/odjava', () => {
      if (!this.studentPrijavljen) {
        return bezSesijeStudenta();
      }
      this.studentPrijavljen = false;
      d.nalogStudenta.uredjaji = d.nalogStudenta.uredjaji.filter(u => !u.trenutni);
      return { status: 204 };
    });
    post('public/nalog/odjava-svuda', () => {
      if (!this.studentPrijavljen) {
        return bezSesijeStudenta();
      }
      this.studentPrijavljen = false;
      const odjavljeno = d.nalogStudenta.uredjaji.length;
      d.nalogStudenta.uredjaji = [];
      return ok({ odjavljeno });
    });
    post('public/nalog/pomoc', () => ok({ poruka: 'Javili smo nastavniku.' }));
    // naredni časovi i najava odsustva (javno, STUDENT; spec najave odsustva 4): bez kolačića studenta 401 kao server
    get('public/nalog/casovi', () => (this.studentPrijavljen ? ok(rs.naredni()) : bezSesijeStudenta()));
    post('public/nalog/casovi/najavi', z => (this.studentPrijavljen ? rs.najavi(z.telo as NajavaCmd) : bezSesijeStudenta()));
    post('public/nalog/casovi/povuci', z => (this.studentPrijavljen ? rs.povuci(z.telo as NajavaCmd) : bezSesijeStudenta()));
    // čekiranje studenta (`/nalog/cas`): token oblika `<id>.<22 znaka>` živog predavanja, inače 410 kao server
    const casStanje = () => {
      const c = this.cekiranje;
      const x = c.predavanjeId === null ? undefined : d.predavanja.find(q => q.id === c.predavanjeId);
      if (!x) {
        return { predavanje: null, cekiranU: null, izvodjenje: null, uToku: c.uToku };
      }
      const predavanje = { id: x.id, predmet: this.predmet(x.predmetId)?.naziv ?? null, datum: x.datum, rb: x.rb, tema: x.tema, zavrseno: x.zavrseno };
      return { predavanje, cekiranU: c.cekiranU, izvodjenje: x.zavrseno ? null : c.izvodjenje, uToku: x.zavrseno ? c.uToku : null };
    };
    const cekiraj = (x: Predavanje) => {
      this.cekiranje.predavanjeId = x.id;
      this.cekiranje.cekiranU = lokalnoVreme(new Date());
    };
    post('public/nalog/cas/skeniraj', z => {
      const token = String((z.telo as { token?: unknown } | null)?.token ?? '');
      const m = /^(\d+)\.[A-Za-z0-9_-]{22}$/.exec(token);
      const x = m ? d.predavanja.find(q => q.id === Number(m[1])) : undefined;
      if (!x) {
        return greska(410, 'QR je istekao. Skeniraj ponovo sa table.');
      }
      if (x.zavrseno) {
        return greska(410, 'Čekiranje za ovaj čas je završeno.');
      }
      if (!this.studentPrijavljen) {
        const kljuc = `K${x.id}`.padEnd(32, 'k');
        this.cekiranje.kljucevi.add(kljuc);
        return ok({ kljuc });
      }
      cekiraj(x);
      return ok({ stanje: casStanje() });
    });
    post('public/nalog/cas/potvrdi', z => {
      if (!this.studentPrijavljen) {
        return bezSesijeStudenta();
      }
      const kljuc = String((z.telo as { kljuc?: unknown } | null)?.kljuc ?? '');
      const x = this.cekiranje.kljucevi.delete(kljuc) ? d.predavanja.find(q => q.id === Number(kljuc.slice(1, kljuc.indexOf('k')))) : undefined;
      if (!x) {
        return greska(410, 'Čekiranje je isteklo. Skeniraj QR ponovo.');
      }
      cekiraj(x);
      return ok(casStanje());
    });
    get('public/nalog/cas', () => (this.studentPrijavljen ? ok(casStanje()) : bezSesijeStudenta()));
    this.portal.studentskeRute(get, post, put, del);
    // ime Moodle naloga iz ulaska (R17): samo čita (par se ne troši), 410 bez `__Host-gfs_lti_par`; ne traži sesiju studenta
    get('public/lti/povezivanje', () =>
      this.moodlePar ? ok({ ime: this.moodleIme }) : greska(410, 'Povezivanje je isteklo. Otvori GFS ponovo iz Moodle-a.'));
    // povezivanje Moodle naloga (javno, STUDENT + `__Host-gfs_lti_par`, spec prijave 8.3): 401 bez studenta, 410 bez para, pa veza
    post('public/lti/povezi', () => {
      if (!this.studentPrijavljen) {
        return bezSesijeStudenta();
      }
      if (!this.moodlePar) {
        return greska(410, 'Povezivanje je isteklo. Otvori GFS ponovo iz Moodle-a.');
      }
      this.moodlePar = false;
      d.nalogStudenta.moodlePovezan = true;
      return { status: 204 };
    });

    // registracije alata na Moodle-u (nastavnik, Podešavanja -> Moodle, spec prijave 8.1): adrese kao `LtiUrl` na serveru
    // (samo https://, prazne se izvode iz issuer-a), duplikat trojke je 409
    const ltiAdresa = (url: string, polje: string): string | Odgovor =>
      /^https:\/\/[^\s/]\S*$/iu.test(url.trim()) ? url.trim() : greska(400, `${polje} mora biti adresa koja počinje sa https://.`);
    const ltiRegistracija = (cmd: LtiRegistracijaCmd, id: number, kreirano: string): LtiRegistracijaInfo | Odgovor => {
      const izdavac = ltiAdresa(cmd.izdavac ?? '', 'Izdavač (issuer)');
      if (jeOdgovor(izdavac)) {
        return izdavac;
      }
      const osnova = izdavac.replace(/\/+$/u, '');
      const authUrl = ltiAdresa(cmd.authUrl?.trim() ? cmd.authUrl : `${osnova}/mod/lti/auth.php`, 'Auth URL');
      const jwksUrl = ltiAdresa(cmd.jwksUrl?.trim() ? cmd.jwksUrl : `${osnova}/mod/lti/certs.php`, 'JWKS URL');
      if (jeOdgovor(authUrl)) {
        return authUrl;
      }
      if (jeOdgovor(jwksUrl)) {
        return jwksUrl;
      }
      const r: LtiRegistracijaInfo = {
        id, naziv: cmd.naziv.trim(), izdavac, clientId: cmd.clientId.trim(), deploymentId: cmd.deploymentId.trim(), authUrl, jwksUrl,
        aktivna: cmd.aktivna, kreirano,
      };
      return d.ltiRegistracije.some(x => x.id !== id && x.izdavac === r.izdavac && x.clientId === r.clientId && x.deploymentId === r.deploymentId)
        ? greska(409, 'Registracija za ovaj Moodle, Client ID i Deployment ID već postoji.')
        : r;
    };
    get('lti/registracije', () => ok(d.ltiRegistracije));
    get('lti/registracije/vrednosti', () => ok(d.ltiVrednosti));
    post('lti/registracije', z => {
      const r = ltiRegistracija(z.telo as LtiRegistracijaCmd, this.sledeciId++, lokalnoVreme(new Date()));
      if (jeOdgovor(r)) {
        return r;
      }
      d.ltiRegistracije.push(r);
      return { status: 201, telo: r };
    });
    put('lti/registracije/:id', (z, p) => {
      const postoji = nadji(d.ltiRegistracije, p['id'], 'Registracija');
      if (jeOdgovor(postoji)) {
        return postoji;
      }
      const r = ltiRegistracija(z.telo as LtiRegistracijaCmd, postoji.id, postoji.kreirano);
      if (jeOdgovor(r)) {
        return r;
      }
      Object.assign(postoji, r);
      return ok(postoji);
    });
    del('lti/registracije/:id', (_z, p) => {
      const postoji = nadji(d.ltiRegistracije, p['id'], 'Registracija');
      if (jeOdgovor(postoji)) {
        return postoji;
      }
      d.ltiRegistracije = d.ltiRegistracije.filter(x => x.id !== postoji.id);
      return { status: 204 };
    });

    // nastavničko izvođenje (iza basic-auth-a): stanje i komande; snimci kroz STOMP idu preko `lazni-stomp.ts`
    const izvodjenje = (id: string) => Number(id) === this.izvodjenje.id;
    get('izvodjenja/:id/stanje', (_z, p) =>
      izvodjenje(p['id']) ? ok(this.izvodjenje.stanje()) : greska(404, 'Izvođenje ne postoji.'));
    post('izvodjenja/:id/komande', (z, p) => {
      if (!izvodjenje(p['id'])) {
        return greska(404, 'Izvođenje ne postoji.');
      }
      const cmd = z.telo as { tip: string; vrednost?: number | null };
      return this.izvodjenje.primeni(cmd.tip, cmd.vrednost);
    });
    // potezi CRTEZ slojeva slajda (projektor i konzola, `PoteziCrteza`): kao backend, redom slojeva iz dokumenta slajda u
    // fiksturi (prvo slajd izvođenja, pa prezentacije; snimak izvođenja ih nema, `bezPoteza`); prazno bez crteža, 404 bez
    // slajda; broj zahteva: `brojZahtevaPoteza`
    get('slajdovi/:id/potezi', (_z, p) => {
      const id = Number(p['id']);
      const sl = this.izvodjenje.slajdPoId(id) ?? d.prezentacije.flatMap(x => x.slajdovi).find(s => s.id === id);
      if (!sl) {
        return greska(404, 'Slajd ne postoji.');
      }
      const slojevi = (sl.platno as { slojevi?: Record<string, unknown>[] } | null)?.slojevi ?? [];
      return ok(slojevi.filter(x => x['tip'] === 'CRTEZ').map(x => ({
        slojId: x['id'], medijId: x['medijId'], sirina: x['sirina'], visina: x['visina'], potezi: x['potezi'] ?? null,
      })));
    });

    return r;
  }
}

// ---------------------------------------------------------------------------------------------- pomoćne

/** Spring `PagedModel`: `page` je 0-based, `size` podrazumevano 25 i najviše 100 (kao `PageableUtil`). */
function strana<T>(stavke: T[], q: URLSearchParams): Odgovor {
  const page = Math.max(0, Number.parseInt(q.get('page') ?? '0', 10) || 0);
  const size = Math.min(100, Math.max(1, Number.parseInt(q.get('size') ?? '25', 10) || 25));
  return {
    telo: {
      content: stavke.slice(page * size, page * size + size),
      page: { size, number: page, totalElements: stavke.length, totalPages: Math.ceil(stavke.length / size) },
    },
  };
}

/** Sort `polje,smer` nad poljem stavke (string ili broj); nepoznat oblik je podrazumevani sort. */
function poSortu<T>(sort: string | null, podrazumevano: string): (a: T, b: T) => number {
  const [polje, smer] = (sort && /^\w+,(asc|desc)$/.test(sort) ? sort : podrazumevano).split(',');
  return (a, b) => {
    const x = (a as Record<string, unknown>)[polje];
    const y = (b as Record<string, unknown>)[polje];
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'sr');
    return smer === 'desc' ? -r : r;
  };
}

/** Kopija objekta bez jednog ključa (veza u fiksturi koju DTO nema). */
function bezKljuca<T extends object, K extends keyof T>(kljuc: K): (x: T) => Omit<T, K> {
  return x => {
    const kopija = { ...x };
    delete kopija[kljuc];
    return kopija;
  };
}

const dva = (n: number) => String(n).padStart(2, '0');

function lokalniDatum(d: Date): string {
  return `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}`;
}

/** `LocalDateTime` kao ga šalje Jackson (bez zone). */
function lokalnoVreme(d: Date): string {
  return `${lokalniDatum(d)}T${dva(d.getHours())}:${dva(d.getMinutes())}:${dva(d.getSeconds())}`;
}
