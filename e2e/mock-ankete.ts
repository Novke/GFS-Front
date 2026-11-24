import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AnketaDetails, AnketaInfo, AnketeSabloniInfo, FolderAnkete, IzvorAnkete, PokreniAnketuCmd, PublikaAnkete, SablonAnkete,
  SablonAnketeCmd,
} from '../src/app/features/ankete/data-access/ankete.models';
import type { AnketaStudentu } from '../src/app/features/nalog/data-access/ankete-studenta.models';

/*
 * Mok brze ankete (spec brze ankete 2026-11-23, sekcije 4 i 5): sačuvana pitanja, prečice i folderi nastavnika
 * (`fixtures/ankete.json`), pokretanje, zatvaranje, rezultat i istorija (`api/ankete*`), i studentska strana
 * (`api/public/nalog/ankete*`, polje `ankete` u stanju časa). Pravila kao na serveru, koliko e2e proverava:
 * - ko sme da glasa: NA_CASU čekiran na predavanju ankete; GRUPA student te grupe ili čekiran na predavanju ankete;
 *   inače 403 `Ova anketa nije za tebe.`, zatvorena 409 `Anketa je zatvorena.`, nepostojeća 404;
 * - glas zamenjuje stari; jedan odgovor tačno jedan indeks, više odgovora bar jedan (400);
 * - anonimno: nijedan odgovor ne nosi ko je za šta glasao, student vidi samo svoj glas i zbir tek kad je rezultat pokazan;
 * - skup za studenta: otvorene i zatvorene sa pokazanim rezultatom (na času do 2 h, za grupu do 24 h), najnovije prvo, do 5;
 * - nova anketa na času zatvara otvorenu anketu istog predavanja; rok zatvara sam (i `trajanjeSekunde`).
 * Glasove drugih studenata test dodaje kroz {@link MockAnkete.glasajDrugi}. Rute registruje `mock-api.ts`.
 */

interface Odgovor { status?: number; telo?: unknown }
type Rukovalac = (z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>) => Odgovor;
type Ruta = (sablon: string, h: Rukovalac) => void;

/** Ono što mok anketa čita iz ostatka moka (sesija i čekiranje studenta, predavanja i grupe). */
export interface OkruzenjeAnketa {
  studentPrijavljen(): boolean;
  /** Predavanje na kome je prijavljen student čekiran (`null`: nije). */
  cekiranNa(): number | null;
  /** Grupa prijavljenog studenta. */
  grupaStudenta(): number | null;
  predavanje(id: number): { grupaId: number | null; zavrseno: boolean; predmetNaziv: string | null } | null;
  grupa(id: number): { naziv: string; brojStudenata: number } | null;
  /** Broj čekiranih na predavanju (bez prijavljenog studenta iz moka). */
  brojCekiranih(predavanjeId: number): number;
}

interface Anketa {
  id: number; sablonId: number | null; pitanje: string; opcije: string[]; viseOdgovora: boolean; publika: PublikaAnkete;
  predavanjeId: number | null; grupaId: number | null; otvoreno: Date; rok: Date | null; zatvorenoRucno: Date | null;
  rezultatPrikazan: boolean; izvor: IzvorAnkete;
  /** Glas po studentu (`STUDENT` je prijavljen student moka, ostali su izmišljeni ključevi). */
  glasovi: Map<string, number[]>;
}

const FIKSTURA = join(__dirname, 'fixtures', 'ankete.json');
const STUDENT = 'student';
const MAX_SABLONA = 200;
const MAX_FOLDERA = 30;
const MAX_PRECICA = 12;
const MAX_OTVORENIH_GRUPE = 5;
const ok = (telo: unknown): Odgovor => ({ telo });
const greska = (status: number, reason: string): Odgovor => ({ status, telo: { reason, time: new Date().toISOString() } });
const BEZ_SESIJE = () => greska(401, 'Potrebna je prijava.');
const jeGreska = (x: SablonAnkete | Odgovor): x is Odgovor => !('id' in x);
const dva = (n: number) => String(n).padStart(2, '0');
const lokalno = (d: Date) =>
  `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}T${dva(d.getHours())}:${dva(d.getMinutes())}:${dva(d.getSeconds())}`;

