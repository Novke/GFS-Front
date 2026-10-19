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
interface OdgovorPolja { broj: number | null; prihvatljivi: string[] | null; tacna: number | null; tacne: number[] | null }
interface PoljeZadatka {
  kljuc: string; oznaka: string; tip: 'BROJ' | 'TEKST' | 'JEDAN_TACAN' | 'VISE_TACNIH'; jedinica: string | null;
  opcije: { id: number; tekst: string }[] | null; [polje: string]: unknown;
}
/** `ZadatakSlajdaInfo` kako ga server šalje uz slajd (fikstura ga nosi gotovog: mok ne računa kandidate). */
interface ZadatakInfo {
  grupaId: number | null; brojVarijanti: number | null; brojAktivnihVarijanti: number; polja: PoljeZadatka[] | null;
  [polje: string]: unknown;
}
/** Aktivna varijanta grupe Zadatak slajda (fikstura `varijanteZadatka`): šta se izvlači pri otvaranju runde. */
interface VarijantaZadatka {
  varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; odgovori: Record<string, OdgovorPolja>;
}
export interface Slajd {
  id: number; rb: number; tip: 'INFO' | 'PITANJE' | 'PLATNO' | 'ZADATAK'; naslov: string | null; sadrzaj: string | null;
  beleske: string | null; postepeno: boolean; pitanje: Pitanje | null; platno: { animacije: Animacija[] } | null;
  /** Samo ZADATAK. */
  zadatak?: ZadatakInfo | null;
  /** Prelaz na slajd (faza 5); fikstura bez polja = bez prelaza (`null` u snimku, kao server). */
  prelaz?: { efekat: string; smer: string | null; trajanjeMs: number } | null;
  [polje: string]: unknown;
}
interface IzvodjenjeInfo {
  id: number; prezentacija: { id: number; naziv: string; predmetId: number }; kod: string; status: 'AKTIVNO' | 'ZAVRSENO';
  cuvanje: boolean; grupa: unknown; predavanje: unknown; pocetak: string; kraj: string | null; brojUcesnika: number;
  brojPitanja: number; boduje?: boolean;
}
interface Ucesnik {
  id: number; ime: string; poeni: number; povezan: boolean; odgovorio: boolean;
  /** Samo u Zadatak rundi: dodeljena varijanta i ishod. */
  varijantaId?: number | null; tacno?: boolean | null;
}
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
  /** Aktivne varijante grupe Zadatak slajda (izvlače se redom, prvih `brojZaOtvaranje`). */
  varijanteZadatka?: VarijantaZadatka[];
}

/** `NastavnickiZadatak` (konzola vidi sve: tačne odgovore i rešenja svake izvučene). */
interface ZadatakSnimak {
  slajd: ZadatakInfo; izmenaBrojaVarijanti: number | null; brojZaOtvaranje: number; resenjePrikazano: boolean;
  varijante: {
    varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; dodeljeno: number; odgovorilo: number;
    tacnih: number;
  }[] | null;
  rezultat: { ukupno: number; varijante: unknown[]; odgovoriPrikazani: boolean } | null;
  javniRezultat: null;
}

