import type {
  BankaPretragaStavka, GrupaCmd, GrupaCvor, GrupaDetails, GrupaPutanja, IskljucenaTemaCmd, IskljucenaTemaInfo, IzvorVarijante, Namena,
  OdgovorPolja, Polje, PonistavanjeInfo, PreambulaInfo, PremestiCmd, PrilogInfo, RenderDeo, RenderGreskaInfo, RenderProbaInfo,
  RenderujSveInfo, SerijaInfo, StatusVarijante, StavkaPonistavanja, VarijantaCmd, VarijantaDetails, VarijantaInfo,
} from '../src/app/features/banka/data-access/banka.models';

/*
 * Mok banke zadataka za e2e: stablo grupa i varijante u memoriji (`Podaci.bankaGrupe`, `bankaVarijante`, `preambule`,
 * `iskljuceneTeme` iz `fixtures/banka.json`), pojednostavljena kopija pravila servera (`GrupaZadatakaService`, `VarijantaService`,
 * `SerijaService`, `IskljuceneTemeService`, uvek sa istim porukama greške) samo za ono što e2e proverava. LaTeX se ne prevodi:
 * render uspeva uvek, osim kad tekst (ili rešenje) sadrži `\foo`, što daje "Undefined control sequence \foo" u liniji tog
 * teksta. Preambulu sa `\foo` `PUT` odbija (400 "Preambula se ne kompajlira (linija N): ...", kao probni render servera) i ništa
 * ne upisuje. Klodove serije: grupe i varijante nose `izvor` i `serija` (prezentacije u moku nemaju seriju, pa su njihovi brojači
 * 0); odobravanje kopije (`zamenjuje`) arhivira original. Rute registruje `mock-api.ts`.
 */

/** Grupa kako je mok čuva; bez `izvor` / `serija` (npr. grupa koju test doda) je ručna, bez serije. */
export interface BankaGrupa {
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
  izmenjeno: string;
  izvor?: IzvorVarijante;
  serija?: string | null;
}

/** Isključena tema kako je server čuva (`IskljucenaTemaInfo` bez putanje, nju računa mok). */
export type BankaTema = Omit<IskljucenaTemaInfo, 'putanja'>;

/** Varijanta kako je server čuva (`VarijantaDetails` bez putanje i šeme polja, njih računa mok). */
export interface BankaVarijanta extends Omit<VarijantaDetails, 'putanja' | 'polja'> {
  /** Preambula predmeta je promenjena posle rendera: `renderuj-sve` je ponovo prevodi. */
  zastareo?: boolean;
}

export interface BankaPodaci {
  bankaGrupe: BankaGrupa[];
  bankaVarijante: BankaVarijanta[];
  /** Preambula po predmetu; bez ključa ili `null` je podrazumevana. */
  preambule: Record<number, string | null>;
  iskljuceneTeme: BankaTema[];
}

/** Odgovor rute: isti oblik kao `Odgovor` u `mock-api.ts`. */
export interface Ishod {
  status?: number;
  telo?: unknown;
}

/**
 * Podrazumevana preambula predmeta, skraćena kopija `LatexDokument.PODRAZUMEVANA_PREAMBULA`: bez `\documentclass` (omot je
 * serverov, a preambula ga ne sme imati).
 */
export const PODRAZUMEVANA_PREAMBULA = '\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath,amssymb}\n\\usepackage{tikz}';

/** Koliko varijanti `renderuj-sve` prevede u jednom pozivu (front zove ponovo dok `preostalo` nije 0). */
const KORAK_RENDERA = 10;
const MAX_DUBINA = 6;
/** Oblik serije (`utility/Serija` na serveru) i poruka kad ne odgovara. */
const SERIJA = /^[a-z0-9-]{3,60}$/;
const PORUKA_SERIJE = 'Serija mora imati 3 do 60 malih slova, cifara ili crtica.';
const MAX_OPIS_TEME = 300;

const greska = (status: number, reason: string): Ishod => ({ status, telo: { reason, time: new Date().toISOString() } });
const vreme = () => new Date().toISOString().slice(0, 19);
const kopija = <T>(x: T): T => structuredClone(x);
const uXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const duzina = (s: string | null | undefined) => (s ? [...s].length : 0);
/** Opis teme za poređenje (kao server): bez razmaka na krajevima, nizovi razmaka kao jedan, bez obzira na velika slova. */
const normalizujOpis = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Najmanji SVG kao iz render servisa: širina 300, jedna linija natpisa. */
export function probniSvg(natpis: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80"><text x="8" y="44" font-family="sans-serif" font-size="14">${uXml(natpis.slice(0, 40))}</text></svg>`;
}

/** Ishod "prevođenja": uz grešku u rešenju `svg` je SVG zadatka (zadatak se preveo), inače `null`. */
type Render = { ok: true; svg: string; resenjeSvg: string | null } | { ok: false; greska: RenderGreskaInfo; deo: RenderDeo; svg: string | null };

/** Medij otpremljen kroz `POST banka/prilozi` (lista iz `MockApi.mediji`). */
interface Medij { id: string; naziv: string; mime: string; velicina: number }

export class MockBanka {
  /** SVG-ovi koje mok služi na `api/public/mediji/{id}`, po id-ju medija (fikstura i svaki novi render). */
  readonly svgovi = new Map<string, string>();
  private sledeciGrupa: number;
  private sledeciVarijanta: number;
  private sledeciTema: number;
  private sledeciSvg = 0;

