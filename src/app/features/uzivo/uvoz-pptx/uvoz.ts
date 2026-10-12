// Orkestracija uvoza PPTX-a: svaki slajd u PLATNO slajd (pozadina, ukrasi mastera i layouta, p:spTree sa grupama i
// alternativnim sadržajem, animacije, beleške, granice servera). Moduli F1-F11 pretvaraju pojedinačne objekte; ovde se
// sastavljaju kutije grupa, dodeljuju id-jevi slojeva, gradi mapa meta animacija i proverava dokument kao na serveru.
// Čiste funkcije bez Angular-a i RxJS-a (lokalna provera ih pokreće u Node-u).
import type { Animacija, Ivica, Platno, Senka, Sloj, TekstSloj } from '../data-access/platno.models';
import type { SlajdCmd } from '../data-access/uzivo.models';
import { pretvoriAnimacije, pasusiSaAnimacijom, type MapaMeta, type MetaPasusa } from './animacije';
import { pretvoriBeleske } from './beleske';
import { pretvoriCrtez } from './crtez';
import { formuleCelija, pretvoriFormulu } from './formula';
import { proveriKaoServer, uklopiUGranice } from './granice';
import { GreskaUvoza } from './ime-fajla';
import { praznaStatistika, type GreskaSlajda, type Statistika, type Upozorenje } from './izvestaj';
import { napraviKontekst, transformacija, type ZajednickoUvoza } from './kontekst';
import {
  kutijaIzLanca, lanacPlaceholdera, placeholderOblika, stiloviNivoa, vrstaTeksta,
} from './nasledjivanje';
import { GEOMETRIJE, ivicaIz, nazivOblika, popunaIz, pretvoriOblik, rotacijaSloja, senkaIz, upozoriJednom } from './oblik';
import { otvoriPaket } from './paket';
import { pozadinaSlajda, pretvoriSliku } from './slika';
import { pretvoriTabelu } from './tabela';
import { pretvoriTekst, type OpcijeTeksta, type RezultatTeksta } from './tekst';
import { bojaIz, pomesaj } from './tema';
import { EMU_PO_PT, uSloj, zaokruziKaoServer, type KontekstSlajda, type Kutija, type MedijUvoza } from './tipovi';
import { brojAtr, deca, dete, NS } from './xml';

export type { MedijUvoza } from './tipovi';

/** Pretvoren slajd: `indeks` = redni broj u PPTX-u (1-based); `mediji` = ključevi koje dokument koristi. */
export interface UvezenSlajd { indeks: number; cmd: SlajdCmd; mediji: string[]; statistika: Statistika; }
export interface RezultatUvoza {
  imeFajla: string;
  /** Broj slajdova u PPTX-u (i skrivenih i neuspelih). */
  ukupnoSlajdova: number;
  slajdovi: UvezenSlajd[];
  greske: GreskaSlajda[];
  upozorenja: Upozorenje[];
  /** Samo mediji koje koriste uvezeni slajdovi (preskočena slika ili neuspeo slajd ne šalju ništa). */
  mediji: Map<string, MedijUvoza>;
}
export interface OpcijePretvaranja { napredak?: (uradjeno: number, ukupno: number) => void; prekid?: AbortSignal; }

/** Prefiksi `mc:Choice@Requires` koje uvoz razume (crtež, formula, novi crtež). */
const POZNATI_ZAHTEVI: ReadonlySet<string> = new Set([NS.p14, NS.a14, NS.aink]);
const URI_TABELE = 'http://schemas.openxmlformats.org/drawingml/2006/table';
/** Placeholderi koje PowerPoint ne prikazuje kao sadržaj slajda (datum, podnožje, broj, zaglavlje, slika slajda). */
const PRESKOCENI_PLACEHOLDERI: ReadonlySet<string> = new Set(['dt', 'ftr', 'sldNum', 'hdr', 'sldImg']);
/** Id sloja kakav server prima (`PlatnoPP.ID`). */
const ISPRAVAN_ID = /^[A-Za-z0-9_-]{1,12}$/;
/** Odstupanje odnosa stranica od 16:9 koje se još smatra 16:9 (zaokruživanje EMU). */
const TOLERANCIJA_FORMATA = 0.005;
/** Granice položaja i veličine sloja na serveru (`PlatnoPP.proveriSloj`). */
const MIN_POLOZAJ = -960;
const MAX_POLOZAJ = 1920;
const MAX_MERA = 2880;

/** Kutija objekta (EMU, koordinate roditelja) -> kutija na slajdu, kroz sve grupe iznad njega. */
type KutijaGrupe = (k: Kutija) => Kutija;
const IDENTITET: KutijaGrupe = (k) => k;

