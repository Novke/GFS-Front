// Tekst PPTX-a (a:txBody) u pasuse, delove i okvir TEKST sloja platna: liste, tab-stopovi, autofit, velika slova,
// senka teksta. Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { Deo, FormatBroja, Lista, Okvir, Pasus, Polozaj, Poravnanje, Senka, Sidro, Tabulator } from '../data-access/platno.models';
import { razresiBodyPr, razresiPPr, razresiRPr, type RazresenPPr, type RazresenRPr } from './nasledjivanje';
import { bojaIz, pomesaj, zamenaFonta, type Boja, type KontekstBoja } from './tema';
import { EMU_PO_PT, zaokruzi, type KontekstSlajda } from './tipovi';
import { brojAtr, dete, NS } from './xml';

/**
 * Stil oblika (`p:style/a:fontRef`, stil tabele): slabiji od sopstvenog `rPr` dela (i `pPr/a:defRPr`), jači od
 * nasleđenih stilova nivoa (lstStyle, txStyles mastera, defaultTextStyle), kao u PowerPointu (beo tekst na plavom obliku
 * iako `defaultTextStyle` kaže `tx1`).
 */
export interface OpcijeTeksta { podrazumevanaBoja?: string; fontIzStila?: string; podebljanoIzStila?: boolean; }
export interface RezultatTeksta { pasusi: Pasus[]; okvir: Okvir; senka: Senka | null | 'razlicite'; prazan: boolean; }

/** Granice iz `PlatnoPP` (server odbija dokument van njih). */
const MAX_TABULATORA = 32;
const PODRAZUMEVANI_DEF_TAB = 457200;
const PODRAZUMEVANA_VELICINA_PT = 18;

const ogranici = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
/** EMU -> jedinice platna (bez pomeraja), 2 decimale, bez `-0`. */
const uJed = (emu: number, s: number) => zaokruzi(emu / EMU_PO_PT * s) || 0;

const odnos = (n: number) => Math.round(n * 10000) / 10000;

const PORAVNANJA: Readonly<Record<string, Poravnanje>> = {
  l: 'LEVO', ctr: 'CENTAR', r: 'DESNO', just: 'OBOSTRANO', dist: 'OBOSTRANO', justLow: 'OBOSTRANO', thaiDist: 'OBOSTRANO',
};
const SIDRA: Readonly<Record<string, Sidro>> = { t: 'VRH', ctr: 'SREDINA', b: 'DNO', just: 'VRH', dist: 'VRH' };
const TABOVI: Readonly<Record<string, Tabulator['poravnanje']>> = { l: 'LEVO', ctr: 'CENTAR', r: 'DESNO', dec: 'DECIMALNO' };

const SEME_BROJEVA: Readonly<Record<string, FormatBroja>> = {
  arabicPeriod: 'ARAPSKI_TACKA', arabicParenR: 'ARAPSKI_ZAGRADA', arabicPlain: 'ARAPSKI',
  alphaLcParenR: 'MALA_SLOVA_ZAGRADA', alphaUcPeriod: 'VELIKA_SLOVA_TACKA',
  romanUcPeriod: 'RIMSKI_VELIKI_TACKA', romanLcPeriod: 'RIMSKI_MALI_TACKA',
};

/** Znaci simbolskih fontova (posle skidanja PUA pomeraja U+F000) -> Unicode. */
const ZNACI_WINGDINGS: Readonly<Record<string, string>> = {
  l: '●', n: '■', q: '❑', v: '❖', 'Ø': '➢', 'ü': '✓', '§': '▪', 'à': '➔',
};
const ZNACI_SYMBOL: Readonly<Record<string, string>> = { '·': '•' };

/** Upozorenja `FONT_ZAMENJEN` već prijavljena za slajd (jednom po fontu po slajdu, kroz sve okvire). */
const prijavljeniFontovi = new WeakMap<KontekstSlajda, Set<string>>();

