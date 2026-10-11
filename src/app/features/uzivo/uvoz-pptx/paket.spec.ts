import { strToU8, zipSync } from 'fflate';
import { GreskaUvoza, PORUKE_FAJLA, proveriImeFajla } from './ime-fajla';
import { GRANICE_PAKETA, otvoriPaket } from './paket';
import { napraviPptx, PNG_1X1, SlajdFabrike } from './pptx-fabrika.testing';

const PRAZAN: SlajdFabrike = { spTree: '' };
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function greska(f: () => unknown): GreskaUvoza {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(GreskaUvoza);
    return e as GreskaUvoza;
  }
  throw new Error('očekivana GreskaUvoza');
}
const poruka = (f: () => unknown) => greska(f).message;

/**
 * Prepravlja zaglavlja jednog dela zip-a u lokalnom i centralnom direktorijumu. Lokalno zaglavlje: potpis 0x04034b50,
 * metod kompresije +8, neraspakovana veličina +22, dužina imena +26, ime od +30; centralno: potpis 0x02014b50, metod +10,
 * veličina +24, dužina imena +28, ime od +46.
 */
function prepravi(zip: Uint8Array, ime: string, polje: 'velicina' | 'metod', vrednost: number): Uint8Array {
  const b = zip.slice();
  const dv = new DataView(b.buffer);
  const dek = new TextDecoder();
  let izmena = 0;
  for (let i = 0; i + 46 <= b.length; i++) {
    const potpis = dv.getUint32(i, true);
    const lokalno = potpis === 0x04034b50;
    if (!lokalno && potpis !== 0x02014b50) continue;
    const n = dv.getUint16(i + (lokalno ? 26 : 28), true);
    const odImena = i + (lokalno ? 30 : 46);
    if (dek.decode(b.subarray(odImena, odImena + n)) !== ime) continue;
    if (polje === 'velicina') dv.setUint32(i + (lokalno ? 22 : 24), vrednost, true);
    else dv.setUint16(i + (lokalno ? 8 : 10), vrednost, true);
    izmena++;
  }
  expect(izmena).toBe(2);
  return b;
}

/** Zip bomba sa lažnim veličinama: deklarisana neraspakovana veličina dela. */
const lazneVelicine = (zip: Uint8Array, ime: string, velicina: number) => prepravi(zip, ime, 'velicina', velicina);

