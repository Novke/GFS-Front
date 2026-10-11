// Crteži rukom (PowerPoint ink) u CRTEZ slojeve platna: `mc:AlternateContent` sa `p:contentPart` (InkML potezi) u
// `mc:Choice` i slikom crteža (`p:pic`) u `mc:Fallback`. Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { CrtezSloj, Potez } from '../data-access/platno.models';
import { kutijaIzLanca } from './nasledjivanje';
import { nazivOblika, upozoriJednom } from './oblik';
import { deoElementa, pretvoriSliku } from './slika';
import { EMU_PO_PT, type KontekstSlajda, type Kutija } from './tipovi';
import { brojAtr, deca, dete, NS } from './xml';

/** Najviše tačaka po CRTEZ sloju, isto kao `PlatnoPP.MAX_TACAKA` (server broji parove x, y svih poteza sloja). */
export const MAX_TACAKA = 20_000;
/**
 * Najviše sirovih (neuprošćenih) tačaka koje se dekodiraju po crtežu. Granica servera važi posle uprošćavanja, pa se
 * sirovih sme pročitati više, ali ne neograničeno: dekodiranje staje čim se ova granica pređe (InkML deo može imati do 50 MB).
 */
export const MAX_SIROVIH_TACAKA = 200_000;
/** Tolerancija uprošćavanja poteza u jedinicama platna. */
const TOLERANCIJA = 0.3;
/** Uprošćavanje radi u prozorima od ovoliko tačaka: RDP je u najgorem slučaju kvadratan, pa je posao ograničen na n * PROZOR. */
const PROZOR = 1000;
/** Prefiksi `mc:Choice@Requires` koje crtež razume (po imenskom prostoru, ne po imenu prefiksa). */
const POZNATI_ZAHTEVI: ReadonlySet<string> = new Set([NS.p14, NS.aink]);
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const EMU_PO_CM = 360_000;
const PT_PO_CM = 72 / 2.54;
/** Širina pera bez četke ili bez `width` (cm). */
const PODRAZUMEVANA_SIRINA_CM = 0.05;
const CRNA = '#000000';

// ------------------------------------------------------------------ dekoder i uprošćavanje

