// Formule PowerPointa (`mc:AlternateContent`: `mc:Choice Requires="a14"` sa `a14:m`, `mc:Fallback` sa slikom) u FORMULA
// slojeve: slika iz Fallback-a je tačan izgled, LaTeX (F8) je izvor za izmenu i rezerva kad slike nema. Okvir je jedan
// sloj; kad animacija cilja pasus, slika se seče po pojasevima mastila (odluka 5) i svaki neprazan pasus dobija svoj sloj.
// Formula u ćeliji tabele (`tcPr/blipFill`) je sloj iznad TABELE (odluka 6). Čiste funkcije bez Angular-a.
import type { FormulaSloj, Lista, Pasus, Poravnanje } from '../data-access/platno.models';
import { oznakeListe } from '../ui/platno-tekst';
import {
  kutijaIzLanca, lanacPlaceholdera, placeholderOblika, razresiPPr, razresiRPr, stiloviNivoa, vrstaTeksta,
} from './nasledjivanje';
import { bojaTx1, nazivOblika, rotacijaSloja } from './oblik';
import { latexOkvira } from './omml-latex';
import { dekodirajPng, isecKolone, isecRedove, kodirajPng, pojaseviMastila, type Rgba } from './png';
import { deoElementa, NEPODRZANI_FORMATI } from './slika';
import type { RezultatTabele } from './tabela';
import { formatBroja, pocetakListe } from './tekst';
import { bojaIz, pomesaj } from './tema';
import { uSloj, zaokruzi, type KontekstSlajda, type Kutija } from './tipovi';
import { brojAtr, deca, dete, NS } from './xml';

/** Slojevi formule; `pasusUSloj` (indeks pasusa -> id sloja) je popunjen samo kad je okvir rasklopljen po pasusima. */
export interface RezultatFormule { slojevi: FormulaSloj[]; pasusUSloj: Map<number, string>; }

const PODRAZUMEVANA_VELICINA_PT = 18;
/** Server traži širinu i visinu sloja > 0 (posle zaokruživanja na 2 decimale). */
const NAJMANJA_MERA = 0.01;

const PORAVNANJA: Readonly<Record<string, Poravnanje>> = {
  l: 'LEVO', ctr: 'CENTAR', r: 'DESNO', just: 'OBOSTRANO', dist: 'OBOSTRANO', justLow: 'OBOSTRANO', thaiDist: 'OBOSTRANO',
};
/** `m:oMathParaPr/m:jc` (ECMA-376 §22.1.2.51); podrazumevano `centerGroup`. */
const PORAVNANJA_MATEMATIKE: Readonly<Record<string, Poravnanje>> = {
  left: 'LEVO', right: 'DESNO', center: 'CENTAR', centerGroup: 'CENTAR',
};

const ogranici = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const jeA = (el: Element, ime: string) => el.namespaceURI === NS.a && el.localName === ime;
const jeMatematika = (el: Element) => el.namespaceURI === NS.a14 && el.localName === 'm';
const tekstDela = (el: Element) => dete(el, NS.a, 't')?.textContent ?? '';

/** Pasusi okvira ili ćelije i stilovi njihovih nivoa (isti lanac kao za TEKST sloj, `stiloviNivoa`). */
interface TekstOkvira { pasusi: Element[]; nivoi: (nivo: number) => Element[]; }

/** Ima "mastila": formulu (`a14:m`) ili `a:r`/`a:fld` sa vidljivim tekstom (samo razmak nema mastila, odluka 5). */
function neprazan(p: Element): boolean {
  return Array.from(p.children).some((c) => jeMatematika(c) || ((jeA(c, 'r') || jeA(c, 'fld')) && tekstDela(c).trim() !== ''));
}

/** Pasus ima bilo kakav sadržaj (kao neprazan pasus prikaza teksta: i razmak i `a:br` troše broj liste). */
function imaSadrzaj(p: Element): boolean {
  return Array.from(p.children).some((c) => jeMatematika(c) || jeA(c, 'br') || ((jeA(c, 'r') || jeA(c, 'fld')) && tekstDela(c) !== ''));
}

const nivoPasusa = (pPr: Element | null) => Math.trunc(ogranici(brojAtr(pPr, 'lvl', 0), 0, 8));