describe('otvoriPaket: ispravan fajl', () => {
  it('otvaraSintetickiPptx: slajdovi po p:sldIdLst, veličina i veze slajda', () => {
    const p = otvoriPaket(napraviPptx({ slajdovi: [PRAZAN, PRAZAN] }), 'predavanje.pptx');
    expect(p.imeFajla).toBe('predavanje.pptx');
    expect(p.slajdovi).toEqual(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']);
    expect(p.velicina).toEqual({ cx: 12192000, cy: 6858000 });
    expect(p.veza('ppt/slides/slide1.xml', 'rIdL')?.cilj).toBe('ppt/slideLayouts/slideLayout1.xml');
    expect(p.vezaTipa('ppt/slides/slide1.xml', 'slideLayout')).toEqual(
      { id: 'rIdL', tip: 'slideLayout', cilj: 'ppt/slideLayouts/slideLayout1.xml', spoljna: false });
    expect(p.xml('ppt/slides/slide1.xml')?.documentElement.localName).toBe('sld');
    expect(p.xml('ppt/slides/slide1.xml')).toBe(p.xml('ppt/slides/slide1.xml'));
    expect(p.xml('ppt/slides/slide9.xml')).toBeNull();
    expect(p.veza('ppt/slides/slide1.xml', 'rIdNema')).toBeNull();
    expect(p.vezaTipa('ppt/slides/slide1.xml', 'notesSlide')).toBeNull();
  });

  it('redosled slajdova je redosled p:sldIdLst, ne imena delova', () => {
    const bajtovi = napraviPptx({
      slajdovi: [PRAZAN, PRAZAN],
      delovi: {
        'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rIdS1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>'
          + '<Relationship Id="rIdS2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="/ppt/slides/slide1.xml"/>'
          + '</Relationships>',
      },
    });
    expect(otvoriPaket(bajtovi, 'a.pptx').slajdovi).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml']);
  });

  it('putanje veza: relativno na folder izvora, .. i ., apsolutne bez vodeće kose crte', () => {
    const p = otvoriPaket(napraviPptx({
      slajdovi: [{
        spTree: '',
        veze: [
          { id: 'rId2', tip: 'image', cilj: '../media/./image1.png' },
          { id: 'rId3', tip: 'image', cilj: '/ppt/media/image2.png' },
          { id: 'rId4', tip: 'customXml', cilj: '../../ppt/ink/ink1.xml' },
        ],
      }],
    }), 'a.pptx');
    expect(p.veza('ppt/slides/slide1.xml', 'rId2')?.cilj).toBe('ppt/media/image1.png');
    expect(p.veza('ppt/slides/slide1.xml', 'rId3')?.cilj).toBe('ppt/media/image2.png');
    expect(p.veza('ppt/slides/slide1.xml', 'rId4')?.cilj).toBe('ppt/ink/ink1.xml');
    expect(p.vezaTipa('ppt/slideMasters/slideMaster1.xml', 'theme')?.cilj).toBe('ppt/theme/theme1.xml');
    expect(p.veze('ppt/slides/slide1.xml').map((v) => v.id)).toEqual(['rIdL', 'rId2', 'rId3', 'rId4']);
    expect(p.veze('ppt/nema.xml')).toEqual([]);
  });

  it('spoljnaVeza: TargetMode="External" -> spoljna, cilj ostaje URL', () => {
    const p = otvoriPaket(napraviPptx({
      slajdovi: [{ spTree: '', veze: [{ id: 'rId9', tip: 'hyperlink', cilj: 'https://example.com/a/../b?x=1', spoljna: true }] }],
    }), 'a.pptx');
    expect(p.veza('ppt/slides/slide1.xml', 'rId9')).toEqual(
      { id: 'rId9', tip: 'hyperlink', cilj: 'https://example.com/a/../b?x=1', spoljna: true });
  });

  it('bajtoviLenjo: deo slike se raspakuje na zahtev; nepostojeći deo je null', () => {
    const p = otvoriPaket(napraviPptx({ slajdovi: [PRAZAN], delovi: { 'ppt/media/image1.png': PNG_1X1 } }), 'a.pptx');
    expect(p.bajtovi('ppt/media/image1.png')).toEqual(PNG_1X1);
    expect(p.bajtovi('ppt/media/image1.png')).toBe(p.bajtovi('ppt/media/image1.png'));
    expect(p.bajtovi('ppt/media/nema.png')).toBeNull();
  });

  it('bajtovi: deo koji ne može da se raspakuje (nepoznat metod kompresije) je null, ne izuzetak', () => {
    const z = prepravi(napraviPptx({ slajdovi: [PRAZAN], delovi: { 'ppt/media/image1.png': PNG_1X1 } }), 'ppt/media/image1.png', 'metod', 99);
    const p = otvoriPaket(z, 'a.pptx');
    expect(p.bajtovi('ppt/media/image1.png')).toBeNull();
  });

  it('sldId sa neispravnom vezom zadržava svoj indeks: veze nema, deo ne postoji, pogrešan tip veze, spoljna veza', () => {
    const SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
    const veza = (id: string, tip: string, cilj: string, dodatak = '') =>
      `<Relationship Id="${id}" Type="${tip}" Target="${cilj}"${dodatak}/>`;
    const bajtovi = napraviPptx({
      slajdovi: [PRAZAN, PRAZAN, PRAZAN, PRAZAN, PRAZAN],
      delovi: {
        'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + veza('rIdM', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', 'slideMasters/slideMaster1.xml')
          // rIdS1 nema
          + veza('rIdS2', SLIDE, 'slides/slide99.xml')
          + veza('rIdS3', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', 'slideLayouts/slideLayout1.xml')
          + veza('rIdS4', SLIDE, 'https://example.com/slajd.xml', ' TargetMode="External"')
          + veza('rIdS5', SLIDE, 'slides/slide5.xml')
          + '</Relationships>',
      },
    });
    const p = otvoriPaket(bajtovi, 'a.pptx');
    expect(p.slajdovi).toHaveLength(5);
    expect(p.slajdovi.slice(0, 4).map((s) => p.xml(s))).toEqual([null, null, null, null]);
    expect(p.slajdovi.slice(0, 4).map((s) => p.veze(s))).toEqual([[], [], [], []]);
    expect(p.slajdovi[1]).toBe('ppt/slides/slide99.xml');
    expect(p.slajdovi[4]).toBe('ppt/slides/slide5.xml');
    expect(p.xml(p.slajdovi[4])?.documentElement.localName).toBe('sld');
  });

  it('prikaz (.ppsx) i šablon (.potx) se otvaraju', () => {
    const prikaz = 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml';
    const sablon = 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml';
    expect(otvoriPaket(napraviPptx({ slajdovi: [PRAZAN], glavniTip: prikaz }), 'a.ppsx').slajdovi).toHaveLength(1);
    expect(otvoriPaket(napraviPptx({ slajdovi: [PRAZAN], glavniTip: sablon }), 'a.potx').slajdovi).toHaveLength(1);
  });
});

describe('otvoriPaket: neispravan ili zlonameran fajl (Review Focus 1)', () => {
  it('nijeZip', () => {
    expect(poruka(() => otvoriPaket(strToU8('nije zip'), 'a.pptx'))).toBe(PORUKE_FAJLA.ostecen);
  });

  it('skracenZip (prvih 70% bajtova)', () => {
    const z = napraviPptx({ slajdovi: [PRAZAN] });
    expect(poruka(() => otvoriPaket(z.slice(0, Math.floor(z.length * 0.7)), 'a.pptx'))).toBe(PORUKE_FAJLA.ostecen);
  });

  it('lazneVelicine: XML deo deklarisan sa 60 MB se odbija pre raspakivanja', () => {
    const z = lazneVelicine(napraviPptx({ slajdovi: [PRAZAN] }), 'ppt/presentation.xml', 60 * 1024 * 1024);
    const g = greska(() => otvoriPaket(z, 'a.pptx'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(String(g.cause)).toBe('XML deo preko granice: ppt/presentation.xml'); // filter, ne greška fflate-a
  });

  it('stored XML deo preko 50 MB sa lažno malim originalSize se odbija (fflate stored deo ne seče na originalSize)', () => {
    const veliki = new Uint8Array(GRANICE_PAKETA.xml + 1).fill(0x20);
    const z = lazneVelicine(zipSync({ 'ppt/velik.xml': [veliki, { level: 0 }] }), 'ppt/velik.xml', 100);
    const g = greska(() => otvoriPaket(z, 'a.pptx'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(String(g.cause)).toBe('XML deo preko granice: ppt/velik.xml');
  });

  it('ukupna deklarisana veličina preko 500 MB se odbija (i kad je deo slika)', () => {
    const z = lazneVelicine(
      napraviPptx({ slajdovi: [PRAZAN], delovi: { 'ppt/media/image1.png': PNG_1X1 } }), 'ppt/media/image1.png', 501 * 1024 * 1024);
    const g = greska(() => otvoriPaket(z, 'a.pptx'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(String(g.cause)).toBe('granica paketa: ppt/media/image1.png');
  });

  it('previseDelova (5001 deo)', () => {
    const delovi = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`ppt/x/d${i}.bin`, new Uint8Array(0)]));
    const g = greska(() => otvoriPaket(napraviPptx({ slajdovi: [PRAZAN], delovi }), 'a.pptx'));
    expect(g.message).toBe(PORUKE_FAJLA.ostecen);
    expect(String(g.cause)).toMatch(/^granica paketa: /);
  });

  it('fajl veći od 500 MB se odbija bez čitanja', () => {
    const veliki = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    Object.defineProperty(veliki, 'byteLength', { value: GRANICE_PAKETA.fajl + 1 });
    Object.defineProperty(veliki, 'length', { value: GRANICE_PAKETA.fajl + 1 });
    expect(poruka(() => otvoriPaket(veliki, 'a.pptx'))).toBe(PORUKE_FAJLA.ostecen);
  });

  it('doctype u glavnom delu', () => {
    const z = napraviPptx({ slajdovi: [PRAZAN], delovi: { 'ppt/presentation.xml': '<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>' } });
    expect(poruka(() => otvoriPaket(z, 'a.pptx'))).toBe(PORUKE_FAJLA.ostecen);
  });

  it('bezGlavnogDela', () => {
    const z = napraviPptx({ slajdovi: [PRAZAN], bezDelova: ['ppt/presentation.xml'] });
    expect(poruka(() => otvoriPaket(z, 'a.pptx'))).toBe(PORUKE_FAJLA.nijePptx);
  });

  it('bez [Content_Types].xml ili bez _rels/.rels', () => {
    for (const deo of ['[Content_Types].xml', '_rels/.rels']) {
      expect(poruka(() => otvoriPaket(napraviPptx({ slajdovi: [PRAZAN], bezDelova: [deo] }), 'a.pptx'))).toBe(PORUKE_FAJLA.nijePptx);
    }
  });

  it('Strict OOXML (koren glavnog dela iz drugog imenskog prostora) -> nijePptx', () => {
    const strict = '<p:presentation xmlns:p="http://purl.oclc.org/ooxml/presentationml/main" '
      + 'xmlns:r="http://purl.oclc.org/ooxml/officeDocument/relationships"><p:sldIdLst><p:sldId id="256" r:id="rIdS1"/></p:sldIdLst></p:presentation>';
    const z = napraviPptx({ slajdovi: [PRAZAN], delovi: { 'ppt/presentation.xml': strict } });
    expect(poruka(() => otvoriPaket(z, 'a.pptx'))).toBe(PORUKE_FAJLA.nijePptx);
  });

  it('bezSlajdova', () => {
    expect(poruka(() => otvoriPaket(napraviPptx({ slajdovi: [] }), 'a.pptx'))).toBe(PORUKE_FAJLA.bezSlajdova);
  });
});

describe('otvoriPaket: pogrešan format (Review Focus 2)', () => {
  const cfb = (dodatak: number[] = []) => new Uint8Array([...CFB, ...new Array(504).fill(0), ...dodatak]);
  const utf16le = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);

  it('ppt po imenu', () => {
    expect(poruka(() => otvoriPaket(cfb(), 'a.ppt'))).toBe(PORUKE_FAJLA.ppt);
  });

  it('cfbKaoPptx: stari format preimenovan u .pptx', () => {
    expect(poruka(() => otvoriPaket(cfb(), 'a.pptx'))).toBe(PORUKE_FAJLA.ppt);
  });

  it('lozinka: CFB sa EncryptedPackage (UTF-16LE)', () => {
    expect(poruka(() => otvoriPaket(cfb([0, 0, ...utf16le('EncryptedPackage'), 0, 0]), 'a.pptx'))).toBe(PORUKE_FAJLA.lozinka);
  });

  it('pptmPoImenu', () => {
    expect(poruka(() => otvoriPaket(napraviPptx({ slajdovi: [PRAZAN] }), 'a.pptm'))).toBe(PORUKE_FAJLA.makro);
  });

  it('pptmPoSadrzaju', () => {
    const z = napraviPptx({ slajdovi: [PRAZAN], glavniTip: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml' });
    expect(poruka(() => otvoriPaket(z, 'a.pptx'))).toBe(PORUKE_FAJLA.makro);
  });

  it('docx preimenovan u .pptx', () => {
    const z = napraviPptx({
      slajdovi: [PRAZAN], glavniTip: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    });
    expect(poruka(() => otvoriPaket(z, 'a.pptx'))).toBe(PORUKE_FAJLA.nijePptx);
  });
});

describe('proveriImeFajla', () => {
  it('ekstenzija bez obzira na veličinu slova', () => {
    expect(proveriImeFajla('x.PPTX')).toBeNull();
    expect(proveriImeFajla('Predavanje 3.ppsx')).toBeNull();
    expect(proveriImeFajla('sablon.potx')).toBeNull();
    expect(proveriImeFajla('stari.PPT')).toBe(PORUKE_FAJLA.ppt);
    expect(proveriImeFajla('stari.pps')).toBe(PORUKE_FAJLA.ppt);
    expect(proveriImeFajla('stari.pot')).toBe(PORUKE_FAJLA.ppt);
    expect(proveriImeFajla('m.pptm')).toBe(PORUKE_FAJLA.makro);
    expect(proveriImeFajla('m.ppsm')).toBe(PORUKE_FAJLA.makro);
    expect(proveriImeFajla('m.potm')).toBe(PORUKE_FAJLA.makro);
    expect(proveriImeFajla('dokument.docx')).toBe(PORUKE_FAJLA.nijePptx);
    expect(proveriImeFajla('bez-ekstenzije')).toBe(PORUKE_FAJLA.nijePptx);
    expect(proveriImeFajla('pptx')).toBe(PORUKE_FAJLA.nijePptx);
  });
});
