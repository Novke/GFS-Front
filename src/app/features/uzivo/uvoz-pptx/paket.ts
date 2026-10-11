// Paket PPTX-a (OPC zip): granice, prepoznavanje formata, veze i lenjo raspakivanje delova.
// Samo sinhrone funkcije fflate-a (async unzip pravi Worker iz Blob-a). Bez Angular-a i RxJS-a.
import { unzipSync, type Unzipped } from 'fflate';
import { GreskaUvoza, PORUKE_FAJLA, proveriImeFajla } from './ime-fajla';
import { brojAtr, deca, dete, NS, parsirajXml, tipVeze } from './xml';

export { GreskaUvoza } from './ime-fajla';

/** Granice paketa (spec 7.7): proveravaju se na deklarisanim veličinama iz centralnog direktorijuma, pre raspakivanja. */
export const GRANICE_PAKETA = { delova: 5000, ukupno: 500 * 1024 * 1024, xml: 50 * 1024 * 1024, fajl: 500 * 1024 * 1024 } as const;

/** Veza dela; `tip` = poslednji segment Type URI-ja; `cilj` je putanja dela u paketu, ili URL kad je `spoljna`. */
export interface Veza { id: string; tip: string; cilj: string; spoljna: boolean; }

export interface Paket {
  readonly imeFajla: string;
  /**
   * Putanje delova slajdova po `p:sldIdLst`, jedna po `p:sldId` (indeks = PowerPointov redni broj - 1). Unos čija veza
   * ne postoji, spoljna je ili nije tipa `slide` je `#slajd<n>` (`#` ne može biti u imenu dela): `xml()` daje `null`,
   * `veze()` prazno, kao za slajd čiji deo ne postoji.
   */
  readonly slajdovi: readonly string[];
  /** `p:sldSz` (EMU). */
  readonly velicina: { cx: number; cy: number };
  /** Keširano; `null` kad dela nema. Neispravan XML -> `GreskaUvoza`. */
  xml(putanja: string): Document | null;
  veze(putanja: string): readonly Veza[];
  veza(putanja: string, rId: string): Veza | null;
  vezaTipa(putanja: string, tip: string): Veza | null;
  /** Lenjo raspakivanje jednog dela (slike); `null` kad dela nema ili ne može da se raspakuje. */
  bajtovi(putanja: string): Uint8Array | null;
}

const POTPIS_CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const POTPIS_ZIP = [0x50, 0x4b, 0x03, 0x04];
const GLAVNI_TIP = /^application\/vnd\.openxmlformats-officedocument\.presentationml\.(presentation|slideshow|template)\.main\+xml$/i;
const MAKRO_TIP = /^application\/vnd\.ms-powerpoint\..*macroenabled/i;
const JE_XML = /\.(xml|rels)$/i;
/** Podrazumevana veličina slajda kad `p:sldSz` nema (10 x 7,5 in). */
const PODRAZUMEVANA_VELICINA = { cx: 9144000, cy: 6858000 };

const ostecen = (cause?: unknown) => new GreskaUvoza(PORUKE_FAJLA.ostecen, cause === undefined ? undefined : { cause });

function pocinjeSa(b: Uint8Array, potpis: readonly number[]): boolean {
  return b.length >= potpis.length && potpis.every((x, i) => b[i] === x);
}

/** Da li bajtovi sadrže ASCII niz kodiran kao UTF-16LE (ime toka u CFB direktorijumu). */
function sadrziUtf16le(b: Uint8Array, niz: string): boolean {
  const n = niz.length * 2;
  const prvi = niz.charCodeAt(0);
  for (let i = 0; i + n <= b.length; i++) {
    if (b[i] !== prvi || b[i + 1] !== 0) continue;
    let k = 1;
    while (k < niz.length && b[i + 2 * k] === niz.charCodeAt(k) && b[i + 2 * k + 1] === 0) k++;
    if (k === niz.length) return true;
  }
  return false;
}