/**
 * Oznake automatske numeracije (`a:buAutoNum`, i nasleđene iz `lstStyle`/stilova mastera) po pasusu, ili `null`. Broj
 * računa ista funkcija kao prikaz TEKST sloja (`oznakeListe`), nad pasusima svedenim na nivo, listu i "ima sadržaj";
 * znak liste (`buChar`) se ne prenosi u LaTeX, ali prekida brojanje kao u prikazu.
 */
function oznakeBrojeva(t: TekstOkvira): (string | null)[] {
  const liste: (Lista | null)[] = [];
  const svedeni = t.pasusi.map((p) => {
    const pPr = dete(p, NS.a, 'pPr');
    const nivo = nivoPasusa(pPr);
    const bu = razresiPPr(pPr, t.nivoi(nivo)).bu;
    const lista: Lista | null = bu.vrsta === 'broj'
      ? { vrsta: 'BROJ', znak: null, boja: null, format: formatBroja(bu.sema).format, pocetak: pocetakListe(bu.pocetak) }
      : bu.vrsta === 'znak' ? { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null } : null;
    liste.push(lista);
    // `oznakeListe` čita samo nivo, listu i tekst delova.
    return { nivo, lista, delovi: [{ tekst: imaSadrzaj(p) ? 'x' : '' }] } as Pasus;
  });
  return oznakeListe(svedeni).map((o, i) => (liste[i]?.vrsta === 'BROJ' ? o : null));
}

/**
 * Pasusi za LaTeX: numerisani dobijaju oznaku kao tekst (`1. `) na početku (kopija pasusa, pa `latexOkvira` je spaja sa
 * tekstom iza nje u isti `\text{}`); ostali ostaju isti elementi. Tab posle broja je jedan razmak; beli znaci na početku
 * prvog dela teksta se brišu (inače `\text{1.  x}`).
 */
function pasusiZaLatex(t: TekstOkvira): Element[] {
  const oznake = oznakeBrojeva(t);
  return t.pasusi.map((p, i) => {
    const oznaka = oznake[i];
    if (!oznaka) return p;
    const kopija = p.cloneNode(true) as Element;
    const doc = p.ownerDocument;
    const r = doc.createElementNS(NS.a, 'a:r');
    const tekst = doc.createElementNS(NS.a, 'a:t');
    tekst.textContent = `${oznaka} `;
    r.appendChild(tekst);
    const pPr = dete(kopija, NS.a, 'pPr');
    const prviSadrzaj = Array.from(kopija.children).find((c) => jeMatematika(c) || jeA(c, 'r') || jeA(c, 'fld') || jeA(c, 'br'));
    const t = prviSadrzaj && (jeA(prviSadrzaj, 'r') || jeA(prviSadrzaj, 'fld')) ? dete(prviSadrzaj, NS.a, 't') : null;
    if (t) t.textContent = (t.textContent ?? '').replace(/^\s+/, '');
    kopija.insertBefore(r, pPr ? pPr.nextSibling : kopija.firstChild);
    return kopija;
  });
}

interface Izgled { boja: string; velicina: number; poravnanje: Poravnanje; }

/** `a:rPr` prvog dela pasusa: `a:r`/`a:fld` sa tekstom, ili `a:rPr` u `m:r` formule; nema -> `a:endParaRPr`. */
function rPrPrvogDela(p: Element): Element | null {
  for (const c of Array.from(p.children)) {
    if ((jeA(c, 'r') || jeA(c, 'fld')) && tekstDela(c).trim() !== '') return dete(c, NS.a, 'rPr');
    if (jeMatematika(c)) {
      const rPr = c.getElementsByTagNameNS(NS.a, 'rPr')[0];
      if (rPr) return rPr;
    }
  }
  return dete(p, NS.a, 'endParaRPr');
}

/**
 * Boja i veličina iz prvog dela (sopstveni `rPr` -> `pPr/a:defRPr` -> stilovi nivoa, kao tekst), poravnanje iz pasusa:
 * prikazna formula (`m:oMathPara`) po `m:jc` (podrazumevano centrirano), inače `algn` pasusa.
 */
