/*
 * Mok nastavničkog izvođenja za e2e (daljinski i konzola): jednostavna mašina stanja, pojednostavljena kopija pravila
 * servera (`IzvodjenjeService`, uživo spec 2.3), samo za ono što e2e proverava. E2e ne uvozi `src/`, pa su DTO-i ovde
 * lokalni tipovi sa istim poljima kao `NastavnickoStanje` (`src/app/features/uzivo/data-access/uzivo.models.ts`).
 */

type Prikaz = 'PRIJAVA' | 'SLAJD' | 'KRAJ';
type Faza = 'CEKA' | 'OTVORENO' | 'ZATVORENO';

interface Opcija { id: number; rb: number; tekst: string; tacna: boolean }
interface Pitanje { id: number; tip: string; opcije: Opcija[]; brojTacno: number | null; prihvatljiviOdgovori: string[] | null }
interface Animacija { okidac: string }
export interface Slajd {
  id: number; rb: number; tip: 'INFO' | 'PITANJE' | 'PLATNO'; naslov: string | null; sadrzaj: string | null;
  beleske: string | null; postepeno: boolean; pitanje: Pitanje | null; platno: { animacije: Animacija[] } | null;
  [polje: string]: unknown;
}
interface IzvodjenjeInfo {
  id: number; prezentacija: { id: number; naziv: string; predmetId: number }; kod: string; status: 'AKTIVNO' | 'ZAVRSENO';
  cuvanje: boolean; grupa: unknown; predavanje: unknown; pocetak: string; kraj: string | null; brojUcesnika: number;
  brojPitanja: number;
}
interface Ucesnik { id: number; ime: string; poeni: number; povezan: boolean; odgovorio: boolean }
interface Runda { id: number; redniBroj: number; rokMs: number | null; preostaloMs: number | null; tajmerRadi: boolean }
interface Rezultat {
  tip: string; ukupno: number; opcije: { id: number; tekst: string | null; broj: number; tacna: boolean | null }[] | null;
  brojevi: null; tekstovi: null; skala: null;
}

export interface FiksturaIzvodjenja {
  izvodjenje: IzvodjenjeInfo;
  tema: string;
  takmicenje: boolean;
  telefonPrikaz: 'DUGMAD' | 'PITANJE';
  detaljiDozvoljeni: boolean;
  slajdovi: Slajd[];
  ucesnici: Ucesnik[];
}

/** Snimak za nastavnika: sva polja `NastavnickoStanje`. */
export interface NastavnickoSnimak {
  izvodjenje: IzvodjenjeInfo; verzija: number; serverVremeMs: number; prikaz: Prikaz; korak: number; brojStavki: number;
  indeks: number; brojSlajdova: number; trenutniSlajd: Slajd | null; sledeciSlajd: Slajd | null; faza: Faza | null;
  runda: Runda | null; rezultatiPrikazani: boolean; tacanPrikazan: boolean; rangListaPrikazana: boolean;
  ekran: 'NORMALAN' | 'CRN' | 'BEO'; qrPrikazan: boolean; telefonPrikaz: 'DUGMAD' | 'PITANJE'; detaljiDozvoljeni: boolean;
  takmicenje: boolean; tema: string; rezultat: Rezultat | null; brojOdgovora: number; brojPovezanih: number;
  ucesnici: Ucesnik[]; rangLista: unknown[]; javniRezultat: Rezultat | null; javnaRangLista: unknown[] | null;
  pocetakMs: number;
}

export interface IshodKomande { status: number; telo: unknown }

const greska = (status: number, reason: string): IshodKomande => ({ status, telo: { reason, time: new Date().toISOString() } });

/** Broj koraka slajda: INFO postepeno = stavke liste (`- ` bez uvlačenja), PLATNO = KLIK animacije, ostalo 0. */
export function brojKoraka(s: Slajd | null | undefined): number {
  if (!s) return 0;
  if (s.tip === 'INFO' && s.postepeno) return (s.sadrzaj ?? '').split('\n').filter(r => r.startsWith('- ')).length;
  if (s.tip === 'PLATNO') return (s.platno?.animacije ?? []).filter(a => a.okidac === 'KLIK').length;
  return 0;
}