  constructor(
    private readonly d: BankaPodaci,
    private readonly predmetPostoji: (id: number) => boolean,
    private readonly mediji: readonly Medij[],
  ) {
    this.sledeciGrupa = Math.max(0, ...d.bankaGrupe.map(g => g.id)) + 1;
    this.sledeciVarijanta = Math.max(0, ...d.bankaVarijante.map(v => v.id)) + 1;
    this.sledeciTema = Math.max(0, ...d.iskljuceneTeme.map(t => t.id)) + 1;
    for (const v of d.bankaVarijante) {
      if (v.svgId) this.svgovi.set(v.svgId, probniSvg(`Zadatak ${v.id}`));
      if (v.resenjeSvgId) this.svgovi.set(v.resenjeSvgId, probniSvg(`Rešenje ${v.id}`));
    }
  }

  // -------------------------------------------------------------------------------------------- stablo

  private grupa(id: number): BankaGrupa | undefined {
    return this.d.bankaGrupe.find(g => g.id === id);
  }

  private braca(predmetId: number, namena: Namena, roditeljId: number | null): BankaGrupa[] {
    return this.d.bankaGrupe
      .filter(g => g.predmetId === predmetId && g.namena === namena && g.roditeljId === roditeljId)
      .sort((a, b) => a.rb - b.rb);
  }

  private varijanteGrupe(grupaId: number): BankaVarijanta[] {
    return this.d.bankaVarijante.filter(v => v.grupaId === grupaId).sort((a, b) => a.rb - b.rb);
  }

  private putanja(g: BankaGrupa): GrupaPutanja[] {
    const roditelj = g.roditeljId === null ? undefined : this.grupa(g.roditeljId);
    return [...(roditelj ? this.putanja(roditelj) : []), { id: g.id, naziv: g.naziv }];
  }

  private brojaci(g: BankaGrupa): Pick<GrupaCvor, 'brojVarijanti' | 'brojAktivnih' | 'brojNacrta' | 'brojGresaka'> {
    const sve = [g, ...this.potomci(g)].flatMap(x => this.varijanteGrupe(x.id));
    return {
      brojVarijanti: sve.length,
      brojAktivnih: sve.filter(v => v.status === 'AKTIVNA').length,
      brojNacrta: sve.filter(v => v.status === 'NACRT').length,
      brojGresaka: sve.filter(v => v.renderStatus === 'GRESKA').length,
    };
  }

  private potomci(g: BankaGrupa): BankaGrupa[] {
    return this.braca(g.predmetId, g.namena, g.id).flatMap(c => [c, ...this.potomci(c)]);
  }

  /** Isključenje grupe: tema same grupe, inače najbližeg pretka (`iskljucenjeId`), ili `null`. */
  private iskljucenje(g: BankaGrupa): Pick<GrupaCvor, 'iskljucena' | 'iskljucenjeId'> {
    for (const p of this.putanja(g).reverse()) {
      const tema = this.d.iskljuceneTeme.find(t => t.grupaId === p.id);
      if (tema) return { iskljucena: true, iskljucenjeId: tema.id };
    }
    return { iskljucena: false, iskljucenjeId: null };
  }

  private cvor(g: BankaGrupa): GrupaCvor {
    const deca = this.braca(g.predmetId, g.namena, g.id).map(c => this.cvor(c));
    const brojClaudeNacrta = [g, ...this.potomci(g)].flatMap(x => this.varijanteGrupe(x.id))
      .filter(v => v.izvor === 'CLAUDE' && v.status === 'NACRT').length;
    return {
      id: g.id, naziv: g.naziv, rb: g.rb, tezina: g.tezina, list: deca.length === 0, ...this.brojaci(g), deca, izvor: g.izvor ?? 'RUCNO',
      brojClaudeNacrta, ...this.iskljucenje(g),
    };
  }

  private details(g: BankaGrupa): GrupaDetails {
    return {
      id: g.id, predmetId: g.predmetId, roditeljId: g.roditeljId, namena: g.namena, naziv: g.naziv, opis: g.opis, rb: g.rb,
      tezina: g.tezina, uputstvo: g.uputstvo, polja: kopija(g.polja), putanja: this.putanja(g),
      list: this.braca(g.predmetId, g.namena, g.id).length === 0, ...this.brojaci(g), izmenjeno: g.izmenjeno, izvor: g.izvor ?? 'RUCNO',
      serija: g.serija ?? null, ...this.iskljucenje(g),
    };
  }

  stablo(predmetId: number, namena: string | null): Ishod {
    if (namena !== 'PREDAVANJE' && namena !== 'TEST') return greska(400, 'Neispravan parametar: namena.');
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    return { telo: this.braca(predmetId, namena, null).map(g => this.cvor(g)) };
  }

  grupaDetalji(id: number): Ishod {
    const g = this.grupa(id);
    return g ? { telo: this.details(g) } : greska(404, 'Grupa nije pronađena.');
  }