function izgledPasusa(p: Element | undefined, t: TekstOkvira, ctx: KontekstSlajda): Izgled {
  if (!p) return { boja: bojaTx1(ctx), velicina: zaokruzi(PODRAZUMEVANA_VELICINA_PT * ctx.t.s) || 1, poravnanje: 'LEVO' };
  const pPr = dete(p, NS.a, 'pPr');
  const stilovi = t.nivoi(nivoPasusa(pPr));
  const r = razresiRPr(rPrPrvogDela(p), pPr && dete(pPr, NS.a, 'defRPr'), stilovi);
  const b = r.boja ? bojaIz(r.boja, { tema: ctx.tema, mapaBoja: ctx.mapaBoja }) : null;
  const boja = r.bezBoje ? ctx.pozadina : b ? pomesaj(b, ctx.pozadina) : bojaTx1(ctx);
  const pt = r.sz !== null ? r.sz / 100 : PODRAZUMEVANA_VELICINA_PT;

  let poravnanje: Poravnanje;
  const para = p.getElementsByTagNameNS(NS.m, 'oMathPara')[0];
  if (para) {
    const jc = dete(dete(para, NS.m, 'oMathParaPr') ?? para, NS.m, 'jc');
    const v = jc ? (jc.getAttributeNS(NS.m, 'val') || jc.getAttribute('val') || '') : 'centerGroup';
    poravnanje = PORAVNANJA_MATEMATIKE[v] ?? 'CENTAR';
  } else {
    poravnanje = PORAVNANJA[razresiPPr(pPr, stilovi).algn ?? 'l'] ?? 'LEVO';
  }
  return { boja, velicina: zaokruzi(ogranici(pt * ctx.t.s, 1, 400)), poravnanje };
}

/** Slika izvora: ključ medija se registruje tek na zahtev (rasklopljena formula šalje isečke, ne original). */
interface SlikaFormule { cilj: string; kljuc: () => string | null; bajtovi: () => Uint8Array | null; }

/**
 * `a:blip r:embed` -> slika formule. Nema je, spoljna je, deo ne postoji ili je format koji pregledač ne dekodira (EMF,
 * WMF, ...: `slike.ts` bi oborio slanje celog uvoza) -> `null` (sloj prikazuje LaTeX izvor).
 */
function slikaIz(blip: Element | null, ctx: KontekstSlajda): SlikaFormule | null {
  const rId = blip?.getAttributeNS(NS.r, 'embed')?.trim() ?? '';
  if (!blip || rId === '') return null;
  const deo = deoElementa(blip, ctx);
  const veza = ctx.paket.veza(deo, rId);
  if (!veza || veza.spoljna || NEPODRZANI_FORMATI.test(veza.cilj) || !ctx.paket.postoji(veza.cilj)) return null;
  return { cilj: veza.cilj, kljuc: () => ctx.medijIzVeze(deo, rId), bajtovi: () => ctx.paket.bajtovi(veza.cilj) };
}

/** Udeli kutije `[x0, x1] x [y0, y1]` (0..1 = cela kutija; van toga slika izlazi iz oblika). */
interface Udeli { x0: number; y0: number; x1: number; y1: number; }
const CELA: Udeli = { x0: 0, y0: 0, x1: 1, y1: 1 };

/**
 * Pravougaonik slike u obliku po `a:stretch/a:fillRect` (`l`, `t`, `r`, `b` u 1/1000 %, negativno = slika izlazi van
 * oblika): `x0 = l`, `x1 = 1 - r`, ... Prazan ili izvrnut pravougaonik -> ceo oblik.
 */
function udeliSlike(fillRect: Element | null): Udeli {
  if (!fillRect) return CELA;
  const u = (ime: string) => brojAtr(fillRect, ime, 0) / 100000;
  const d: Udeli = { x0: u('l'), y0: u('t'), x1: 1 - u('r'), y1: 1 - u('b') };
  return d.x1 > d.x0 && d.y1 > d.y0 ? d : CELA;
}

/**
 * Deo kutije po udelima. Udeli su u sistemu oblika, pa se pomeraj centra okreće za `rot` (oblik se okreće oko svog
 * centra); deo zadržava rotaciju oblika.
 */
function deoKutije(k: Kutija, d: Udeli): Kutija {
  const w = k.w * (d.x1 - d.x0);
  const h = k.h * (d.y1 - d.y0);
  const dx = k.w * ((d.x0 + d.x1) / 2 - 0.5);
  const dy = k.h * ((d.y0 + d.y1) / 2 - 0.5);
  const ugao = k.rot * Math.PI / 180;
  const cx = k.x + k.w / 2 + dx * Math.cos(ugao) - dy * Math.sin(ugao);
  const cy = k.y + k.h / 2 + dx * Math.sin(ugao) + dy * Math.cos(ugao);
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot: k.rot };
}

