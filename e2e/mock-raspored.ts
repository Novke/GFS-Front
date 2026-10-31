import type { RasporedTablaInfo, TerminKratkoInfo } from '../src/app/core/api/pregled.api';
import type { NajavaCmd, NaredniCasovi, StudentskiTermin } from '../src/app/features/nalog/data-access/casovi.models';
import type {
  NajavaInfo, PromenaTerminaOdgovor, RasporedCmd, RasporedDetails, RasporedInfo, TerminCmd, TerminInfo,
} from '../src/app/features/raspored/data-access/raspored.models';

/*
 * Mok rasporeda časova i najava odsustva za e2e (spec najave odsustva): periodi sa stavkama u memoriji, termini se računaju
 * kao na serveru (`Termini`), a čuvaju se samo otkazivanja i najave. Pojednostavljena kopija pravila servera
 * (`RasporedService`, `NajavaService`, `TerminService`) sa istim porukama greške, samo za ono što e2e proverava. Student naloga
 * (`nalogStudenta`, u fiksturi student 1) sluša grupu {@link MockRaspored.grupaStudenta}; starija generacija se ne mokuje.
 * Podrazumevano nema nijednog rasporeda (stari specovi rade kao ranije); `primer()` puni jedan period oko današnjeg dana.
 * Rute registruje `mock-api.ts`.
 */

interface Stavka {
  id: number; predmetId: number; grupaId: number; dan: number; pocetak: string; kraj: string;
}
interface Period {
  id: number; naziv: string; vaziOd: string; vaziDo: string; pragNajava: number; stavke: Stavka[];
}
interface Najava {
  stavkaId: number; datum: string; studentId: number; razlog: string | null; vreme: string;
}
interface StudentRasporeda {
  id: number; ime: string; prezime: string; indeks: string; godina: number | null; grupaId: number | null;
}
interface Ishod {
  status?: number;
  telo?: unknown;
}
/** Šta mok rasporeda traži od ostatka moka (predmeti, grupe, studenti, predavanja, obaveštenja). */
export interface OkolinaRasporeda {
  predmet(id: number): { id: number; naziv: string } | null;
  grupa(id: number): { id: number; naziv: string; godinaUpisa: number | null; brojStudenata?: number | null } | null;
  studenti(): StudentRasporeda[];
  /** Najveći id predavanja istog predmeta, grupe i datuma. */
  predavanje(predmetId: number, grupaId: number, datum: string): number | null;
  /** Novo obaveštenje `MNOGO_NAJAVA` (jednom po ključu) i rešavanje po ključu. */
  mnogoNajava(kljuc: string, podaci: Record<string, unknown>): void;
  resiPoKljucu(kljuc: string): void;
}

const greska = (status: number, reason: string): Ishod => ({ status, telo: { reason, time: new Date().toISOString() } });
const dva = (n: number) => String(n).padStart(2, '0');

/** `yyyy-MM-dd` lokalnog dana. */
export function isoDan(d: Date): string {
  return `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}`;
}

/** Dan pomeren za `n` dana (lokalno, bez DST zamki: podne). */
export function pomeriDan(iso: string, n: number): string {
  const [g, m, d] = iso.split('-').map(Number);
  return isoDan(new Date(g, m - 1, d + n, 12));
}

/** ISO dan u nedelji (1 = ponedeljak ... 7 = nedelja). */
export function danUNedelji(iso: string): number {
  const [g, m, d] = iso.split('-').map(Number);
  return ((new Date(g, m - 1, d, 12).getDay() + 6) % 7) + 1;
}

const sekunde = (v: string) => (v.length === 5 ? `${v}:00` : v);
const kljuc = (stavkaId: number, datum: string) => `${stavkaId}:${datum}`;
const jeStavka = (x: Stavka | Ishod): x is Stavka => 'dan' in x;