/** Snimak za nastavnika: sva polja `NastavnickoStanje`. */
export interface NastavnickoSnimak {
  izvodjenje: IzvodjenjeInfo; verzija: number; serverVremeMs: number; prikaz: Prikaz; korak: number; brojStavki: number;
  indeks: number; brojSlajdova: number; trenutniSlajd: Slajd | null; sledeciSlajd: Slajd | null; faza: Faza | null;
  runda: Runda | null; rezultatiPrikazani: boolean; tacanPrikazan: boolean; rangListaPrikazana: boolean;
  ekran: 'NORMALAN' | 'CRN' | 'BEO'; qrPrikazan: boolean; telefonPrikaz: 'DUGMAD' | 'PITANJE'; detaljiDozvoljeni: boolean;
  takmicenje: boolean; tema: string; rezultat: Rezultat | null; brojOdgovora: number; brojPovezanih: number;
  ucesnici: Ucesnik[]; rangLista: unknown[]; javniRezultat: Rezultat | null; javnaRangLista: unknown[] | null;
  pocetakMs: number; zadatak: ZadatakSnimak | null;
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

/**
 * Slajd u snimku kao na serveru (`SlajdMapper.bezPoteza`, plan faze 5 odluka 8): svaki CRTEZ sloj dobija `potezi: null`,
 * a potezi stižu samo kroz `GET slajdovi/:id/potezi`. Kopija, pa fikstura (koju ruta poteza čita) ostaje netaknuta.
 */
function bezPoteza(s: Slajd | null): Slajd | null {
  const slojevi = (s?.platno as { slojevi?: Record<string, unknown>[] } | null | undefined)?.slojevi;
  if (!s || !slojevi?.some(x => x['tip'] === 'CRTEZ')) return s;
  return {
    ...s,
    platno: { ...s.platno!, slojevi: slojevi.map(x => (x['tip'] === 'CRTEZ' ? { ...x, potezi: null } : x)) } as Slajd['platno'],
  };
}

/** Slajd u snimku: bez poteza, a `prelaz` uvek postoji (server ga šalje i kad je `null`). */
function zaSnimak(s: Slajd | null): Slajd | null {
  const b = bezPoteza(s);
  return b && { ...b, prelaz: b.prelaz ?? null };
}

const imaTacan = (p: Pitanje | null): boolean =>
  !!p && (['JEDAN_TACAN', 'VISE_TACNIH', 'TACNO_NETACNO'].includes(p.tip)
    || (p.tip === 'BROJ' && p.brojTacno !== null) || (p.tip === 'KRATAK_TEKST' && !!p.prihvatljiviOdgovori?.length));

/**
 * Pitanje sa formulama (5a, izmišljeno): u tekstu ispravna formula, dve zabranjene komande (`ZABRANJENE_KOMANDE`: `\href`
 * i `\htmlStyle` sa CSS `url(`, Review Focus 2: ni veza ni zahtev van porekla) i nepoznata komanda (`\nepostoji{x}`:
 * MathLive je stvarno odbija; `\frac{1}{` bi nacrtao), u opcijama dve formule. Isto pitanje vidi telefon studenta
 * (`uzivo-javno.spec.ts`), projektor i axe (`pristupacnost.spec.ts`).
 */
export const TEKST_SA_FORMULOM = 'Koliko je $1011_2$ dekadno? Vidi $\\href{http://primer.invalid}{ovde}$, '
  + '$\\htmlStyle{background:url(http://primer.invalid/x.png)}{x}$ i $\\nepostoji{x}$.';
/** Formula teksta pitanja koje ostaju izvor `$...$` (redom). */
export const IZVORI_TEKSTA = [
  '$\\href{http://primer.invalid}{ovde}$', '$\\htmlStyle{background:url(http://primer.invalid/x.png)}{x}$', '$\\nepostoji{x}$',
] as const;
export const OPCIJE_SA_FORMULOM = ['$11$', '$13$'] as const;
/** Ispravnih formula (tekst + opcije), koje se crtaju MathLive-om; ostale (`IZVORI_TEKSTA`) ostaju izvor `$...$`. */
export const SPREMNIH_FORMULA = 3;

/** `pitanje` nastavničkog slajda sa `TEKST_SA_FORMULOM` (za `MockIzvodjenje.izmeniSlajd(2, { pitanje })`). */
export const pitanjeSaFormulom = (): Pitanje & Record<string, unknown> => ({
  id: 51, tip: 'JEDAN_TACAN', tekst: TEKST_SA_FORMULOM, slika: null, vremeSekunde: null,
  opcije: OPCIJE_SA_FORMULOM.map((tekst, i) => ({ id: i + 1, rb: i + 1, tekst, tacna: i === 0 })),
  brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
  prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
});

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
  /** Zadatak slajd: izbor broja različitih iz konzole (`null` kao na slajdu, `0` sve), rešenje i izvučene u rundi. */
  private izmenaBrojaVarijanti: number | null = null;
  private resenjePrikazano = false;
  private izvucene: VarijantaZadatka[] | null = null;

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