const tacno = (v: string | null | undefined) => v === '1' || v === 'true';
const sKrajem = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** `cNvPr` objekta (`p:nv*Pr/p:cNvPr`, ili `p14:nvContentPartPr/p14:cNvPr` crteža), ili `null`. */
function cNvPr(el: Element): Element | null {
  for (const nv of Array.from(el.children)) {
    if (!nv.localName.startsWith('nv')) continue;
    return Array.from(nv.children).find((c) => c.localName === 'cNvPr' && (c.namespaceURI === NS.p || c.namespaceURI === NS.p14)) ?? null;
  }
  return null;
}
const idObjekta = (el: Element) => cNvPr(el)?.getAttribute('id')?.trim() ?? '';
const opisObjekta = (el: Element, vrsta = 'Objekat') => {
  const naziv = nazivOblika(el);
  return naziv ? `${vrsta} '${naziv}'` : vrsta;
};

/** Ima li `txBody` vidljiv tekst (za odluku da li objekat bez položaja vredi prijaviti). */
function imaTeksta(el: Element): boolean {
  const tx = dete(el, NS.p, 'txBody');
  return !!tx && Array.from(tx.getElementsByTagNameNS(NS.a, 't')).some((t) => (t.textContent ?? '').trim() !== '');
}

/**
 * Kutije dece grupe (`p:grpSp`): `x' = off.x + (x - chOff.x) * ext.cx / chExt.cx` (isto y), širina i visina se množe;
 * rotacija grupe okreće centar deteta oko centra grupe i dodaje se rotaciji deteta; pa sve kroz grupe iznad.
 */
function kutijaUGrupi(spolja: KutijaGrupe, xfrm: Element | null): KutijaGrupe {
  if (!xfrm) return spolja;
  const off = dete(xfrm, NS.a, 'off');
  const ext = dete(xfrm, NS.a, 'ext');
  const chOff = dete(xfrm, NS.a, 'chOff');
  const chExt = dete(xfrm, NS.a, 'chExt');
  const gx = brojAtr(off, 'x', 0);
  const gy = brojAtr(off, 'y', 0);
  const gw = brojAtr(ext, 'cx', 0);
  const gh = brojAtr(ext, 'cy', 0);
  const cx = brojAtr(chOff, 'x', gx);
  const cy = brojAtr(chOff, 'y', gy);
  const cw = brojAtr(chExt, 'cx', gw);
  const ch = brojAtr(chExt, 'cy', gh);
  const sx = cw > 0 ? gw / cw : 1;
  const sy = ch > 0 ? gh / ch : 1;
  const rot = brojAtr(xfrm, 'rot', 0) / 60000;
  const ugao = rot * Math.PI / 180;
  return (k) => {
    const w = k.w * sx;
    const h = k.h * sy;
    let x = gx + (k.x - cx) * sx;
    let y = gy + (k.y - cy) * sy;
    if (rot !== 0) {
      const dx = x + w / 2 - (gx + gw / 2);
      const dy = y + h / 2 - (gy + gh / 2);
      x = gx + gw / 2 + dx * Math.cos(ugao) - dy * Math.sin(ugao) - w / 2;
      y = gy + gh / 2 + dx * Math.sin(ugao) + dy * Math.cos(ugao) - h / 2;
    }
    return spolja({ x, y, w, h, rot: k.rot + rot });
  };
}

/** Objekat slajda za mapu meta animacija: njegovi slojevi (redom z-ose) i pasusi. */
interface Objekat { slojevi: string[]; pasus?: (i: number) => MetaPasusa | null; }

type Prefiks = 's' | 'l' | 'm';

/** Slojevi jednog slajda: hod kroz stablo oblika, id-jevi, mapa meta animacija. */
class GraditeljSlajda {
  readonly slojevi: Sloj[] = [];
  private readonly objekti = new Map<string, Objekat>();
  private readonly zauzeti = new Set<string>();
  private brojacX = 0;
  /** Sloj objekta koji se trenutno obrađuje je preskočen zbog položaja ili veličine. */
  private van = false;

  constructor(private readonly ctx: KontekstSlajda, private readonly animiraniPasusi: ReadonlyMap<string, ReadonlySet<number>>) {}

  readonly mete: MapaMeta = {
    slojevi: (spid) => this.objekti.get(spid)?.slojevi ?? [],
    pasus: (spid, i) => this.objekti.get(spid)?.pasus?.(i) ?? null,
  };

  /** Ukrasi mastera ili layouta: deca `p:spTree` koja nisu placeholderi (id prefiks `m`/`l`). */
  ukrasi(doc: Document, prefiks: 'm' | 'l'): void {
    for (const el of this.deca(doc)) {
      if (!placeholderOblika(el) && !(el.localName === 'AlternateContent' && this.placeholderUAlternativi(el))) {
        this.element(el, IDENTITET, prefiks);
      }
    }
  }

  /** `p:spTree` slajda (id prefiks `s`; objekti ulaze u mapu meta animacija). */
  stablo(doc: Document): void {
    for (const el of this.deca(doc)) this.element(el, IDENTITET, 's');
  }

