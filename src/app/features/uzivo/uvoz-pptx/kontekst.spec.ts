import { otvoriPaket } from './paket';
import { napraviKontekst, transformacija, type ZajednickoUvoza } from './kontekst';
import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import { napraviPptx, NS_DEKL, oblik, pasus, PNG_1X1, type OpcijeFabrike } from './pptx-fabrika.testing';
import { PODRAZUMEVANA_TEMA } from './tema';
import { uSloj, zaokruzi } from './tipovi';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const veze = (lista: [string, string, string][]) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + lista.map(([id, tip, cilj]) => `<Relationship Id="${id}" Type="${R}/${tip}" Target="${cilj}"/>`).join('') + '</Relationships>';
/** Izmišljena tema sa datim fontom naslova i bojom accent1. */
const tema = (fontNaslova: string, accent1: string) => `${XML}<a:theme ${NS_DEKL} name="Druga"><a:themeElements>`
  + `<a:clrScheme name="Druga"><a:accent1><a:srgbClr val="${accent1}"/></a:accent1></a:clrScheme>`
  + `<a:fontScheme name="Druga"><a:majorFont><a:latin typeface="${fontNaslova}"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>`
  + '</a:themeElements></a:theme>';

function zajednicko(o: OpcijeFabrike): ZajednickoUvoza {
  const paket = otvoriPaket(napraviPptx(o), 'kontekst.pptx');
  return { paket, t: transformacija(paket.velicina), upozorenja: [], mediji: new Map(), brojacGen: { n: 0 } };
}

describe('transformacija i uSloj', () => {
  it('16:9 (12192000 x 6858000) -> s 1, bez pomeraja', () => {
    expect(transformacija({ cx: 12192000, cy: 6858000 })).toEqual({ s: 1, ox: 0, oy: 0 });
  });

  it('4:3 (9144000 x 6858000) -> s 1, ox 120, oy 0', () => {
    expect(transformacija({ cx: 9144000, cy: 6858000 })).toEqual({ s: 1, ox: 120, oy: 0 });
  });

  it('4:3 veći (12192000 x 9144000) -> s 0,75, ox 120, oy 0', () => {
    expect(transformacija({ cx: 12192000, cy: 9144000 })).toEqual({ s: 0.75, ox: 120, oy: 0 });
  });

  it('širi od 16:9 -> uklapanje po širini, pomeraj po visini', () => {
    const t = transformacija({ cx: 24384000, cy: 6858000 });
    expect(t.s).toBe(0.5);
    expect(t.ox).toBe(0);
    expect(t.oy).toBe(135);
  });

  it('uSloj: EMU -> jedinice platna, zaokruženo na 2 decimale, rotacija ostaje', () => {
    expect(uSloj({ x: 838200, y: 365125, w: 10515600, h: 1325563, rot: 0 }, { s: 1, ox: 0, oy: 0 }))
      .toEqual({ x: 66, y: 28.75, sirina: 828, visina: 104.38, rotacija: 0 });
    expect(uSloj({ x: 0, y: 12700, w: 127000, h: 25400, rot: 45 }, { s: 0.75, ox: 120, oy: 0 }))
      .toEqual({ x: 120, y: 0.75, sirina: 7.5, visina: 1.5, rotacija: 45 });
    expect(zaokruzi(1.005 + 0.0001)).toBe(1.01);
  });
});

