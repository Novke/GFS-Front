import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import { kutijaIzLanca } from './nasledjivanje';
import { NS_DEKL, PNG_1X1, type OpcijeFabrike, type VezaFabrike } from './pptx-fabrika.testing';
import { pozadinaSlajda, pretvoriSliku } from './slika';
import type { KontekstSlajda } from './tipovi';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const relsXml = (lista: [string, string, string][]) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + lista.map(([id, tip, cilj]) => `<Relationship Id="${id}" Type="${R}/${tip}" Target="${cilj}"/>`).join('') + '</Relationships>';

const SLIKA: VezaFabrike = { id: 'rIdI', tip: 'image', cilj: '../media/image1.png' };
const MEDIJ = { 'ppt/media/image1.png': PNG_1X1 };

interface DeloviSlike { blip?: string; blipFill?: string; spPr?: string; nvPr?: string; xfrmAtr?: string; ime?: string; rId?: string; cx?: number; cy?: number; }
/** `p:pic` (id 7) sa delovima koje test menja: deca `a:blip`, ostatak `p:blipFill`, ostatak `p:spPr`, `p:nvPr`. */
function pic(d: DeloviSlike = {}): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="7" name="${d.ime ?? 'Slika 7'}"/><p:cNvPicPr/><p:nvPr>${d.nvPr ?? ''}</p:nvPr></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${d.rId ?? 'rIdI'}">${d.blip ?? ''}</a:blip>${d.blipFill ?? ''}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm${d.xfrmAtr ?? ''}><a:off x="914400" y="914400"/><a:ext cx="${d.cx ?? 1828800}" cy="${d.cy ?? 914400}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${d.spPr ?? ''}</p:spPr></p:pic>`;
}

function slika(d: DeloviSlike = {}, veze: VezaFabrike[] = [SLIKA], delovi: Record<string, string | Uint8Array> = MEDIJ) {
  const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: pic(d), veze }], delovi });
  const el = oblikSaId(ctx, 7);
  return { s: pretvoriSliku(el, kutijaIzLanca([el])!, ctx, 's7'), ctx, z };
}

const kodovi = (z: { upozorenja: { kod: string }[] }) => z.upozorenja.map((u) => u.kod);

describe('pretvoriSliku', () => {
  it('slika sa rIdI -> ključ pptx:ppt/media/image1.png, kutija u jedinicama (914400 EMU = 72)', () => {
    const { s, z } = slika();
    expect(s).toEqual({
      id: 's7', tip: 'SLIKA', naziv: 'Slika 7', x: 72, y: 72, sirina: 144, visina: 72, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, medijId: 'pptx:ppt/media/image1.png', isecak: { levo: 0, gore: 0, desno: 0, dole: 0 },
    });
    expect([...z.mediji.keys()]).toEqual(['pptx:ppt/media/image1.png']);
    expect(z.upozorenja).toEqual([]);
  });

  it('srcRect l=10000 r=20000 -> isecak.levo 0,1, desno 0,2; negativno -> 0', () => {
    expect(slika({ blipFill: '<a:srcRect l="10000" r="20000"/>' }).s!.isecak).toEqual({ levo: 0.1, gore: 0, desno: 0.2, dole: 0 });
    expect(slika({ blipFill: '<a:srcRect t="-5000" b="12345"/>' }).s!.isecak).toEqual({ levo: 0, gore: 0, desno: 0, dole: 0.1235 });
  });

  it('srcRect sa levo + desno >= 1 -> isečak poništen + OBLIK_PRIBLIZAN', () => {
    const { s, z } = slika({ blipFill: '<a:srcRect l="60000" r="40000" t="10000"/>' });
    expect(s!.isecak).toEqual({ levo: 0, gore: 0, desno: 0, dole: 0 });
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
    expect(slika({ blipFill: '<a:srcRect t="150000" b="-60000"/>' }).s!.isecak).toEqual({ levo: 0, gore: 0, desno: 0, dole: 0 });
  });

  it('alphaModFix amt=50000 -> providnost 0,5', () => {
    expect(slika({ blip: '<a:alphaModFix amt="50000"/>' }).s!.providnost).toBe(0.5);
  });

  it('slika bez dela -> null i OBJEKAT_PRESKOCEN', () => {
    const { s, z } = slika({}, [{ id: 'rIdI', tip: 'image', cilj: '../media/nema.png' }]);
    expect(s).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
    expect(z.mediji.size).toBe(0);
  });

  it('veza ne postoji -> null i OBJEKAT_PRESKOCEN', () => {
    const { s, z } = slika({ rId: 'rIdNema' });
    expect(s).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('spoljna slika (r:link) -> null i OBJEKAT_PRESKOCEN', () => {
    const el = pic().replace('r:embed="rIdI"', 'r:link="rIdW"');
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: el, veze: [{ id: 'rIdW', tip: 'image', cilj: 'https://example.com/a.png', spoljna: true }] }] });
    const p = oblikSaId(ctx, 7);
    expect(pretvoriSliku(p, kutijaIzLanca([p])!, ctx, 's7')).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('image1.emf i .wmf -> null i upozorenje, medij se ne registruje', () => {
    for (const ext of ['emf', 'WMF']) {
      const { s, z } = slika({}, [{ id: 'rIdI', tip: 'image', cilj: `../media/image1.${ext}` }], { [`ppt/media/image1.${ext}`]: PNG_1X1 });
      expect(s).toBeNull();
      expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
      expect(z.upozorenja[0].poruka).toContain(ext.toUpperCase());
      expect(z.mediji.size).toBe(0);
    }
  });

  it('svgBlip u extLst -> koristi se r:embed (PNG)', () => {
    const ext = '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdS"/></a:ext></a:extLst>';
    const { s, z } = slika({ blip: ext }, [SLIKA, { id: 'rIdS', tip: 'image', cilj: '../media/image2.svg' }],
      { ...MEDIJ, 'ppt/media/image2.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    expect(s!.medijId).toBe('pptx:ppt/media/image1.png');
    expect([...z.mediji.keys()]).toEqual(['pptx:ppt/media/image1.png']);
  });

  it('flipH -> slika + OBLIK_PRIBLIZAN', () => {
    const { s, z } = slika({ xfrmAtr: ' flipH="1"' });
    expect(s).not.toBeNull();
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('video -> sličica + OBJEKAT_PRESKOCEN ("video nije podržan, uvezena je sličica")', () => {
    const { s, z } = slika({ nvPr: '<a:videoFile r:link="rIdV"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media r:embed="rIdM"/></p:ext></p:extLst>' });
    expect(s!.medijId).toBe('pptx:ppt/media/image1.png');
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
    expect(z.upozorenja[0].poruka).toContain('video nije podržan, uvezena je sličica');
  });

  it('naziv najviše 60 znakova; prazan naziv -> null', () => {
    expect(slika({ ime: 'Ш'.repeat(61) }).s!.naziv).toBe('Ш'.repeat(60));
    expect(slika({ ime: '' }).s!.naziv).toBeNull();
  });

  it('senka slike iz spPr/effectLst/outerShdw', () => {
    const { s } = slika({ spPr: '<a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="5400000"><a:srgbClr val="000000"/></a:outerShdw></a:effectLst>' });
    expect(s!.senka).toEqual({ boja: '#000000', pomerajX: 0, pomerajY: 3, zamucenje: 3 });
  });

  it('slika nulte veličine -> null i OBJEKAT_PRESKOCEN', () => {
    const { s, z } = slika({ cy: 0 });
    expect(s).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('slika u ukrasu layouta: veza se čita iz dela layouta', () => {
    const { ctx, z } = kontekstZaTest({
      slajdovi: [{ spTree: '' }],
      layoutDodatak: pic({ rId: 'rIdLI' }),
      delovi: {
        ...MEDIJ,
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels': relsXml([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml'], ['rIdLI', 'image', '../media/image1.png']]),
      },
    });
    const el = Array.from(ctx.layout!.doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'pic'))[0];
    expect(pretvoriSliku(el, kutijaIzLanca([el])!, ctx, 'l7')!.medijId).toBe('pptx:ppt/media/image1.png');
    expect(z.upozorenja).toEqual([]);
  });
});

describe('pozadinaSlajda', () => {
  const pozadina = (o: Partial<OpcijeFabrike['slajdovi'][number]>, dodatno: Partial<OpcijeFabrike> = {}) => {
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: '', ...o }], ...dodatno });
    return { p: pozadinaSlajda(ctx), ctx, z };
  };
  const bgPr = (sadrzaj: string) => `<p:bg><p:bgPr>${sadrzaj}<a:effectLst/></p:bgPr></p:bg>`;

  it('pozadina slajda solidFill FFEECC -> #FFEECC', () => {
    expect(pozadina({ bg: bgPr('<a:solidFill><a:srgbClr val="FFEECC"/></a:solidFill>') }).p).toEqual({ boja: '#FFEECC', medijId: null });
  });

  it('bez p:bg na slajdu i layoutu -> bgRef mastera -> #FFFFFF', () => {
    expect(pozadina({}).p).toEqual({ boja: '#FFFFFF', medijId: null });
  });

  it('bgRef slajda -> boja deteta (phClr = ta boja)', () => {
    expect(pozadina({ bg: '<p:bg><p:bgRef idx="1003"><a:schemeClr val="accent1"/></p:bgRef></p:bg>' }).p.boja).toBe('#4472C4');
  });

  it('gradFill -> prvi gs + OBLIK_PRIBLIZAN', () => {
    const { p, z } = pozadina({ bg: bgPr('<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="203040"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst></a:gradFill>') });
    expect(p.boja).toBe('#203040');
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('blipFill -> medijId iz veze dela sa p:bg, boja #FFFFFF', () => {
    const { p, z } = pozadina({ bg: bgPr('<a:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>'), veze: [SLIKA] }, { delovi: MEDIJ });
    expect(p).toEqual({ boja: '#FFFFFF', medijId: 'pptx:ppt/media/image1.png' });
    expect([...z.mediji.keys()]).toEqual(['pptx:ppt/media/image1.png']);
  });

  it('blipFill bez dela -> #FFFFFF bez medija + OBJEKAT_PRESKOCEN', () => {
    const { p, z } = pozadina({ bg: bgPr('<a:blipFill><a:blip r:embed="rIdI"/></a:blipFill>'), veze: [SLIKA] });
    expect(p).toEqual({ boja: '#FFFFFF', medijId: null });
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('nigde p:bg -> bg1 preko mape boja', () => {
    const master = `${XML}<p:sldMaster ${NS_DEKL}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>`
      + '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>';
    const { p, ctx } = pozadina({}, { delovi: { 'ppt/slideMasters/slideMaster1.xml': master } });
    expect(ctx.master).not.toBeNull();
    expect(p).toEqual({ boja: '#000000', medijId: null });
  });

  it('pozadina layouta ima prednost nad masterom', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: '' }] });
    const cSld = ctx.layout!.doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'cSld')[0];
    const bg = new DOMParser().parseFromString(`<p:bg ${NS_DEKL}><p:bgPr><a:solidFill><a:srgbClr val="010203"/></a:solidFill></p:bgPr></p:bg>`, 'application/xml').documentElement;
    cSld.insertBefore(ctx.layout!.doc.importNode(bg, true), cSld.firstChild);
    expect(pozadinaSlajda(ctx as KontekstSlajda).boja).toBe('#010203');
  });
});