  private deca(doc: Document): Element[] {
    const cSld = dete(doc.documentElement, NS.p, 'cSld');
    const stablo = cSld && dete(cSld, NS.p, 'spTree');
    return stablo ? Array.from(stablo.children) : [];
  }

  private placeholderUAlternativi(ac: Element): boolean {
    return Array.from(ac.children).some((g) => Array.from(g.children).some((el) => placeholderOblika(el) !== null));
  }

  /**
   * Jedan objekat stabla (i dete grupe): slojevi koje doda postaju njegovi u mapi meta animacija (samo na slajdu); sloj
   * van slajda se preskače uz jedno upozorenje po objektu.
   */
  private element(el: Element, kg: KutijaGrupe, prefiks: Prefiks): void {
    if (el.namespaceURI !== NS.p && el.namespaceURI !== NS.mc) return;
    if (tacno(cNvPr(el)?.getAttribute('hidden'))) return;
    const pre = this.slojevi.length;
    const vanPre = this.van;
    this.van = false;
    let pasus: Objekat['pasus'];
    let spid: string | null = null;
    switch (el.localName) {
      case 'sp':
        spid = idObjekta(el);
        pasus = this.oblik(el, kg, prefiks);
        break;
      case 'cxnSp':
        spid = idObjekta(el);
        this.konektor(el, kg, prefiks);
        break;
      case 'pic':
        spid = idObjekta(el);
        this.slika(el, kg, prefiks);
        break;
      case 'graphicFrame':
        spid = idObjekta(el);
        this.okvirGrafike(el, kg, prefiks);
        break;
      case 'grpSp':
        spid = idObjekta(el);
        this.grupa(el, kg, prefiks);
        break;
      case 'AlternateContent': {
        const ishod = this.alternativa(el, kg, prefiks);
        spid = ishod.spid;
        pasus = ishod.pasus;
        break;
      }
      case 'contentPart':
        this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(el, 'Crtež rukom')} nije uvezen: format crteža nije podržan.`);
        break;
      default:
        break;
    }
    if (this.van) {
      // Alternativni sadržaj (crtež, formula) nosi ime u svom obliku.
      const nosilac = el.localName === 'AlternateContent'
        ? (dete(el, NS.mc, 'Fallback') ?? dete(el, NS.mc, 'Choice'))?.firstElementChild ?? el : el;
      this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(nosilac)} nije uvezen: položaj je van slajda ili veličina nije ispravna.`);
    }
    this.van = vanPre;
    if (prefiks === 's' && spid) {
      const ids = this.slojevi.slice(pre).map((s) => s.id);
      const postojeci = this.objekti.get(spid);
      this.objekti.set(spid, postojeci
        ? { slojevi: [...postojeci.slojevi, ...ids], pasus: postojeci.pasus ?? pasus }
        : { slojevi: ids, pasus });
    }
  }

  /** Konačan id: predlog kad ga server prima i nije zauzet, inače `x<n>` (brojač po slajdu). */
  private id(predlog: string): string {
    let id = predlog;
    while (!ISPRAVAN_ID.test(id) || this.zauzeti.has(id)) id = `x${++this.brojacX}`;
    this.zauzeti.add(id);
    return id;
  }

  /**
   * Dodaje sloj (sa konačnim id-jem) kad je u granicama servera (x/y u -960..1920, širina/visina u (0, 2880] posle
   * zaokruživanja kao na serveru); inače ga preskače (upozorenje daje `element`). Vraća konačan id ili `null`.
   */
  private dodaj(s: Sloj): string | null {
    const z = zaokruziKaoServer;
    const uOpsegu = (v: number) => z(v) >= MIN_POLOZAJ && z(v) <= MAX_POLOZAJ;
    const mera = (v: number) => z(v) > 0 && z(v) <= MAX_MERA;
    if (!uOpsegu(s.x) || !uOpsegu(s.y) || !mera(s.sirina) || !mera(s.visina)) {
      this.van = true;
      return null;
    }
    const id = this.id(s.id);
    this.slojevi.push(id === s.id ? s : { ...s, id });
    return id;
  }

  // ------------------------------------------------------------------------------------------- p:sp

  /** Stil teksta iz `p:style/a:fontRef` oblika (boja i font teme), slabiji od sopstvenog `rPr`. */
  private opcijeStila(sp: Element): OpcijeTeksta {
    const stil = dete(sp, NS.p, 'style');
    const fontRef = stil && dete(stil, NS.a, 'fontRef');
    if (!fontRef) return {};
    const o: OpcijeTeksta = {};
    const b = bojaIz(fontRef, { tema: this.ctx.tema, mapaBoja: this.ctx.mapaBoja });
    if (b) o.podrazumevanaBoja = pomesaj(b, this.ctx.pozadina);
    const idx = fontRef.getAttribute('idx');
    if (idx === 'minor' || idx === 'major') o.fontIzStila = idx === 'minor' ? '+mn-lt' : '+mj-lt';
    return o;
  }

  private tekstSloj(id: string, el: Element, k: Kutija, rez: RezultatTeksta, popuna: string | null, ivica: Ivica | null, senka: Senka | null): TekstSloj {
    const s = uSloj(k, this.ctx.t);
    return {
      id, tip: 'TEKST', naziv: nazivOblika(el), x: s.x, y: s.y, sirina: s.sirina, visina: s.visina,
      rotacija: rotacijaSloja(s.rotacija), providnost: 1, zakljucan: false, senka,
      pasusi: rez.pasusi, okvir: rez.okvir, popuna, ivica,
    };
  }

  /** Pasusi TEKST sloja za animacije (1:1 sa `a:p`). */
  private static pasusiTeksta(id: string | null, broj: number): Objekat['pasus'] {
    return id === null ? undefined : (i) => (i >= 0 && i < broj ? { slojId: id, pasus: i, spojeno: false } : null);
  }

  /**
   * `p:sp`: pravougaonik (ili bez geometrije, npr. placeholder) sa tekstom -> jedan TEKST sa popunom i ivicom; prazan
   * vidljiv pravougaonik -> OBLIK; podržana geometrija -> OBLIK + TEKST iznad (`<id>t`); druga geometrija -> samo tekst uz
   * `OBJEKAT_PRESKOCEN`. Datum, podnožje i broj slajda se ne uvoze.
   */
  private oblik(sp: Element, kg: KutijaGrupe, prefiks: Prefiks): Objekat['pasus'] {
    const ctx = this.ctx;
    const ph = placeholderOblika(sp);
    if (ph && PRESKOCENI_PLACEHOLDERI.has(ph.tip)) return undefined;
    const lanac = lanacPlaceholdera(sp, ctx);
    const kutija = kutijaIzLanca(lanac);
    if (!kutija) {
      if (imaTeksta(sp)) ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(sp)} nije uvezen: nema položaj.`);
      return undefined;
    }
    const k = kg(kutija);
    const id = `${prefiks}${idObjekta(sp)}`;
    const spPr = dete(sp, NS.p, 'spPr');
    const stil = dete(sp, NS.p, 'style');
    const prstGeom = spPr && dete(spPr, NS.a, 'prstGeom');
    const custGeom = spPr && dete(spPr, NS.a, 'custGeom');
    const prst = prstGeom?.getAttribute('prst')?.trim() ?? null;
    const pravougaonik = !custGeom && (prst === null || prst === 'rect');
    const podrzana = prst !== null && !custGeom && Object.hasOwn(GEOMETRIJE, prst);

    const txBody = dete(sp, NS.p, 'txBody');
    const sirina = uSloj(k, ctx.t).sirina;
    const vrsta = vrstaTeksta(ph);
    const tekst = txBody
      ? pretvoriTekst(txBody, (n) => stiloviNivoa(lanac, vrsta, ctx, n), lanac, ctx, sirina, this.opcijeStila(sp))
      : null;
    const prazan = !tekst || tekst.prazan;
    const brojPasusa = tekst?.pasusi.length ?? 0;

    if (pravougaonik) {
      const popuna = popunaIz(spPr, ctx, stil);
      const ivica = ivicaIz(spPr && dete(spPr, NS.a, 'ln'), ctx, stil);
      if (prazan) {
        if (popuna === null && ivica === null) return undefined;
        const o = pretvoriOblik(sp, k, ctx, id) ?? this.pravougaonik(sp, k, id, popuna, ivica);
        this.dodaj(o);
        return undefined;
      }
      const senka = this.senkaTeksta(tekst!, spPr, popuna !== null || ivica !== null);
      return GraditeljSlajda.pasusiTeksta(this.dodaj(this.tekstSloj(id, sp, k, tekst!, popuna, ivica, senka)), brojPasusa);
    }

    let saOblikom = false;
    if (podrzana) {
      const o = pretvoriOblik(sp, k, ctx, id);
      if (o) this.dodaj(o);
      saOblikom = o !== null;
    } else {
      const popuna = popunaIz(spPr, ctx, stil);
      const ivica = ivicaIz(spPr && dete(spPr, NS.a, 'ln'), ctx, stil);
      if (!prazan || popuna !== null || ivica !== null) {
        const opis = `${opisObjekta(sp, 'Oblik')} (${custGeom ? 'slobodan oblik' : prst})`;
        ctx.upozori('OBJEKAT_PRESKOCEN', prazan ? `${opis} nije podržan i nije uvezen.` : `${opis} nije podržan: uvezen je samo njegov tekst.`);
      }
    }
    if (prazan) return undefined;
    const senka = this.senkaTeksta(tekst!, null, false);
    // Sufiks `t` samo za tekst iznad OBLIK sloja; bez oblika tekst je sam objekat.
    return GraditeljSlajda.pasusiTeksta(this.dodaj(this.tekstSloj(saOblikom ? `${id}t` : id, sp, k, tekst!, null, null, senka)), brojPasusa);
  }

  /** Rezerva za pravougaonik koji `pretvoriOblik` ne vrati (placeholder bez geometrije). */
  private pravougaonik(sp: Element, k: Kutija, id: string, popuna: string | null, ivica: Ivica | null): Sloj {
    const s = uSloj(k, this.ctx.t);
    return {
      id, tip: 'OBLIK', naziv: nazivOblika(sp), x: s.x, y: s.y, sirina: s.sirina, visina: s.visina,
      rotacija: rotacijaSloja(s.rotacija), providnost: 1, zakljucan: false, senka: senkaIz(dete(sp, NS.p, 'spPr'), this.ctx),
      oblik: 'PRAVOUGAONIK', popuna, ivica, od: null, do: null,
    };
  }

  /**
   * Senka TEKST sloja: senka teksta (ista na svim delovima) kad sloj nema popunu ni ivicu, inače senka oblika iz `spPr`
   * (`spPr` `null` = tekst iznad OBLIK sloja, koji nosi senku oblika). Različite senke delova, ili senka teksta uz popunu
   * -> `SENKA`.
   */
  private senkaTeksta(tekst: RezultatTeksta, spPr: Element | null, imaPopunu: boolean): Senka | null {
    const t = tekst.senka;
    if (t === 'razlicite' || (t !== null && imaPopunu)) {
      upozoriJednom(this.ctx, 'SENKA', 'Senka teksta nije prenesena (različita po delovima ili uz popunu okvira).');
    }
    if (imaPopunu) return senkaIz(spPr, this.ctx);
    if (t !== null && t !== 'razlicite') return t;
    return spPr ? senkaIz(spPr, this.ctx) : null;
  }

  // ------------------------------------------------------------------------------------------- ostali objekti

  private konektor(el: Element, kg: KutijaGrupe, prefiks: Prefiks): void {
    const kutija = kutijaIzLanca([el]);
    if (!kutija) {
      this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(el, 'Linija')} nije uvezena: nema položaj.`);
      return;
    }
    const o = pretvoriOblik(el, kg(kutija), this.ctx, `${prefiks}${idObjekta(el)}`);
    if (o) {
      this.dodaj(o);
      return;
    }
    const spPr = dete(el, NS.p, 'spPr');
    const prst = spPr && dete(spPr, NS.a, 'prstGeom')?.getAttribute('prst');
    if (!prst || !Object.hasOwn(GEOMETRIJE, prst)) {
      this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(el, 'Linija')} nije uvezena: oblik linije nije podržan.`);
    }
  }

  private slika(pic: Element, kg: KutijaGrupe, prefiks: Prefiks): void {
    const kutija = kutijaIzLanca(lanacPlaceholdera(pic, this.ctx));
    if (!kutija) {
      this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(pic, 'Slika')} nije uvezena: nema položaj.`);
      return;
    }
    const s = pretvoriSliku(pic, kg(kutija), this.ctx, `${prefiks}${idObjekta(pic)}`);
    if (s) this.dodaj(s);
  }

  /** `p:graphicFrame`: tabela, ili slika iz `mc:Fallback`/`p:oleObj` (grafikon, SmartArt, OLE), inače preskok. */
  private okvirGrafike(gf: Element, kg: KutijaGrupe, prefiks: Prefiks): void {
    const kutija = kutijaIzLanca(lanacPlaceholdera(gf, this.ctx));
    const graphic = dete(gf, NS.a, 'graphic');
    const data = graphic && dete(graphic, NS.a, 'graphicData');
    const uri = data?.getAttribute('uri') ?? '';
    if (!kutija || !data) {
      this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(gf)} nije uvezen: nema položaj ili sadržaj.`);
      return;
    }
    const id = `${prefiks}${idObjekta(gf)}`;
    if (uri === URI_TABELE) {
      const t = pretvoriTabelu(gf, kg(kutija), this.ctx, id);
      if (t) this.dodaj(t.tabela);
      return;
    }
    const pic = data.getElementsByTagNameNS(NS.p, 'pic')[0];
    if (pic) {
      const s = pretvoriSliku(pic, kg(kutija), this.ctx, id);
      if (s) this.dodaj({ ...s, naziv: nazivOblika(gf) ?? s.naziv });
      return;
    }
    const vrsta = /\/chart$/.test(uri) ? 'Grafikon' : /\/diagram$/.test(uri) ? 'SmartArt' : /\/ole$/.test(uri) ? 'Ugrađeni objekat' : 'Objekat';
    this.ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(gf, vrsta)} nije uvezen: ${vrsta.toLowerCase()} nije podržan.`);
  }

  /**
   * `p:grpSp`: deca kroz kutiju grupe; popuna grupe (`grpFill` dece) se postavlja na ISTI kontekst i vraća posle grupe
   * (kopija konteksta bi lomila prijavljivanje upozorenja jednom po slajdu i pozadinu). Preslikana grupa -> `OBLIK_PRIBLIZAN`.
   */
  private grupa(g: Element, kg: KutijaGrupe, prefiks: Prefiks): void {
    const ctx = this.ctx;
    const grpSpPr = dete(g, NS.p, 'grpSpPr');
    const xfrm = grpSpPr && dete(grpSpPr, NS.a, 'xfrm');
    if (tacno(xfrm?.getAttribute('flipH')) || tacno(xfrm?.getAttribute('flipV'))) {
      upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Preslikana (okrenuta) grupa je prikazana bez preslikavanja.');
    }
    const unutra = kutijaUGrupi(kg, xfrm);
    const prethodna = ctx.popunaGrupe;
    ctx.popunaGrupe = popunaIz(grpSpPr, ctx);
    try {
      for (const d of Array.from(g.children)) this.element(d, unutra, prefiks);
    } finally {
      ctx.popunaGrupe = prethodna;
    }
  }

  /** Prvi `mc:Choice` čiji su svi `Requires` prefiksi poznati, ili `null`. */
  private static poznatIzbor(ac: Element): Element | null {
    for (const choice of deca(ac, NS.mc, 'Choice')) {
      const prefiksi = (choice.getAttribute('Requires') ?? '').trim().split(/\s+/).filter((p) => p !== '');
      if (prefiksi.length > 0 && prefiksi.every((p) => POZNATI_ZAHTEVI.has(choice.lookupNamespaceURI(p) ?? ''))) return choice;
    }
    return null;
  }

  /**
   * `mc:AlternateContent`: crtež (`p:contentPart`) -> `pretvoriCrtez`; formula (`a14:m` u `p:sp`) -> `pretvoriFormulu`;
   * tabela sa formulom u ćeliji -> tabela iz Fallback-a + `formuleCelija`; ostalo -> deca `mc:Fallback` kroz isti hod (nema
   * ga -> Choice sa poznatim prefiksima, inače preskok).
   */
  private alternativa(ac: Element, kg: KutijaGrupe, prefiks: Prefiks): { spid: string | null; pasus?: Objekat['pasus'] } {
    const ctx = this.ctx;
    const izbori = deca(ac, NS.mc, 'Choice');
    const fallback = dete(ac, NS.mc, 'Fallback');
    const prvo = (el: Element | null) => (el ? el.firstElementChild : null);

    const deoCrteza = izbori.map((c) => dete(c, NS.p, 'contentPart')).find((d) => d !== null) ?? null;
    if (deoCrteza) {
      const pic = fallback && dete(fallback, NS.p, 'pic');
      const spid = idObjekta(deoCrteza) || (pic ? idObjekta(pic) : '');
      const c = pretvoriCrtez(ac, kg, ctx, `${prefiks}${spid}`);
      if (c) this.dodaj(c);
      return { spid };
    }

    const izbor = izbori[0] ?? null;
    const sp = prvo(izbor);
    if (sp?.namespaceURI === NS.p && sp.localName === 'sp' && sp.getElementsByTagNameNS(NS.a14, 'm').length > 0) {
      const spid = idObjekta(sp);
      if (placeholderOblika(sp) && PRESKOCENI_PLACEHOLDERI.has(placeholderOblika(sp)!.tip)) return { spid: null };
      const animirani = prefiks === 's' ? this.animiraniPasusi.get(spid) : undefined;
      const rez = pretvoriFormulu(ac, kg, ctx, `${prefiks}${spid}`, animirani ?? new Set());
      if (!rez) return { spid };
      const ime = new Map<string, string | null>();
      for (const s of rez.slojevi) ime.set(s.id, this.dodaj(s));
      if (rez.pasusUSloj.size > 0) {
        const poPasusu = new Map(Array.from(rez.pasusUSloj, ([i, id]) => [i, ime.get(id) ?? null] as const));
        return { spid, pasus: (i) => { const id = poPasusu.get(i); return id ? { slojId: id, pasus: null, spojeno: false } : null; } };
      }
      const jedini = rez.slojevi.length === 1 ? ime.get(rez.slojevi[0].id) ?? null : null;
      return { spid, pasus: jedini ? () => ({ slojId: jedini, pasus: null, spojeno: true }) : undefined };
    }

    const gf = prvo(fallback);
    if (sp?.namespaceURI === NS.p && sp.localName === 'graphicFrame' && gf?.namespaceURI === NS.p && gf.localName === 'graphicFrame'
      && gf.getElementsByTagNameNS(NS.a, 'tbl').length > 0) {
      const spid = idObjekta(gf);
      const kutija = kutijaIzLanca(lanacPlaceholdera(gf, ctx));
      if (!kutija) {
        ctx.upozori('OBJEKAT_PRESKOCEN', `${opisObjekta(gf, 'Tabela')} nije uvezena: nema položaj.`);
        return { spid };
      }
      const id = `${prefiks}${spid}`;
      const t = pretvoriTabelu(gf, kg(kutija), ctx, id);
      if (!t) return { spid };
      if (this.dodaj(t.tabela) === null) return { spid };
      for (const f of formuleCelija(ac, t, ctx, id)) this.dodaj(f);
      return { spid };
    }

    const zamena = fallback ?? GraditeljSlajda.poznatIzbor(ac);
    if (!zamena) {
      ctx.upozori('OBJEKAT_PRESKOCEN', 'Objekat u formatu koji uvoz ne poznaje nije uvezen.');
      return { spid: null };
    }
    for (const d of Array.from(zamena.children)) this.element(d, kg, prefiks);
    return { spid: null };
  }
}