  /** Slajd izvođenja po id-ju, sa potezima (za `GET slajdovi/:id/potezi`; snimak nosi slajd bez poteza, `bezPoteza`). */
  slajdPoId(id: number): Slajd | undefined {
    return this.f.slajdovi.find(s => s.id === id);
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
      trenutniSlajd: zaSnimak(trenutni), sledeciSlajd: this.prikaz === 'KRAJ' ? null : zaSnimak(sl[this.indeks + 1] ?? null),
      faza: this.faza, runda: this.runda, rezultatiPrikazani: this.rezultatiPrikazani, tacanPrikazan: this.tacanPrikazan,
      rangListaPrikazana: false, ekran: 'NORMALAN', qrPrikazan: false, telefonPrikaz: this.f.telefonPrikaz,
      detaljiDozvoljeni: this.f.detaljiDozvoljeni, takmicenje: this.f.takmicenje, tema: this.f.tema, rezultat,
      brojOdgovora: 0, brojPovezanih: this.f.ucesnici.filter(u => u.povezan).length,
      rangLista: [], javniRezultat: javni, javnaRangLista: null, pocetakMs: this.pocetakMs,
      ucesnici: this.ucesniciSnimka(), zadatak: this.zadatakSnimak(trenutni),
    };
  }

  /** Komanda kao `POST izvodjenja/{id}/komande`: 200 sa novim snimkom, 409 sa razlogom ili 410 posle `zavrsi()`. */
  primeni(tip: string, vrednost?: number | null): IshodKomande {
    if (this.f.izvodjenje.status !== 'AKTIVNO') return greska(410, 'Izvođenje je završeno.');
    const trenutni = this.trenutni();
    const pitanje = trenutni?.tip === 'PITANJE' ? trenutni.pitanje : null;
    const zadatak = trenutni?.tip === 'ZADATAK' ? trenutni.zadatak ?? null : null;
    switch (tip) {
      case 'SLEDECI': {
        const odbijeno = this.sledeci(pitanje, zadatak);
        if (odbijeno) return odbijeno;
        break;
      }
      case 'PRETHODNI':
        this.prethodni();
        break;
      case 'IDI_NA':
        if (vrednost == null || !Number.isInteger(vrednost) || vrednost < -1 || vrednost > this.f.slajdovi.length) {
          return greska(400, 'Neispravan broj slajda.');
        }
        this.idi(vrednost, 0);
        break;
      case 'OTVORI_ZATVORI': {
        if (!pitanje && !zadatak) return greska(409, 'Na ovom slajdu nema pitanja.');
        if (this.faza === 'OTVORENO') this.faza = 'ZATVORENO';
        else if (this.faza === 'ZATVORENO') this.faza = 'OTVORENO';
        else {
          const odbijeno = this.otvori(zadatak);
          if (odbijeno) return odbijeno;
        }
        break;
      }
      case 'REZULTATI':
        if (!this.rezultatiPrikazani && !((pitanje || zadatak) && this.runda && this.faza !== 'CEKA')) {
          return greska(409, 'Rezultati se vide kad se pitanje otvori.');
        }
        this.rezultatiPrikazani = !this.rezultatiPrikazani;
        break;
      case 'TACAN':
        if (!this.tacanPrikazan && zadatak) {
          const odbijeno = this.posleZatvaranja() ?? (zadatak.polja?.length ? null : greska(409, 'Ovo pitanje nema tačan odgovor.'));
          if (odbijeno) return odbijeno;
        } else if (!this.tacanPrikazan && !(pitanje && this.faza === 'ZATVORENO' && imaTacan(pitanje))) {
          return greska(409, 'Prvo zatvori pitanje.');
        }
        this.tacanPrikazan = !this.tacanPrikazan;
        break;
      case 'RESENJE':
        // prekidač: isključenje uvek, uključenje na zatvorenoj Zadatak rundi sa bar jednim rešenjem (kao server)
        if (!this.resenjePrikazano) {
          if (!zadatak) return greska(409, 'Na ovom slajdu nema zadatka.');
          const odbijeno = this.posleZatvaranja()
            ?? (this.izvucene?.some(v => v.resenjeSvgId) ? null : greska(409, 'Nijedna varijanta nema rešenje.'));
          if (odbijeno) return odbijeno;
        }
        this.resenjePrikazano = !this.resenjePrikazano;
        break;
      case 'BROJ_VARIJANTI': {
        if (!zadatak) return greska(409, 'Na ovom slajdu nema zadatka.');
        if (this.faza !== 'CEKA') return greska(409, 'Broj različitih zadataka se menja pre otvaranja.');
        const n = vrednost ?? null;
        if (n !== null && (!Number.isInteger(n) || n < 0 || n > 50)) return greska(400, 'Broj različitih zadataka mora biti od 1 do 50.');
        this.izmenaBrojaVarijanti = n;
        break;
      }
      default:
        return greska(409, 'Mok: komanda nije podržana.');
    }
    this.verzija++;
    return { status: 200, telo: this.stanje() };
  }

  private trenutni(): Slajd | null {
    return this.prikaz === 'SLAJD' ? this.f.slajdovi[this.indeks] ?? null : null;
  }

  /** Koliko se izvlači pri otvaranju: izbor iz konzole, inače broj sa slajda (`null` = sve), najviše koliko ima aktivnih. */
  private brojZaOtvaranje(z: ZadatakInfo): number {
    const m = z.brojAktivnihVarijanti;
    const n = this.izmenaBrojaVarijanti === null ? (z.brojVarijanti ?? m) : this.izmenaBrojaVarijanti === 0 ? m : this.izmenaBrojaVarijanti;
    return Math.min(n, m);
  }

  /** Razlog odbijanja `TACAN`/`RESENJE` pre zatvaranja (kao `TACAN` na pitanju), `null` na zatvorenoj rundi. */
  private posleZatvaranja(): IshodKomande | null {
    if (this.faza === 'ZATVORENO') return null;
    return greska(409, this.faza === 'OTVORENO' ? 'Prvo zatvori pitanje.' : 'Pitanje još nije postavljeno.');
  }

  /** Nova runda; na Zadatak slajdu izvlači prve `brojZaOtvaranje` aktivne varijante (bez njih 409, faza ostaje CEKA). */
  private otvori(zadatak: ZadatakInfo | null = null): IshodKomande | null {
    if (zadatak) {
      if (zadatak.grupaId === null) return greska(409, 'Grupa zadatka je obrisana.');
      const n = this.brojZaOtvaranje(zadatak);
      if (n === 0) return greska(409, 'Grupa nema aktivnih varijanti.');
      this.izvucene = (this.f.varijanteZadatka ?? []).slice(0, n);
      this.resenjePrikazano = false;
    }
    this.faza = 'OTVORENO';
    this.brojRundi++;
    this.runda = { id: 900 + this.brojRundi, redniBroj: this.brojRundi, rokMs: null, preostaloMs: null, tajmerRadi: false };
    return null;
  }

  /** Dodela u Zadatak rundi: učesnici redom, varijante ciklično (ravnomerno, kao server; bez nasumičnosti). */
  private dodele(): Map<number, number> {
    const v = this.izvucene ?? [];
    return new Map(v.length ? this.f.ucesnici.map((u, i) => [u.id, v[i % v.length].varijantaId] as const) : []);
  }

  private ucesniciSnimka(): Ucesnik[] {
    if (!this.izvucene || this.trenutni()?.tip !== 'ZADATAK') return this.f.ucesnici;
    const d = this.dodele();
    return this.f.ucesnici.map(u => ({ ...u, varijantaId: d.get(u.id) ?? null, tacno: null }));
  }

  /** `NastavnickiZadatak` (bez odgovora: brojevi odgovora su 0); `javniRezultat` mok ne gradi. */
  private zadatakSnimak(sl: Slajd | null): ZadatakSnimak | null {
    const z = sl?.tip === 'ZADATAK' ? sl.zadatak ?? null : null;
    if (!z) return null;
    const d = [...this.dodele().values()];
    const polja = z.polja ?? [];
    const izvucene = this.izvucene;
    return {
      slajd: z, izmenaBrojaVarijanti: this.izmenaBrojaVarijanti, brojZaOtvaranje: this.brojZaOtvaranje(z),
      resenjePrikazano: this.resenjePrikazano,
      varijante: izvucene?.map(v => ({
        varijantaId: v.varijantaId, naziv: v.naziv, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId,
        dodeljeno: d.filter(x => x === v.varijantaId).length, odgovorilo: 0, tacnih: 0,
      })) ?? null,
      rezultat: izvucene && {
        ukupno: 0, odgovoriPrikazani: true,
        varijante: izvucene.map(v => ({
          varijantaId: v.varijantaId, naziv: v.naziv, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId,
          dodeljeno: d.filter(x => x === v.varijantaId).length, odgovorilo: 0, tacnih: 0,
          polja: polja.map(p => ({
            kljuc: p.kljuc, oznaka: p.oznaka, tip: p.tip, jedinica: p.jedinica, vrednosti: p.opcije ? null : [],
            opcije: p.opcije?.map(o => ({ id: o.id, tekst: o.tekst, broj: 0, tacna: null })) ?? null,
            tacno: v.odgovori[p.kljuc] ?? null,
          })),
        })),
      },
      javniRezultat: null,
    };
  }

  /** Slajd `i` na koraku `korak` (pitanje u CEKA); `i < 0` je prijava, `i >= broj slajdova` kraj. */
  private idi(i: number, korak: number): void {
    const n = this.f.slajdovi.length;
    this.runda = null;
    this.rezultatiPrikazani = false;
    this.tacanPrikazan = false;
    this.izmenaBrojaVarijanti = null;
    this.resenjePrikazano = false;
    this.izvucene = null;
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
      this.faza = ['PITANJE', 'ZADATAK'].includes(this.f.slajdovi[i].tip) ? 'CEKA' : null;
    }
  }

  /** `→`; na pitanju i Zadatak slajdu prvo otvara i zatvara rundu. Vraća odbijanje (Zadatak bez aktivnih varijanti). */
  private sledeci(pitanje: Pitanje | null, zadatak: ZadatakInfo | null): IshodKomande | null {
    if (this.prikaz === 'KRAJ') return null;
    if (this.prikaz === 'PRIJAVA') {
      this.idi(0, 0);
      return null;
    }
    if (pitanje || zadatak) {
      if (this.faza === 'CEKA' || this.faza === null) return this.otvori(zadatak);
      if (this.faza === 'OTVORENO') {
        this.faza = 'ZATVORENO';
        return null;
      }
      this.idi(this.indeks + 1, 0);
      return null;
    }
    if (this.korak < brojKoraka(this.trenutni())) {
      this.korak++;
      return null;
    }
    this.idi(this.indeks + 1, 0);
    return null;
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