export class MockAnkete {
  folderi: Omit<FolderAnkete, 'brojSablona'>[];
  sabloni: SablonAnkete[];
  readonly ankete: Anketa[] = [];
  /** Broj studenata koji smeju da glasaju (`brojMogucih`); `null` = računa se iz čekiranih i grupe. */
  brojMogucih: number | null = null;
  private sledeciId = 500;

  constructor(private readonly o: OkruzenjeAnketa) {
    const f = JSON.parse(readFileSync(FIKSTURA, 'utf8')) as { folderi: MockAnkete['folderi']; sabloni: SablonAnkete[] };
    this.folderi = f.folderi;
    this.sabloni = f.sabloni;
  }

  // ------------------------------------------------------------------------------------------ pomoć za specove

  /** Anketa kao da ju je nastavnik pokrenuo (bez provere komande); vraća id. */
  otvori(izmene: Partial<PokreniAnketuCmd> & { rokMs?: number } = {}): number {
    const a: Anketa = {
      id: this.sledeciId++, sablonId: izmene.sablonId ?? null, pitanje: izmene.pitanje ?? 'Da li vam treba pauza?',
      opcije: izmene.opcije ?? ['Da, 10 min', 'Da, 15 min', 'Ne, završimo ranije'], viseOdgovora: izmene.viseOdgovora ?? false,
      publika: izmene.publika ?? 'NA_CASU', predavanjeId: izmene.predavanjeId === undefined ? 1 : izmene.predavanjeId,
      grupaId: izmene.grupaId ?? 1, otvoreno: new Date(), rok: izmene.rokMs !== undefined ? new Date(izmene.rokMs) : null,
      zatvorenoRucno: null, rezultatPrikazan: false, izvor: 'NASTAVNIK', glasovi: new Map(),
    };
    this.ankete.push(a);
    return a.id;
  }

  /** `broj` drugih studenata glasa za `opcije` (ključevi `drugi-N`, bez provere prava). */
  glasajDrugi(id: number, opcije: number[], broj = 1): void {
    const a = this.nadji(id)!;
    for (let i = 0; i < broj; i++) {
      a.glasovi.set(`drugi-${a.glasovi.size}`, [...opcije]);
    }
  }

  prikaziRezultat(id: number, prikazan = true): void {
    this.nadji(id)!.rezultatPrikazan = prikazan;
  }

  zatvori(id: number): void {
    const a = this.nadji(id)!;
    a.zatvorenoRucno ??= new Date();
  }

  /** Glas prijavljenog studenta (`null` dok nije glasao). */
  glasStudenta(id: number): number[] | null {
    return this.nadji(id)?.glasovi.get(STUDENT) ?? null;
  }

  // ------------------------------------------------------------------------------------------ pravila

  private nadji(id: number): Anketa | undefined {
    return this.ankete.find(a => a.id === id);
  }

  /** Efektivno zatvaranje: ručno, rok ili kraj predavanja (na času); `null` dok je otvorena. */
  private zatvoreno(a: Anketa, sada = new Date()): Date | null {
    if (a.zatvorenoRucno) {
      return a.zatvorenoRucno;
    }
    if (a.rok && a.rok <= sada) {
      return a.rok;
    }
    if (a.publika === 'NA_CASU' && a.predavanjeId !== null && this.o.predavanje(a.predavanjeId)?.zavrseno) {
      return sada;
    }
    return null;
  }

  private mozeDaGlasa(a: Anketa): boolean {
    const cekiran = a.predavanjeId !== null && this.o.cekiranNa() === a.predavanjeId;
    return a.publika === 'NA_CASU' ? cekiran : cekiran || (a.grupaId !== null && this.o.grupaStudenta() === a.grupaId);
  }

  private brojevi(a: Anketa): { glasovi: number[]; brojGlasalo: number } {
    const glasovi = a.opcije.map(() => 0);
    for (const g of a.glasovi.values()) {
      g.forEach(i => glasovi[i]++);
    }
    return { glasovi, brojGlasalo: a.glasovi.size };
  }

  private moguci(a: Anketa): number {
    if (this.brojMogucih !== null) {
      return this.brojMogucih;
    }
    const cekirani = a.predavanjeId === null ? 0
      : this.o.brojCekiranih(a.predavanjeId) + (this.o.cekiranNa() === a.predavanjeId ? 1 : 0);
    const grupa = a.publika === 'GRUPA' && a.grupaId !== null ? (this.o.grupa(a.grupaId)?.brojStudenata ?? 0) : 0;
    return Math.max(cekirani + grupa, a.glasovi.size);
  }