/**
 * Raspakuje samo XML delove; granice se proveravaju u `filter`-u (deklarisane veličine, pre raspakivanja). Veličina dela je
 * `max(size, originalSize)`: fflate 0.8.3 deo bez kompresije (stored) vraća u veličini `size` i ne gleda `originalSize`,
 * pa lažno mali `originalSize` ne sme da ga provuče; deflate deo se raspakuje u bafer tačno veličine `originalSize`.
 */
function raspakujXml(bajtovi: Uint8Array): Unzipped {
  let delova = 0;
  let ukupno = 0;
  try {
    return unzipSync(bajtovi, {
      filter: (f) => {
        delova++;
        const velicina = Math.max(f.size, f.originalSize);
        ukupno += velicina;
        if (delova > GRANICE_PAKETA.delova || ukupno > GRANICE_PAKETA.ukupno) throw ostecen(`granica paketa: ${f.name}`);
        if (!JE_XML.test(f.name)) return false;
        if (velicina > GRANICE_PAKETA.xml) throw ostecen(`XML deo preko granice: ${f.name}`);
        return true;
      },
    });
  } catch (e) {
    throw e instanceof GreskaUvoza ? e : ostecen(e);
  }
}

/** Putanja `.rels` dela za dati deo (`''` = paket). */
function putanjaVeza(deo: string): string {
  const i = deo.lastIndexOf('/');
  return `${deo.slice(0, i + 1)}_rels/${deo.slice(i + 1)}.rels`;
}

/** `Target` veze -> putanja dela: relativno na folder izvora, `..`/`.` normalizovani, apsolutni bez vodeće kose crte. */
function razresi(izvor: string, cilj: string): string {
  const osnova = cilj.startsWith('/') ? [] : izvor.split('/').slice(0, -1);
  const delovi: string[] = [...osnova];
  for (const s of cilj.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') delovi.pop();
    else delovi.push(s);
  }
  return delovi.join('/');
}

class PptxPaket implements Paket {
  readonly slajdovi: readonly string[];
  readonly velicina: { cx: number; cy: number };
  private readonly dokumenti = new Map<string, Document>();
  private readonly vezeDelova = new Map<string, readonly Veza[]>();
  private readonly raspakovano = new Map<string, Uint8Array | null>();

  constructor(readonly imeFajla: string, private readonly sviBajtovi: Uint8Array, private readonly xmlDelovi: Unzipped) {
    const tipovi = this.xml('[Content_Types].xml');
    const glavna = this.vezaTipa('', 'officeDocument');
    if (!tipovi || !glavna || glavna.spoljna) throw new GreskaUvoza(PORUKE_FAJLA.nijePptx);
    const tip = tipDela(tipovi, glavna.cilj);
    if (MAKRO_TIP.test(tip)) throw new GreskaUvoza(PORUKE_FAJLA.makro);
    if (!GLAVNI_TIP.test(tip)) throw new GreskaUvoza(PORUKE_FAJLA.nijePptx);
    const prezentacija = this.xml(glavna.cilj)?.documentElement;
    // Strict OOXML (drugi imenski prostori) se ne čita: ostatak uvoza radi samo sa Transitional prostorima.
    if (!prezentacija || prezentacija.namespaceURI !== NS.p || prezentacija.localName !== 'presentation') {
      throw new GreskaUvoza(PORUKE_FAJLA.nijePptx);
    }

    const lista = dete(prezentacija, NS.p, 'sldIdLst');
    this.slajdovi = (lista ? deca(lista, NS.p, 'sldId') : []).map((s, i) => {
      const v = this.veza(glavna.cilj, s.getAttributeNS(NS.r, 'id') ?? '');
      return v && !v.spoljna && v.tip === 'slide' ? v.cilj : `#slajd${i + 1}`;
    });
    if (this.slajdovi.length === 0) throw new GreskaUvoza(PORUKE_FAJLA.bezSlajdova);

    const sldSz = dete(prezentacija, NS.p, 'sldSz');
    this.velicina = { cx: brojAtr(sldSz, 'cx', PODRAZUMEVANA_VELICINA.cx), cy: brojAtr(sldSz, 'cy', PODRAZUMEVANA_VELICINA.cy) };
  }