export class MockRaspored {
  readonly periodi: Period[] = [];
  /** Otkazani termini: ključ `stavka:datum` -> napomena. */
  readonly otkazani = new Map<string, string | null>();
  readonly najave: Najava[] = [];
  /** Grupa studenta naloga (student 1 iz fiksture). */
  grupaStudenta = 1;
  /** Id studenta naloga (kolačić `gfs_student`). */
  studentNaloga = 1;
  private sledeciId = 500;

  constructor(private readonly o: OkolinaRasporeda, private readonly sada: () => Date = () => new Date()) {}

  // ------------------------------------------------------------------------------------------ primer

  /**
   * Jedan period „Zimski semestar (primer)“ od pre mesec dana do za četiri meseca, prag 2, sa tri stavke: sutrašnji dan u
   * nedelji 10:00-13:00 (predmet 1, grupa 1), prekosutrašnji 08:15-09:45 (predmet 2, grupa 1) i sutrašnji 14:00-15:30
   * (predmet 1, grupa 2, tuđa za studenta naloga). Sutrašnji termini nikad nisu počeli, pa su akcije uvek dozvoljene.
   */
  primer(): { sutra: string; prekosutra: string; period: Period } {
    const danas = isoDan(this.sada());
    const sutra = pomeriDan(danas, 1);
    const prekosutra = pomeriDan(danas, 2);
    const period: Period = {
      id: 3, naziv: 'Zimski semestar (primer)', vaziOd: pomeriDan(danas, -30), vaziDo: pomeriDan(danas, 120), pragNajava: 2,
      stavke: [
        { id: 31, predmetId: 1, grupaId: 1, dan: danUNedelji(sutra), pocetak: '10:00:00', kraj: '13:00:00' },
        { id: 32, predmetId: 2, grupaId: 1, dan: danUNedelji(prekosutra), pocetak: '08:15:00', kraj: '09:45:00' },
        { id: 33, predmetId: 1, grupaId: 2, dan: danUNedelji(sutra), pocetak: '14:00:00', kraj: '15:30:00' },
      ],
    };
    this.periodi.push(period);
    return { sutra, prekosutra, period };
  }

  /** Najava drugog studenta (za broj i obaveštenje); ide kroz isto pravilo praga kao najava studenta. */
  najavaDrugog(studentId: number, stavkaId: number, datum: string, razlog: string | null = null): void {
    this.upisiNajavu(studentId, this.stavka(stavkaId)!, datum, razlog);
  }

  // ------------------------------------------------------------------------------------------ nastavnik: periodi

  lista(): RasporedInfo[] {
    return [...this.periodi]
      .sort((a, b) => b.vaziOd.localeCompare(a.vaziOd) || b.id - a.id)
      .map(p => ({ id: p.id, naziv: p.naziv, vaziOd: p.vaziOd, vaziDo: p.vaziDo, pragNajava: p.pragNajava, brojStavki: p.stavke.length }));
  }

  detalj(id: number): Ishod {
    const p = this.periodi.find(x => x.id === id);
    return p ? { telo: this.details(p) } : greska(404, 'Raspored ne postoji.');
  }

  kreiraj(cmd: RasporedCmd): Ishod {
    const g = this.proveri(cmd);
    if (g) {
      return g;
    }
    const preklapanje = this.preklapanje(null, cmd);
    if (preklapanje) {
      return preklapanje;
    }
    const p: Period = { id: this.sledeciId++, naziv: cmd.naziv.trim(), vaziOd: cmd.vaziOd, vaziDo: cmd.vaziDo, pragNajava: cmd.pragNajava ?? 5, stavke: [] };
    p.stavke = cmd.stavke.map(s => this.novaStavka(s));
    this.periodi.push(p);
    return { status: 201, telo: this.details(p) };
  }