  private proveriSadrzaj(cmd: GrupaCmd): Ishod | null {
    if (!cmd.naziv?.trim() || duzina(cmd.naziv.trim()) > 120) return greska(400, 'Naziv grupe mora imati 1 do 120 znakova.');
    if (cmd.tezina !== null && cmd.tezina !== undefined && (!Number.isInteger(cmd.tezina) || cmd.tezina < 1 || cmd.tezina > 5)) {
      return greska(400, 'Težina mora biti od 1 do 5.');
    }
    if (duzina(cmd.uputstvo) > 5000) return greska(400, 'Uputstvo može imati najviše 5 000 znakova.');
    return null;
  }

  private nazivPostoji(braca: BankaGrupa[], naziv: string, bezId: number | null): boolean {
    return braca.some(b => b.id !== bezId && b.naziv.trim().toLowerCase() === naziv.trim().toLowerCase());
  }

  kreirajGrupu(cmd: GrupaCmd): Ishod {
    const neispravno = this.proveriSadrzaj(cmd);
    if (neispravno) return neispravno;
    let predmetId: number;
    let namena: Namena;
    const roditelj = cmd.roditeljId == null ? null : this.grupa(cmd.roditeljId);
    if (cmd.roditeljId == null) {
      if (cmd.predmetId == null) return greska(400, 'Predmet je obavezan.');
      if (cmd.namena == null) return greska(400, 'Namena je obavezna za koren.');
      if (!this.predmetPostoji(cmd.predmetId)) return greska(404, 'Predmet nije pronađen.');
      predmetId = cmd.predmetId;
      namena = cmd.namena;
    } else {
      if (!roditelj) return greska(404, 'Grupa nije pronađena.');
      if (this.varijanteGrupe(roditelj.id).length > 0) return greska(409, 'Grupa sa varijantama ne može imati podgrupe.');
      if (this.putanja(roditelj).length + 1 > MAX_DUBINA) return greska(400, 'Najveća dubina stabla je 6.');
      predmetId = roditelj.predmetId;
      namena = roditelj.namena;
    }
    const braca = this.braca(predmetId, namena, roditelj?.id ?? null);
    if (this.nazivPostoji(braca, cmd.naziv, null)) return greska(400, 'Grupa sa tim nazivom već postoji.');
    const g: BankaGrupa = {
      id: this.sledeciGrupa++, predmetId, roditeljId: roditelj?.id ?? null, namena, naziv: cmd.naziv.trim(), opis: cmd.opis ?? null,
      rb: Math.max(0, ...braca.map(b => b.rb)) + 1, tezina: cmd.tezina ?? null, uputstvo: cmd.uputstvo ?? null,
      polja: kopija(cmd.polja ?? []), izmenjeno: vreme(), izvor: 'RUCNO', serija: null,
    };
    this.d.bankaGrupe.push(g);
    return { status: 201, telo: this.details(g) };
  }

  /**
   * Nova šema nad varijantama grupe (kao `prilagodiVarijante` na serveru): promena tipa postojećeg polja je 409 dok ima
   * aktivnih; inače odgovor ostaje samo za polje koje i dalje postoji sa istim tipom (i opcijom koja postoji), a aktivna
   * varijanta kojoj zatim fali odgovor postaje nacrt.
   */
  private prilagodiVarijante(g: BankaGrupa, nova: Polje[]): Ishod | null {
    const varijante = this.varijanteGrupe(g.id);
    const stara = new Map(g.polja.map(p => [p.kljuc, p]));
    const promenjen = nova.find(p => stara.has(p.kljuc) && stara.get(p.kljuc)!.tip !== p.tip);
    if (promenjen && varijante.some(v => v.status === 'AKTIVNA')) {
      return greska(409, `Tip polja '${promenjen.kljuc}' se ne menja dok grupa ima aktivne varijante.`);
    }
    for (const v of varijante) {
      const vazeci = Object.fromEntries(nova.flatMap(p => {
        const o = v.odgovori[p.kljuc];
        return o && stara.get(p.kljuc)?.tip === p.tip && this.proveriOdgovore([p], { [p.kljuc]: o }) === null ? [[p.kljuc, o]] : [];
      }));
      v.odgovori = vazeci;
      if (Object.keys(vazeci).length < nova.length && v.status === 'AKTIVNA') v.status = 'NACRT';
    }
    return null;
  }

  /** Puna zamena naziva, opisa, težine i uputstva; `polja: null` ostavlja šemu (i odgovore varijanti). */
  izmeniGrupu(id: number, cmd: GrupaCmd): Ishod {
    const g = this.grupa(id);
    if (!g) return greska(404, 'Grupa nije pronađena.');
    const neispravno = this.proveriSadrzaj(cmd);
    if (neispravno) return neispravno;
    if (this.nazivPostoji(this.braca(g.predmetId, g.namena, g.roditeljId), cmd.naziv, id)) {
      return greska(400, 'Grupa sa tim nazivom već postoji.');
    }
    if ((cmd.tezina ?? null) === null && this.varijanteGrupe(id).length > 0) {
      return greska(400, 'Težina je obavezna za grupu sa varijantama.');
    }
    if (cmd.polja != null) {
      const odbijeno = this.prilagodiVarijante(g, cmd.polja);
      if (odbijeno) return odbijeno;
    }
    g.naziv = cmd.naziv.trim();
    g.opis = cmd.opis ?? null;
    g.tezina = cmd.tezina ?? null;
    g.uputstvo = cmd.uputstvo ?? null;
    if (cmd.polja != null) g.polja = kopija(cmd.polja);
    g.izmenjeno = vreme();
    return { telo: this.details(g) };
  }

