import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page, Request, Route } from '@playwright/test';

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
interface Grupa { id: number; naziv: string; godinaUpisa: number | null }
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
interface KontrolnaTablaPodesavanje {
  sledece: { predmetId: number; grupaId: number; rb: number; brojStarijih: number };
  nedelja: { tip: 'PREDAVANJE' | 'DOMACI' | 'TEST'; id: number; naslov: string; predmetId: number; grupaId: number; danUNedelji: number }[];
}

export interface Podaci {
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
}

const FIKSTURE = join(__dirname, 'fixtures');
const ucitaj = <T>(ime: string): T => JSON.parse(readFileSync(join(FIKSTURE, ime), 'utf8')) as T;

/** Sveža kopija izmišljenih podataka (svaki test ima svoju, pa izmene ne prelaze u druge testove). */
export function ucitajPodatke(): Podaci {
  const predmeti = ucitaj<{ predmeti: Predmet[]; tipoviTesta: TipTesta[] }>('predmeti.json');
  const studenti = ucitaj<{ studenti: Student[]; beleske: Beleska[] }>('studenti.json');
  const onboarding = ucitaj<{ sesije: Sesija[]; prijave: Prijava[] }>('onboarding.json');
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

/** `predavanja/:id/prisustvo/:sid` -> regex; `:param` je samo ceo broj, `:token` bilo koji segment. */
function napraviRutu(metod: string, sablon: string, rukovalac: Rukovalac): Ruta {
  const imena: string[] = [];
  const izraz = sablon
    .split('/')
    .map(deo => {
      if (!deo.startsWith(':')) {
        return deo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      imena.push(deo.slice(1));
      return deo === ':token' ? '([^/]+)' : '(\\d+)';
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

/** Zadržan odgovor: `stigao` se razrešava kad zahtev stigne do moka, a odgovor ide tek posle `pusti()`. */
export interface Zadrzan {
  stigao: Promise<Zahtev>;
  pusti(): void;
}

// ---------------------------------------------------------------------------------------------- mok

export class MockApi {
  readonly podaci = ucitajPodatke();
  /** Svi zahtevi ka `api/` redom kojim su stigli. */
  readonly zahtevi: Zahtev[] = [];
  /** Zahtevi za koje mok nema rutu (test ih proverava u `afterEach`). */
  readonly nepoznati: string[] = [];
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

  async instaliraj(page: Page): Promise<void> {
    // okruženje (Dockerfile ga pravi u slici; lokalni dist ga nema): bez oznake STAGING
    await page.route('**/assets/env.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"env":"prod"}' }));
    await page.route('**/api/**', (route, request) => this.obradi(route, request));
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
    if (!izbor) {
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
      predmet: { naziv: this.predmet(p.predmetId)?.naziv ?? '' },
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
          prepisivao: p.prepisivao, polozio: p.ostvareniPoeni === null ? null : this.prolazi(t, p), napomene: p.napomene,
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
          id: p.id, testId: t.id, ostvareniPoeni: p.ostvareniPoeni, polozio: p.ostvareniPoeni === null ? null : this.prolazi(t, p),
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
    return {
      sledece: {
        predmet: this.predmet(k.sledece.predmetId), grupa: g, rb: k.sledece.rb, brojStudenata: g?.brojStudenata ?? 0, brojStarijih: k.sledece.brojStarijih,
      },
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
    const del = (s: string, h: Rukovalac) => r.push(napraviRutu('DELETE', s, h));
    const ok = (telo: unknown): Odgovor => ({ telo });
    const nadji = <T extends { id: number }>(lista: T[], id: string, sta: string): T | Odgovor =>
      lista.find(x => x.id === Number(id)) ?? greska(404, `${sta} ne postoji.`);
    const jeOdgovor = (x: unknown): x is Odgovor => typeof x === 'object' && x !== null && 'status' in x;

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