  izmeni(id: number, cmd: RasporedCmd): Ishod {
    const p = this.periodi.find(x => x.id === id);
    if (!p) {
      return greska(404, 'Raspored ne postoji.');
    }
    const g = this.proveri(cmd);
    if (g) {
      return g;
    }
    const stare = new Map(p.stavke.map(s => [s.id, s]));
    for (const [i, s] of cmd.stavke.entries()) {
      if (s.id !== null && !stare.has(s.id)) {
        return greska(400, `Termin ${i + 1} ne pripada ovom rasporedu.`);
      }
    }
    const preklapanje = this.preklapanje(id, cmd);
    if (preklapanje) {
      return preklapanje;
    }
    const nove: Stavka[] = [];
    for (const s of cmd.stavke) {
      const stara = s.id === null ? undefined : stare.get(s.id);
      if (stara && stara.predmetId === s.predmetId && stara.grupaId === s.grupaId) {
        Object.assign(stara, { dan: s.dan, pocetak: sekunde(s.pocetak), kraj: sekunde(s.kraj) });
        nove.push(stara);
      } else {
        nove.push(this.novaStavka(s));
      }
    }
    const ostaju = new Set(nove.map(s => s.id));
    const danas = isoDan(this.sada());
    const buduca = [...this.otkazani.keys()].filter(k => stare.has(Number(k.split(':')[0])) && k.split(':')[1] >= danas);
    this.ocistiStavke(p.stavke.filter(s => !ostaju.has(s.id)).map(s => s.id));
    Object.assign(p, { naziv: cmd.naziv.trim(), vaziOd: cmd.vaziOd, vaziDo: cmd.vaziDo, pragNajava: cmd.pragNajava ?? 5, stavke: nove });
    // kao server: budući otkazan termin uklonjene stavke ili koji više nije termin (dan, period) se briše i broji
    let izgubljena = 0;
    for (const k of buduca) {
      const [stavkaId, datum] = k.split(':');
      const s = ostaju.has(Number(stavkaId)) ? this.stavka(Number(stavkaId)) : undefined;
      if (!s || !this.jeTermin(s, datum)) {
        this.otkazani.delete(k);
        izgubljena++;
      }
    }
    return { telo: this.details(p, izgubljena) };
  }

  obrisi(id: number): Ishod {
    const i = this.periodi.findIndex(x => x.id === id);
    if (i < 0) {
      return greska(404, 'Raspored ne postoji.');
    }
    this.ocistiStavke(this.periodi[i].stavke.map(s => s.id));
    this.periodi.splice(i, 1);
    return { status: 204 };
  }

  // ------------------------------------------------------------------------------------------ nastavnik: termini