  obrisiGrupu(id: number): Ishod {
    const g = this.grupa(id);
    if (!g) return greska(404, 'Grupa nije pronađena.');
    if (this.braca(g.predmetId, g.namena, id).length > 0) return greska(409, 'Grupa ima podgrupe.');
    this.d.bankaVarijante = this.d.bankaVarijante.filter(v => v.grupaId !== id);
    this.d.bankaGrupe = this.d.bankaGrupe.filter(x => x.id !== id);
    this.prenumerisi(this.braca(g.predmetId, g.namena, g.roditeljId));
    // FK teme prema grupi je `ON DELETE SET NULL`: tema ostaje, bez grupe
    for (const t of this.d.iskljuceneTeme.filter(x => x.grupaId === id)) t.grupaId = null;
    return { status: 204 };
  }

  private prenumerisi(grupe: BankaGrupa[]): void {
    grupe.forEach((x, i) => (x.rb = i + 1));
  }

  premesti(id: number, cmd: PremestiCmd): Ishod {
    const g = this.grupa(id);
    if (!g) return greska(404, 'Grupa nije pronađena.');
    const cilj = cmd.roditeljId == null ? null : this.grupa(cmd.roditeljId);
    if (cmd.roditeljId != null && !cilj) return greska(404, 'Grupa nije pronađena.');
    if (cilj && (cilj.predmetId !== g.predmetId || cilj.namena !== g.namena)) {
      return greska(400, 'Grupa se premešta samo unutar istog predmeta i namene.');
    }
    if (cilj && this.putanja(cilj).some(p => p.id === id)) return greska(400, 'Grupa se ne može premestiti u sopstveno podstablo.');
    if (cilj && this.varijanteGrupe(cilj.id).length > 0) return greska(409, 'Grupa sa varijantama ne može imati podgrupe.');
    const stara = this.braca(g.predmetId, g.namena, g.roditeljId).filter(x => x.id !== id);
    const nova = this.braca(g.predmetId, g.namena, cilj?.id ?? null).filter(x => x.id !== id);
    const mesto = Math.min(Math.max((cmd.rb ?? nova.length + 1) - 1, 0), nova.length);
    g.roditeljId = cilj?.id ?? null;
    nova.splice(mesto, 0, g);
    this.prenumerisi(stara);
    this.prenumerisi(nova);
    g.izmenjeno = vreme();
    return { telo: this.details(g) };
  }

  redosled(predmetId: number, namena: string | null, roditeljId: number | null, ids: unknown): Ishod {
    if (namena !== 'PREDAVANJE' && namena !== 'TEST') return greska(400, 'Neispravan parametar: namena.');
    const deca = this.braca(predmetId, namena, roditeljId);
    const trazeni = (ids as { ids?: number[] } | null)?.ids;
    if (!trazeni || trazeni.length !== deca.length || new Set(trazeni).size !== deca.length || !trazeni.every(i => deca.some(x => x.id === i))) {
      return greska(400, 'Redosled mora sadržati sve podgrupe.');
    }
    trazeni.forEach((gid, i) => {
      const x = this.grupa(gid);
      if (x) x.rb = i + 1;
    });
    return { status: 204 };
  }

  // -------------------------------------------------------------------------------------------- varijante

  private varijanta(id: number): BankaVarijanta | undefined {
    return this.d.bankaVarijante.find(v => v.id === id);
  }

  private info(v: BankaVarijanta): VarijantaInfo {
    return {
      id: v.id, grupaId: v.grupaId, rb: v.rb, naziv: v.naziv, status: v.status, izvor: v.izvor, renderStatus: v.renderStatus,
      svgId: v.svgId, resenjeSvgId: v.resenjeSvgId, izmenjeno: v.izmenjeno, ikadOdobrena: v.ikadOdobrena, zamenjuje: v.zamenjuje,
      serija: v.serija,
    };
  }

  private varijantaDetails(v: BankaVarijanta): VarijantaDetails {
    const g = this.grupa(v.grupaId);
    const ostalo = kopija(v);
    delete ostalo.zastareo;
    return { ...ostalo, putanja: g ? this.putanja(g) : [], polja: g ? kopija(g.polja) : [] };
  }

  lista(grupaId: number, status: string | null): Ishod {
    if (!this.grupa(grupaId)) return greska(404, 'Grupa nije pronađena.');
    return { telo: this.varijanteGrupe(grupaId).filter(v => status === null || v.status === status).map(v => this.info(v)) };
  }

  varijantaDetalji(id: number): Ishod {
    const v = this.varijanta(id);
    return v ? { telo: this.varijantaDetails(v) } : greska(404, 'Varijanta nije pronađena.');
  }