  private details(a: Anketa): AnketaDetails {
    const z = this.zatvoreno(a);
    const p = a.predavanjeId === null ? null : this.o.predavanje(a.predavanjeId);
    return {
      id: a.id, sablonId: a.sablonId, pitanje: a.pitanje, opcije: [...a.opcije], viseOdgovora: a.viseOdgovora, publika: a.publika,
      predavanjeId: a.predavanjeId, grupaId: a.grupaId, grupaNaziv: a.grupaId === null ? null : (this.o.grupa(a.grupaId)?.naziv ?? null),
      predmetNaziv: p?.predmetNaziv ?? null, otvoreno: lokalno(a.otvoreno), rok: a.rok ? lokalno(a.rok) : null,
      rokMs: a.rok?.getTime() ?? null, zatvoreno: z ? lokalno(z) : null, otvorena: z === null, rezultatPrikazan: a.rezultatPrikazan,
      izvor: a.izvor, ...this.brojevi(a), brojMogucih: this.moguci(a), sadaMs: Date.now(),
    };
  }

  private info(a: Anketa): AnketaInfo {
    const d = this.details(a);
    const max = Math.max(0, ...d.glasovi);
    const pobednici = d.glasovi.flatMap((g, i) => (g === max && max > 0 ? [i] : []));
    return {
      id: d.id, pitanje: d.pitanje, publika: d.publika, otvoreno: d.otvoreno, zatvoreno: d.zatvoreno, otvorena: d.otvorena,
      brojGlasalo: d.brojGlasalo, brojMogucih: d.brojMogucih, pobednik: pobednici.length === 1 ? d.opcije[pobednici[0]] : null,
      predmetNaziv: d.predmetNaziv, grupaNaziv: d.grupaNaziv,
    };
  }

  private zaStudentaJedna(a: Anketa): AnketaStudentu {
    const otvorena = this.zatvoreno(a) === null;
    return {
      id: a.id, pitanje: a.pitanje, opcije: [...a.opcije], viseOdgovora: a.viseOdgovora, publika: a.publika,
      rokMs: a.rok?.getTime() ?? null, otvorena, mojGlas: a.glasovi.get(STUDENT) ?? null,
      rezultat: a.rezultatPrikazan ? this.brojevi(a) : null, sadaMs: Date.now(),
    };
  }

  /** Skup za prijavljenog studenta (stanje časa i `GET public/nalog/ankete`); bez sesije prazan. */
  zaStudenta(): AnketaStudentu[] {
    if (!this.o.studentPrijavljen()) {
      return [];
    }
    const sada = new Date();
    return this.ankete
      .filter(a => this.mozeDaGlasa(a))
      .filter(a => {
        const z = this.zatvoreno(a, sada);
        if (z === null) {
          return true;
        }
        if (!a.rezultatPrikazan) {
          return false;
        }
        const proteklo = sada.getTime() - z.getTime();
        if (a.publika === 'NA_CASU') {
          return !(a.predavanjeId !== null && this.o.predavanje(a.predavanjeId)?.zavrseno) && proteklo <= 2 * 3600_000;
        }
        return proteklo <= 24 * 3600_000;
      })
      .sort((x, y) => y.otvoreno.getTime() - x.otvoreno.getTime() || y.id - x.id)
      .slice(0, 5)
      .map(a => this.zaStudentaJedna(a));
  }

  private sabloniInfo(): AnketeSabloniInfo {
    return {
      folderi: [...this.folderi].sort((a, b) => a.rb - b.rb)
        .map(f => ({ ...f, brojSablona: this.sabloni.filter(s => s.folderId === f.id).length })),
      sabloni: [...this.sabloni].sort((a, b) =>
        Number(b.precica) - Number(a.precica) || (a.precicaRb ?? 0) - (b.precicaRb ?? 0) || a.rb - b.rb),
    };
  }