interface Stanje {
  ctx: KontekstSlajda;
  o: OpcijeTeksta;
  kb: KontekstBoja;
  /** Poruke `TEKST_PRIBLIZAN`/`TABULATORI` već prijavljene u ovom okviru. */
  prijavljeno: Set<string>;
}

function upozoriJednom(st: Stanje, kod: 'TEKST_PRIBLIZAN' | 'TABULATORI', poruka: string): void {
  if (st.prijavljeno.has(poruka)) return;
  st.prijavljeno.add(poruka);
  st.ctx.upozori(kod, poruka);
}

function font(st: Stanje, ime: string | null): string {
  const z = zamenaFonta(ime, st.ctx.tema);
  if (z.upozorenje) {
    let skup = prijavljeniFontovi.get(st.ctx);
    if (!skup) prijavljeniFontovi.set(st.ctx, (skup = new Set()));
    if (!skup.has(z.upozorenje)) {
      skup.add(z.upozorenje);
      st.ctx.upozori('FONT_ZAMENJEN', z.upozorenje);
    }
  }
  return z.font;
}

/** Boja kao `#RRGGBB` preko pozadine slajda (model nema providnost boje). */
const hex = (b: Boja, st: Stanje) => pomesaj(b, st.ctx.pozadina);

/** `tx1` preko mape boja (podrazumevana boja teksta). */
function tx1(st: Stanje): string {
  return st.ctx.tema.boje[st.ctx.mapaBoja['tx1'] ?? 'dk1'] ?? '#000000';
}

/** Deo pre spajanja: deo platna, veličina u pt izvora (za prored u tačkama) i senka (za senku okvira). */
interface SirovDeo { deo: Deo; velicinaPt: number; senka: Senka | null; }

/** Svojstva dela: sopstveni `rPr` (+ `pPr/a:defRPr`) -> stil oblika (opcije) -> nasleđeni nivoi. */
function napraviDeo(tekst: string, rPr: Element | null, defRPr: Element | null, nivoi: Element[], st: Stanje): SirovDeo {
  const { ctx, o } = st;
  const s = ctx.t.s;
  const svoj = razresiRPr(rPr, defRPr, []);
  const r: RazresenRPr = razresiRPr(rPr, defRPr, nivoi);
  const imaSvoj = (ime: string) => [rPr, defRPr].some((e) => !!e?.getAttribute(ime)?.trim());

  const latin = svoj.latin ?? o.fontIzStila ?? r.latin;
  const podebljano = imaSvoj('b') ? svoj.b : o.podebljanoIzStila ?? r.b;

  let boja: string;
  const izvorBoje = svoj.boja || svoj.bezBoje ? svoj : o.podrazumevanaBoja ? null : r;
  if (izvorBoje?.bezBoje) boja = ctx.pozadina;
  else {
    const b = izvorBoje?.boja ? bojaIz(izvorBoje.boja, st.kb) : null;
    boja = b ? hex(b, st) : o.podrazumevanaBoja ?? tx1(st);
  }

  const velicinaPt = ogranici(r.sz !== null ? r.sz / 100 : PODRAZUMEVANA_VELICINA_PT, 0.01, 4000);
  let velicina = ogranici(velicinaPt * s, 1, 400);
  let t = tekst;
  if (r.cap !== 'none') {
    t = t.toLocaleUpperCase('sr-Latn');
    if (r.cap === 'small') {
      velicina = ogranici(velicina * 0.8, 1, 400);
      if (t.trim() !== '') upozoriJednom(st, 'TEKST_PRIBLIZAN', 'Mala velika slova (small caps) su prikazana kao umanjena velika slova.');
    }
  }
  const polozaj: Polozaj = r.baseline > 0 ? 'EKSPONENT' : r.baseline < 0 ? 'INDEKS' : 'OBICAN';
  return {
    deo: {
      tekst: t, font: font(st, latin), velicina: zaokruzi(velicina), boja,
      podebljano, kurziv: r.i, podvuceno: r.u, precrtano: r.strike, polozaj,
    },
    velicinaPt,
    senka: r.senka ? senkaIzEfekta(r.senka, ctx) : null,
  };
}