const imaTacan = (p: Pitanje | null): boolean =>
  !!p && (['JEDAN_TACAN', 'VISE_TACNIH', 'TACNO_NETACNO'].includes(p.tip)
    || (p.tip === 'BROJ' && p.brojTacno !== null) || (p.tip === 'KRATAK_TEKST' && !!p.prihvatljiviOdgovori?.length));

export class MockIzvodjenje {
  private readonly f: FiksturaIzvodjenja;
  private readonly pocetakMs = Date.now() - (12 * 60 + 2) * 1000;
  private verzija = 1;
  private prikaz: Prikaz = 'PRIJAVA';
  private indeks = -1;
  private korak = 0;
  private faza: Faza | null = null;
  private runda: Runda | null = null;
  private brojRundi = 0;
  private rezultatiPrikazani = false;
  private tacanPrikazan = false;

  constructor(fikstura: FiksturaIzvodjenja) {
    this.f = fikstura;
  }

  get id(): number {
    return this.f.izvodjenje.id;
  }

  /** Menja slajd u fiksturi (pre ili tokom testa); vidi se u sledećem snimku. */
  izmeniSlajd(indeks: number, izmene: Record<string, unknown>): void {
    Object.assign(this.f.slajdovi[indeks], izmene);
  }

  /** Izvođenje je završeno (npr. sa laptopa): `GET stanje` pokazuje ZAVRSENO, svaka komanda dobija 410. */
  zavrsi(): void {
    this.f.izvodjenje.status = 'ZAVRSENO';
    this.f.izvodjenje.kraj = '2026-10-07T11:00:00';
    this.verzija++;
  }

  stanje(): NastavnickoSnimak {
    const sl = this.f.slajdovi;
    const trenutni = this.trenutni();
    const pitanje = trenutni?.tip === 'PITANJE' ? trenutni.pitanje : null;
    const rezultat: Rezultat | null = pitanje && this.runda
      ? { tip: pitanje.tip, ukupno: 0, opcije: pitanje.opcije.map(o => ({ id: o.id, tekst: o.tekst, broj: 0, tacna: o.tacna })),
          brojevi: null, tekstovi: null, skala: null }
      : null;
    const javni = rezultat && this.rezultatiPrikazani
      ? { ...rezultat, opcije: rezultat.opcije!.map(o => ({ ...o, tacna: this.tacanPrikazan ? o.tacna : null })) }
      : null;
    return {
      izvodjenje: { ...this.f.izvodjenje }, verzija: this.verzija, serverVremeMs: Date.now(), prikaz: this.prikaz,
      korak: this.korak, brojStavki: brojKoraka(trenutni), indeks: this.indeks, brojSlajdova: sl.length,
      trenutniSlajd: trenutni, sledeciSlajd: this.prikaz === 'KRAJ' ? null : (sl[this.indeks + 1] ?? null),
      faza: this.faza, runda: this.runda, rezultatiPrikazani: this.rezultatiPrikazani, tacanPrikazan: this.tacanPrikazan,
      rangListaPrikazana: false, ekran: 'NORMALAN', qrPrikazan: false, telefonPrikaz: this.f.telefonPrikaz,
      detaljiDozvoljeni: this.f.detaljiDozvoljeni, takmicenje: this.f.takmicenje, tema: this.f.tema, rezultat,
      brojOdgovora: 0, brojPovezanih: this.f.ucesnici.filter(u => u.povezan).length, ucesnici: this.f.ucesnici,
      rangLista: [], javniRezultat: javni, javnaRangLista: null, pocetakMs: this.pocetakMs,
    };
  }

