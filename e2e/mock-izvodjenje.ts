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
  grupaId: number | null; brojVarijanti: number | null; nivo?: number | null; brojAktivnihVarijanti: number;
  brojAktivnihPoNivou?: number[]; polja: PoljeZadatka[] | null;
  [polje: string]: unknown;
}
/** Aktivna varijanta grupe Zadatak slajda (fikstura `varijanteZadatka`): šta se izvlači pri otvaranju runde. */
interface VarijantaZadatka {
  varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; odgovori: Record<string, OdgovorPolja>;
  /** Nivo 1-3; fikstura bez njega = 2 (kao server za varijante od pre nivoa). */
  nivo?: number;
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
  /** Broj tačnih (nastavnički uvek kad pitanje ima tačan; javni tek posle `TACAN` na zatvorenom pitanju). */
  tacnih: number | null;
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

/** `RezultatPolja`: `vrednosti` (BROJ, TEKST) ili `opcije` (JEDAN_TACAN, VISE_TACNIH), `tacno` tek kad je `TACAN` vidljiv. */
interface RezultatPoljaMok {
  kljuc: string; oznaka: string; tip: PoljeZadatka['tip']; jedinica: string | null;
  vrednosti: { kljuc: string; tekst: string; broj: number; sakriven: boolean; tacan: boolean | null }[] | null;
  opcije: { id: number; tekst: string | null; broj: number; tacna: boolean | null }[] | null; tacno: OdgovorPolja | null;
}
interface RezultatVarijanteMok {
  varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; dodeljeno: number; odgovorilo: number;
  tacnih: number | null; polja: RezultatPoljaMok[];
}
/** `ZadatakRezultat`: bez `odgovoriPrikazani` su brojevi 0 i `vrednosti` `null` (pravila vidljivosti iz Ugovora). */
interface ZadatakRezultatMok { ukupno: number; varijante: RezultatVarijanteMok[]; odgovoriPrikazani: boolean }
/** Šta rezultat otkriva: nezavisni prekidači projektora (rezultati, `TACAN`, `RESENJE`); konzola ima sve. */
interface Vidljivo { brojevi: boolean; tacno: boolean; resenje: boolean }

/** `NastavnickiZadatak` (konzola vidi sve: tačne odgovore i rešenja svake izvučene; projektor samo `javniRezultat`). */
interface ZadatakSnimak {
  slajd: ZadatakInfo; izmenaBrojaVarijanti: number | null; izmenaNivoa: number | null; nivoZaOtvaranje: number | null;
  brojZaOtvaranje: number; resenjePrikazano: boolean;
  varijante: {
    varijantaId: number; naziv: string | null; svgId: string; resenjeSvgId: string | null; dodeljeno: number; odgovorilo: number;
    tacnih: number; nivo: number | null;
  }[] | null;
  rezultat: ZadatakRezultatMok | null;
  javniRezultat: ZadatakRezultatMok | null;
}

/** Odgovor učesnika po polju (`OdgovorCmd.polja`): BROJ i TEKST string, JEDAN_TACAN i VISE_TACNIH lista id-jeva opcija. */
export type OdgovoriPolja = Record<string, string | number[]>;

/** Da li je vrednost polja tačna po definiciji varijante (BROJ tačno, TEKST među prihvatljivima, opcije skup id-jeva). */
function jeTacno(p: PoljeZadatka, vrednost: string | number[] | undefined, tacan: OdgovorPolja | undefined): boolean {
  if (vrednost === undefined || !tacan) return false;
  if (typeof vrednost === 'string') {
    return p.tip === 'BROJ' ? Number(vrednost) === tacan.broj : (tacan.prihvatljivi ?? []).includes(vrednost);
  }
  const trazeni = p.tip === 'JEDAN_TACAN' ? [tacan.tacna] : [...(tacan.tacne ?? [])].sort();
  return trazeni.length === vrednost.length && [...vrednost].sort().every((x, i) => x === trazeni[i]);
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
  /** Izbor nivoa iz konzole (`null` kao na slajdu, `0` svi, `1..3`); briše se napuštanjem slajda. */
  private izmenaNivoa: number | null = null;
  private resenjePrikazano = false;
  private izvucene: VarijantaZadatka[] | null = null;
  /** Odgovori učesnika u Zadatak rundi (`odgovori`), po id-ju učesnika. */
  private readonly odgovoriZadatka = new Map<number, OdgovoriPolja>();

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

  /**
   * Učesnik odgovara u otvorenoj Zadatak rundi (kao STOMP `SEND`, bez provere roka i šeme): računa se u sledećem snimku
   * (`brojOdgovora`, `odgovorio`, `tacno`, brojevi varijante, vrednosti polja). Mok ne šalje snimak sam: spec ga šalje kroz broker.
   */
  odgovori(ucesnikId: number, polja: OdgovoriPolja): void {
    this.odgovoriZadatka.set(ucesnikId, polja);
    this.verzija++;
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
          brojevi: null, tekstovi: null, skala: null, tacnih: imaTacan(pitanje) ? 0 : null }
      : null;
    const tacanVidljiv = this.tacanPrikazan && this.faza === 'ZATVORENO';
    const javni = rezultat && this.rezultatiPrikazani
      ? { ...rezultat, opcije: rezultat.opcije!.map(o => ({ ...o, tacna: tacanVidljiv ? o.tacna : null })),
          tacnih: tacanVidljiv ? rezultat.tacnih : null }
      : null;
    return {
      izvodjenje: { ...this.f.izvodjenje }, verzija: this.verzija, serverVremeMs: Date.now(), prikaz: this.prikaz,
      korak: this.korak, brojStavki: brojKoraka(trenutni), indeks: this.indeks, brojSlajdova: sl.length,
      trenutniSlajd: zaSnimak(trenutni), sledeciSlajd: this.prikaz === 'KRAJ' ? null : zaSnimak(sl[this.indeks + 1] ?? null),
      faza: this.faza, runda: this.runda, rezultatiPrikazani: this.rezultatiPrikazani, tacanPrikazan: this.tacanPrikazan,
      rangListaPrikazana: false, ekran: 'NORMALAN', qrPrikazan: false, telefonPrikaz: this.f.telefonPrikaz,
      detaljiDozvoljeni: this.f.detaljiDozvoljeni, takmicenje: this.f.takmicenje, tema: this.f.tema, rezultat,
      brojOdgovora: this.odgovoriZadatka.size, brojPovezanih: this.f.ucesnici.filter(u => u.povezan).length,
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
      case 'NIVO': {
        if (!zadatak) return greska(409, 'Na ovom slajdu nema zadatka.');
        if (this.faza !== 'CEKA') return greska(409, 'Nivo se menja pre otvaranja.');
        const n = vrednost ?? null;
        if (n !== null && (!Number.isInteger(n) || n < 0 || n > 3)) return greska(400, 'Nivo mora biti od 1 do 3 (0 = svi nivoi).');
        this.izmenaNivoa = n;
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

  /** Važeći nivo za sledeće otvaranje: izbor iz konzole, inače nivo slajda (`null` = svi nivoi). */
  private nivoZaOtvaranje(z: ZadatakInfo): number | null {
    return this.izmenaNivoa === null ? (z.nivo ?? null) : this.izmenaNivoa === 0 ? null : this.izmenaNivoa;
  }

  /** Aktivne varijante važećeg nivoa (redom iz fikstura); nivo varijante bez polja je 2. */
  private kandidati(z: ZadatakInfo): VarijantaZadatka[] {
    const nivo = this.nivoZaOtvaranje(z);
    return (this.f.varijanteZadatka ?? []).filter(v => nivo === null || (v.nivo ?? 2) === nivo);
  }

  /** Koliko se izvlači pri otvaranju: izbor iz konzole, inače broj sa slajda (`null` = sve), najviše koliko ima aktivnih. */
  private brojZaOtvaranje(z: ZadatakInfo): number {
    // nivo slajda: broj sa servera (fikstura ga može menjati); drugi nivo iz konzole: kandidati tog nivoa
    const m = this.nivoZaOtvaranje(z) === (z.nivo ?? null) ? z.brojAktivnihVarijanti : this.kandidati(z).length;
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
      if (n === 0) {
        const nivo = this.nivoZaOtvaranje(zadatak);
        return greska(409, nivo === null ? 'Grupa nema aktivnih varijanti.' : `Grupa nema aktivnih varijanti nivoa ${'★'.repeat(nivo)}.`);
      }
      this.izvucene = this.kandidati(zadatak).slice(0, n);
      this.resenjePrikazano = false;
      this.odgovoriZadatka.clear();
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
    const sl = this.trenutni();
    if (!this.izvucene || sl?.tip !== 'ZADATAK') return this.f.ucesnici;
    const d = this.dodele();
    return this.f.ucesnici.map(u => {
      const odgovor = this.odgovoriZadatka.get(u.id);
      const v = this.izvucene!.find(x => x.varijantaId === d.get(u.id));
      return {
        ...u, odgovorio: odgovor !== undefined, varijantaId: d.get(u.id) ?? null,
        tacno: odgovor !== undefined && v && sl.zadatak ? this.tacanOdgovor(sl.zadatak, v, odgovor) : null,
      };
    });
  }

  /** Odgovor je tačan kad su tačna sva polja šeme (grupa bez polja nema odgovora). */
  private tacanOdgovor(z: ZadatakInfo, v: VarijantaZadatka, odgovor: OdgovoriPolja): boolean {
    return (z.polja ?? []).every(p => jeTacno(p, odgovor[p.kljuc], v.odgovori[p.kljuc]));
  }

  /**
   * `RezultatVarijante` po pravilima vidljivosti iz Ugovora: bez `brojevi` su brojevi 0 i `vrednosti` `null`; `tacnih` samo uz
   * `brojevi` i `tacno`; `tacno`, `tacan` i `tacna` samo uz `tacno`; `resenjeSvgId` samo uz `resenje`.
   */
  private rezultatVarijante(z: ZadatakInfo, v: VarijantaZadatka, d: Map<number, number>, vidljivo: Vidljivo): RezultatVarijanteMok {
    const dodeljeni = [...d].filter(([, vid]) => vid === v.varijantaId).map(([u]) => u);
    const odgovori = dodeljeni.flatMap(u => (this.odgovoriZadatka.has(u) ? [this.odgovoriZadatka.get(u)!] : []));
    const polja = z.polja ?? [];
    return {
      varijantaId: v.varijantaId, naziv: v.naziv, svgId: v.svgId, resenjeSvgId: vidljivo.resenje ? v.resenjeSvgId : null,
      dodeljeno: vidljivo.brojevi ? dodeljeni.length : 0, odgovorilo: vidljivo.brojevi ? odgovori.length : 0,
      tacnih: vidljivo.brojevi && vidljivo.tacno ? odgovori.filter(o => this.tacanOdgovor(z, v, o)).length : null,
      polja: polja.map(p => {
        const tacno = v.odgovori[p.kljuc];
        const vrednosti = odgovori.map(o => o[p.kljuc]).filter(x => x !== undefined);
        const brojeviPoOpciji = (id: number) => vrednosti.filter(x => Array.isArray(x) && x.includes(id)).length;
        const grupe = new Map<string, number>();
        for (const x of vrednosti) if (typeof x === 'string') grupe.set(x, (grupe.get(x) ?? 0) + 1);
        return {
          kljuc: p.kljuc, oznaka: p.oznaka, tip: p.tip, jedinica: p.jedinica,
          vrednosti: p.opcije || !vidljivo.brojevi ? null : [...grupe].sort((x, y) => y[1] - x[1]).map(([tekst, broj]) => ({
            kljuc: tekst, tekst, broj, sakriven: false, tacan: vidljivo.tacno ? jeTacno(p, tekst, tacno) : null,
          })),
          opcije: p.opcije?.map(o => ({
            id: o.id, tekst: o.tekst, broj: vidljivo.brojevi ? brojeviPoOpciji(o.id) : 0,
            tacna: vidljivo.tacno ? (tacno?.tacna === o.id || (tacno?.tacne ?? []).includes(o.id)) : null,
          })) ?? null,
          tacno: vidljivo.tacno ? tacno ?? null : null,
        };
      }),
    };
  }

  private rezultatRunde(z: ZadatakInfo, d: Map<number, number>, vidljivo: Vidljivo): ZadatakRezultatMok | null {
    if (!this.izvucene) return null;
    return {
      ukupno: vidljivo.brojevi ? this.odgovoriZadatka.size : 0, odgovoriPrikazani: vidljivo.brojevi,
      varijante: this.izvucene.map(v => this.rezultatVarijante(z, v, d, vidljivo)),
    };
  }

  /**
   * `NastavnickiZadatak`: konzola vidi sve (`rezultat`), projektor `javniRezultat` kad je uključen bar jedan od tri nezavisna
   * prekidača (rezultati; `TACAN` i `RESENJE` samo na zatvorenoj rundi), inače `null`.
   */
  private zadatakSnimak(sl: Slajd | null): ZadatakSnimak | null {
    const z = sl?.tip === 'ZADATAK' ? sl.zadatak ?? null : null;
    if (!z) return null;
    const dodele = this.dodele();
    const d = [...dodele.values()];
    const izvucene = this.izvucene;
    const zatvoreno = this.faza === 'ZATVORENO';
    const javno: Vidljivo = {
      brojevi: this.rezultatiPrikazani, tacno: this.tacanPrikazan && zatvoreno, resenje: this.resenjePrikazano && zatvoreno,
    };
    return {
      slajd: z, izmenaBrojaVarijanti: this.izmenaBrojaVarijanti, izmenaNivoa: this.izmenaNivoa,
      nivoZaOtvaranje: this.nivoZaOtvaranje(z), brojZaOtvaranje: this.brojZaOtvaranje(z),
      resenjePrikazano: this.resenjePrikazano,
      varijante: izvucene?.map(v => ({
        varijantaId: v.varijantaId, naziv: v.naziv, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId,
        dodeljeno: d.filter(x => x === v.varijantaId).length,
        odgovorilo: [...dodele].filter(([u, vid]) => vid === v.varijantaId && this.odgovoriZadatka.has(u)).length,
        tacnih: [...dodele].filter(([u, vid]) => vid === v.varijantaId && this.odgovoriZadatka.has(u)
          && this.tacanOdgovor(z, v, this.odgovoriZadatka.get(u)!)).length,
        nivo: v.nivo ?? 2,
      })) ?? null,
      rezultat: this.rezultatRunde(z, dodele, { brojevi: true, tacno: true, resenje: true }),
      javniRezultat: javno.brojevi || javno.tacno || javno.resenje ? this.rezultatRunde(z, dodele, javno) : null,
    };
  }

  /** Slajd `i` na koraku `korak` (pitanje u CEKA); `i < 0` je prijava, `i >= broj slajdova` kraj. */
  private idi(i: number, korak: number): void {
    const n = this.f.slajdovi.length;
    this.runda = null;
    this.rezultatiPrikazani = false;
    this.tacanPrikazan = false;
    this.izmenaBrojaVarijanti = null;
    this.izmenaNivoa = null;
    this.resenjePrikazano = false;
    this.izvucene = null;
    this.odgovoriZadatka.clear();
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