function napraviSloj(id: string, naziv: string | null, k: Kutija, ctx: KontekstSlajda, latex: string, izgled: Izgled,
                     slikaIzvora: string | null): FormulaSloj {
  const s = uSloj(k, ctx.t);
  return {
    id, tip: 'FORMULA', naziv, x: s.x, y: s.y,
    sirina: Math.max(NAJMANJA_MERA, s.sirina), visina: Math.max(NAJMANJA_MERA, s.visina),
    rotacija: rotacijaSloja(s.rotacija), providnost: 1, zakljucan: false, senka: null,
    latex, boja: izgled.boja, velicina: izgled.velicina, poravnanje: izgled.poravnanje, slikaIzvora,
  };
}

const BEZ_SLIKE = 'nema slike iz PowerPointa, prikazuje se LaTeX izvor';

/** `FORMULA_ZA_PROVERU` jednom po sloju: LaTeX je približan i/ili sloj nema sliku (`bezSlike` = razlog; prikazuje se LaTeX). */
function proveri(ctx: KontekstSlajda, id: string, zaProveru: boolean, bezSlike: string | null): void {
  if (!zaProveru && !bezSlike) return;
  const razlozi = [
    ...(bezSlike ? [bezSlike] : []),
    ...(zaProveru ? ['LaTeX je približan'] : []),
  ];
  ctx.upozori('FORMULA_ZA_PROVERU', `Formula '${id}': ${razlozi.join('; ')}. Proveri je u editoru.`);
}

const prvoDete = (el: Element | null) => (el ? Array.from(el.children)[0] ?? null : null);

/**
 * `mc:AlternateContent` formule -> FORMULA slojevi. Položaj: kutija oblika (`mc:Choice` pa `mc:Fallback`, pa placeholder
 * layouta/mastera) kroz `kutijaGrupe`, umanjena po `fillRect` slike iz Fallback-a (`p:spPr/a:blipFill`, ili `p:blipFill`
 * slike). LaTeX: `latexOkvira` pasusa iz `mc:Choice` (numerisani pasusi dobijaju broj kao tekst).
 * - `pasusiSaAnimacijom` prazan -> jedan sloj `idOsnova`, `pasusUSloj` prazan.
 * - inače se PNG seče po pojasevima mastila: sloj `${idOsnova}p<i>` po nepraznom pasusu (sa isečkom kao novim medijem),
 *   `pasusUSloj` popunjen. Jedan neprazan pasus -> jedan takav sloj sa celom slikom (isečak bi bio ista slika). Nema
 *   slike, nije PNG ili se broj nizova mastila ne poklapa -> jedan sloj + `FORMULA_ODJEDNOM`, `pasusUSloj` prazan.
 * Nema položaja -> `null` + `OBJEKAT_PRESKOCEN`.
 */