  /** Komanda kao `POST izvodjenja/{id}/komande`: 200 sa novim snimkom, 409 sa razlogom ili 410 posle `zavrsi()`. */
  primeni(tip: string, vrednost?: number | null): IshodKomande {
    void vrednost;
    if (this.f.izvodjenje.status !== 'AKTIVNO') return greska(410, 'Izvođenje je završeno.');
    const trenutni = this.trenutni();
    const pitanje = trenutni?.tip === 'PITANJE' ? trenutni.pitanje : null;
    switch (tip) {
      case 'SLEDECI':
        this.sledeci(pitanje);
        break;
      case 'PRETHODNI':
        this.prethodni();
        break;
      case 'OTVORI_ZATVORI':
        if (!pitanje) return greska(409, 'Na ovom slajdu nema pitanja.');
        if (this.faza === 'OTVORENO') this.faza = 'ZATVORENO';
        else if (this.faza === 'ZATVORENO') this.faza = 'OTVORENO';
        else this.otvori();
        break;
      case 'REZULTATI':
        if (!this.rezultatiPrikazani && !(pitanje && this.runda && this.faza !== 'CEKA')) {
          return greska(409, 'Rezultati se vide kad se pitanje otvori.');
        }
        this.rezultatiPrikazani = !this.rezultatiPrikazani;
        break;
      case 'TACAN':
        if (!this.tacanPrikazan && !(pitanje && this.faza === 'ZATVORENO' && imaTacan(pitanje))) {
          return greska(409, 'Prvo zatvori pitanje.');
        }
        this.tacanPrikazan = !this.tacanPrikazan;
        break;
      default:
        return greska(409, 'Mok: komanda nije podržana.');
    }
    this.verzija++;
    return { status: 200, telo: this.stanje() };
  }

  private trenutni(): Slajd | null {
    return this.prikaz === 'SLAJD' ? this.f.slajdovi[this.indeks] ?? null : null;
  }

  private otvori(): void {
    this.faza = 'OTVORENO';
    this.brojRundi++;
    this.runda = { id: 900 + this.brojRundi, redniBroj: this.brojRundi, rokMs: null, preostaloMs: null, tajmerRadi: false };
  }

  /** Slajd `i` na koraku `korak` (pitanje u CEKA); `i < 0` je prijava, `i >= broj slajdova` kraj. */
  private idi(i: number, korak: number): void {
    const n = this.f.slajdovi.length;
    this.runda = null;
    this.rezultatiPrikazani = false;
    this.tacanPrikazan = false;
    this.korak = 0;
    this.faza = null;
    if (i < 0) {
      this.prikaz = 'PRIJAVA';
      this.indeks = -1;
    } else if (i >= n) {
      this.prikaz = 'KRAJ';
      this.indeks = n;
    } else {
      this.prikaz = 'SLAJD';
      this.indeks = i;
      this.korak = korak;
      this.faza = this.f.slajdovi[i].tip === 'PITANJE' ? 'CEKA' : null;
    }
  }

  private sledeci(pitanje: Pitanje | null): void {
    if (this.prikaz === 'KRAJ') return;
    if (this.prikaz === 'PRIJAVA') return this.idi(0, 0);
    if (pitanje) {
      if (this.faza === 'CEKA' || this.faza === null) return this.otvori();
      if (this.faza === 'OTVORENO') {
        this.faza = 'ZATVORENO';
        return;
      }
      return this.idi(this.indeks + 1, 0);
    }
    if (this.korak < brojKoraka(this.trenutni())) {
      this.korak++;
      return;
    }
    this.idi(this.indeks + 1, 0);
  }

  private prethodni(): void {
    const sl = this.f.slajdovi;
    if (this.prikaz === 'PRIJAVA') return;
    if (this.prikaz === 'KRAJ') return this.idi(sl.length - 1, brojKoraka(sl[sl.length - 1]));
    if (this.faza === 'OTVORENO') {
      this.faza = 'ZATVORENO';
      return;
    }
    if (this.korak > 0) {
      this.korak--;
      return;
    }
    if (this.indeks === 0) return this.idi(-1, 0);
    this.idi(this.indeks - 1, brojKoraka(sl[this.indeks - 1]));
  }
}