const istaSvojstva = (a: Deo, b: Deo) => a.font === b.font && a.velicina === b.velicina && a.boja === b.boja
  && a.podebljano === b.podebljano && a.kurziv === b.kurziv && a.podvuceno === b.podvuceno && a.precrtano === b.precrtano
  && a.polozaj === b.polozaj;

const istaSenka = (a: Senka | null, b: Senka | null) => a === b || (!!a && !!b && a.boja === b.boja
  && a.pomerajX === b.pomerajX && a.pomerajY === b.pomerajY && a.zamucenje === b.zamucenje);

const prazanTekst = (t: string) => t.trim() === '';

function lista(pp: RazresenPPr, st: Stanje): Lista | null {
  const bu = pp.bu;
  if (bu.vrsta === 'nema') return null;
  const b = bu.boja ? bojaIz(bu.boja, st.kb) : null;
  const boja = b ? hex(b, st) : null;
  if (bu.vrsta === 'broj') {
    let format = SEME_BROJEVA[bu.sema];
    if (!format) {
      format = bu.sema.startsWith('alphaLc') ? 'MALA_SLOVA_ZAGRADA'
        : bu.sema.startsWith('alphaUc') ? 'VELIKA_SLOVA_TACKA'
          : bu.sema.startsWith('romanUc') ? 'RIMSKI_VELIKI_TACKA'
            : bu.sema.startsWith('romanLc') ? 'RIMSKI_MALI_TACKA'
              : 'ARAPSKI_TACKA';
      upozoriJednom(st, 'TEKST_PRIBLIZAN', `Numeracija liste '${bu.sema}' je prikazana približno.`);
    }
    return { vrsta: 'BROJ', znak: null, boja, format, pocetak: ogranici(Math.trunc(bu.pocetak), 1, 9999) };
  }
  const znak = znakListe(bu.znak, bu.font, st);
  return znak === null ? null : { vrsta: 'ZNAK', znak, boja, format: null, pocetak: null };
}

/** Znak liste: simbolski fontovi (Wingdings, Symbol) i PUA U+F000-F0FF u Unicode; razmak -> bez liste. */
function znakListe(izvor: string, fontListe: string | null, st: Stanje): string | null {
  const prvi = Array.from(izvor)[0] ?? '•';
  if (prazanTekst(prvi)) return null;
  const kod = prvi.codePointAt(0)!;
  const pua = kod >= 0xf000 && kod <= 0xf0ff;
  const f = (fontListe ?? '').trim().toLowerCase();
  const simbolski = f === 'symbol' || f.startsWith('wingdings') || f === 'webdings';
  if (!simbolski && !pua) return prvi;
  const znak = pua ? String.fromCodePoint(kod - 0xf000) : prvi;
  const tabela = f === 'wingdings' ? ZNACI_WINGDINGS : f === 'symbol' ? ZNACI_SYMBOL : null;
  const preslikan = tabela && Object.hasOwn(tabela, znak) ? tabela[znak] : null;
  if (preslikan) return preslikan;
  upozoriJednom(st, 'TEKST_PRIBLIZAN', `Znak liste iz simbolskog fonta${fontListe ? ` '${fontListe}'` : ''} je zamenjen tačkom.`);
  return '•';
}

function tabulatori(pp: RazresenPPr, imaTab: boolean, sirinaOkvira: number, st: Stanje): Tabulator[] {
  const s = st.ctx.t.s;
  const stopovi: Tabulator[] = pp.tabovi.slice(0, MAX_TABULATORA).map((t) => {
    const poravnanje = TABOVI[t.algn] ?? 'LEVO';
    return { poz: ogranici(uJed(t.poz, s), 0, 2880), poravnanje };
  });
  if (stopovi.some((t) => t.poravnanje !== 'LEVO')) {
    upozoriJednom(st, 'TABULATORI', 'Tab-stopovi koji nisu levi su prikazani kao levi.');
  }
  if (imaTab && pp.defTabSz > 0 && pp.defTabSz !== PODRAZUMEVANI_DEF_TAB) {
    const d = pp.defTabSz / EMU_PO_PT * s;
    const poslednji = stopovi.reduce((m, t) => Math.max(m, t.poz), 0);
    const granica = Math.min(sirinaOkvira, 2880);
    for (let k = 1; stopovi.length < MAX_TABULATORA && k * d <= granica + 1e-9; k++) {
      const poz = zaokruzi(k * d);
      if (poz > poslednji) stopovi.push({ poz, poravnanje: 'LEVO' });
    }
  }
  return stopovi;
}