describe('napraviKontekst', () => {
  it('slajd, layout i master po vezama; tema, mapa boja, defaultTextStyle, pozadina bg1', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '' }, { spTree: '' }] });
    const ctx = napraviKontekst(z, 'ppt/slides/slide2.xml', 2);
    expect(ctx.indeks).toBe(2);
    expect(ctx.paket).toBe(z.paket);
    expect(ctx.t).toBe(z.t);
    expect(ctx.slajd.putanja).toBe('ppt/slides/slide2.xml');
    expect(ctx.slajd.doc.documentElement.localName).toBe('sld');
    expect(ctx.layout?.putanja).toBe('ppt/slideLayouts/slideLayout1.xml');
    expect(ctx.master?.putanja).toBe('ppt/slideMasters/slideMaster1.xml');
    expect(ctx.tema.fontNaslova).toBe('Calibri Light');
    expect(ctx.mapaBoja['tx1']).toBe('dk1');
    expect(ctx.defaultTextStyle?.localName).toBe('defaultTextStyle');
    expect(ctx.tabelaStilova).toBeNull();
    expect(ctx.pozadina).toBe('#FFFFFF');
  });

  it('tema iz veze mastera, ne prvi theme*.xml u paketu (theme1 pripada masteru beležaka)', () => {
    const z = zajednicko({
      slajdovi: [{ spTree: '' }],
      delovi: {
        'ppt/theme/theme1.xml': tema('Courier New', '111111'),
        'ppt/theme/theme2.xml': tema('Georgia', '222222'),
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': veze([
          ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme2.xml']]),
        'ppt/notesMasters/notesMaster1.xml': `${XML}<p:notesMaster ${NS_DEKL}><p:cSld><p:spTree/></p:cSld></p:notesMaster>`,
        'ppt/notesMasters/_rels/notesMaster1.xml.rels': veze([['rId1', 'theme', '../theme/theme1.xml']]),
      },
    });
    const ctx = napraviKontekst(z, 'ppt/slides/slide1.xml', 1);
    expect(ctx.tema.fontNaslova).toBe('Georgia');
    expect(ctx.tema.fontTela).toBe('Arial');
    expect(ctx.tema.boje['accent1']).toBe('#222222');
  });

  it('master bez veze ka temi -> PODRAZUMEVANA_TEMA', () => {
    const z = zajednicko({
      slajdovi: [{ spTree: '' }],
      delovi: { 'ppt/slideMasters/_rels/slideMaster1.xml.rels': veze([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    });
    expect(napraviKontekst(z, 'ppt/slides/slide1.xml', 1).tema).toBe(PODRAZUMEVANA_TEMA);
  });

  it('slajd bez layouta -> layout i master null, PODRAZUMEVANA_TEMA', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '', bezLayouta: true }] });
    const ctx = napraviKontekst(z, 'ppt/slides/slide1.xml', 1);
    expect(ctx.layout).toBeNull();
    expect(ctx.master).toBeNull();
    expect(ctx.tema).toBe(PODRAZUMEVANA_TEMA);
    expect(ctx.pozadina).toBe('#FFFFFF');
  });

  it('layout bez dela mastera -> master null, PODRAZUMEVANA_TEMA', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '' }], bezDelova: ['ppt/slideMasters/slideMaster1.xml'] });
    const ctx = napraviKontekst(z, 'ppt/slides/slide1.xml', 1);
    expect(ctx.layout).not.toBeNull();
    expect(ctx.master).toBeNull();
    expect(ctx.tema).toBe(PODRAZUMEVANA_TEMA);
  });

  it('pozadina je bg1 kroz mapu boja slajda', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '', clrMapOvr: '<p:clrMapOvr><a:overrideClrMapping bg1="dk1"/></p:clrMapOvr>' }] });
    expect(napraviKontekst(z, 'ppt/slides/slide1.xml', 1).pozadina).toBe('#000000');
  });

  it('tabelaStilova iz veze tableStyles glavnog dela', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '' }], tableStyles: '<a:tblStyle styleId="{X}" styleName="Izmišljen"/>' });
    expect(napraviKontekst(z, 'ppt/slides/slide1.xml', 1).tabelaStilova?.documentElement.localName).toBe('tblStyleLst');
  });

  it('slajd bez dela -> izuzetak (F12 ga pretvara u grešku slajda)', () => {
    const z = zajednicko({ slajdovi: [{ spTree: '' }] });
    expect(() => napraviKontekst(z, '#slajd1', 1)).toThrowError();
  });

  it('upozori dodaje upozorenje sa rednim brojem slajda', () => {
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: '' }, { spTree: '' }] }, 2);
    ctx.upozori('TEKST_PRIBLIZAN', 'izmišljeno');
    expect(z.upozorenja).toEqual([{ slajd: 2, kod: 'TEKST_PRIBLIZAN', poruka: 'izmišljeno' }]);
  });

  it('medijIzVeze: deo paketa -> pptx:<putanja> sa lenjim bajtovima; isti deo jednom', () => {
    const { ctx, z } = kontekstZaTest({
      slajdovi: [{ spTree: oblik.slika(2, 'rId2', 0, 0, 12700, 12700), veze: [
        { id: 'rId2', tip: 'image', cilj: '../media/image1.png' },
        { id: 'rId3', tip: 'image', cilj: '../media/image1.png' },
        { id: 'rId4', tip: 'image', cilj: '../media/nema.png' },
        { id: 'rId5', tip: 'image', cilj: 'https://primer.test/slika.png', spoljna: true },
      ] }],
      delovi: { 'ppt/media/image1.png': PNG_1X1 },
    });
    expect(ctx.medijIzVeze(ctx.slajd.putanja, 'rId2')).toBe('pptx:ppt/media/image1.png');
    expect(ctx.medijIzVeze(ctx.slajd.putanja, 'rId3')).toBe('pptx:ppt/media/image1.png');
    expect(z.mediji.size).toBe(1);
    const m = z.mediji.get('pptx:ppt/media/image1.png');
    expect(m?.kljuc).toBe('pptx:ppt/media/image1.png');
    expect(m?.ime).toBe('image1.png');
    expect(m?.bajtovi()).toEqual(PNG_1X1);
    expect(ctx.medijIzVeze(ctx.slajd.putanja, 'rId4')).toBeNull();
    expect(ctx.medijIzVeze(ctx.slajd.putanja, 'rId5')).toBeNull();
    expect(ctx.medijIzVeze(ctx.slajd.putanja, 'rIdNema')).toBeNull();
    expect(z.mediji.size).toBe(1);
  });

  it('noviMedij: gen:<n> po zajedničkom brojaču', () => {
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: '' }] });
    const b = new Uint8Array([1, 2, 3]);
    expect(ctx.noviMedij('formula.png', b)).toBe('gen:1');
    expect(ctx.noviMedij('formula.png', b)).toBe('gen:2');
    expect(z.brojacGen.n).toBe(2);
    expect(z.mediji.get('gen:1')?.ime).toBe('formula.png');
    expect(z.mediji.get('gen:2')?.bajtovi()).toBe(b);
  });

  it('kontekstZaTest: podrazumevano prvi slajd; oblikSaId nalazi oblik po cNvPr id', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: oblik.tekst(5, 0, 0, 12700, 12700, pasus('x')) }] });
    expect(ctx.indeks).toBe(1);
    expect(oblikSaId(ctx, 5).localName).toBe('sp');
    expect(() => oblikSaId(ctx, 99)).toThrowError();
  });
});