  /** Kao `BankaPP.proveriOdgovore`: prva poruka ili `null` kad odgovori pokrivaju šemu. */
  private proveriOdgovore(polja: Polje[], odgovori: Record<string, OdgovorPolja> | null | undefined): string | null {
    for (const p of polja) {
      const o = odgovori?.[p.kljuc];
      if (!o) return `Odgovor za polje '${p.kljuc}' nedostaje.`;
      const ids = (p.opcije ?? []).map(x => x.id);
      if (p.tip === 'BROJ' && (o.broj == null || !Number.isFinite(o.broj))) return `Odgovor za polje '${p.kljuc}' mora biti broj.`;
      if (p.tip === 'TEKST' && !o.prihvatljivi?.length) return `Polje '${p.kljuc}' traži 1 do 10 prihvatljivih odgovora (1-200 znakova).`;
      if (p.tip === 'JEDAN_TACAN' && (o.tacna == null || !ids.includes(o.tacna))) return `Odgovor za polje '${p.kljuc}' mora biti id jedne od opcija.`;
      if (p.tip === 'VISE_TACNIH' && (!o.tacne?.length || !o.tacne.every(i => ids.includes(i)))) return `Odgovor za polje '${p.kljuc}' mora biti skup id-jeva opcija.`;
    }
    return null;
  }

  private proveriVarijantu(cmd: VarijantaCmd): Ishod | null {
    if (!cmd.tekst?.trim() || duzina(cmd.tekst) > 20_000) return greska(400, 'Tekst zadatka mora imati 1 do 20 000 znakova.');
    if (duzina(cmd.resenje) > 20_000) return greska(400, 'Rešenje može imati najviše 20 000 znakova.');
    if (duzina(cmd.naziv) > 120) return greska(400, 'Naziv varijante može imati najviše 120 znakova.');
    return null;
  }

  private prilozi(cmd: VarijantaCmd): PrilogInfo[] | Ishod {
    const rezultat: PrilogInfo[] = [];
    for (const p of cmd.prilozi ?? []) {
      if (!/^[a-z0-9_-]{1,60}$/.test(p.ime)) return greska(400, "Ime priloga: 1-60 malih slova, cifara, '_' ili '-'.");
      if (p.ime === 'dokument') return greska(400, "Ime priloga 'dokument' je rezervisano.");
      if (rezultat.some(r => r.ime === p.ime)) return greska(400, `Ime priloga '${p.ime}' se ponavlja.`);
      const medij = this.mediji.find(m => m.id === p.medijId);
      if (!medij) return greska(400, `Prilog '${p.ime}' nije pronađen.`);
      rezultat.push({ ime: p.ime, medij: { ...medij } });
    }
    return rezultat;
  }

  /**
   * "Prevodi" tekst i rešenje: `\foo` je nepoznata komanda u liniji u kojoj stoji (tekst ima prednost; uz grešku u rešenju
   * zadatak ima SVG). Preambula ne može da obori render: neispravnu `PUT` ne upisuje.
   */
  private prevedi(tekst: string, resenje: string | null): Render {
    const foo = 'Undefined control sequence \\foo';
    const svg = probniSvg(tekst.replace(/[$\\]/g, ''));
    for (const [deo, izvor] of [['tekst', tekst], ['resenje', resenje ?? '']] as const) {
      const linija = izvor.split('\n').findIndex(l => l.includes('\\foo'));
      if (linija >= 0) return { ok: false, greska: { linija: linija + 1, poruka: foo }, deo, svg: deo === 'resenje' ? svg : null };
    }
    return { ok: true, svg, resenjeSvg: resenje?.trim() ? probniSvg(resenje.replace(/[$\\]/g, '')) : null };
  }

  private noviSvg(svg: string): string {
    const id = `c0000000-0000-4000-8000-${(++this.sledeciSvg).toString(16).padStart(12, '0')}`;
    this.svgovi.set(id, svg);
    return id;
  }

  /**
   * Render varijante: uspeh upisuje nove SVG-ove, neuspeh ostavlja stare (kao server) i beleži grešku. Čuvanje i ponovni
   * render vraćaju aktivnu sa neuspelim renderom u nacrt; `renderuj-sve` ne (`vratiUNacrt: false`), status ostaje. Vraća da li
   * je uspeo.
   */
  private renderuj(v: BankaVarijanta, vratiUNacrt = true): boolean {
    const r = this.prevedi(v.tekst, v.resenje);
    v.zastareo = false;
    if (r.ok) {
      v.renderStatus = 'OK';
      v.svgId = this.noviSvg(r.svg);
      v.resenjeSvgId = r.resenjeSvg === null ? null : this.noviSvg(r.resenjeSvg);
      v.renderGreska = null;
      v.renderDeo = null;
    } else {
      v.renderStatus = 'GRESKA';
      v.renderGreska = r.greska;
      v.renderDeo = r.deo;
      if (vratiUNacrt && v.status === 'AKTIVNA') v.status = 'NACRT';
    }
    return r.ok;
  }

  kreirajVarijantu(grupaId: number, cmd: VarijantaCmd): Ishod {
    const neispravno = this.proveriVarijantu(cmd);
    if (neispravno) return neispravno;
    const g = this.grupa(grupaId);
    if (!g) return greska(404, 'Grupa nije pronađena.');
    if (this.braca(g.predmetId, g.namena, g.id).length > 0) return greska(409, 'Grupa sa podgrupama ne može imati varijante.');
    if (g.tezina === null) return greska(409, 'Težina je obavezna za grupu sa varijantama.');
    const poruka = this.proveriOdgovore(g.polja, cmd.odgovori);
    if (poruka) return greska(400, poruka);
    const prilozi = this.prilozi(cmd);
    if (!Array.isArray(prilozi)) return prilozi;
    const sada = vreme();
    const v: BankaVarijanta = {
      id: this.sledeciVarijanta++, grupaId, rb: Math.max(0, ...this.varijanteGrupe(grupaId).map(x => x.rb)) + 1, naziv: cmd.naziv || null,
      tekst: cmd.tekst, resenje: cmd.resenje || null, odgovori: kopija(cmd.odgovori ?? {}), prilozi, status: 'NACRT',
      izvor: cmd.izvor ?? 'RUCNO', renderStatus: 'CEKA', svgId: null, resenjeSvgId: null, renderGreska: null, renderDeo: null,
      kreirano: sada, izmenjeno: sada, ikadOdobrena: false, zamenjuje: null, serija: null,
    };
    this.renderuj(v);
    this.d.bankaVarijante.push(v);
    return { status: 201, telo: this.varijantaDetails(v) };
  }