  private proveriPitanje(pitanje: unknown, opcije: unknown): Odgovor | null {
    const p = typeof pitanje === 'string' ? pitanje.trim() : '';
    if (p.length < 1 || p.length > 300) {
      return greska(400, 'Pitanje je obavezno (do 300 znakova).');
    }
    const o = Array.isArray(opcije) ? opcije.map(x => (typeof x === 'string' ? x.trim() : '')) : [];
    if (o.length < 2 || o.length > 10) {
      return greska(400, 'Anketa ima od 2 do 10 odgovora.');
    }
    if (o.some(x => x.length < 1 || x.length > 120)) {
      return greska(400, 'Odgovor ima od 1 do 120 znakova.');
    }
    if (new Set(o.map(x => x.toLowerCase())).size !== o.length) {
      return greska(400, 'Odgovori moraju biti različiti.');
    }
    return null;
  }

  private sablonIzCmd(cmd: SablonAnketeCmd, stari: SablonAnkete | null): SablonAnkete | Odgovor {
    const g = this.proveriPitanje(cmd.pitanje, cmd.opcije);
    if (g) {
      return g;
    }
    const precica = !!cmd.precica;
    if (precica && !stari?.precica && this.sabloni.filter(s => s.precica).length >= MAX_PRECICA) {
      return greska(409, `Najviše ${MAX_PRECICA} prečica.`);
    }
    if (cmd.folderId !== null && !this.folderi.some(f => f.id === cmd.folderId)) {
      return greska(404, 'Folder ne postoji.');
    }
    const precicaRb = !precica ? null
      : (stari?.precica ? stari.precicaRb : Math.max(-1, ...this.sabloni.map(s => s.precicaRb ?? -1)) + 1);
    return {
      id: stari?.id ?? this.sledeciId++, folderId: cmd.folderId, pitanje: cmd.pitanje.trim(), opcije: cmd.opcije.map(x => x.trim()),
      viseOdgovora: !!cmd.viseOdgovora, publika: cmd.publika, trajanjeSekunde: cmd.publika === 'NA_CASU' ? cmd.trajanjeSekunde : null,
      rokSati: cmd.publika === 'GRUPA' ? cmd.rokSati : null, precica, precicaRb, ikonica: cmd.ikonica, boja: cmd.boja,
      kratakNaziv: cmd.kratakNaziv, pokreniOdmah: !!cmd.pokreniOdmah,
      rb: stari?.rb ?? this.sabloni.filter(s => s.folderId === cmd.folderId).length,
      brojPokretanja: stari?.brojPokretanja ?? 0, poslednjePokretanje: stari?.poslednjePokretanje ?? null,
    };
  }

  private pokreni(cmd: PokreniAnketuCmd): Odgovor {
    const g = this.proveriPitanje(cmd.pitanje, cmd.opcije);
    if (g) {
      return g;
    }
    const sada = new Date();
    const p = cmd.predavanjeId === null ? null : this.o.predavanje(cmd.predavanjeId);
    let rok: Date | null;
    let grupaId: number | null;
    if (cmd.publika === 'NA_CASU') {
      if (!p || p.grupaId === null || p.zavrseno) {
        return greska(409, 'Predavanje nije u toku.');
      }
      grupaId = p.grupaId;
      const t = cmd.trajanjeSekunde;
      if (t !== null && (t < 10 || t > 1800)) {
        return greska(400, 'Trajanje je od 10 s do 30 min.');
      }
      rok = t === null ? null : new Date(sada.getTime() + t * 1000);
      for (const a of this.ankete) {
        if (a.publika === 'NA_CASU' && a.predavanjeId === cmd.predavanjeId && this.zatvoreno(a, sada) === null) {
          a.zatvorenoRucno = sada;
        }
      }
    } else {
      grupaId = cmd.grupaId ?? p?.grupaId ?? null;
      if (grupaId === null || !this.o.grupa(grupaId)) {
        return greska(400, 'Izaberi grupu.');
      }
      rok = cmd.rok ? new Date(cmd.rok) : null;
      if (!rok || isNaN(rok.getTime()) || rok <= sada || rok.getTime() - sada.getTime() > 14 * 86_400_000) {
        return greska(400, 'Rok mora biti u narednih 14 dana.');
      }
      const otvorenih = this.ankete.filter(a => a.publika === 'GRUPA' && a.grupaId === grupaId && this.zatvoreno(a, sada) === null);
      if (otvorenih.length >= MAX_OTVORENIH_GRUPE) {
        return greska(409, `Grupa već ima ${MAX_OTVORENIH_GRUPE} otvorenih anketa.`);
      }
    }
    const s = cmd.sablonId === null ? undefined : this.sabloni.find(x => x.id === cmd.sablonId);
    if (s) {
      s.brojPokretanja++;
      s.poslednjePokretanje = lokalno(sada);
    }
    const a: Anketa = {
      id: this.sledeciId++, sablonId: s?.id ?? null, pitanje: cmd.pitanje.trim(), opcije: cmd.opcije.map(x => x.trim()),
      viseOdgovora: !!cmd.viseOdgovora, publika: cmd.publika, predavanjeId: cmd.predavanjeId, grupaId, otvoreno: sada, rok,
      zatvorenoRucno: null, rezultatPrikazan: false, izvor: 'NASTAVNIK', glasovi: new Map(),
    };
    this.ankete.push(a);
    return { status: 201, telo: this.details(a) };
  }

