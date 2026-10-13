import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import {
  kutijaIzLanca, lanacPlaceholdera, nadjiULayoutu, nadjiUMasteru, placeholderOblika, razresiBodyPr, razresiPPr, razresiRPr,
  stiloviNivoa, vrstaTeksta,
} from './nasledjivanje';
import { oblik, pasus, type OpcijeFabrike } from './pptx-fabrika.testing';
import { dete, NS, potomak } from './xml';

/** Izmišljen placeholder layouta (`p:sp`) sa datim `p:ph`, `lstStyle` i opcionim `xfrm`. */
const phLayouta = (id: number, ph: string, lstStyle: string, xfrm = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Izmišljen ${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr>`
  + `<p:txBody><a:bodyPr/><a:lstStyle>${lstStyle}</a:lstStyle><a:p/></p:txBody></p:sp>`;

/** Slajd iz Step 1: naslov bez xfrm-a (id 2), telo `idx="1"` (id 3), plus dodatni oblici. */
function kontekst(dodatak = '', o: Partial<OpcijeFabrike> = {}) {
  const spTree = oblik.placeholder(2, '<p:ph type="title"/>', pasus('Naslov'))
    + oblik.placeholder(3, '<p:ph idx="1"/>', pasus('Prvi') + pasus('Drugi', '<a:pPr lvl="1"/>'))
    + dodatak;
  return kontekstZaTest({ slajdovi: [{ spTree }], ...o }).ctx;
}

const prviPPr = (sp: Element) => potomak(sp, NS.a, 'pPr');
const prviRPr = (sp: Element) => potomak(sp, NS.a, 'rPr');
const xfrmKutija = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

describe('placeholderi', () => {
  it('placeholderOblika: tip bez atributa je obj; oblik bez p:ph -> null', () => {
    const ctx = kontekst(oblik.tekst(4, 0, 0, 12700, 12700, pasus('x')));
    expect(placeholderOblika(oblikSaId(ctx, 2))).toEqual({ tip: 'title', idx: null });
    expect(placeholderOblika(oblikSaId(ctx, 3))).toEqual({ tip: 'obj', idx: '1' });
    expect(placeholderOblika(oblikSaId(ctx, 4))).toBeNull();
  });

  it('naslovBezXfrmUzimaMaster: layout naslov nema xfrm -> kutija mastera', () => {
    const ctx = kontekst();
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 2), ctx);
    expect(lanac).toHaveLength(3);
    expect(kutijaIzLanca(lanac)).toEqual({ x: 838200, y: 365125, w: 10515600, h: 1325563, rot: 0 });
  });

  it('teloUzimaLayout: kutija layouta, ne mastera', () => {
    const ctx = kontekst();
    expect(kutijaIzLanca(lanacPlaceholdera(oblikSaId(ctx, 3), ctx))).toEqual({ x: 838200, y: 1905000, w: 10515600, h: 4000000, rot: 0 });
  });

  it('sopstveni xfrm ima prednost; rot u stepenima', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph type="title"/>', pasus('x'),
      '<a:xfrm rot="5400000"><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm>'));
    expect(kutijaIzLanca(lanacPlaceholdera(oblikSaId(ctx, 5), ctx))).toEqual({ x: 100, y: 200, w: 300, h: 400, rot: 90 });
  });

  it('idxImaPrednost: <p:ph type="body" idx="1"/> nalazi layout idx="1"', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph type="body" idx="1"/>', pasus('x')),
      { layoutDodatak: phLayouta(9, '<p:ph type="body" idx="13"/>', '', xfrmKutija(1, 2, 3, 4)) });
    const ph = placeholderOblika(oblikSaId(ctx, 5));
    expect(ph).toEqual({ tip: 'body', idx: '1' });
    const uLayoutu = nadjiULayoutu(ph!, ctx.layout!.doc);
    expect(uLayoutu && placeholderOblika(uLayoutu)).toEqual({ tip: 'obj', idx: '1' });
    expect(kutijaIzLanca(lanacPlaceholdera(oblikSaId(ctx, 5), ctx))).toEqual({ x: 838200, y: 1905000, w: 10515600, h: 4000000, rot: 0 });
    // Isti tip bi našao prvi obj/body (idx 1); idx 13 ima prednost.
    expect(kutijaIzLanca([nadjiULayoutu({ tip: 'body', idx: '13' }, ctx.layout!.doc)!])).toEqual({ x: 1, y: 2, w: 3, h: 4, rot: 0 });
  });

  it('isti tip: ctrTitle i title se poklapaju, obj i body takođe', () => {
    const ctx = kontekst();
    const layout = ctx.layout!.doc;
    expect(placeholderOblika(nadjiULayoutu({ tip: 'ctrTitle', idx: null }, layout)!)).toEqual({ tip: 'title', idx: null });
    expect(placeholderOblika(nadjiULayoutu({ tip: 'body', idx: null }, layout)!)).toEqual({ tip: 'obj', idx: '1' });
    expect(nadjiULayoutu({ tip: 'pic', idx: null }, layout)).toBeNull();
    expect(nadjiULayoutu({ tip: 'title', idx: null }, null)).toBeNull();
  });

  it('master po tipu: title/ctrTitle -> title; body, obj, subTitle -> body; sldNum -> sldNum', () => {
    const master = kontekst().master!.doc;
    const tip = (t: string) => placeholderOblika(nadjiUMasteru({ tip: t, idx: null }, master)!)?.tip;
    expect(tip('ctrTitle')).toBe('title');
    expect(tip('title')).toBe('title');
    expect(tip('obj')).toBe('body');
    expect(tip('body')).toBe('body');
    expect(tip('subTitle')).toBe('body');
    expect(tip('sldNum')).toBe('sldNum');
    expect(nadjiUMasteru({ tip: 'dt', idx: null }, master)).toBeNull();
    expect(nadjiUMasteru({ tip: 'title', idx: null }, null)).toBeNull();
  });

  it('nemaParaNigde: <p:ph idx="7"/> bez xfrm -> lanac samo oblik, kutijaIzLanca null', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph idx="7"/>', pasus('x')));
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 5), ctx);
    expect(lanac).toEqual([oblikSaId(ctx, 5)]);
    expect(kutijaIzLanca(lanac)).toBeNull();
  });

  it('oblik koji nije placeholder i slajd bez layouta: lanac je samo oblik', () => {
    const ctx = kontekst(oblik.tekst(4, 12700, 25400, 38100, 50800, pasus('x')));
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 4), ctx);
    expect(lanac).toEqual([oblikSaId(ctx, 4)]);
    expect(kutijaIzLanca(lanac)).toEqual({ x: 12700, y: 25400, w: 38100, h: 50800, rot: 0 });
    const bez = kontekstZaTest({ slajdovi: [{ spTree: oblik.placeholder(2, '<p:ph type="title"/>', pasus('x')), bezLayouta: true }] }).ctx;
    expect(lanacPlaceholdera(oblikSaId(bez, 2), bez)).toHaveLength(1);
  });

  it('kutijaIzLanca: p:xfrm okvira (graphicFrame) i grupa', () => {
    const okvir = new DOMParser().parseFromString(
      `<p:graphicFrame xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:xfrm><a:off x="1" y="2"/><a:ext cx="3" cy="4"/></p:xfrm></p:graphicFrame>`,
      'application/xml').documentElement;
    expect(kutijaIzLanca([okvir])).toEqual({ x: 1, y: 2, w: 3, h: 4, rot: 0 });
    const ctx = kontekst(oblik.grupa(6, [10, 20], [30, 40], [0, 0], [30, 40], ''));
    expect(kutijaIzLanca([oblikSaId(ctx, 6)])).toEqual({ x: 10, y: 20, w: 30, h: 40, rot: 0 });
  });

  it('vrstaTeksta', () => {
    expect(vrstaTeksta({ tip: 'title', idx: null })).toBe('naslov');
    expect(vrstaTeksta({ tip: 'ctrTitle', idx: null })).toBe('naslov');
    expect(vrstaTeksta({ tip: 'obj', idx: '1' })).toBe('telo');
    expect(vrstaTeksta({ tip: 'subTitle', idx: '1' })).toBe('telo');
    expect(vrstaTeksta(null)).toBe('ostalo');
  });
});

describe('lanac stilova teksta', () => {
  it('stilTela: veličina, font, uvlačenje, tab, prored, razmak i lista iz bodyStyle mastera', () => {
    const ctx = kontekst();
    const sp = oblikSaId(ctx, 3);
    const nivoi = stiloviNivoa(lanacPlaceholdera(sp, ctx), 'telo', ctx, 0);
    const r = razresiRPr(null, null, nivoi);
    expect(r.sz).toBe(2800);
    expect(r.latin).toBe('+mn-lt');
    expect(r.boja?.localName).toBe('solidFill');
    expect(r.bezBoje).toBe(false);
    const p = razresiPPr(null, nivoi);
    expect(p.marL).toBe(228600);
    expect(p.indent).toBe(-228600);
    expect(p.defTabSz).toBe(914400);
    expect(p.lnSpc).toEqual({ pct: 90000 });
    expect(p.spcBef).toEqual({ pts: 1000 });
    expect(p.spcAft).toBeNull();
    expect(p.algn).toBe('l'); // iz defaultTextStyle
    expect(p.bu).toEqual({ vrsta: 'znak', znak: '•', font: 'Arial', boja: null });
    expect(p.tabovi).toEqual([]);
  });

  it('drugi nivo tela (lvl="1") uzima lvl2pPr', () => {
    const ctx = kontekst();
    const nivoi = stiloviNivoa(lanacPlaceholdera(oblikSaId(ctx, 3), ctx), 'telo', ctx, 1);
    expect(razresiRPr(null, null, nivoi).sz).toBe(2400);
    expect(razresiPPr(null, nivoi).marL).toBe(685800);
  });

  it('naslov: titleStyle mastera (buNone, +mj-lt, 44 pt)', () => {
    const ctx = kontekst();
    const nivoi = stiloviNivoa(lanacPlaceholdera(oblikSaId(ctx, 2), ctx), 'naslov', ctx, 0);
    expect(razresiRPr(null, null, nivoi)).toMatchObject({ sz: 4400, latin: '+mj-lt' });
    expect(razresiPPr(null, nivoi)).toMatchObject({ algn: 'l', bu: { vrsta: 'nema' }, lnSpc: { pct: 90000 } });
  });

  it('stilOstalo: tekst-okvir -> 18 pt i defTabSz 457200 iz defaultTextStyle (ne 914400 iz otherStyle)', () => {
    const ctx = kontekst(oblik.tekst(4, 0, 0, 12700, 12700, pasus('x')));
    const sp = oblikSaId(ctx, 4);
    const nivoi = stiloviNivoa(lanacPlaceholdera(sp, ctx), 'ostalo', ctx, 0);
    expect(razresiRPr(null, null, nivoi).sz).toBe(1800);
    expect(razresiPPr(null, nivoi).defTabSz).toBe(457200);
    expect(razresiPPr(null, nivoi).bu).toEqual({ vrsta: 'nema' });
  });

  it('ostalo: lstStyle oblika je jači od defaultTextStyle', () => {
    const sp = oblik.tekst(4, 0, 0, 12700, 12700, pasus('x')).replace('<a:lstStyle/>',
      '<a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle>');
    const ctx = kontekst(sp);
    const nivoi = stiloviNivoa(lanacPlaceholdera(oblikSaId(ctx, 4), ctx), 'ostalo', ctx, 0);
    expect(nivoi).toHaveLength(2);
    expect(razresiRPr(null, null, nivoi)).toMatchObject({ sz: 1200, latin: '+mn-lt' });
    expect(razresiPPr(null, nivoi)).toMatchObject({ algn: 'r', defTabSz: 457200 });
  });

  it('pasusPrepisujeLanac: pPr algn="ctr" i rPr b="1" sz="3200"', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph idx="1"/>',
      pasus('x', '<a:pPr algn="ctr" marL="0" indent="0"><a:buNone/><a:defRPr i="1"/></a:pPr>', '<a:rPr lang="sr-Latn-RS" b="1" sz="3200"/>')));
    const sp = oblikSaId(ctx, 5);
    const nivoi = stiloviNivoa(lanacPlaceholdera(sp, ctx), 'telo', ctx, 0);
    const pPr = prviPPr(sp);
    const p = razresiPPr(pPr, nivoi);
    expect(p).toMatchObject({ algn: 'ctr', marL: 0, indent: 0, defTabSz: 914400, bu: { vrsta: 'nema' } });
    const r = razresiRPr(prviRPr(sp), dete(pPr!, NS.a, 'defRPr'), nivoi);
    expect(r).toMatchObject({ b: true, sz: 3200, i: true, latin: '+mn-lt' });
  });

  it('capIzLayouta: lstStyle placeholdera layouta sa cap="all"', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph type="body" sz="quarter" idx="10"/>', pasus('x')), {
      layoutDodatak: phLayouta(9, '<p:ph type="body" sz="quarter" idx="10"/>',
        '<a:lvl1pPr><a:defRPr cap="all"/></a:lvl1pPr>', xfrmKutija(1, 2, 3, 4)),
    });
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 5), ctx);
    expect(lanac).toHaveLength(3);
    const r = razresiRPr(null, null, stiloviNivoa(lanac, 'telo', ctx, 0));
    expect(r.cap).toBe('all');
    expect(r.sz).toBe(2800);
  });

  it('lstStyle redom: oblik, layout, master placeholder, pa bodyStyle i defaultTextStyle', () => {
    const ctx = kontekst(oblik.placeholder(5, '<p:ph type="body" idx="10"/>', pasus('x')).replace('<a:lstStyle/>',
      '<a:lstStyle><a:lvl1pPr><a:defRPr sz="1000"/></a:lvl1pPr></a:lstStyle>'), {
      layoutDodatak: phLayouta(9, '<p:ph type="body" idx="10"/>', '<a:lvl1pPr><a:defRPr sz="2000" b="1"/></a:lvl1pPr>'),
    });
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 5), ctx);
    const nivoi = stiloviNivoa(lanac, 'telo', ctx, 0);
    expect(nivoi.map((n) => n.parentElement?.localName)).toEqual(['lstStyle', 'lstStyle', 'bodyStyle', 'defaultTextStyle']);
    expect(razresiRPr(null, null, nivoi)).toMatchObject({ sz: 1000, b: true });
  });

  it('nivo bez lvlNpPr u stilu se preskače; nivo van 0..8 se ograničava', () => {
    const ctx = kontekst();
    const lanac = lanacPlaceholdera(oblikSaId(ctx, 3), ctx);
    expect(stiloviNivoa(lanac, 'telo', ctx, 2)).toEqual([]);
    expect(stiloviNivoa(lanac, 'telo', ctx, -3)).toEqual(stiloviNivoa(lanac, 'telo', ctx, 0));
  });
});

/** `a:pPr` / `a:rPr` iz XML niza (sa deklaracijom imenskog prostora `a`). */
function el(xml: string): Element {
  return new DOMParser().parseFromString(xml.replace(/^<a:(\w+)/, `<a:$1 xmlns:a="${NS.a}"`), 'application/xml').documentElement;
}

describe('razresiPPr', () => {
  it('podrazumevane vrednosti bez lanca', () => {
    expect(razresiPPr(null, [])).toEqual({
      algn: null, marL: 0, indent: 0, defTabSz: 457200, lnSpc: null, spcBef: null, spcAft: null, bu: { vrsta: 'nema' }, tabovi: [],
      velicinaZnaka: null,
    });
  });

  it('veličina znaka liste: buSzPct, buSzPts, buSzTx (kao tekst) prekida lanac', () => {
    const nivo = el('<a:lvl1pPr><a:buSzPct val="75000"/></a:lvl1pPr>');
    expect(razresiPPr(null, [nivo]).velicinaZnaka).toEqual({ pct: 75000 });
    expect(razresiPPr(el('<a:pPr><a:buSzPts val="1400"/></a:pPr>'), [nivo]).velicinaZnaka).toEqual({ pts: 1400 });
    expect(razresiPPr(el('<a:pPr><a:buSzTx/></a:pPr>'), [nivo]).velicinaZnaka).toBeNull();
  });

  it('buAutoNum sa startAt; buFont i buClr se traže nezavisno', () => {
    const nivo = el('<a:lvl1pPr><a:buClr><a:srgbClr val="FF0000"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="-"/></a:lvl1pPr>');
    const p = razresiPPr(el('<a:pPr><a:buAutoNum type="arabicPlain" startAt="3"/></a:pPr>'), [nivo]);
    expect(p.bu).toMatchObject({ vrsta: 'broj', sema: 'arabicPlain', pocetak: 3 });
    expect(p.bu.vrsta === 'broj' && p.bu.boja?.localName).toBe('buClr');
    const bezStart = razresiPPr(el('<a:pPr><a:buAutoNum type="romanUcPeriod"/></a:pPr>'), []);
    expect(bezStart.bu).toEqual({ vrsta: 'broj', sema: 'romanUcPeriod', pocetak: 1, boja: null });
  });

  it('buClrTx i buFontTx = kao tekst (null), i prekidaju traženje u lancu', () => {
    const nivo = el('<a:lvl1pPr><a:buClr><a:srgbClr val="FF0000"/></a:buClr><a:buFont typeface="Wingdings"/><a:buChar char="§"/></a:lvl1pPr>');
    const p = razresiPPr(el('<a:pPr><a:buClrTx/><a:buFontTx/></a:pPr>'), [nivo]);
    expect(p.bu).toEqual({ vrsta: 'znak', znak: '§', font: null, boja: null });
  });

  it('buNone u pasusu prekida listu iz lanca', () => {
    const nivo = el('<a:lvl1pPr><a:buChar char="•"/></a:lvl1pPr>');
    expect(razresiPPr(el('<a:pPr><a:buNone/></a:pPr>'), [nivo]).bu).toEqual({ vrsta: 'nema' });
  });

  it('lnSpc spcPts, spcAft spcPct, tabovi (pos, algn podrazumevano l)', () => {
    const p = razresiPPr(el('<a:pPr><a:lnSpc><a:spcPts val="2400"/></a:lnSpc><a:spcAft><a:spcPct val="50000"/></a:spcAft>'
      + '<a:tabLst><a:tab pos="914400"/><a:tab pos="1828800" algn="ctr"/></a:tabLst></a:pPr>'), []);
    expect(p.lnSpc).toEqual({ pts: 2400 });
    expect(p.spcAft).toEqual({ pct: 50000 });
    expect(p.tabovi).toEqual([{ poz: 914400, algn: 'l' }, { poz: 1828800, algn: 'ctr' }]);
  });

  it('tabovi iz lanca kad ih pasus nema', () => {
    const nivo = el('<a:lvl1pPr><a:tabLst><a:tab pos="457200" algn="r"/></a:tabLst></a:lvl1pPr>');
    expect(razresiPPr(el('<a:pPr algn="just"/>'), [nivo]).tabovi).toEqual([{ poz: 457200, algn: 'r' }]);
  });
});

describe('razresiRPr', () => {
  it('podrazumevane vrednosti bez lanca', () => {
    expect(razresiRPr(null, null, [])).toEqual({
      sz: null, b: false, i: false, u: false, strike: false, baseline: 0, cap: 'none', latin: null, boja: null, bezBoje: false, senka: null,
    });
  });

  it('u, strike, baseline, cap="small", b="0" prepisuje lanac', () => {
    const nivo = el('<a:lvl1pPr><a:defRPr b="1" u="sng" strike="sngStrike"/></a:lvl1pPr>');
    const r = razresiRPr(el('<a:rPr b="0" u="none" baseline="30000" cap="small"/>'), null, [nivo]);
    expect(r).toMatchObject({ b: false, u: false, strike: true, baseline: 30000, cap: 'small' });
    expect(razresiRPr(el('<a:rPr strike="noStrike" u="dbl"/>'), null, [nivo])).toMatchObject({ u: true, strike: false, b: true });
  });

  it('boja: prvi solidFill u lancu; gradFill -> prvi gs; noFill -> bezBoje', () => {
    const nivo = el('<a:lvl1pPr><a:defRPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></a:defRPr></a:lvl1pPr>');
    expect(razresiRPr(el('<a:rPr/>'), null, [nivo]).boja?.localName).toBe('solidFill');
    const grad = razresiRPr(el('<a:rPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst></a:gradFill></a:rPr>'), null, [nivo]);
    expect(grad.boja?.localName).toBe('gs');
    expect(grad.boja?.getAttribute('pos')).toBe('0');
    const bez = razresiRPr(el('<a:rPr><a:noFill/></a:rPr>'), null, [nivo]);
    expect(bez).toMatchObject({ boja: null, bezBoje: true });
  });

  it('latin i senka (effectLst/outerShdw); prazan effectLst prekida senku iz lanca', () => {
    const nivo = el('<a:lvl1pPr><a:defRPr><a:effectLst><a:outerShdw dist="38100" dir="2700000"/></a:effectLst><a:latin typeface="Georgia"/></a:defRPr></a:lvl1pPr>');
    const r = razresiRPr(null, el('<a:defRPr><a:latin typeface="Arial"/></a:defRPr>'), [nivo]);
    expect(r.latin).toBe('Arial');
    expect(r.senka?.localName).toBe('outerShdw');
    expect(razresiRPr(el('<a:rPr><a:effectLst/></a:rPr>'), null, [nivo]).senka).toBeNull();
  });
});

describe('razresiBodyPr', () => {
  it('bodyPrNasledjuje: slajd naslov bez atributa bodyPr -> anchor ctr iz mastera', () => {
    const ctx = kontekst();
    expect(razresiBodyPr(lanacPlaceholdera(oblikSaId(ctx, 2), ctx)).anchor).toBe('ctr');
    expect(razresiBodyPr(lanacPlaceholdera(oblikSaId(ctx, 3), ctx)).anchor).toBe('t');
  });

  it('podrazumevane vrednosti', () => {
    const ctx = kontekst(oblik.tekst(4, 0, 0, 12700, 12700, pasus('x'), undefined, '<a:bodyPr/>'));
    expect(razresiBodyPr(lanacPlaceholdera(oblikSaId(ctx, 4), ctx))).toEqual({
      lIns: 91440, tIns: 45720, rIns: 91440, bIns: 45720, anchor: 't', wrap: true, vert: 'horz', numCol: 1, fontScale: 100000, lnSpcReduction: 0,
    });
  });

  it('sopstveni atributi i normAutofit samo iz sopstvenog bodyPr', () => {
    const ctx = kontekst(oblik.tekst(4, 0, 0, 12700, 12700, pasus('x'), undefined,
      '<a:bodyPr wrap="none" lIns="0" vert="vert" numCol="2"><a:normAutofit fontScale="62500" lnSpcReduction="20000"/></a:bodyPr>'));
    expect(razresiBodyPr(lanacPlaceholdera(oblikSaId(ctx, 4), ctx))).toMatchObject({
      wrap: false, lIns: 0, vert: 'vert', numCol: 2, fontScale: 62500, lnSpcReduction: 20000, rIns: 91440,
    });
    const roditelj = kontekst(oblik.placeholder(5, '<p:ph type="body" idx="10"/>', pasus('x')), {
      layoutDodatak: phLayouta(9, '<p:ph type="body" idx="10"/>', '').replace('<a:bodyPr/>',
        '<a:bodyPr tIns="0"><a:normAutofit fontScale="50000"/></a:bodyPr>'),
    });
    const b = razresiBodyPr(lanacPlaceholdera(oblikSaId(roditelj, 5), roditelj));
    expect(b.tIns).toBe(0);
    expect(b.fontScale).toBe(100000);
  });
});