  /** Puna zamena; renderuje samo kad se ulaz rendera promenio ili poslednji render nije uspeo. */
  izmeniVarijantu(id: number, cmd: VarijantaCmd): Ishod {
    const v = this.varijanta(id);
    if (!v) return greska(404, 'Varijanta nije pronađena.');
    const neispravno = this.proveriVarijantu(cmd);
    if (neispravno) return neispravno;
    const g = this.grupa(v.grupaId);
    const poruka = this.proveriOdgovore(g?.polja ?? [], cmd.odgovori);
    if (poruka) return greska(400, poruka);
    const prilozi = this.prilozi(cmd);
    if (!Array.isArray(prilozi)) return prilozi;
    const promenjen = v.tekst !== cmd.tekst || (v.resenje ?? '') !== (cmd.resenje ?? '') || JSON.stringify(v.prilozi) !== JSON.stringify(prilozi);
    Object.assign(v, {
      naziv: cmd.naziv || null, tekst: cmd.tekst, resenje: cmd.resenje || null, odgovori: kopija(cmd.odgovori ?? {}), prilozi,
      izmenjeno: vreme(),
    });
    if (promenjen || v.renderStatus !== 'OK' || v.zastareo) this.renderuj(v);
    return { telo: this.varijantaDetails(v) };
  }

  obrisiVarijantu(id: number): Ishod {
    const v = this.varijanta(id);
    if (!v) return greska(404, 'Varijanta nije pronađena.');
    this.d.bankaVarijante = this.d.bankaVarijante.filter(x => x.id !== id);
    this.varijanteGrupe(v.grupaId).forEach((x, i) => (x.rb = i + 1));
    return { status: 204 };
  }

  /**
   * `odobri`, `arhiviraj` i `vrati-u-nacrt`: promena statusa; aktivna traži uspeo render i potpune odgovore. Odobravanje
   * postavlja `ikadOdobrena` (ostaje i posle vraćanja u nacrt), a kopija (`zamenjuje`) u istom koraku arhivira original.
   */
  promeniStatus(id: number, status: StatusVarijante): Ishod {
    const v = this.varijanta(id);
    if (!v) return greska(404, 'Varijanta nije pronađena.');
    if (status === 'AKTIVNA') {
      if (v.renderStatus !== 'OK') return greska(409, 'Varijanta se odobrava tek kad je render uspeo.');
      const poruka = this.proveriOdgovore(this.grupa(v.grupaId)?.polja ?? [], v.odgovori);
      if (poruka) return greska(400, poruka);
      v.ikadOdobrena = true;
      const original = v.zamenjuje === null ? undefined : this.varijanta(v.zamenjuje);
      if (original && original.status !== 'ARHIVIRANA') {
        original.status = 'ARHIVIRANA';
        original.izmenjeno = vreme();
      }
    }
    v.status = status;
    v.izmenjeno = vreme();
    return { telo: this.varijantaDetails(v) };
  }

  /** Ponovni render bez obzira na keš. */
  renderVarijante(id: number): Ishod {
    const v = this.varijanta(id);
    if (!v) return greska(404, 'Varijanta nije pronađena.');
    this.renderuj(v);
    v.izmenjeno = vreme();
    return { telo: this.varijantaDetails(v) };
  }

  /** Kopija na kraj iste grupe: NACRT, isti sadržaj i prilozi, sopstveni render. */
  dupliraj(id: number): Ishod {
    const v = this.varijanta(id);
    if (!v) return greska(404, 'Varijanta nije pronađena.');
    const sada = vreme();
    const k: BankaVarijanta = {
      ...kopija(v), id: this.sledeciVarijanta++, rb: Math.max(0, ...this.varijanteGrupe(v.grupaId).map(x => x.rb)) + 1, status: 'NACRT',
      renderStatus: 'CEKA', svgId: null, resenjeSvgId: null, renderGreska: null, renderDeo: null, zastareo: false, kreirano: sada, izmenjeno: sada,
      ikadOdobrena: false, zamenjuje: null, serija: null,
    };
    this.renderuj(k);
    this.d.bankaVarijante.push(k);
    return { status: 201, telo: this.varijantaDetails(k) };
  }

  // -------------------------------------------------------------------------------------------- render, preambula, pretraga