/** Ključevi medija koje dokument koristi (pozadina, slike, crteži, slike formula), bez ponavljanja, redom. */
function medijiDokumenta(p: Platno): string[] {
  const kljucevi = new Set<string>();
  if (p.pozadina.medijId) kljucevi.add(p.pozadina.medijId);
  for (const s of p.slojevi) {
    if ((s.tip === 'SLIKA' || s.tip === 'CRTEZ') && s.medijId) kljucevi.add(s.medijId);
    if (s.tip === 'FORMULA' && s.slikaIzvora) kljucevi.add(s.slikaIzvora);
  }
  return [...kljucevi];
}

function statistika(p: Platno, efekataPptx: number, klikoviPptx: number, beleske: string | null): Statistika {
  const st = praznaStatistika();
  for (const s of p.slojevi) st.slojevi[s.tip]++;
  for (const a of p.animacije) st.animacije[a.efekat]++;
  st.beleske = beleske === null ? 0 : 1;
  st.efekataPptx = efekataPptx;
  st.klikoviPptx = klikoviPptx;
  st.koraci = p.animacije.filter((a: Animacija) => a.okidac === 'KLIK').length;
  return st;
}

/** Beleške slajda (veza `notesSlide`); nema dela ili je deo neispravan -> bez beležaka, bez greške. */
function beleskeSlajda(ctx: KontekstSlajda): string | null {
  const v = ctx.paket.vezaTipa(ctx.slajd.putanja, 'notesSlide');
  if (!v || v.spoljna) return null;
  let doc: Document | null;
  try {
    doc = ctx.paket.xml(v.cilj);
  } catch {
    return null;
  }
  const b = pretvoriBeleske(doc);
  if (b.skraceno) ctx.upozori('BELESKE_SKRACENE', 'Beleške su duže od 20000 znakova i skraćene su.');
  return b.tekst;
}