export function pretvoriFormulu(ac: Element, kutijaGrupe: (k: Kutija) => Kutija, ctx: KontekstSlajda, idOsnova: string,
                                pasusiSaAnimacijom: ReadonlySet<number>): RezultatFormule | null {
  const sp = prvoDete(dete(ac, NS.mc, 'Choice'));
  const fb = prvoDete(dete(ac, NS.mc, 'Fallback'));
  const lanac = sp ? lanacPlaceholdera(sp, ctx) : [];
  const kutija = kutijaIzLanca([...(sp ? [sp] : []), ...(fb ? [fb] : []), ...lanac.slice(1)]);
  const naziv = (sp && nazivOblika(sp)) || (fb && nazivOblika(fb)) || null;
  if (!kutija) {
    ctx.upozori('OBJEKAT_PRESKOCEN', `Formula${naziv ? ` '${naziv}'` : ''} nije uvezena: nema položaj.`);
    return null;
  }

  const blipFill = fb ? dete(dete(fb, NS.p, 'spPr') ?? fb, NS.a, 'blipFill') ?? dete(fb, NS.p, 'blipFill') : null;
  const slika = slikaIz(blipFill && dete(blipFill, NS.a, 'blip'), ctx);
  const udeli = udeliSlike(blipFill && dete(dete(blipFill, NS.a, 'stretch') ?? blipFill, NS.a, 'fillRect'));
  const oblik = kutijaGrupe(kutija);

  const txBody = sp && dete(sp, NS.p, 'txBody');
  const vrsta = vrstaTeksta(sp ? placeholderOblika(sp) : null);
  const tekst: TekstOkvira = {
    pasusi: txBody ? deca(txBody, NS.a, 'p') : [],
    nivoi: (n) => stiloviNivoa(lanac, vrsta, ctx, n),
  };
  const pasusi = pasusiZaLatex(tekst);
  const indeksi = tekst.pasusi.flatMap((p, i) => (neprazan(p) ? [i] : []));
  const izgled = (i: number | undefined) => izgledPasusa(i === undefined ? tekst.pasusi[0] : tekst.pasusi[i], tekst, ctx);

  const sloj = (id: string, d: Udeli, izPasusa: Element[], izgledOd: number | undefined, slikaIzvora: string | null) => {
    const l = latexOkvira(izPasusa);
    proveri(ctx, id, l.zaProveru, slikaIzvora === null ? BEZ_SLIKE : null);
    return napraviSloj(id, naziv, deoKutije(oblik, d), ctx, l.latex, izgled(izgledOd), slikaIzvora);
  };
  const celo = (): RezultatFormule => ({
    slojevi: [sloj(idOsnova, udeli, pasusi, indeksi[0], slika?.kljuc() ?? null)],
    pasusUSloj: new Map(),
  });

  if (pasusiSaAnimacijom.size === 0 || indeksi.length === 0) return celo();
  if (indeksi.length === 1) {
    const i = indeksi[0];
    const id = `${idOsnova}p${i}`;
    return { slojevi: [sloj(id, udeli, [pasusi[i]], i, slika?.kljuc() ?? null)], pasusUSloj: new Map([[i, id]]) };
  }

  const bajtovi = slika?.bajtovi() ?? null;
  const png = bajtovi ? dekodirajPng(bajtovi) : null;
  const pojasevi = png ? pojaseviMastila(png, indeksi.length) : null;
  if (!png || !pojasevi) {
    const razlog = !slika ? 'nema slike formule' : !png ? 'slika formule nije PNG koji uvoz čita'
      : `redovi formule u slici se ne mogu pouzdano dodeliti njenim pasusima (${indeksi.length})`;
    ctx.upozori('FORMULA_ODJEDNOM',
      `Formula '${idOsnova}' se prikazuje odjednom (${razlog}): animacije njenih pasusa su svedene na prvu.`);
    return celo();
  }

  const rez: RezultatFormule = { slojevi: [], pasusUSloj: new Map() };
  indeksi.forEach((i, n) => {
    const [od, doReda] = pojasevi[n];
    const v = udeli.y1 - udeli.y0;
    const d: Udeli = { ...udeli, y0: udeli.y0 + (od / png.visina) * v, y1: udeli.y0 + (doReda / png.visina) * v };
    const id = `${idOsnova}p${i}`;
    const medij = ctx.noviMedij('formula.png', kodirajPng(isecRedove(png, od, doReda)));
    rez.slojevi.push(sloj(id, d, [pasusi[i]], i, medij));
    rez.pasusUSloj.set(i, id);
  });
  return rez;
}

/**
 * Vidljivi deo slike ćelije. Popuna ćelije je odsečena ćelijom, a `fillRect` (`udeli`, u udelima ćelije) može da razvuče
 * sliku daleko van nje: PowerPoint u fallback tabeli koristi jednu sliku cele tabele za sve ćelije sa formulom, a svaka
 * ćelija bira svoj deo velikim negativnim `fillRect`-om. Vidljivi udeo slike je `u0 = -l / (1 - l - r)`,
 * `u1 = (1 - l) / (1 - l - r)` (isto `t`/`b`), ograničen na [0, 1]; isečak (u celim pikselima) je nov medij, a kutija je
 * njegov položaj u ćeliji. Slika cela unutar ćelije -> original bez dekodiranja. Isečak ne uspeva -> `null` (sloj
 * prikazuje LaTeX; cela slika tabele se nikad ne stavlja u ćeliju).
 */