  /** Render bez čuvanja (pregled u editoru). */
  renderProba(cmd: { predmetId: number; tekst: string; resenje?: string | null }): Ishod {
    if (!this.predmetPostoji(cmd.predmetId)) return greska(404, 'Predmet nije pronađen.');
    if (!cmd.tekst?.trim()) return greska(400, 'Tekst zadatka mora imati 1 do 20 000 znakova.');
    const r = this.prevedi(cmd.tekst, cmd.resenje ?? null);
    const telo: RenderProbaInfo = r.ok
      ? { ok: true, svg: r.svg, resenjeSvg: r.resenjeSvg, greska: null, deo: null }
      : { ok: false, svg: r.svg, resenjeSvg: null, greska: r.greska, deo: r.deo };
    return { telo };
  }

  preambula(predmetId: number): Ishod {
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const preambula = this.d.preambule[predmetId] ?? null;
    const telo: PreambulaInfo = { preambula, podrazumevana: preambula === null, podrazumevanaPreambula: PODRAZUMEVANA_PREAMBULA };
    return { telo };
  }

  /**
   * Prazan tekst je podrazumevana; preambula sa `\foo` je 400 bez upisa; promena poništava render svih varijanti predmeta
   * (`renderuj-sve` ih ponovo prevodi i broji uspele i neuspele; neuspela zadržava status i poslednji uspeo SVG).
   */
  postaviPreambulu(predmetId: number, cmd: { preambula?: string | null } | null): Ishod {
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const tekst = cmd?.preambula?.trim() ? cmd.preambula : null;
    // probni render pre upisa (kao `LatexPreambulaService`): linija u preambuli bez razmaka na krajevima
    const linija = (tekst?.trim() ?? '').split('\n').findIndex(l => l.includes('\\foo'));
    if (linija >= 0) return greska(400, `Preambula se ne kompajlira (linija ${linija + 1}): Undefined control sequence \\foo`);
    this.d.preambule[predmetId] = tekst;
    for (const v of this.d.bankaVarijante) {
      if (this.grupa(v.grupaId)?.predmetId === predmetId) v.zastareo = true;
    }
    return this.preambula(predmetId);
  }

  renderujSve(predmetId: number): Ishod {
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const zastarele = this.d.bankaVarijante.filter(v => v.zastareo && this.grupa(v.grupaId)?.predmetId === predmetId);
    const korak = zastarele.slice(0, KORAK_RENDERA);
    const uspelo = korak.filter(v => this.renderuj(v, false)).length;
    const telo: RenderujSveInfo = { renderovano: uspelo, neuspelo: korak.length - uspelo, preostalo: zastarele.length - korak.length };
    return { telo };
  }

  /**
   * Sve stavke pretrage (strana se seče u `mock-api.ts`); `izmenjeno` opadajuće, kao podrazumevani sort servera. `izvor` i
   * `serija` sužavaju na Klodove ili ručne varijante i na jednu seriju.
   */
  pretraga(q: URLSearchParams): Ishod {
    const predmetId = Number(q.get('predmetId'));
    const upit = q.get('q')?.trim() ?? '';
    if (q.has('q') && upit !== '' && duzina(upit) < 2) return greska(400, 'Upit mora imati bar 2 znaka.');
    const izvor = q.get('izvor');
    if (izvor !== null && izvor !== 'RUCNO' && izvor !== 'CLAUDE') return greska(400, 'Neispravan parametar: izvor.');
    const serija = q.get('serija');
    if (serija !== null && !SERIJA.test(serija)) return greska(400, PORUKA_SERIJE);
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const namena = q.get('namena');
    const status = q.get('status');
    const stavke: BankaPretragaStavka[] = this.d.bankaVarijante
      .filter(v => {
        const g = this.grupa(v.grupaId);
        const naslov = `${v.naziv ?? ''} ${v.tekst} ${g?.naziv ?? ''}`.toLowerCase();
        return g?.predmetId === predmetId && (!namena || g.namena === namena) && (!status || v.status === status)
          && (!izvor || v.izvor === izvor) && (!serija || v.serija === serija) && (upit === '' || naslov.includes(upit.toLowerCase()));
      })
      .sort((a, b) => b.izmenjeno.localeCompare(a.izmenjeno) || b.id - a.id)
      .map(v => {
        const g = this.grupa(v.grupaId) as BankaGrupa;
        return {
          varijantaId: v.id, grupaId: g.id, grupaNaziv: g.naziv, putanja: this.putanja(g), naziv: v.naziv, status: v.status,
          renderStatus: v.renderStatus, isecak: [...v.tekst].slice(0, 160).join(''), izvor: v.izvor, serija: v.serija,
        };
      });
    return { telo: stavke };
  }

  // -------------------------------------------------------------------------------------------- serije Kloda

  /**
   * `GET banka/serije?predmetId=`: serije grupa i varijanti predmeta sa brojevima (kao `SerijaService.serije`), najnovije prve;
   * `poslednja` je najveće `kreirano` varijante (za grupu `izmenjeno`, mok ne čuva njeno `kreirano`).
   */
  serije(predmetIdParam: string | null): Ishod {
    if (predmetIdParam === null || predmetIdParam === '') return greska(400, 'Predmet je obavezan.');
    if (!/^\d+$/.test(predmetIdParam)) return greska(400, 'Neispravan parametar: predmetId.');
    const predmetId = Number(predmetIdParam);
    const grupe = this.d.bankaGrupe.filter(g => g.predmetId === predmetId);
    const varijante = this.d.bankaVarijante.filter(v => grupe.some(g => g.id === v.grupaId));
    const imena = new Set([...grupe.map(g => g.serija), ...varijante.map(v => v.serija)].filter((x): x is string => !!x));
    const telo: SerijaInfo[] = [...imena]
      .map(serija => {
        const vs = varijante.filter(v => v.serija === serija);
        const gs = grupe.filter(g => g.serija === serija);
        return {
          serija,
          nacrta: vs.filter(v => v.izvor === 'CLAUDE' && v.status === 'NACRT').length,
          odobrenih: vs.filter(v => v.ikadOdobrena).length,
          grupa: gs.length,
          prezentacija: 0,
          slajdova: 0,
          poslednja: [...vs.map(v => v.kreirano), ...gs.map(g => g.izmenjeno)].sort().at(-1) as string,
        };
      })
      .sort((a, b) => b.poslednja.localeCompare(a.poslednja));
    return { telo };
  }