const daLiSkriva = (doc: Document | null) => (doc ? ['0', 'false'].includes(doc.documentElement.getAttribute('showMasterSp') ?? '') : false);

/** Jedan slajd u PLATNO slajd; greška granica ili provere servera -> `{ greska }`. */
function pretvoriSlajd(z: ZajednickoUvoza, putanja: string, indeks: number): UvezenSlajd | { greska: string } {
  const ctx = napraviKontekst(z, putanja, indeks);
  if (!ctx.layout || !ctx.master) {
    ctx.upozori('TEKST_PRIBLIZAN', 'Slajd nema layout ili master: tekst i položaji su uvezeni bez nasleđivanja.');
  }
  const koren = ctx.slajd.doc.documentElement;
  const timing = dete(koren, NS.p, 'timing');

  const pozadina = pozadinaSlajda(ctx);
  ctx.pozadina = pozadina.boja;

  const slajd = new GraditeljSlajda(ctx, pasusiSaAnimacijom(timing));
  const skrivaSlajd = daLiSkriva(ctx.slajd.doc);
  if (ctx.master && !skrivaSlajd && !daLiSkriva(ctx.layout?.doc ?? null)) slajd.ukrasi(ctx.master.doc, 'm');
  if (ctx.layout && !skrivaSlajd) slajd.ukrasi(ctx.layout.doc, 'l');
  slajd.stablo(ctx.slajd.doc);

  const anim = pretvoriAnimacije(timing, slajd.mete, (kod, poruka) => ctx.upozori(kod, poruka));
  const beleske = beleskeSlajda(ctx);
  const uklopljeno = uklopiUGranice({ verzija: 1, pozadina, slojevi: slajd.slojevi, animacije: anim.animacije },
    (kod, poruka) => ctx.upozori(kod, poruka));
  if ('greska' in uklopljeno) return { greska: uklopljeno.greska };
  const odbijeno = proveriKaoServer(uklopljeno);
  if (odbijeno) return { greska: odbijeno };

  return {
    indeks,
    cmd: { tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske, postepeno: false, pitanje: null, platno: uklopljeno },
    mediji: medijiDokumenta(uklopljeno),
    statistika: statistika(uklopljeno, anim.efekataPptx, anim.klikoviPptx, beleske),
  };
}

