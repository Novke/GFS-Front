// XML pomoćnici uvoza PPTX-a: parsiranje dela paketa i obilazak po imenskom prostoru (bez Angular-a i RxJS-a).
import { GreskaUvoza, PORUKE_FAJLA } from './ime-fajla';

/** Imenski prostori OOXML-a (Transitional) koje uvoz čita. */
export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  aink: 'http://schemas.microsoft.com/office/drawing/2016/ink',
  inkml: 'http://www.w3.org/2003/InkML',
  /** `_rels/*.rels` */
  veze: 'http://schemas.openxmlformats.org/package/2006/relationships',
  /** `[Content_Types].xml` */
  tipovi: 'http://schemas.openxmlformats.org/package/2006/content-types',
} as const;

function dekodiraj(b: Uint8Array): string {
  // TextDecoder sam skida BOM svog kodiranja (ignoreBOM je podrazumevano false).
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

/**
 * Parsira XML deo paketa. Odbija `<!DOCTYPE` (OOXML ga nikad nema; bez njega nema ni entiteta, pa ni "billion laughs")
 * i neispravan XML: `GreskaUvoza` sa porukom za korisnika, putanja dela je samo u `cause`.
 */
export function parsirajXml(b: Uint8Array, putanja: string): Document {
  const ostecen = () => new GreskaUvoza(PORUKE_FAJLA.ostecen, { cause: putanja });
  let doc: Document;
  try {
    const tekst = dekodiraj(b);
    if (/<!DOCTYPE/i.test(tekst)) throw ostecen();
    doc = new DOMParser().parseFromString(tekst, 'application/xml');
  } catch (e) {
    throw e instanceof GreskaUvoza ? e : ostecen();
  }
  // Pregledači i jsdom vraćaju dokument sa elementom <parsererror> (imenski prostor zavisi od pregledača).
  if (!doc.documentElement || doc.getElementsByTagNameNS('*', 'parsererror').length > 0) throw ostecen();
  return doc;
}

/** Neposredna deca elementa sa datim imenskim prostorom i lokalnim imenom. */
export function deca(el: Element, ns: string, ime: string): Element[] {
  return Array.from(el.children).filter((d) => d.localName === ime && d.namespaceURI === ns);
}

/** Prvo neposredno dete sa datim imenskim prostorom i lokalnim imenom, ili `null`. */
export function dete(el: Element, ns: string, ime: string): Element | null {
  for (const d of Array.from(el.children)) {
    if (d.localName === ime && d.namespaceURI === ns) return d;
  }
  return null;
}

/** Prvi potomak (u dubinu, redosledom dokumenta, bez samog elementa), ili `null`. */
export function potomak(el: Element, ns: string, ime: string): Element | null {
  return el.getElementsByTagNameNS(ns, ime)[0] ?? null;
}

/** Broj iz atributa (bez imenskog prostora); nema elementa, atributa ili nije broj -> `podr`. */
export function brojAtr(el: Element | null, ime: string, podr: number): number {
  const v = el?.getAttribute(ime);
  if (v == null || v.trim() === '') return podr;
  const n = Number(v);
  return Number.isFinite(n) ? n : podr;
}

/** Tip veze = poslednji segment `Type` URI-ja (isto za Transitional i Strict OOXML). */
export function tipVeze(typeUri: string): string {
  const t = typeUri.trim();
  return t.slice(t.lastIndexOf('/') + 1);
}