  // ------------------------------------------------------------------------------------------ rute

  /** Nastavnik (ADMIN, `api/ankete*`). Konkretne putanje pre `:id` (`:id` je samo ceo broj, ali redosled je jasniji). */
  nastavnickeRute(get: Ruta, post: Ruta, put: Ruta, del: Ruta): void {
    get('ankete/sabloni', () => ok(this.sabloniInfo()));
    post('ankete/sabloni', z => {
      if (this.sabloni.length >= MAX_SABLONA) {
        return greska(409, `Najviše ${MAX_SABLONA} sačuvanih pitanja.`);
      }
      const s = this.sablonIzCmd(z.telo as SablonAnketeCmd, null);
      if (jeGreska(s)) {
        return s;
      }
      this.sabloni.push(s);
      return { status: 201, telo: s };
    });
    put('ankete/sabloni/:id', (z, p) => {
      const i = this.sabloni.findIndex(s => s.id === Number(p['id']));
      if (i < 0) {
        return greska(404, 'Sačuvano pitanje ne postoji.');
      }
      const s = this.sablonIzCmd(z.telo as SablonAnketeCmd, this.sabloni[i]);
      if (jeGreska(s)) {
        return s;
      }
      this.sabloni[i] = s;
      return ok(s);
    });
    del('ankete/sabloni/:id', (_z, p) => {
      this.sabloni = this.sabloni.filter(s => s.id !== Number(p['id']));
      return { status: 204 };
    });
    put('ankete/precice', z => {
      const ids = ((z.telo as { ids?: number[] } | null)?.ids ?? []).slice(0, MAX_PRECICA);
      for (const s of this.sabloni) {
        const rb = ids.indexOf(s.id);
        s.precica = rb >= 0;
        s.precicaRb = rb >= 0 ? rb : null;
      }
      return ok(this.sabloniInfo());
    });
    post('ankete/folderi', z => {
      if (this.folderi.length >= MAX_FOLDERA) {
        return greska(409, `Najviše ${MAX_FOLDERA} foldera.`);
      }
      const naziv = String((z.telo as { naziv?: unknown } | null)?.naziv ?? '').trim();
      if (!naziv) {
        return greska(400, 'Naziv foldera je obavezan.');
      }
      const f = { id: this.sledeciId++, naziv, rb: this.folderi.length };
      this.folderi.push(f);
      return { status: 201, telo: { ...f, brojSablona: 0 } };
    });
    put('ankete/folderi/redosled', z => {
      const ids = (z.telo as { ids?: number[] } | null)?.ids ?? [];
      this.folderi.forEach(f => (f.rb = ids.includes(f.id) ? ids.indexOf(f.id) : ids.length + f.rb));
      return ok(this.sabloniInfo());
    });
    put('ankete/folderi/:id', (z, p) => {
      const f = this.folderi.find(x => x.id === Number(p['id']));
      if (!f) {
        return greska(404, 'Folder ne postoji.');
      }
      f.naziv = String((z.telo as { naziv?: unknown } | null)?.naziv ?? f.naziv).trim();
      return ok({ ...f, brojSablona: this.sabloni.filter(s => s.folderId === f.id).length });
    });
    del('ankete/folderi/:id', (_z, p) => {
      const id = Number(p['id']);
      this.folderi = this.folderi.filter(f => f.id !== id);
      this.sabloni.filter(s => s.folderId === id).forEach(s => (s.folderId = null));
      return { status: 204 };
    });
    post('ankete', z => this.pokreni(z.telo as PokreniAnketuCmd));
    get('ankete/aktivne', z => {
      const predavanjeId = z.query.has('predavanjeId') ? Number(z.query.get('predavanjeId')) : null;
      const grupaId = z.query.has('grupaId') ? Number(z.query.get('grupaId')) : null;
      const sada = Date.now();
      return ok(this.ankete
        .filter(a => (predavanjeId !== null && a.predavanjeId === predavanjeId) || (grupaId !== null && a.grupaId === grupaId))
        .filter(a => {
          const zat = this.zatvoreno(a);
          return zat === null || (a.rezultatPrikazan && sada - zat.getTime() <= 30 * 60_000);
        })
        .sort((x, y) => y.id - x.id)
        .map(a => this.details(a)));
    });
    get('ankete', z => {
      const predavanjeId = z.query.has('predavanjeId') ? Number(z.query.get('predavanjeId')) : null;
      const grupaId = z.query.has('grupaId') ? Number(z.query.get('grupaId')) : null;
      const lista = this.ankete
        .filter(a => (predavanjeId === null || a.predavanjeId === predavanjeId) && (grupaId === null || a.grupaId === grupaId))
        .sort((x, y) => y.otvoreno.getTime() - x.otvoreno.getTime() || y.id - x.id)
        .map(a => this.info(a));
      const page = Math.max(0, Number(z.query.get('page') ?? 0) || 0);
      const size = Math.min(100, Math.max(1, Number(z.query.get('size') ?? 20) || 20));
      return ok({
        content: lista.slice(page * size, page * size + size),
        page: { size, number: page, totalElements: lista.length, totalPages: Math.ceil(lista.length / size) },
      });
    });
    get('ankete/:id', (_z, p) => {
      const a = this.nadji(Number(p['id']));
      return a ? ok(this.details(a)) : greska(404, 'Anketa nije pronađena.');
    });
    post('ankete/:id/zatvori', (_z, p) => {
      const a = this.nadji(Number(p['id']));
      if (!a) {
        return greska(404, 'Anketa nije pronađena.');
      }
      if (this.zatvoreno(a) === null) {
        a.zatvorenoRucno = new Date();
      }
      return ok(this.details(a));
    });
    put('ankete/:id/rezultat', (z, p) => {
      const a = this.nadji(Number(p['id']));
      if (!a) {
        return greska(404, 'Anketa nije pronađena.');
      }
      a.rezultatPrikazan = !!(z.telo as { prikazan?: unknown } | null)?.prikazan;
      return ok(this.details(a));
    });
    del('ankete/:id', (_z, p) => {
      const i = this.ankete.findIndex(a => a.id === Number(p['id']));
      if (i >= 0) {
        this.ankete.splice(i, 1);
      }
      return { status: 204 };
    });
  }