const BROJ = /([!'"]?)(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/**
 * Tačke InkML traga (`inkml:trace`): tačke su odvojene zarezom, vrednosti kanala razmakom (ili samo znakom: `'-1-2`).
 * Oznaka ispred vrednosti bira način: `!` eksplicitno, `'` prva razlika, `"` druga razlika. Način važi po kanalu dok se ne
 * promeni, a oznaka važi i za sledeće neoznačene vrednosti iste tačke (`'1 1` i `'-1-2` su obe razlike). Prva vrednost
 * kanala je uvek eksplicitna. Vrednosti preko `kanala` se odbacuju. Dekodiranje staje čim tačaka bude više od `najvise`
 * (vraća `najvise + 1`, da pozivalac vidi prekoračenje), bez deljenja celog teksta unapred.
 */
export function dekodirajTrag(tekst: string, kanala: number, najvise = Infinity): number[][] {
  const tacke: number[][] = [];
  if (!(kanala >= 1)) return tacke;
  const pre: (number | null)[] = Array(kanala).fill(null);
  const brzina: number[] = Array(kanala).fill(0);
  const nacin: string[] = Array(kanala).fill('!');
  let poc = 0;
  while (poc < tekst.length) {
    let kraj = tekst.indexOf(',', poc);
    if (kraj < 0) kraj = tekst.length;
    const komad = tekst.slice(poc, kraj);
    poc = kraj + 1;
    const tacka: number[] = [];
    let oznaka = '';
    for (const [, q, s] of komad.matchAll(BROJ)) {
      const k = tacka.length;
      if (k >= kanala) break;
      if (q) oznaka = q;
      if (oznaka) nacin[k] = oznaka;
      const v = Number(s);
      const p = pre[k];
      let val: number;
      if (p === null || nacin[k] === '!') {
        val = v;
        brzina[k] = p === null ? 0 : v - p;
      } else if (nacin[k] === "'") {
        brzina[k] = v;
        val = p + v;
      } else {
        brzina[k] += v;
        val = p + brzina[k];
      }
      tacka.push(val);
      pre[k] = val;
    }
    if (tacka.length === 0) continue;
    tacke.push(tacka);
    if (tacke.length > najvise) break;
  }
  return tacke;
}

const naDesetinu = (v: number) => Math.round(v * 10) / 10 || 0;

/** Kvadrat rastojanja tačke p od duži ab (duž dužine 0 -> rastojanje od tačke a). */
function rastojanje2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/**
 * Ramer-Douglas-Peucker nad `x0,y0,x1,y1,...` (iterativno sa stekom, rastojanje tačke od duži, krajnje tačke ostaju);
 * rezultat zaokružen na 0,1. Manje od 3 tačke se vraćaju zaokružene; neparan poslednji broj se odbacuje. Potez se
 * uprošćava u prozorima od `PROZOR` tačaka (granice prozora ostaju), pa je posao najviše n * PROZOR i za zlonameran ulaz
 * (običan RDP je u najgorem slučaju kvadratan). Čim zadržanih tačaka bude više od `najvise`, uprošćavanje staje i vraća
 * ono što je do tada zadržano (više od `najvise` tačaka, da pozivalac vidi prekoračenje).
 */
export function uprosti(tacke: readonly number[], tolerancija: number, najvise = Infinity): number[] {
  const n = tacke.length >> 1;
  if (n < 3) return tacke.slice(0, n * 2).map(naDesetinu);
  const zadrzi = new Uint8Array(n);
  let zadrzano = 0;
  const oznaci = (i: number) => {
    if (!zadrzi[i]) zadrzano++;
    zadrzi[i] = 1;
  };
  const tol2 = tolerancija * tolerancija;
  const stek: number[] = [];
  prozori: for (let od = 0; od < n - 1; od += PROZOR) {
    const kraj = Math.min(od + PROZOR, n - 1);
    oznaci(od);
    oznaci(kraj);
    stek.push(od, kraj);
    while (stek.length > 0) {
      if (zadrzano > najvise) break prozori;
      const b = stek.pop()!;
      const a = stek.pop()!;
      if (b - a < 2) continue;
      const ax = tacke[2 * a], ay = tacke[2 * a + 1], bx = tacke[2 * b], by = tacke[2 * b + 1];
      let max = -1;
      let iMax = -1;
      for (let i = a + 1; i < b; i++) {
        const d = rastojanje2(tacke[2 * i], tacke[2 * i + 1], ax, ay, bx, by);
        if (d > max) {
          max = d;
          iMax = i;
        }
      }
      if (max > tol2) {
        oznaci(iMax);
        stek.push(a, iMax, iMax, b);
      }
    }
  }
  const rezultat: number[] = [];
  for (let i = 0; i < n; i++) {
    if (zadrzi[i]) rezultat.push(naDesetinu(tacke[2 * i]), naDesetinu(tacke[2 * i + 1]));
  }
  return rezultat;
}

/**
 * Kao `PlatnoPP.r` na serveru (`BigDecimal.valueOf(d).setScale(2, HALF_UP)`): najkraći decimalni zapis broja (isti u JS-u i
 * u Javi 19+), pa HALF_UP na 2 decimale u celim stotim delovima (2,835 -> 2,84; `Math.round(2.835 * 100)` daje 283).
 */
function zaokruziKaoServer(n: number): number {
  if (!Number.isFinite(n)) return n;
  const s = Math.abs(n).toString();
  if (s.includes('e')) return Math.abs(n) < 1 ? 0 : n;
  const [ceo, razlomak = ''] = s.split('.');
  let stotih = Number(ceo) * 100 + Number(`${razlomak}00`.slice(0, 2));
  if ((razlomak[2] ?? '0') >= '5') stotih += 1;
  return (Math.sign(n) * stotih) / 100 || 0;
}

// ------------------------------------------------------------------ InkML

interface Format { iX: number; iY: number; kanala: number; rezX: number | null; rezY: number | null; }
interface Cetka { boja: string; sirinaPt: number; }
interface SirovTrag { tacke: number[]; format: Format; cetka: Cetka; }
interface Okvir { minX: number; maxX: number; minY: number; maxY: number; }
type Ishod<T> = T | { razlog: string };

const NEISPRAVAN = { razlog: 'InkML nije ispravan' };
/** 20000 -> "20 000" (nezavisno od lokala okruženja). */
const hiljade = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');

function xmlId(el: Element): string {
  return el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('xml:id') ?? '';
}

/** `#id` ili `id` iz atributa elementa ili najbližeg pretka (`inkml:traceGroup` nosi `contextRef`/`brushRef` za svoje tragove). */
function referenca(el: Element, atribut: string, koren: Element): string {
  for (let e: Element | null = el; e && e !== koren.parentElement; e = e.parentElement) {
    const v = e.getAttribute(atribut)?.trim();
    if (v) return v.startsWith('#') ? v.slice(1) : v;
  }
  return '';
}

/** Tačaka po cm iz `inkml:channelProperty name="resolution"` (`1/cm`, `1/mm`, `1/in`); nema je -> `null`. */
function rezolucija(izvor: Element | null, kanal: string): number | null {
  if (!izvor) return null;
  for (const cp of Array.from(izvor.getElementsByTagNameNS(NS.inkml, 'channelProperty'))) {
    if (cp.getAttribute('channel') !== kanal || cp.getAttribute('name') !== 'resolution') continue;
    const v = brojAtr(cp, 'value', 0);
    if (!(v > 0)) return null;
    const jedinica = (cp.getAttribute('units') ?? '1/cm').trim().toLowerCase();
    return jedinica === '1/mm' ? v * 10 : jedinica === '1/in' ? v / 2.54 : v;
  }
  return null;
}

/** Širina iz `brushProperty` u pt (`cm` podrazumevano, `mm`, `in`, `pt`). */
function sirinaUPt(vrednost: number, jedinica: string): number {
  switch (jedinica.trim().toLowerCase()) {
    case 'mm': return vrednost / 10 * PT_PO_CM;
    case 'in': return vrednost * 72;
    case 'pt': return vrednost;
    default: return vrednost * PT_PO_CM;
  }
}

/** Čitač definicija jednog InkML dela: formati tragova i četke po `xml:id`, keširani. */
class Definicije {
  private readonly poId = new Map<string, Element>();
  private readonly formati = new Map<Element | null, Format | null>();
  private readonly cetke = new Map<Element | null, Cetka>();
  private readonly prviFormat: Element | null;

  constructor(private readonly koren: Element) {
    for (const ime of ['context', 'inkSource', 'traceFormat', 'brush']) {
      for (const el of Array.from(koren.getElementsByTagNameNS(NS.inkml, ime))) {
        const id = xmlId(el);
        if (id && !this.poId.has(id)) this.poId.set(id, el);
      }
    }
    this.prviFormat = koren.getElementsByTagNameNS(NS.inkml, 'traceFormat')[0] ?? null;
  }

  private element(id: string, ime: string): Element | null {
    const el = id ? this.poId.get(id) : undefined;
    return el && el.localName === ime ? el : null;
  }

  /** `inkml:traceFormat` traga: iz konteksta (sopstveni, pa `traceFormatRef`, pa `inkSourceRef`), inače prvi u delu. */
  private traceFormat(trag: Element): Element | null {
    const kontekst = this.element(referenca(trag, 'contextRef', this.koren), 'context');
    if (kontekst) {
      const sopstveni = kontekst.getElementsByTagNameNS(NS.inkml, 'traceFormat')[0];
      if (sopstveni) return sopstveni;
      const poRef = this.element(referenca(kontekst, 'traceFormatRef', kontekst), 'traceFormat');
      if (poRef) return poRef;
      const izvor = this.element(referenca(kontekst, 'inkSourceRef', kontekst), 'inkSource');
      const izIzvora = izvor?.getElementsByTagNameNS(NS.inkml, 'traceFormat')[0];
      if (izIzvora) return izIzvora;
    }
    return this.prviFormat;
  }

  /** Kanali traga (X i Y po imenu; ostali se čitaju i odbacuju) i rezolucija; nema X ili Y -> `null`. Bez formata: X, Y. */
  format(trag: Element): Format | null {
    const tf = this.traceFormat(trag);
    let f = this.formati.get(tf);
    if (f === undefined) {
      const kanali = tf ? deca(tf, NS.inkml, 'channel').map((c) => c.getAttribute('name')?.trim() ?? '') : ['X', 'Y'];
      const iX = kanali.indexOf('X');
      const iY = kanali.indexOf('Y');
      const izvor = tf?.parentElement ?? null;
      f = iX < 0 || iY < 0 ? null : { iX, iY, kanala: kanali.length, rezX: rezolucija(izvor, 'X'), rezY: rezolucija(izvor, 'Y') };
      this.formati.set(tf, f);
    }
    return f;
  }

  /** Četka traga (`brushRef`): `color` `#RRGGBB` (inače crna), `width` u pt (podrazumevano 0,05 cm). */
  cetka(trag: Element): Cetka {
    const el = this.element(referenca(trag, 'brushRef', this.koren), 'brush');
    let c = this.cetke.get(el);
    if (!c) {
      let boja = CRNA;
      let sirinaPt = PODRAZUMEVANA_SIRINA_CM * PT_PO_CM;
      for (const bp of el ? deca(el, NS.inkml, 'brushProperty') : []) {
        const ime = bp.getAttribute('name');
        const v = bp.getAttribute('value')?.trim() ?? '';
        if (ime === 'color' && /^#[0-9A-Fa-f]{6}$/.test(v)) boja = v.toUpperCase();
        if (ime === 'width') {
          const w = brojAtr(bp, 'value', NaN);
          if (w > 0) sirinaPt = sirinaUPt(w, bp.getAttribute('units') ?? 'cm');
        }
      }
      c = { boja, sirinaPt };
      this.cetke.set(el, c);
    }
    return c;
  }
}

/** Svi tragovi InkML dela (X, Y u sirovim jedinicama) i njihov zajednički okvir; najviše `MAX_SIROVIH_TACAKA` tačaka. */
function procitajTragove(koren: Element): Ishod<{ tragovi: SirovTrag[]; okvir: Okvir }> {
  const def = new Definicije(koren);
  const okvir: Okvir = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const tragovi: SirovTrag[] = [];
  let budzet = MAX_SIROVIH_TACAKA;
  for (const trag of Array.from(koren.getElementsByTagNameNS(NS.inkml, 'trace'))) {
    const format = def.format(trag);
    if (!format) return NEISPRAVAN;
    const tacke = dekodirajTrag(trag.textContent ?? '', format.kanala, budzet);
    if (tacke.length > budzet) return { razlog: `više od ${hiljade(MAX_SIROVIH_TACAKA)} zapisanih tačaka` };
    budzet -= tacke.length;
    const ravne: number[] = [];
    for (const t of tacke) {
      const x = t[format.iX];
      const y = t[format.iY];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return NEISPRAVAN; // i tačka bez X ili Y (undefined)
      ravne.push(x, y);
      if (x < okvir.minX) okvir.minX = x;
      if (x > okvir.maxX) okvir.maxX = x;
      if (y < okvir.minY) okvir.minY = y;
      if (y > okvir.maxY) okvir.maxY = y;
    }
    if (ravne.length > 0) tragovi.push({ tacke: ravne, format, cetka: def.cetka(trag) });
  }
  return tragovi.length === 0 ? { razlog: 'crtež nema poteza' } : { tragovi, okvir };
}

/**
 * Okvir svih tačaka se preslikava na kutiju `p14:xfrm` (EMU, već kroz `kutijaGrupe`), pa se tačke izražavaju relativno u
 * odnosu na sloj (jedinice platna) i uprošćavaju. Raspon 0 po osi -> razmera druge ose, a tačke u sredini te ose. Debljina:
 * širina četke (pt) * razmera crteža (nacrtano / prirodna veličina po rezoluciji kanala, `sqrt(sx * sy)`) * `t.s`,
 * u granicama 0,25..20 pa zaokružena kao na serveru. Granica tačaka se broji posle uprošćavanja (kao što server broji).
 */
function preslikaj(tragovi: SirovTrag[], o: Okvir, kp: Kutija, ctx: KontekstSlajda, sloj: { x: number; y: number }): Ishod<Potez[]> {
  const rX = o.maxX - o.minX;
  const rY = o.maxY - o.minY;
  let sx = rX > 0 ? kp.w / rX : NaN; // EMU po sirovoj jedinici
  let sy = rY > 0 ? kp.h / rY : NaN;
  if (!(rX > 0)) sx = sy;
  if (!(rY > 0)) sy = sx;
  const { t } = ctx;
  const jedPoEmu = t.s / EMU_PO_PT;
  const x0 = (rX > 0 ? kp.x - o.minX * sx : kp.x + kp.w / 2) * jedPoEmu + t.ox - sloj.x;
  const y0 = (rY > 0 ? kp.y - o.minY * sy : kp.y + kp.h / 2) * jedPoEmu + t.oy - sloj.y;
  const kx = rX > 0 ? sx * jedPoEmu : 0;
  const ky = rY > 0 ? sy * jedPoEmu : 0;

  const potezi: Potez[] = [];
  let ukupno = 0;
  for (const trag of tragovi) {
    const rel = new Array<number>(trag.tacke.length);
    for (let i = 0; i < trag.tacke.length; i += 2) {
      rel[i] = x0 + trag.tacke[i] * kx;
      rel[i + 1] = y0 + trag.tacke[i + 1] * ky;
    }
    const tacke = uprosti(rel, TOLERANCIJA, MAX_TACAKA - ukupno);
    ukupno += tacke.length / 2;
    if (ukupno > MAX_TACAKA) return { razlog: `više od ${hiljade(MAX_TACAKA)} tačaka` };

    const { rezX, rezY } = trag.format;
    let razmeraX = Number.isFinite(sx) && rezX ? sx * rezX / EMU_PO_CM : NaN;
    let razmeraY = Number.isFinite(sy) && rezY ? sy * rezY / EMU_PO_CM : NaN;
    if (!Number.isFinite(razmeraX)) razmeraX = razmeraY;
    if (!Number.isFinite(razmeraY)) razmeraY = razmeraX;
    const razmera = Number.isFinite(razmeraX) ? Math.sqrt(razmeraX * razmeraY) : 1;
    const debljina = zaokruziKaoServer(Math.min(20, Math.max(0.25, trag.cetka.sirinaPt * razmera * t.s || 0.25)));
    potezi.push({ boja: trag.cetka.boja, debljina, tacke });
  }
  return potezi;
}

/** Prvi `mc:Choice` sa `p:contentPart` čiji su svi `Requires` prefiksi poznati (`p14`, `aink`); nema ga -> `null`. */
function izabraniDeo(ac: Element): Element | null {
  for (const choice of deca(ac, NS.mc, 'Choice')) {
    const deo = dete(choice, NS.p, 'contentPart');
    if (!deo) continue;
    const prefiksi = (choice.getAttribute('Requires') ?? '').trim().split(/\s+/).filter((p) => p !== '');
    if (prefiksi.length > 0 && prefiksi.every((p) => POZNATI_ZAHTEVI.has(choice.lookupNamespaceURI(p) ?? ''))) return deo;
  }
  return null;
}

/** Potezi crteža iz `p:contentPart` (veza iz dela kome element pripada) ili razlog zašto ih nema. */
function potezi(deo: Element | null, kutijaGrupe: (k: Kutija) => Kutija, ctx: KontekstSlajda, sloj: { x: number; y: number }): Ishod<Potez[]> {
  if (!deo) return { razlog: 'format crteža nije podržan' };
  const xfrm = dete(deo, NS.p14, 'xfrm');
  const off = xfrm && dete(xfrm, NS.a, 'off');
  const ext = xfrm && dete(xfrm, NS.a, 'ext');
  if (!xfrm || !ext) return { razlog: 'nema položaj poteza' };
  const kp = kutijaGrupe({
    x: brojAtr(off, 'x', 0), y: brojAtr(off, 'y', 0), w: brojAtr(ext, 'cx', 0), h: brojAtr(ext, 'cy', 0),
    rot: brojAtr(xfrm, 'rot', 0) / 60000,
  });

  const rId = deo.getAttributeNS(NS.r, 'id')?.trim() ?? '';
  const veza = rId ? ctx.paket.veza(deoElementa(deo, ctx), rId) : null;
  let doc: Document | null;
  try {
    doc = veza && !veza.spoljna ? ctx.paket.xml(veza.cilj) : null;
  } catch {
    return NEISPRAVAN; // oštećen XML ili DOCTYPE: GreskaUvoza iz parsirajXml važi samo za ovaj crtež
  }
  if (!doc) return { razlog: 'deo crteža nije pronađen u fajlu' };
  const koren = doc.documentElement;
  if (koren.namespaceURI !== NS.inkml || koren.localName !== 'ink') return NEISPRAVAN;

  const procitano = procitajTragove(koren);
  if ('razlog' in procitano) return procitano;
  return preslikaj(procitano.tragovi, procitano.okvir, kp, ctx, sloj);
}

/**
 * `mc:AlternateContent` crteža -> CRTEZ sloj. Slika i kutija sloja su iz `mc:Fallback/p:pic` (`pretvoriSliku`, kutija kroz
 * `kutijaGrupe`); nema fallback slike -> `null` + `OBJEKAT_PRESKOCEN` (CRTEZ mora imati sliku). Potezi su iz InkML dela
 * `p:contentPart`-a (`mc:Choice` sa poznatim `Requires`; nepoznat prefiks -> samo Fallback). Nema dela, InkML nije ispravan,
 * više od `MAX_TACAKA` tačaka posle uprošćavanja (ili `MAX_SIROVIH_TACAKA` pre njega) -> `potezi: null` + `CRTEZ_BEZ_POTEZA`
 * (sloj radi kao slika).
 */
export function pretvoriCrtez(ac: Element, kutijaGrupe: (k: Kutija) => Kutija, ctx: KontekstSlajda, id: string): CrtezSloj | null {
  const fallback = dete(ac, NS.mc, 'Fallback');
  const pic = fallback && dete(fallback, NS.p, 'pic');
  const kutija = pic && kutijaIzLanca([pic]);
  if (!pic || !kutija) {
    ctx.upozori('OBJEKAT_PRESKOCEN', 'Crtež rukom nije uvezen: nema sliku za prikaz.');
    return null;
  }
  const slika = pretvoriSliku(pic, kutijaGrupe(kutija), ctx, id);
  if (!slika) return null;
  const { isecak } = slika;
  if (isecak.levo || isecak.gore || isecak.desno || isecak.dole) {
    upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Isečak slike crteža nije prenesen (prikazana je cela slika).');
  }

  const ishod = potezi(izabraniDeo(ac), kutijaGrupe, ctx, slika);
  if ('razlog' in ishod) {
    const naziv = nazivOblika(pic);
    ctx.upozori('CRTEZ_BEZ_POTEZA', `${naziv ? `Crtež '${naziv}'` : 'Crtež'}: potezi nisu uvezeni (${ishod.razlog}), crtež se prikazuje kao slika.`);
  }
  return {
    id, tip: 'CRTEZ', naziv: slika.naziv, x: slika.x, y: slika.y, sirina: slika.sirina, visina: slika.visina,
    rotacija: slika.rotacija, providnost: slika.providnost, zakljucan: false, senka: slika.senka, medijId: slika.medijId,
    potezi: 'razlog' in ishod ? null : ishod,
  };
}