/** Poruka greške slajda za korisnika (neispravan deo -> putanja dela iz `cause`). */
function porukaGreske(e: unknown): string {
  if (e instanceof GreskaUvoza) {
    return typeof e.cause === 'string' ? `deo ${e.cause} je oštećen` : e.message;
  }
  return e instanceof Error && e.message ? e.message : String(e);
}

const odnosNije169 = (v: { cx: number; cy: number }) => Math.abs((v.cx / v.cy) / (16 / 9) - 1) > TOLERANCIJA_FORMATA;

/** Popušta glavnu nit (makrotaska), pa provera "Otkaži". */
async function popusti(prekid: AbortSignal | undefined): Promise<void> {
  await new Promise((r) => setTimeout(r));
  if (prekid?.aborted) throw new DOMException('Prekinuto', 'AbortError');
}

/**
 * PPTX -> PLATNO slajdovi. Neispravan fajl odbija ceo uvoz (`GreskaUvoza`); slajd koji se ne može pročitati (deo ne
 * postoji, neispravan XML, granice servera, neočekivan izuzetak) je greška tog slajda, a ostali se uvoze. Skriveni slajdovi
 * se preskaču (`SKRIVEN_SLAJD`). Posle svakog slajda: `napredak(uradjeno, ukupno)`, popuštanje glavne niti i provera
 * `prekid` (prekinuto -> `DOMException` `AbortError`). Mediji se registruju lenjo (bajtovi tek na zahtev) i u rezultat idu
 * samo oni koje koriste uvezeni slajdovi.
 */