function razmak(r: RazresenPPr['spcBef'], s: number, velicinaPrvog: number): number {
  if (!r) return 0;
  const v = 'pts' in r ? r.pts / 100 * s : r.pct / 100000 * 1.2 * velicinaPrvog;
  return zaokruzi(ogranici(v, 0, 1000));
}

function pasus(p: Element, nivoi: (nivo: number) => Element[], sirinaOkvira: number, st: Stanje, senke: (Senka | null)[]): Pasus {
  const s = st.ctx.t.s;
  const pPr = dete(p, NS.a, 'pPr');
  const nivo = Math.trunc(ogranici(brojAtr(pPr, 'lvl', 0), 0, 8));
  const stilovi = nivoi(nivo);
  const pp = razresiPPr(pPr, stilovi);
  const defRPr = pPr && dete(pPr, NS.a, 'defRPr');

  const sirovi: SirovDeo[] = [];
  for (const el of Array.from(p.children)) {
    if (el.namespaceURI !== NS.a) continue;
    const rPr = dete(el, NS.a, 'rPr');
    if (el.localName === 'r' || el.localName === 'fld') {
      const tekst = dete(el, NS.a, 't')?.textContent ?? '';
      if (tekst !== '') sirovi.push(napraviDeo(tekst, rPr, defRPr, stilovi, st));
    } else if (el.localName === 'br') {
      sirovi.push(napraviDeo('\n', rPr, defRPr, stilovi, st));
    }
  }
  for (const d of sirovi) if (!prazanTekst(d.deo.tekst)) senke.push(d.senka);

  let delovi: Deo[] = [];
  for (const { deo } of sirovi) {
    const prethodni = delovi[delovi.length - 1];
    if (prethodni && istaSvojstva(prethodni, deo)) prethodni.tekst += deo.tekst;
    else delovi.push({ ...deo });
  }
  let najveciPt = Math.max(0, ...sirovi.map((d) => d.velicinaPt));
  if (delovi.length === 0) {
    // Prazan pasus zadržava visinu reda (odluka 9 faze 1): veličina iz a:endParaRPr, pa iz lanca.
    const kraj = napraviDeo('', dete(p, NS.a, 'endParaRPr'), defRPr, stilovi, st);
    delovi = [kraj.deo];
    najveciPt = kraj.velicinaPt;
  }

  const prviVelicina = delovi[0].velicina;
  let proredProcenat = 100;
  if (pp.lnSpc) {
    proredProcenat = 'pct' in pp.lnSpc ? pp.lnSpc.pct / 1000 : (pp.lnSpc.pts / 100) / (1.2 * najveciPt) * 100;
  }
  const imaTab = delovi.some((d) => d.tekst.includes('\t'));
  return {
    poravnanje: PORAVNANJA[pp.algn ?? 'l'] ?? 'LEVO',
    nivo,
    lista: lista(pp, st),
    uvlacenje: { levo: ogranici(uJed(pp.marL, s), -1000, 1000), prviRed: ogranici(uJed(pp.indent, s), -1000, 1000) },
    razmakPre: razmak(pp.spcBef, s, prviVelicina),
    razmakPosle: razmak(pp.spcAft, s, prviVelicina),
    proredProcenat: zaokruzi(ogranici(proredProcenat, 50, 300)),
    tabulatori: tabulatori(pp, imaTab, sirinaOkvira, st),
    delovi,
  };
}