  /** Student (`api/public/nalog/ankete*`, kolačić studenta). */
  studentskeRute(get: Ruta, post: Ruta): void {
    get('public/nalog/ankete', () => (this.o.studentPrijavljen() ? ok(this.zaStudenta()) : BEZ_SESIJE()));
    post('public/nalog/ankete/:id/glas', (z, p) => {
      if (!this.o.studentPrijavljen()) {
        return BEZ_SESIJE();
      }
      const a = this.nadji(Number(p['id']));
      if (!a) {
        return greska(404, 'Anketa nije pronađena.');
      }
      if (!this.mozeDaGlasa(a)) {
        return greska(403, 'Ova anketa nije za tebe.');
      }
      if (this.zatvoreno(a) !== null) {
        return greska(409, 'Anketa je zatvorena.');
      }
      const opcije = (z.telo as { opcije?: unknown } | null)?.opcije;
      const ispravne = Array.isArray(opcije) && opcije.length > 0 && new Set(opcije).size === opcije.length
        && opcije.every(i => Number.isInteger(i) && i >= 0 && i < a.opcije.length);
      if (!ispravne) {
        return greska(400, 'Neispravan odgovor.');
      }
      if (!a.viseOdgovora && opcije.length !== 1) {
        return greska(400, 'Izaberi jedan odgovor.');
      }
      a.glasovi.set(STUDENT, [...(opcije as number[])].sort((x, y) => x - y));
      return ok(this.zaStudentaJedna(a));
    });
  }
}
