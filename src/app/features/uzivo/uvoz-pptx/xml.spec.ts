import { strToU8 } from 'fflate';
import { GreskaUvoza, PORUKE_FAJLA } from './ime-fajla';
import { brojAtr, deca, dete, NS, parsirajXml, potomak, tipVeze } from './xml';

/** UTF-16 bajtovi teksta (sa BOM-om), little ili big endian. */
function utf16(tekst: string, le: boolean): Uint8Array {
  const b = new Uint8Array(2 + tekst.length * 2);
  b[0] = le ? 0xff : 0xfe;
  b[1] = le ? 0xfe : 0xff;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i);
    b[2 + i * 2] = le ? c & 0xff : c >> 8;
    b[3 + i * 2] = le ? c >> 8 : c & 0xff;
  }
  return b;
}

function greska(f: () => unknown): GreskaUvoza {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(GreskaUvoza);
    return e as GreskaUvoza;
  }
  throw new Error('očekivana GreskaUvoza');
}

const DOK = `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:x="urn:drugi">`
  + '<p:cSld><p:spTree><x:sp/><p:sp id="1"/><p:sp id="2"><a:p><a:t>Ćao</a:t></a:p></p:sp></p:spTree></p:cSld></p:sld>';

describe('parsirajXml', () => {
  it('UTF-8 bez BOM-a, sa našim slovima', () => {
    const doc = parsirajXml(strToU8(DOK), 'ppt/slides/slide1.xml');
    expect(doc.documentElement.localName).toBe('sld');
    expect(potomak(doc.documentElement, NS.a, 't')?.textContent).toBe('Ćao');
  });

  it('skida UTF-8 BOM', () => {
    const doc = parsirajXml(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8('<?xml version="1.0"?><a/>')]), 'x.xml');
    expect(doc.documentElement.localName).toBe('a');
  });

  it('UTF-16LE i UTF-16BE sa BOM-om', () => {
    const tekst = '<?xml version="1.0" encoding="UTF-16"?><koren>Šđ</koren>';
    expect(parsirajXml(utf16(tekst, true), 'x.xml').documentElement.textContent).toBe('Šđ');
    expect(parsirajXml(utf16(tekst, false), 'x.xml').documentElement.textContent).toBe('Šđ');
  });

  it('odbija <!DOCTYPE (OOXML ga nikad nema), putanja samo u cause', () => {
    const g = greska(() => parsirajXml(strToU8('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'), 'ppt/presentation.xml'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(g.cause).toBe('ppt/presentation.xml');
  });

  it('odbija neispravan XML (parsererror)', () => {
    const g = greska(() => parsirajXml(strToU8('<a><b></a>'), 'ppt/slides/slide2.xml'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(g.cause).toBe('ppt/slides/slide2.xml');
  });

  it('odbija prazan deo', () => {
    expect(greska(() => parsirajXml(new Uint8Array(0), 'x.xml')).message).toBe(PORUKE_FAJLA.ostecen);
  });
});

describe('deca, dete, potomak', () => {
  const koren = parsirajXml(strToU8(DOK), 's.xml').documentElement;
  const spTree = potomak(koren, NS.p, 'spTree')!;

  it('deca po imenskom prostoru: element istog lokalnog imena iz drugog prostora se ne vraća', () => {
    expect(deca(spTree, NS.p, 'sp').map((e) => e.getAttribute('id'))).toEqual(['1', '2']);
    expect(deca(spTree, 'urn:drugi', 'sp')).toHaveLength(1);
    expect(deca(spTree, NS.a, 'sp')).toEqual([]);
  });

  it('dete je prvo dete ili null; samo neposredna deca', () => {
    expect(dete(spTree, NS.p, 'sp')?.getAttribute('id')).toBe('1');
    expect(dete(koren, NS.p, 'spTree')).toBeNull();
    expect(dete(koren, NS.p, 'cSld')).not.toBeNull();
  });

  it('potomak traži u dubinu, po imenskom prostoru', () => {
    expect(potomak(koren, NS.p, 'spTree')).toBe(spTree);
    expect(potomak(koren, NS.p, 't')).toBeNull();
    expect(potomak(koren, NS.a, 'nema')).toBeNull();
  });
});

describe('brojAtr', () => {
  const el = parsirajXml(strToU8('<a x="12700" y="-3" z="" w="abc" v="1.5"/>'), 'x.xml').documentElement;

  it('broj iz atributa ili podrazumevana vrednost', () => {
    expect(brojAtr(el, 'x', 0)).toBe(12700);
    expect(brojAtr(el, 'y', 0)).toBe(-3);
    expect(brojAtr(el, 'v', 0)).toBe(1.5);
    expect(brojAtr(el, 'z', 7)).toBe(7);
    expect(brojAtr(el, 'w', 7)).toBe(7);
    expect(brojAtr(el, 'nema', 7)).toBe(7);
    expect(brojAtr(null, 'x', 9)).toBe(9);
  });
});

describe('tipVeze', () => {
  it('poslednji segment Type URI-ja (Transitional i Strict)', () => {
    expect(tipVeze('http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout')).toBe('slideLayout');
    expect(tipVeze('http://purl.oclc.org/ooxml/officeDocument/relationships/slide')).toBe('slide');
    expect(tipVeze('slide')).toBe('slide');
  });
});