export async function pretvoriPptx(bajtovi: Uint8Array, imeFajla: string, o: OpcijePretvaranja = {}): Promise<RezultatUvoza> {
  if (o.prekid?.aborted) throw new DOMException('Prekinuto', 'AbortError');
  const paket = otvoriPaket(bajtovi, imeFajla);
  const z: ZajednickoUvoza = { paket, t: transformacija(paket.velicina), upozorenja: [], mediji: new Map(), brojacGen: { n: 0 } };
  if (odnosNije169(paket.velicina)) {
    const { cx, cy } = paket.velicina;
    z.upozorenja.push({
      slajd: null, kod: 'FORMAT_SLAJDA',
      poruka: `Slajdovi nisu formata 16:9 (${Math.round(cx / EMU_PO_PT)} x ${Math.round(cy / EMU_PO_PT)} pt): sadržaj je umanjen i centriran na platnu.`,
    });
  }

  const ukupno = paket.slajdovi.length;
  const slajdovi: UvezenSlajd[] = [];
  const greske: GreskaSlajda[] = [];
  let prelaz = false;
  for (let i = 0; i < ukupno; i++) {
    const indeks = i + 1;
    const putanja = paket.slajdovi[i];
    const pre = z.upozorenja.length;
    /** Slajd koji nije uvezen ne zadržava svoja upozorenja (ona za ceo fajl ostaju). */
    const neuspeh = (poruka: string) => {
      const dodata = z.upozorenja.splice(pre);
      z.upozorenja.push(...dodata.filter((u) => u.slajd === null));
      greske.push({ slajd: indeks, poruka: `Slajd nije pročitan: ${sKrajem(poruka)}` });
    };
    try {
      const doc = paket.xml(putanja);
      if (!doc) throw new Error('deo slajda ne postoji u fajlu');
      const koren = doc.documentElement;
      if (['0', 'false'].includes(koren.getAttribute('show') ?? '')) {
        z.upozorenja.push({ slajd: indeks, kod: 'SKRIVEN_SLAJD', poruka: 'Skriven slajd nije uvezen (PowerPoint ga ne prikazuje).' });
      } else {
        if (!prelaz && koren.getElementsByTagNameNS(NS.p, 'transition').length > 0) {
          prelaz = true;
          z.upozorenja.push({ slajd: null, kod: 'PRELAZ_SLAJDA', poruka: 'Prelazi između slajdova se ne prenose.' });
        }
        const rez = pretvoriSlajd(z, putanja, indeks);
        if ('greska' in rez) neuspeh(rez.greska);
        else slajdovi.push(rez);
      }
    } catch (e) {
      neuspeh(porukaGreske(e));
    }
    o.napredak?.(indeks, ukupno);
    await popusti(o.prekid);
  }

  const mediji = new Map<string, MedijUvoza>();
  for (const s of slajdovi) {
    for (const k of s.mediji) {
      const m = z.mediji.get(k);
      if (m) mediji.set(k, m);
    }
  }
  return { imeFajla: paket.imeFajla, ukupnoSlajdova: ukupno, slajdovi, greske, upozorenja: z.upozorenja, mediji };
}