  xml(putanja: string): Document | null {
    const kes = this.dokumenti.get(putanja);
    if (kes) return kes;
    const b = this.xmlDelovi[putanja];
    if (!b) return null;
    const doc = parsirajXml(b, putanja);
    this.dokumenti.set(putanja, doc);
    delete this.xmlDelovi[putanja]; // bajtovi više ne trebaju; bajtovi() ionako raspakuje iz celog fajla
    return doc;
  }

  veze(putanja: string): readonly Veza[] {
    let v = this.vezeDelova.get(putanja);
    if (!v) {
      const doc = this.xml(putanjaVeza(putanja));
      v = doc ? deca(doc.documentElement, NS.veze, 'Relationship').map((r) => {
        const spoljna = r.getAttribute('TargetMode') === 'External';
        const cilj = r.getAttribute('Target') ?? '';
        return { id: r.getAttribute('Id') ?? '', tip: tipVeze(r.getAttribute('Type') ?? ''), cilj: spoljna ? cilj : razresi(putanja, cilj), spoljna };
      }) : [];
      this.vezeDelova.set(putanja, v);
    }
    return v;
  }

  veza(putanja: string, rId: string): Veza | null {
    return this.veze(putanja).find((v) => v.id === rId) ?? null;
  }

  vezaTipa(putanja: string, tip: string): Veza | null {
    return this.veze(putanja).find((v) => v.tip === tip) ?? null;
  }

  bajtovi(putanja: string): Uint8Array | null {
    if (!this.raspakovano.has(putanja)) {
      let b: Uint8Array | null;
      try {
        // Granice su proverene pri otvaranju na max(size, originalSize) svakog dela (vidi raspakujXml), pa ni ovde
        // raspakovan deo ne može biti veći od proverenog.
        b = unzipSync(this.sviBajtovi, { filter: (f) => f.name === putanja })[putanja] ?? null;
      } catch {
        b = null; // oštećen deo se ponaša kao deo kog nema (upozorenje daje pozivalac)
      }
      this.raspakovano.set(putanja, b);
    }
    return this.raspakovano.get(putanja) ?? null;
  }
}

/** Content type dela iz `[Content_Types].xml`: `Override` za putanju, inače `Default` po ekstenziji (OPC: bez obzira na slova). */
function tipDela(tipovi: Document, putanja: string): string {
  const koren = tipovi.documentElement;
  const ime = `/${putanja}`.toLowerCase();
  const override = deca(koren, NS.tipovi, 'Override').find((o) => (o.getAttribute('PartName') ?? '').toLowerCase() === ime);
  if (override) return override.getAttribute('ContentType') ?? '';
  const ekstenzija = putanja.slice(putanja.lastIndexOf('.') + 1).toLowerCase();
  const podr = deca(koren, NS.tipovi, 'Default').find((d) => (d.getAttribute('Extension') ?? '').toLowerCase() === ekstenzija);
  return podr?.getAttribute('ContentType') ?? '';
}

/**
 * Otvara PPTX iz bajtova. Redom: ime fajla, veličina i potpis (stari `.ppt`, zaštita lozinkom), granice zip-a,
 * obavezni delovi i content type glavnog dela, lista slajdova. Svaka greška je `GreskaUvoza` sa porukom za korisnika.
 */
export function otvoriPaket(bajtovi: Uint8Array, imeFajla: string): Paket {
  const poruka = proveriImeFajla(imeFajla);
  if (poruka) throw new GreskaUvoza(poruka);
  if (bajtovi.byteLength > GRANICE_PAKETA.fajl) throw ostecen();
  // OLE/CFB: stari binarni format, ili OOXML šifrovan lozinkom (tok "EncryptedPackage").
  if (pocinjeSa(bajtovi, POTPIS_CFB)) {
    throw new GreskaUvoza(sadrziUtf16le(bajtovi, 'EncryptedPackage') ? PORUKE_FAJLA.lozinka : PORUKE_FAJLA.ppt);
  }
  if (!pocinjeSa(bajtovi, POTPIS_ZIP)) throw ostecen();
  return new PptxPaket(imeFajla, bajtovi, raspakujXml(bajtovi));
}