function vidljivoUCeliji(slika: SlikaFormule, u: Udeli, ctx: KontekstSlajda, dekodirane: Map<string, Rgba | null>):
  { kljuc: string; udeli: Udeli } | null {
  if (u.x0 >= 0 && u.y0 >= 0 && u.x1 <= 1 && u.y1 <= 1) {
    const kljuc = slika.kljuc();
    return kljuc ? { kljuc, udeli: u } : null;
  }
  if (!dekodirane.has(slika.cilj)) {
    const b = slika.bajtovi();
    dekodirane.set(slika.cilj, b ? dekodirajPng(b) : null);
  }
  const png = dekodirane.get(slika.cilj);
  if (!png) return null;
  const sirina = u.x1 - u.x0;
  const visina = u.y1 - u.y0;
  const uSliku = (v: number, od: number, raspon: number, n: number, zaokruzi: (x: number) => number) =>
    Math.min(n, Math.max(0, zaokruzi(ogranici((v - od) / raspon, 0, 1) * n)));
  const px0 = uSliku(0, u.x0, sirina, png.sirina, Math.floor);
  const px1 = uSliku(1, u.x0, sirina, png.sirina, Math.ceil);
  const py0 = uSliku(0, u.y0, visina, png.visina, Math.floor);
  const py1 = uSliku(1, u.y0, visina, png.visina, Math.ceil);
  if (px1 <= px0 || py1 <= py0) return null;
  const isecak = isecKolone(isecRedove(png, py0, py1), px0, px1);
  return {
    kljuc: ctx.noviMedij('formula.png', kodirajPng(isecak)),
    udeli: {
      x0: u.x0 + (px0 / png.sirina) * sirina, x1: u.x0 + (px1 / png.sirina) * sirina,
      y0: u.y0 + (py0 / png.visina) * visina, y1: u.y0 + (py1 / png.visina) * visina,
    },
  };
}

/**
 * Formule u ćelijama tabele (odluka 6): za svaku ćeliju iz `tabela.celijeSaSlikom` (Fallback tabela, `tcPr/blipFill`) sloj
 * `${idOsnova}c<red>x<kolona>` u kutiji ćelije; slika je deo slike iz `blipFill` ćelije koji se vidi u ćeliji (po
 * `fillRect`, `vidljivoUCeliji`), LaTeX iz pasusa iste ćelije (isti red, isti `a:tc` po redu = kolona mreže) u tabeli iz
 * `mc:Choice`. `acTabele` je `mc:AlternateContent` tabele.
 */
export function formuleCelija(acTabele: Element, tabela: RezultatTabele, ctx: KontekstSlajda, idOsnova: string): FormulaSloj[] {
  const izvor = dete(acTabele, NS.mc, 'Choice') ?? acTabele;
  const tbl = izvor.getElementsByTagNameNS(NS.a, 'tbl')[0] ?? null;
  const redovi = tbl ? deca(tbl, NS.a, 'tr') : [];
  const dekodirane = new Map<string, Rgba | null>();
  return tabela.celijeSaSlikom.map((c) => {
    const tc = redovi[c.red] ? deca(redovi[c.red], NS.a, 'tc')[c.kolona] ?? null : null;
    const txBody = tc && dete(tc, NS.a, 'txBody');
    const tekst: TekstOkvira = {
      pasusi: txBody ? deca(txBody, NS.a, 'p') : [],
      nivoi: (n) => (txBody ? stiloviNivoa([txBody], 'ostalo', ctx, n) : []),
    };
    const l = latexOkvira(pasusiZaLatex(tekst));
    const id = `${idOsnova}c${c.red}x${c.kolona}`;
    const blipFill = dete(c.tcPr, NS.a, 'blipFill');
    const slika = slikaIz(blipFill && dete(blipFill, NS.a, 'blip'), ctx);
    const udeli = udeliSlike(blipFill && dete(dete(blipFill, NS.a, 'stretch') ?? blipFill, NS.a, 'fillRect'));
    const vidljivo = slika ? vidljivoUCeliji(slika, udeli, ctx, dekodirane) : null;
    proveri(ctx, id, l.zaProveru,
      vidljivo ? null : slika ? 'deo slike tabele za ovu ćeliju nije mogao da se iseče, prikazuje se LaTeX izvor' : BEZ_SLIKE);
    const prvi = tekst.pasusi.find(neprazan) ?? tekst.pasusi[0];
    const kutija = vidljivo ? deoKutije(c.kutija, vidljivo.udeli) : c.kutija;
    return napraviSloj(id, null, kutija, ctx, l.latex, izgledPasusa(prvi, tekst, ctx), vidljivo?.kljuc ?? null);
  });
}