  termini(od: string | null, dana: string | null): Ishod {
    const n = dana === null ? 28 : Number(dana);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      return greska(400, 'Neispravan parametar: dana.');
    }
    const pocetak = od ?? isoDan(this.sada());
    return { telo: this.uProzoru(pocetak, pomeriDan(pocetak, n - 1)).map(([s, d]) => this.terminInfo(s, d)) };
  }

  otkazi(cmd: TerminCmd): Ishod {
    const napomena = (cmd.napomena ?? '').trim() || null;
    if (napomena && napomena.length > 200) {
      return greska(400, 'Napomena može imati najviše 200 znakova.');
    }
    const s = this.zakljucaj(cmd);
    if (!jeStavka(s)) {
      return s;
    }
    const k = kljuc(s.id, cmd.datum);
    let obavesteno = 0;
    if (!this.otkazani.has(k)) {
      this.o.resiPoKljucu(`MNOGO_NAJAVA:${k}`);
      obavesteno = cmd.posaljiMejl === false ? 0 : this.primaoci(s).length;
    }
    this.otkazani.set(k, napomena);
    const odgovor: PromenaTerminaOdgovor = { termin: this.terminInfo(s, cmd.datum), obavesteno, neposlato: 0 };
    return { telo: odgovor };
  }

  vrati(cmd: TerminCmd): Ishod {
    const s = this.zakljucaj(cmd);
    if (!jeStavka(s)) {
      return s;
    }
    const k = kljuc(s.id, cmd.datum);
    const obavesteno = this.otkazani.delete(k) && cmd.posaljiMejl !== false ? this.primaoci(s).length : 0;
    const odgovor: PromenaTerminaOdgovor = { termin: this.terminInfo(s, cmd.datum), obavesteno, neposlato: 0 };
    return { telo: odgovor };
  }

  // ------------------------------------------------------------------------------------------ student

  naredni(): NaredniCasovi {
    const termini: StudentskiTermin[] = [];
    for (const p of this.periodi) {
      for (const s of p.stavke.filter(x => x.grupaId === this.grupaStudenta)) {
        this.narednih(s).forEach(d => termini.push(this.studentskiTermin(s, d)));
      }
    }
    termini.sort((a, b) => a.datum.localeCompare(b.datum) || a.pocetak.localeCompare(b.pocetak) || a.stavkaId - b.stavkaId);
    return { termini };
  }

  najavi(cmd: NajavaCmd): Ishod {
    const razlog = (cmd.razlog ?? '').trim() || null;
    if (razlog && razlog.length > 200) {
      return greska(400, 'Razlog može imati najviše 200 znakova.');
    }
    const s = this.studentova(cmd);
    if (!jeStavka(s)) {
      return s;
    }
    this.upisiNajavu(this.studentNaloga, s, cmd.datum, razlog);
    return { telo: this.studentskiTermin(s, cmd.datum) };
  }

  povuci(cmd: NajavaCmd): Ishod {
    const s = this.studentova(cmd);
    if (!jeStavka(s)) {
      return s;
    }
    const i = this.najave.findIndex(n => n.stavkaId === s.id && n.datum === cmd.datum && n.studentId === this.studentNaloga);
    if (i >= 0) {
      this.najave.splice(i, 1);
    }
    return { telo: this.studentskiTermin(s, cmd.datum) };
  }

  // ------------------------------------------------------------------------------------------ početna

  /** `raspored` kontrolne table (danas .. danas + 6); `null` bez ijednog perioda (kao stariji backend: kartice nema). */
  tabla(): RasporedTablaInfo | null {
    if (this.periodi.length === 0) {
      return null;
    }
    const danas = isoDan(this.sada());
    return {
      pokrivaDanas: this.periodi.some(p => p.vaziOd <= danas && danas <= p.vaziDo),
      naredni: this.uProzoru(danas, pomeriDan(danas, 6)).map(([s, d]) => this.kratko(s, d)),
    };
  }

  /** Predlog „Sledeće predavanje“ iz rasporeda (spec 8); `null` = stara heuristika. */
  sledece(): { termin: TerminKratkoInfo; izvor: 'RASPORED_DANAS' | 'RASPORED_SLEDECI'; predmetId: number; grupaId: number } | null {
    const danas = isoDan(this.sada());
    if (!this.periodi.some(p => p.vaziOd <= danas && danas <= p.vaziDo)) {
      return null;
    }
    const sat = `${dva(this.sada().getHours())}:${dva(this.sada().getMinutes())}:00`;
    const svi = this.uProzoru(danas, pomeriDan(danas, 60)).filter(([s, d]) => !this.otkazani.has(kljuc(s.id, d)));
    const danasnji = svi.find(([s, d]) => d === danas && s.kraj > sat && this.o.predavanje(s.predmetId, s.grupaId, d) === null);
    const izbor = danasnji ?? svi.find(([, d]) => d > danas);
    if (!izbor) {
      return null;
    }
    const [s, d] = izbor;
    return { termin: this.kratko(s, d), izvor: danasnji ? 'RASPORED_DANAS' : 'RASPORED_SLEDECI', predmetId: s.predmetId, grupaId: s.grupaId };
  }

  // ------------------------------------------------------------------------------------------ interno

  private stavka(id: number): Stavka | undefined {
    return this.periodi.flatMap(p => p.stavke).find(s => s.id === id);
  }

  private periodStavke(id: number): Period {
    return this.periodi.find(p => p.stavke.some(s => s.id === id))!;
  }

  private jeTermin(s: Stavka, datum: string): boolean {
    const p = this.periodStavke(s.id);
    return /^\d{4}-\d{2}-\d{2}$/.test(datum) && p.vaziOd <= datum && datum <= p.vaziDo && danUNedelji(datum) === s.dan;
  }

  private poceo(datum: string, pocetak: string): boolean {
    const danas = isoDan(this.sada());
    const sat = `${dva(this.sada().getHours())}:${dva(this.sada().getMinutes())}:${dva(this.sada().getSeconds())}`;
    return datum < danas || (datum === danas && sat >= sekunde(pocetak));
  }

  /** Parovi (stavka, datum) u prozoru, po datumu pa početku. */
  private uProzoru(od: string, doDatuma: string): [Stavka, string][] {
    const izlaz: [Stavka, string][] = [];
    for (let d = od; d <= doDatuma; d = pomeriDan(d, 1)) {
      for (const p of this.periodi) {
        if (p.vaziOd <= d && d <= p.vaziDo) {
          p.stavke.filter(s => s.dan === danUNedelji(d)).forEach(s => izlaz.push([s, d]));
        }
      }
    }
    return izlaz.sort((a, b) => a[1].localeCompare(b[1]) || a[0].pocetak.localeCompare(b[0].pocetak) || a[0].id - b[0].id);
  }

  private zakljucaj(cmd: TerminCmd): Stavka | Ishod {
    const s = this.stavka(Number(cmd.stavkaId));
    if (!s || !this.jeTermin(s, cmd.datum)) {
      return greska(404, 'Termin ne postoji.');
    }
    return this.poceo(cmd.datum, s.pocetak) ? greska(409, 'Termin je već počeo.') : s;
  }

  private studentova(cmd: NajavaCmd): Stavka | Ishod {
    const s = this.stavka(Number(cmd.stavkaId));
    if (!s || s.grupaId !== this.grupaStudenta || !this.jeTermin(s, cmd.datum)) {
      return greska(404, 'Taj čas nije u tvom rasporedu.');
    }
    if (this.poceo(cmd.datum, s.pocetak)) {
      return greska(409, 'Čas je već počeo.');
    }
    if (!this.narednih(s).includes(cmd.datum)) {
      return greska(404, 'Taj čas nije u tvom rasporedu.');
    }
    return this.otkazani.has(kljuc(s.id, cmd.datum)) ? greska(409, 'Ovaj čas je otkazan.') : s;
  }

  private upisiNajavu(studentId: number, s: Stavka, datum: string, razlog: string | null): void {
    const postojeca = this.najave.find(n => n.stavkaId === s.id && n.datum === datum && n.studentId === studentId);
    if (postojeca) {
      postojeca.razlog = razlog;
      return;
    }
    const d = this.sada();
    this.najave.push({ stavkaId: s.id, datum, studentId, razlog, vreme: `${isoDan(d)}T${dva(d.getHours())}:${dva(d.getMinutes())}:00` });
    const broj = this.najave.filter(n => n.stavkaId === s.id && n.datum === datum).length;
    const prag = this.periodStavke(s.id).pragNajava;
    if (broj > prag) {
      this.o.mnogoNajava(`MNOGO_NAJAVA:${kljuc(s.id, datum)}`, {
        stavkaId: s.id, datum, pocetak: s.pocetak.slice(0, 5), kraj: s.kraj.slice(0, 5),
        predmet: this.o.predmet(s.predmetId)?.naziv ?? null, grupa: this.o.grupa(s.grupaId)?.naziv ?? null, broj, prag,
      });
    }
  }

  private primaoci(s: Stavka): StudentRasporeda[] {
    return this.o.studenti().filter(x => x.grupaId === s.grupaId);
  }

  /** Naredna 4 termina stavke koja nisu počela (kao `Termini.naredni(..., NAREDNIH)`): student vidi i najavljuje samo njih. */
  private narednih(s: Stavka): string[] {
    const p = this.periodStavke(s.id);
    const izlaz: string[] = [];
    for (let d = isoDan(this.sada()); izlaz.length < 4 && d <= p.vaziDo; d = pomeriDan(d, 1)) {
      if (d >= p.vaziOd && danUNedelji(d) === s.dan && !this.poceo(d, s.pocetak)) {
        izlaz.push(d);
      }
    }
    return izlaz;
  }

  /** Isti predmet, grupa, dan i početak u drugom periodu čiji se datumi preklapaju bar u jednom takvom danu: 400. */
  private preklapanje(id: number | null, cmd: RasporedCmd): Ishod | null {
    const datum = (iso: string) => iso.split('-').map(Number).reverse().map(String).join('. ') + '.';
    for (const [i, n] of cmd.stavke.entries()) {
      for (const p of this.periodi.filter(x => x.id !== id && x.vaziOd <= cmd.vaziDo && x.vaziDo >= cmd.vaziOd)) {
        const od = cmd.vaziOd > p.vaziOd ? cmd.vaziOd : p.vaziOd;
        const doDatuma = cmd.vaziDo < p.vaziDo ? cmd.vaziDo : p.vaziDo;
        const isti = p.stavke.some(d => d.predmetId === n.predmetId && d.grupaId === n.grupaId && d.dan === n.dan
          && d.pocetak === sekunde(n.pocetak));
        let imaDan = false;
        for (let d = od; d <= doDatuma && !imaDan; d = pomeriDan(d, 1)) {
          imaDan = danUNedelji(d) === n.dan;
        }
        if (isti && imaDan) {
          return greska(400, `Termin ${i + 1} već postoji u rasporedu „${p.naziv}“ (${datum(p.vaziOd)} – ${datum(p.vaziDo)}): isti `
            + 'predmet, grupa, dan i početak u periodima koji se preklapaju. Promeni datume važenja ili ukloni termin.');
        }
      }
    }
    return null;
  }

  private ocistiStavke(ids: number[]): void {
    const brisu = new Set(ids);
    for (const k of [...this.otkazani.keys()]) {
      if (brisu.has(Number(k.split(':')[0]))) {
        this.otkazani.delete(k);
      }
    }
    for (let i = this.najave.length - 1; i >= 0; i--) {
      if (brisu.has(this.najave[i].stavkaId)) {
        this.najave.splice(i, 1);
      }
    }
  }

  private proveri(cmd: RasporedCmd): Ishod | null {
    if (!cmd?.naziv?.trim()) {
      return greska(400, 'Naziv rasporeda je obavezan.');
    }
    if (!cmd.vaziOd || !cmd.vaziDo) {
      return greska(400, 'Datumi važenja su obavezni.');
    }
    if (cmd.vaziOd > cmd.vaziDo) {
      return greska(400, 'Raspored mora da počne pre nego što se završi.');
    }
    const vidjeni = new Set<string>();
    for (const [i, s] of (cmd.stavke ?? []).entries()) {
      if (!this.o.predmet(s.predmetId)) {
        return greska(400, `Termin ${i + 1}: predmet ne postoji.`);
      }
      if (!this.o.grupa(s.grupaId)) {
        return greska(400, `Termin ${i + 1}: grupa ne postoji.`);
      }
      if (sekunde(s.pocetak) >= sekunde(s.kraj)) {
        return greska(400, `Termin ${i + 1}: početak mora biti pre kraja.`);
      }
      const k = `${s.predmetId}:${s.grupaId}:${s.dan}:${sekunde(s.pocetak)}`;
      if (vidjeni.has(k)) {
        return greska(400, `Termin ${i + 1} se ponavlja (isti predmet, grupa, dan i početak).`);
      }
      vidjeni.add(k);
    }
    return null;
  }

  private novaStavka(s: RasporedCmd['stavke'][number]): Stavka {
    return { id: this.sledeciId++, predmetId: s.predmetId, grupaId: s.grupaId, dan: s.dan, pocetak: sekunde(s.pocetak), kraj: sekunde(s.kraj) };
  }

  private details(p: Period, izgubljenaOtkazivanja = 0): RasporedDetails {
    const danas = isoDan(this.sada());
    const otkazani = (s: Stavka) => [...this.otkazani.keys()]
      .map(k => k.split(':'))
      .filter(([id, d]) => Number(id) === s.id && d >= danas && this.jeTermin(s, d))
      .map(([, d]) => d)
      .sort();
    return {
      id: p.id, naziv: p.naziv, vaziOd: p.vaziOd, vaziDo: p.vaziDo, pragNajava: p.pragNajava,
      stavke: [...p.stavke]
        .sort((a, b) => a.dan - b.dan || a.pocetak.localeCompare(b.pocetak) || a.id - b.id)
        .map(s => ({
          id: s.id, predmet: this.o.predmet(s.predmetId)!, grupa: this.grupaInfo(s.grupaId), dan: s.dan, pocetak: s.pocetak, kraj: s.kraj,
          otkazani: otkazani(s),
        })),
      izgubljenaOtkazivanja,
    };
  }

  private grupaInfo(id: number) {
    const g = this.o.grupa(id)!;
    return { id: g.id, naziv: g.naziv, godinaUpisa: g.godinaUpisa, brojStudenata: g.brojStudenata ?? null };
  }

  private terminInfo(s: Stavka, datum: string): TerminInfo {
    const k = kljuc(s.id, datum);
    const studenti = this.o.studenti();
    const najave: NajavaInfo[] = this.najave
      .filter(n => n.stavkaId === s.id && n.datum === datum)
      .map(n => {
        const st = studenti.find(x => x.id === n.studentId);
        return {
          studentId: n.studentId, ime: st?.ime ?? null, prezime: st?.prezime ?? null, indeks: st?.indeks ?? null, godina: st?.godina ?? null,
          razlog: n.razlog, vreme: n.vreme,
        };
      });
    return {
      stavkaId: s.id, rasporedId: this.periodStavke(s.id).id, datum, pocetak: s.pocetak, kraj: s.kraj,
      predmet: this.o.predmet(s.predmetId)!, grupa: this.grupaInfo(s.grupaId), otkazan: this.otkazani.has(k),
      napomena: this.otkazani.get(k) ?? null, poceo: this.poceo(datum, s.pocetak), brojNajava: najave.length,
      prag: this.periodStavke(s.id).pragNajava, najave, predavanjeId: this.o.predavanje(s.predmetId, s.grupaId, datum),
    };
  }

  private kratko(s: Stavka, datum: string): TerminKratkoInfo {
    const k = kljuc(s.id, datum);
    return {
      stavkaId: s.id, datum, pocetak: s.pocetak, kraj: s.kraj, predmet: this.o.predmet(s.predmetId)!, grupa: this.grupaInfo(s.grupaId),
      otkazan: this.otkazani.has(k), napomena: this.otkazani.get(k) ?? null,
      brojNajava: this.najave.filter(n => n.stavkaId === s.id && n.datum === datum).length,
      predavanjeId: this.o.predavanje(s.predmetId, s.grupaId, datum),
    };
  }

  private studentskiTermin(s: Stavka, datum: string): StudentskiTermin {
    const k = kljuc(s.id, datum);
    const moja = this.najave.find(n => n.stavkaId === s.id && n.datum === datum && n.studentId === this.studentNaloga);
    return {
      stavkaId: s.id, datum, pocetak: s.pocetak, kraj: s.kraj, predmet: this.o.predmet(s.predmetId)?.naziv ?? '',
      grupa: this.o.grupa(s.grupaId)?.naziv ?? '', svojaGrupa: s.grupaId === this.grupaStudenta, otkazan: this.otkazani.has(k),
      napomena: this.otkazani.get(k) ?? null, najavljeno: !!moja, razlog: moja?.razlog ?? null,
    };
  }
}