function okvir(bodyLanac: Element[], st: Stanje): Okvir {
  const s = st.ctx.t.s;
  const b = razresiBodyPr(bodyLanac);
  if (b.vert !== 'horz' || b.numCol > 1) {
    upozoriJednom(st, 'TEKST_PRIBLIZAN', b.numCol > 1
      ? 'Tekst u više kolona je prikazan u jednoj koloni.'
      : 'Uspravan tekst je prikazan vodoravno.');
  }
  const unutra = (emu: number) => ogranici(uJed(emu, s), 0, 200);
  return {
    unutraLevo: unutra(b.lIns), unutraGore: unutra(b.tIns), unutraDesno: unutra(b.rIns), unutraDole: unutra(b.bIns),
    sidro: SIDRA[b.anchor] ?? 'VRH',
    prelom: b.wrap,
    // Odnosi (ne jedinice): bez zaokruživanja na 2 decimale, samo bez šuma pokretnog zareza.
    skala: odnos(ogranici(b.fontScale / 100000, 0.25, 1)),
    skalaProreda: odnos(ogranici(1 - b.lnSpcReduction / 100000, 0.5, 1)),
  };
}

/**
 * Tekst oblika: pasusi 1:1 sa `a:p` (i prazni), okvir iz `bodyPr` lanca, senka teksta (odluka 21: ista na svim
 * nepraznim delovima -> senka; nijedna -> null; inače `'razlicite'`). `nivoi(lvl)` daje stilove nivoa (najjači prvi,
 * `stiloviNivoa`); `sirinaOkvira` (jedinice platna) ograničava podrazumevane tab-stopove.
 */
export function pretvoriTekst(txBody: Element, nivoi: (nivo: number) => Element[], bodyLanac: Element[],
                              ctx: KontekstSlajda, sirinaOkvira: number, o: OpcijeTeksta = {}): RezultatTeksta {
  const st: Stanje = { ctx, o, kb: { tema: ctx.tema, mapaBoja: ctx.mapaBoja }, prijavljeno: new Set() };
  const senke: (Senka | null)[] = [];
  const pasusi = Array.from(txBody.children)
    .filter((el) => el.namespaceURI === NS.a && el.localName === 'p')
    .map((p) => pasus(p, nivoi, sirinaOkvira, st, senke));

  let senka: RezultatTeksta['senka'] = null;
  if (senke.length > 0 && senke.some((x) => x !== null)) {
    senka = senke.every((x) => istaSenka(x, senke[0])) ? senke[0] : 'razlicite';
  }
  return {
    pasusi,
    okvir: okvir(bodyLanac, st),
    senka,
    prazan: pasusi.every((p) => p.delovi.every((d) => prazanTekst(d.tekst))),
  };
}

/**
 * Senka iz `a:outerShdw`: `dist` (EMU) u smeru `dir` (1/60000 stepena, 0 = desno, smer kazaljke), `blurRad` (EMU) ->
 * zamućenje; sve u jedinicama platna, ograničeno na opsege `PlatnoPP`; boja (podrazumevano crna) pomešana sa pozadinom.
 */
export function senkaIzEfekta(outerShdw: Element, ctx: KontekstSlajda): Senka {
  const s = ctx.t.s;
  const dist = brojAtr(outerShdw, 'dist', 0);
  const ugao = brojAtr(outerShdw, 'dir', 0) / 60000 * Math.PI / 180;
  const b = bojaIz(outerShdw, { tema: ctx.tema, mapaBoja: ctx.mapaBoja }) ?? { hex: '#000000', alfa: 1 };
  return {
    boja: pomesaj(b, ctx.pozadina),
    pomerajX: ogranici(uJed(dist * Math.cos(ugao), s), -100, 100),
    pomerajY: ogranici(uJed(dist * Math.sin(ugao), s), -100, 100),
    zamucenje: ogranici(uJed(brojAtr(outerShdw, 'blurRad', 0), s), 0, 100),
  };
}