  /**
   * `POST banka/serije/{serija}/odbaci` (kao `SerijaService.ponisti(serija, true)`): briše neodobrene Klodove nacrte serije, pa
   * Klodove grupe serije od najdubljih kad su prazne; ostale varijante i grupe serije navodi kao preskočene, ručne grupe ne pominje.
   */
  odbaciSeriju(serija: string): Ishod {
    if (!SERIJA.test(serija)) return greska(400, PORUKA_SERIJE);
    const obrisano: StavkaPonistavanja[] = [];
    const preskoceno: StavkaPonistavanja[] = [];
    for (const v of this.d.bankaVarijante.filter(x => x.serija === serija)) {
      const stavka = { vrsta: 'VARIJANTA' as const, id: v.id, naziv: v.naziv };
      if (v.izvor === 'CLAUDE' && v.status === 'NACRT' && !v.ikadOdobrena) {
        this.obrisiVarijantu(v.id);
        obrisano.push({ ...stavka, razlog: null });
      } else {
        preskoceno.push({ ...stavka, razlog: 'Odobrena ili nije Klodov nacrt.' });
      }
    }
    const grupe = this.d.bankaGrupe.filter(g => g.izvor === 'CLAUDE' && g.serija === serija)
      .sort((a, b) => this.putanja(b).length - this.putanja(a).length);
    for (const g of grupe) {
      const stavka = { vrsta: 'GRUPA' as const, id: g.id, naziv: g.naziv };
      if (this.varijanteGrupe(g.id).length > 0 || this.braca(g.predmetId, g.namena, g.id).length > 0) {
        preskoceno.push({ ...stavka, razlog: 'Grupa nije prazna.' });
      } else {
        this.obrisiGrupu(g.id);
        obrisano.push({ ...stavka, razlog: null });
      }
    }
    const telo: PonistavanjeInfo = { potvrdjeno: true, obrisano, preskoceno };
    return { telo };
  }

  // -------------------------------------------------------------------------------------------- isključene teme

  private temaInfo(t: BankaTema): IskljucenaTemaInfo {
    const g = t.grupaId === null ? undefined : this.grupa(t.grupaId);
    return { ...kopija(t), putanja: g ? this.putanja(g) : [] };
  }

  /** `GET predmeti/{id}/iskljucene-teme`: najnovije prve. */
  iskljuceneTeme(predmetId: number): Ishod {
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const teme = this.d.iskljuceneTeme.filter(t => t.predmetId === predmetId)
      .sort((a, b) => b.kreirano.localeCompare(a.kreirano) || b.id - a.id);
    return { telo: teme.map(t => this.temaInfo(t)) };
  }

  /** `POST predmeti/{id}/iskljucene-teme` (izvor RUCNO): ista grupa ili isti normalizovan opis bez grupe je 409. */
  iskljuciTemu(predmetId: number, cmd: IskljucenaTemaCmd | null): Ishod {
    if (!this.predmetPostoji(predmetId)) return greska(404, 'Predmet nije pronađen.');
    const opis = cmd?.opis?.trim() ?? '';
    if (opis === '' || duzina(opis) > MAX_OPIS_TEME) return greska(400, 'Opis teme mora imati od 1 do 300 znakova.');
    const grupaId = cmd?.grupaId ?? null;
    if (grupaId !== null && this.grupa(grupaId)?.predmetId !== predmetId) return greska(400, 'Grupa nije u ovom predmetu.');
    const teme = this.d.iskljuceneTeme.filter(t => t.predmetId === predmetId);
    if (grupaId !== null && teme.some(t => t.grupaId === grupaId)) return greska(409, 'Ova grupa je već isključena.');
    if (grupaId === null && teme.some(t => t.grupaId === null && normalizujOpis(t.opis) === normalizujOpis(opis))) {
      return greska(409, 'Ova tema je već isključena.');
    }
    const t: BankaTema = { id: this.sledeciTema++, predmetId, opis, grupaId, izvor: 'RUCNO', serija: null, kreirano: vreme() };
    this.d.iskljuceneTeme.push(t);
    return { status: 201, telo: this.temaInfo(t) };
  }

  /** `DELETE iskljucene-teme/{id}`. */
  ukljuciTemu(id: number): Ishod {
    if (!this.d.iskljuceneTeme.some(t => t.id === id)) return greska(404, 'Isključena tema nije pronađena.');
    this.d.iskljuceneTeme = this.d.iskljuceneTeme.filter(t => t.id !== id);
    return { status: 204 };
  }
}
