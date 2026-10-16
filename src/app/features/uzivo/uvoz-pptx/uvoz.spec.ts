// Integracioni testovi uvoza: ceo `pretvoriPptx` nad sintetičkim PPTX-ovima iz fabrike (sve izmišljeno).
import { vi } from 'vitest';

import type { Animacija, CrtezSloj, FormulaSloj, OblikSloj, Platno, Sloj, SlikaSloj, TabelaSloj, TekstSloj } from '../data-access/platno.models';
import { FONTOVI_PLATNA } from '../ui/platno-fontovi';
import { proveriKaoServer } from './granice';
import type { KodUpozorenja } from './izvestaj';
import { kodirajPng } from './png';
import {
  napraviPptx, oblik, pasus, PNG_1X1, tabela, timing, type EfekatFabrike, type OpcijeFabrike, type SlajdFabrike, type VezaFabrike,
} from './pptx-fabrika.testing';
import { pretvoriPptx, type RezultatUvoza } from './uvoz';

const FONTOVI = new Set(FONTOVI_PLATNA.map((f) => f.naziv));
const BOJA = /^#[0-9A-F]{6}$/;

/**
 * Svaki slajd rezultata kao server (`proveriKaoServer`) i pravila iz spec-a 13: fontovi iz kataloga, boje `#RRGGBB`,
 * animacije ciljaju postojeći sloj i pasus, mediji slajda su u rezultatu. `uvezi` je zove za svaki fixture ovog fajla.
 */
function proveriKaoServerSve(r: RezultatUvoza): void {
  for (const s of r.slajdovi) {
    const p = s.cmd.platno!;
    expect(proveriKaoServer(p)).toBeNull();
    const boje: string[] = [];
    JSON.stringify(p, (_, v) => {
      if (typeof v === 'string' && v.startsWith('#')) boje.push(v);
      return v;
    });
    expect(boje.filter((b) => !BOJA.test(b))).toEqual([]);
    for (const sl of p.slojevi) {
      const pasusi = sl.tip === 'TEKST' ? sl.pasusi : sl.tip === 'TABELA' ? sl.celije.flat().flatMap((c) => c.pasusi) : [];
      for (const d of pasusi.flatMap((ps) => ps.delovi)) expect(FONTOVI.has(d.font)).toBe(true);
    }
    for (const a of p.animacije) {
      const cilj = p.slojevi.find((x) => x.id === a.slojId);
      expect(cilj).toBeDefined();
      const c = cilj!;
      if (a.pasus !== null) expect(c.tip === 'TEKST' && a.pasus < c.pasusi.length).toBe(true);
    }
    for (const m of s.mediji) expect(r.mediji.has(m)).toBe(true);
  }
}

async function uvezi(o: OpcijeFabrike): Promise<RezultatUvoza> {
  const r = await pretvoriPptx(napraviPptx(o), 'predavanje.pptx');
  proveriKaoServerSve(r);
  return r;
}
const jedan = (s: SlajdFabrike, o: Partial<OpcijeFabrike> = {}) => uvezi({ slajdovi: [s], ...o });
const platno = (r: RezultatUvoza, i = 0): Platno => r.slajdovi[i].cmd.platno!;
function sloj<T extends Sloj>(r: RezultatUvoza, id: string, i = 0): T {
  const s = platno(r, i).slojevi.find((x) => x.id === id);
  if (!s) throw new Error(`nema sloja ${id}: ${platno(r, i).slojevi.map((x) => x.id).join(', ')}`);
  return s as T;
}
const kodovi = (r: RezultatUvoza) => r.upozorenja.map((u) => u.kod);
const ima = (r: RezultatUvoza, kod: KodUpozorenja) => r.upozorenja.filter((u) => u.kod === kod);
const mesto = (s: Sloj) => [s.x, s.y, s.sirina, s.visina];
const anim = (a: Animacija) => `${a.slojId}${a.pasus === null ? '' : `#${a.pasus}`} ${a.efekat} ${a.okidac}`;
const fade = (spid: number, okidac: EfekatFabrike['okidac'] = 'clickEffect', o: Partial<EfekatFabrike> = {}): EfekatFabrike =>
  ({ spid, klasa: 'entr', preset: 10, filter: 'fade', okidac, ...o });

/** Tekst-okvir (EMU) sa jednim pasusom. */
const okvir = (id: number, x: number, y: number, t = 'Tekst', cx = 1270000, cy = 635000) => oblik.tekst(id, x, y, cx, cy, pasus(t));

// ---------------------------------------------------------------------------------------------- crtež i formula

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const xfrmUnutra = (x: number, y: number, cx: number, cy: number) => `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>`;
/** Crtež rukom kao što ga PowerPoint piše: Choice sa `p:contentPart`, Fallback sa `p:pic` (id 4). */
const crtezAc = `<mc:AlternateContent><mc:Choice Requires="p14"><p:contentPart p14:bwMode="auto" r:id="rIdK">`
  + '<p14:nvContentPartPr><p14:cNvPr id="4" name="Rukopis 4"/><p14:cNvContentPartPr/><p14:nvPr/></p14:nvContentPartPr>'
  + `<p14:xfrm>${xfrmUnutra(914400, 914400, 1270000, 635000)}</p14:xfrm></p:contentPart></mc:Choice>`
  + '<mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="4" name="Rukopis 4"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
  + '<p:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
  + `<p:spPr><a:xfrm>${xfrmUnutra(901700, 901700, 1295400, 660400)}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  + '</mc:Fallback></mc:AlternateContent>';
const INK = `${XML}<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML"><inkml:definitions><inkml:context xml:id="ctx0">`
  + '<inkml:inkSource xml:id="inkSrc0"><inkml:traceFormat><inkml:channel name="X" type="integer" units="cm"/>'
  + '<inkml:channel name="Y" type="integer" units="cm"/></inkml:traceFormat><inkml:channelProperties>'
  + '<inkml:channelProperty channel="X" name="resolution" value="1000" units="1/cm"/>'
  + '<inkml:channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/></inkml:channelProperties></inkml:inkSource>'
  + '</inkml:context><inkml:brush xml:id="br0"><inkml:brushProperty name="width" value="0.1" units="cm"/>'
  + '<inkml:brushProperty name="color" value="#FF0000"/></inkml:brush></inkml:definitions>'
  + '<inkml:trace contextRef="#ctx0" brushRef="#br0">0 0, 3528 1764</inkml:trace></inkml:ink>';
const VEZE_CRTEZA: VezaFabrike[] = [{ id: 'rIdI', tip: 'image', cilj: '../media/image1.png' }, { id: 'rIdK', tip: 'customXml', cilj: '../ink/ink1.xml' }];

const SLIKA_FORMULE: VezaFabrike = { id: 'rIdF', tip: 'image', cilj: '../media/formula1.png' };
const mr = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
const razlomak = `<m:f><m:num>${mr('a')}</m:num><m:den>${mr('b')}</m:den></m:f>`;
const mp = (omml: string) => `<a:p><a14:m><m:oMathPara><m:oMath>${omml}</m:oMath></m:oMathPara></a14:m></a:p>`;
/** Formula (`p:sp` id `id` u Choice, fallback `p:sp` sa slikom `rIdF`) u kutiji 100,50 200 x 100. */
function formulaAc(id: number | string, pasusi: string): string {
  const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="Formula ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
  const k = `<a:xfrm>${xfrmUnutra(1270000, 635000, 2540000, 1270000)}</a:xfrm>`;
  return `<mc:AlternateContent><mc:Choice Requires="a14"><p:sp>${nv}<p:spPr>${k}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${pasusi}</p:txBody></p:sp></mc:Choice>`
    + `<mc:Fallback><p:sp>${nv}<p:spPr>${k}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + '<a:blipFill><a:blip r:embed="rIdF"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:spPr></p:sp></mc:Fallback></mc:AlternateContent>';
}
/** PNG 4 x 30 sa crnim redovima mastila na datim opsezima redova (providna pozadina). */
function slikaFormule(nizovi: [number, number][], visina = 30): Uint8Array {
  const piksli = new Uint8Array(4 * visina * 4);
  for (let y = 0; y < visina; y++) {
    const mastilo = nizovi.some(([a, b]) => y >= a && y < b);
    for (let x = 0; x < 4; x++) piksli.set(mastilo ? [0, 0, 0, 255] : [0, 0, 0, 0], (y * 4 + x) * 4);
  }
  return kodirajPng({ sirina: 4, visina, piksli });
}

// ---------------------------------------------------------------------------------------------- slučajevi spec-a 13

describe('pretvoriPptx: nasleđivanje i boje', () => {
  it('nasledjivanjeIzLayouta: naslov bez xfrm iz mastera, telo (idx 1) u kutiji layouta', async () => {
    const r = await jedan({
      spTree: oblik.placeholder(2, '<p:ph type="title"/>', pasus('Naslov'))
        + oblik.placeholder(3, '<p:ph idx="1"/>', pasus('Prvi') + pasus('Drugi')),
    });
    expect(r.greske).toEqual([]);
    const naslov = sloj<TekstSloj>(r, 's2');
    expect(naslov.tip).toBe('TEKST');
    expect(mesto(naslov)).toEqual([66, 28.75, 828, 104.38]);
    expect(naslov.pasusi[0].delovi[0]).toMatchObject({ tekst: 'Naslov', font: 'Carlito', velicina: 44 });
    const telo = sloj<TekstSloj>(r, 's3');
    expect([telo.x, telo.y]).toEqual([66, 150]);
    expect(telo.pasusi).toHaveLength(2);
    expect(telo.pasusi[0].lista).toMatchObject({ vrsta: 'ZNAK', znak: '•' });
    expect(telo.pasusi[1].delovi[0]).toMatchObject({ tekst: 'Drugi', velicina: 28 });
  });

  it('bojeSeme: accent2 lumMod 75% i clrMapOvr (tx1 = lt1, bg1 = dk1)', async () => {
    const rPr = '<a:rPr lang="sr-Latn-RS"><a:solidFill><a:schemeClr val="accent2"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr>';
    const preokrenuto = '<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" '
      + 'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>';
    const r = await uvezi({
      slajdovi: [
        { spTree: oblik.tekst(5, 0, 0, 2540000, 635000, pasus('Narandžasto', '', rPr)) },
        { spTree: okvir(5, 0, 0, 'Belo'), clrMapOvr: preokrenuto },
      ],
    });
    expect(sloj<TekstSloj>(r, 's5').pasusi[0].delovi[0].boja).toBe('#C55A11');
    expect(sloj<TekstSloj>(r, 's5', 1).pasusi[0].delovi[0].boja).toBe('#FFFFFF');
    expect(platno(r, 1).pozadina).toEqual({ boja: '#000000', medijId: null });
    expect(platno(r, 0).pozadina).toEqual({ boja: '#FFFFFF', medijId: null });
  });
});

describe('pretvoriPptx: tabele, crteži, formule', () => {
  it('tabelaSaSpajanjem: 3 x 3 sa gridSpan, rowSpan, hMerge i vMerge', async () => {
    const K = 914400;
    const R = 381000;
    const r = await jedan({
      spTree: oblik.tabela(7, K, K, [K, K, K], [
        tabela.red(R, [tabela.celija('A', 'gridSpan="2"'), tabela.celija('', 'hMerge="1"'), tabela.celija('C', 'rowSpan="2"')]),
        tabela.red(R, [tabela.celija('D'), tabela.celija('E'), tabela.celija('', 'vMerge="1"')]),
        tabela.red(R, [tabela.celija('F'), tabela.celija('G', 'rowSpan="1"'), tabela.celija('H')]),
      ]),
    });
    const t = sloj<TabelaSloj>(r, 's7');
    expect(t.tip).toBe('TABELA');
    expect([t.x, t.y, t.kolone, t.redovi]).toEqual([72, 72, [72, 72, 72], [30, 30, 30]]);
    const spoj = t.celije.map((red) => red.map((c) => (c.pokrivena ? 'P' : `${c.spojDesno}${c.spojDole}`)));
    expect(spoj).toEqual([['10', 'P', '01'], ['00', '00', 'P'], ['00', '00', '00']]);
    expect(t.celije[0][0].pasusi[0].delovi[0].tekst).toBe('A');
    expect(t.celije[0][2].pasusi[0].delovi[0].tekst).toBe('C');
  });

  it('crtezSaSlikomIInkml: CRTEZ sa potezima, fallback slika je medij', async () => {
    const r = await jedan(
      { spTree: crtezAc, veze: VEZE_CRTEZA },
      { delovi: { 'ppt/media/image1.png': PNG_1X1, 'ppt/ink/ink1.xml': INK } },
    );
    const c = sloj<CrtezSloj>(r, 's4');
    expect(c.tip).toBe('CRTEZ');
    expect(c.medijId).toBe('pptx:ppt/media/image1.png');
    expect(c.potezi).toHaveLength(1);
    expect(c.potezi![0].boja).toBe('#FF0000');
    expect(r.slajdovi[0].mediji).toEqual(['pptx:ppt/media/image1.png']);
    expect([...r.mediji.keys()]).toEqual(['pptx:ppt/media/image1.png']);
    expect(r.mediji.get('pptx:ppt/media/image1.png')!.bajtovi()).toEqual(PNG_1X1);
    expect(kodovi(r)).toEqual([]);
  });

  it('formula: jedan okvir -> FORMULA sa latex i slikaIzvora', async () => {
    const r = await jedan({ spTree: formulaAc(5, mp(razlomak)), veze: [SLIKA_FORMULE] }, { delovi: { 'ppt/media/formula1.png': PNG_1X1 } });
    const f = sloj<FormulaSloj>(r, 's5');
    expect(f).toMatchObject({ tip: 'FORMULA', latex: '\\frac{a}{b}', slikaIzvora: 'pptx:ppt/media/formula1.png', x: 100, y: 50 });
    expect(r.slajdovi[0].mediji).toEqual(['pptx:ppt/media/formula1.png']);
    expect(r.slajdovi[0].statistika.slojevi.FORMULA).toBe(1);
  });

  it('formula sa animacijom po pasusu: rasklopljeni slojevi (isečci gen:) i animacije na njima', async () => {
    const r = await jedan(
      {
        spTree: formulaAc(5, mp(mr('x')) + mp(mr('y'))), veze: [SLIKA_FORMULE],
        timing: timing([fade(5, 'clickEffect', { pasus: 0 }), fade(5, 'clickEffect', { pasus: 1 })]),
      },
      { delovi: { 'ppt/media/formula1.png': slikaFormule([[2, 8], [16, 22]]) } },
    );
    const p = platno(r);
    expect(p.slojevi.map((s) => s.id)).toEqual(['s5p0', 's5p1']);
    expect(p.slojevi.map((s) => (s as FormulaSloj).slikaIzvora)).toEqual(['gen:1', 'gen:2']);
    expect(p.animacije.map(anim)).toEqual(['s5p0 FADE KLIK', 's5p1 FADE KLIK']);
    expect(r.slajdovi[0].mediji).toEqual(['gen:1', 'gen:2']);
    expect([...r.mediji.keys()]).toEqual(['gen:1', 'gen:2']);   // original se ne šalje
    expect(r.slajdovi[0].statistika).toMatchObject({ koraci: 2, klikoviPptx: 2, efekataPptx: 2 });
  });

  it('id duži od 12 znakova -> x<n>, i u pasusUSloj (animacije prate novo ime)', async () => {
    const r = await jedan(
      {
        spTree: formulaAc(1234567890, mp(mr('x')) + mp(mr('y'))), veze: [SLIKA_FORMULE],
        timing: timing([fade(1234567890, 'clickEffect', { pasus: 1 }), fade(1234567890, 'clickEffect', { pasus: 0 })]),
      },
      { delovi: { 'ppt/media/formula1.png': slikaFormule([[2, 8], [16, 22]]) } },
    );
    const p = platno(r);
    expect(p.slojevi.map((s) => s.id)).toEqual(['x1', 'x2']);
    expect(p.animacije.map(anim)).toEqual(['x2 FADE KLIK', 'x1 FADE KLIK']);
  });

  it('tabela sa formulom u ćeliji (mc:AlternateContent oko graphicFrame): TABELA iz Fallback-a + FORMULA ćelije', async () => {
    const K = 914400;
    const R = 381000;
    const blip = '<a:tcPr><a:blipFill><a:blip r:embed="rIdF"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></a:tcPr>';
    const formulaCelija = `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${mp(razlomak)}</a:txBody><a:tcPr/></a:tc>`;
    const tbl = (c11: string) => oblik.tabela(6, K, K, [K, K], [
      tabela.red(R, [tabela.celija('a'), tabela.celija('b')]),
      tabela.red(R, [tabela.celija('c'), c11]),
    ]);
    const r = await jedan(
      {
        spTree: `<mc:AlternateContent><mc:Choice Requires="a14">${tbl(formulaCelija)}</mc:Choice>`
          + `<mc:Fallback>${tbl(tabela.celija('', '', blip))}</mc:Fallback></mc:AlternateContent>`,
        veze: [SLIKA_FORMULE], timing: timing([fade(6)]),
      },
      { delovi: { 'ppt/media/formula1.png': PNG_1X1 } },
    );
    const p = platno(r);
    expect(p.slojevi.map((s) => `${s.id} ${s.tip}`)).toEqual(['s6 TABELA', 's6c1x1 FORMULA']);
    expect(mesto(sloj(r, 's6c1x1'))).toEqual([144, 102, 72, 30]);
    expect(p.animacije.map(anim)).toEqual(['s6 FADE KLIK', 's6c1x1 FADE SA_PRETHODNIM']);
  });
});

describe('pretvoriPptx: grupe i animacije', () => {
  const grupa = oblik.grupa(10, [914400, 914400], [1828800, 914400], [0, 0], [3657600, 1828800],
    okvir(11, 0, 0, 'Levo', 1828800, 914400) + okvir(12, 1828800, 914400, 'Desno', 1828800, 914400));

  it('grupaSaAnimacijom: kutije dece kroz grupu, animacija grupe -> kopija po detetu, animacija deteta -> samo njegov sloj', async () => {
    const r = await jedan({ spTree: grupa, timing: timing([fade(10), fade(12)]) });
    expect(mesto(sloj(r, 's11'))).toEqual([72, 72, 72, 36]);
    expect(mesto(sloj(r, 's12'))).toEqual([144, 108, 72, 36]);
    expect(platno(r).animacije.map(anim)).toEqual(['s11 FADE KLIK', 's12 FADE SA_PRETHODNIM', 's12 FADE KLIK']);
    expect(r.slajdovi[0].statistika).toMatchObject({ koraci: 2, klikoviPptx: 2, efekataPptx: 2 });
  });

  it('font se ne skalira grupom', async () => {
    const r = await jedan({ spTree: grupa });
    expect(sloj<TekstSloj>(r, 's11').pasusi[0].delovi[0].velicina).toBe(18);
  });

  it('rotacija grupe okreće centar deteta oko centra grupe i dodaje se rotaciji deteta', async () => {
    const r = await jedan({
      spTree: '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="20" name="Grupa"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>'
        + '<a:xfrm rot="5400000"><a:off x="0" y="1270000"/><a:ext cx="2540000" cy="1270000"/><a:chOff x="0" y="0"/><a:chExt cx="2540000" cy="1270000"/></a:xfrm>'
        + `</p:grpSpPr>${okvir(21, 0, 0, 'A', 1270000, 1270000)}</p:grpSp>`,
    });
    // centar grupe (100, 150), centar deteta (50, 150) -> za 90° u smeru kazaljke (100, 100)
    const s = sloj(r, 's21');
    expect([...mesto(s), s.rotacija]).toEqual([50, 50, 100, 100, 90]);
  });

  it('preslikana grupa -> OBLIK_PRIBLIZAN', async () => {
    const r = await jedan({ spTree: grupa.replace('<a:xfrm>', '<a:xfrm flipH="1">') });
    expect(ima(r, 'OBLIK_PRIBLIZAN')).toHaveLength(1);
    expect(platno(r).slojevi).toHaveLength(2);
  });

  it('grpFill deteta uzima popunu grupe (i ugnežđene grupe bez sopstvene popune)', async () => {
    const dete = (id: number) => oblik.geometrija(id, 'ellipse', 0, 0, 914400, 914400, '<a:grpFill/>');
    const unutrasnja = oblik.grupa(31, [0, 0], [914400, 914400], [0, 0], [914400, 914400], dete(32)).replace('<p:grpSpPr>', '<p:grpSpPr><a:grpFill/>');
    const spolja = oblik.grupa(30, [0, 0], [1828800, 914400], [0, 0], [1828800, 914400], dete(33) + unutrasnja)
      .replace(/(<p:grpSpPr><a:xfrm>.*?<\/a:xfrm>)/, '$1<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>');
    const r = await jedan({ spTree: spolja + dete(34) });
    expect(sloj<OblikSloj>(r, 's33').popuna).toBe('#00FF00');
    expect(sloj<OblikSloj>(r, 's32').popuna).toBe('#00FF00');
    expect(sloj<OblikSloj>(r, 's34').popuna).toBeNull();
  });

  it('nepoznatEfekat: preset 6 -> FADE + EFEKAT_ZAMENJEN; putanja -> preskočena + ANIMACIJA_PRESKOCENA', async () => {
    const r = await jedan({
      spTree: okvir(5, 0, 0) + okvir(6, 0, 1270000),
      timing: timing([
        { spid: 5, klasa: 'entr', preset: 6, filter: 'circle(in)', okidac: 'clickEffect' },
        { spid: 6, klasa: 'path', preset: 42, okidac: 'clickEffect' },
      ]),
    });
    expect(platno(r).animacije.map(anim)).toEqual(['s5 FADE KLIK']);
    expect(ima(r, 'EFEKAT_ZAMENJEN')).toHaveLength(1);
    expect(ima(r, 'ANIMACIJA_PRESKOCENA')).toHaveLength(1);
    expect(r.slajdovi[0].statistika).toMatchObject({ efekataPptx: 2, klikoviPptx: 2, koraci: 1 });
    expect(r.slajdovi[0].statistika.animacije.FADE).toBe(1);
  });

  it('oblik sa tekstom: OBLIK s<id> + TEKST s<id>t; animacija pasusa ide na TEKST, cela na oba', async () => {
    const tx = `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/>${pasus('Jedan')}${pasus('Dva')}</p:txBody>`;
    const stil = '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>'
      + '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>';
    const r = await jedan({
      spTree: oblik.geometrija(5, 'ellipse', 0, 0, 2540000, 1270000, '', `${stil}${tx}`),
      timing: timing([fade(5), fade(5, 'clickEffect', { pasus: 1 })]),
    });
    const p = platno(r);
    expect(p.slojevi.map((s) => `${s.id} ${s.tip}`)).toEqual(['s5 OBLIK', 's5t TEKST']);
    expect(sloj<OblikSloj>(r, 's5')).toMatchObject({ oblik: 'ELIPSA', popuna: '#4472C4' });
    const t = sloj<TekstSloj>(r, 's5t');
    expect(t).toMatchObject({ popuna: null, ivica: null });
    expect(t.pasusi[0].delovi[0].boja).toBe('#FFFFFF');   // fontRef stila oblika (lt1)
    expect(p.animacije.map(anim)).toEqual(['s5 FADE KLIK', 's5t FADE SA_PRETHODNIM', 's5t#1 FADE KLIK']);
  });

  it('pravougaonik sa tekstom je jedan TEKST sa popunom i ivicom; prazan pravougaonik je OBLIK; prazan nevidljiv nije ništa', async () => {
    const popuna = '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:ln>';
    const tx = `<p:txBody><a:bodyPr/><a:lstStyle/>${pasus('U okviru')}</p:txBody>`;
    const r = await jedan({
      spTree: oblik.geometrija(5, 'rect', 0, 0, 1270000, 635000, popuna, tx)
        + oblik.geometrija(6, 'rect', 0, 635000, 1270000, 635000, popuna)
        + oblik.geometrija(7, 'rect', 0, 1270000, 1270000, 635000, '<a:noFill/>', '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>'),
    });
    expect(platno(r).slojevi.map((s) => `${s.id} ${s.tip}`)).toEqual(['s5 TEKST', 's6 OBLIK']);
    expect(sloj<TekstSloj>(r, 's5')).toMatchObject({ popuna: '#FF0000', ivica: { boja: '#0000FF', debljina: 1, crtica: 'PUNA' } });
    expect(sloj<OblikSloj>(r, 's6')).toMatchObject({ oblik: 'PRAVOUGAONIK', popuna: '#FF0000' });
  });

  it('placeholder bez sopstvene popune i linije ih nasleđuje iz layouta; sopstvena popuna je jača; prazan placeholder se ne prikazuje', async () => {
    const LAYOUT_PH = '<p:sp><p:nvSpPr><p:cNvPr id="9" name="Okvir"/><p:cNvSpPr/><p:nvPr><p:ph idx="5"/></p:nvPr></p:nvSpPr><p:spPr>'
      + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></a:xfrm><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill>'
      + '<a:ln w="25400"><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>';
    const r = await uvezi({
      slajdovi: [
        { spTree: oblik.placeholder(5, '<p:ph idx="5"/>', pasus('U okviru')) },
        { spTree: oblik.placeholder(5, '<p:ph idx="5"/>', pasus('Svoja'), '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>') },
        { spTree: oblik.placeholder(5, '<p:ph idx="5"/>', '<a:p><a:endParaRPr/></a:p>') + okvir(6, 0, 0) },
      ],
      layoutDodatak: LAYOUT_PH,
    });
    expect(sloj<TekstSloj>(r, 's5')).toMatchObject({ x: 0, y: 0, popuna: '#FFFF00', ivica: { boja: '#00FF00', debljina: 2, crtica: 'PUNA' } });
    expect(sloj<TekstSloj>(r, 's5', 1)).toMatchObject({ popuna: '#FF0000', ivica: { boja: '#00FF00' } });
    expect(platno(r, 2).slojevi.map((s) => s.id)).toEqual(['s6']);
  });

  it('nepodržana geometrija: samo tekst + OBJEKAT_PRESKOCEN', async () => {
    const tx = `<p:txBody><a:bodyPr/><a:lstStyle/>${pasus('Oblačić')}</p:txBody>`;
    const r = await jedan({ spTree: oblik.geometrija(5, 'wedgeRectCallout', 0, 0, 1270000, 635000, '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>', tx) });
    expect(platno(r).slojevi.map((s) => `${s.id} ${s.tip}`)).toEqual(['s5 TEKST']);
    expect(sloj<TekstSloj>(r, 's5').popuna).toBeNull();
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toHaveLength(1);
  });
});

describe('pretvoriPptx: beleške, format, skriveni slajdovi, ukrasi', () => {
  it('beleske: tekst beleški u cmd.beleske, statistika.beleske 1', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0), beleske: pasus('Reci ovo') + pasus('i ovo') });
    expect(r.slajdovi[0].cmd).toMatchObject({
      tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske: 'Reci ovo\ni ovo', postepeno: false, pitanje: null,
    });
    expect(r.slajdovi[0].statistika.beleske).toBe(1);
  });

  it('slajd4x3: sadržaj centriran (ox = 120), FORMAT_SLAJDA jednom za ceo fajl', async () => {
    const r = await uvezi({ slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }], velicina: { cx: 9144000, cy: 6858000 } });
    expect([sloj(r, 's5').x, sloj(r, 's5').y]).toEqual([120, 0]);
    expect(ima(r, 'FORMAT_SLAJDA')).toEqual([expect.objectContaining({ slajd: null })]);
  });

  it('16:9 nema FORMAT_SLAJDA', async () => {
    const r = await uvezi({ slajdovi: [{ spTree: okvir(5, 0, 0) }] });
    expect(ima(r, 'FORMAT_SLAJDA')).toEqual([]);
  });

  it('prelaz slajda: p:transition -> cmd.prelaz po slajdu; podržan efekat bez PRELAZ_SLAJDA, slajd bez prelaza -> null', async () => {
    const r = await uvezi({ slajdovi: [
      { spTree: okvir(5, 0, 0), prelaz: '<p:transition spd="med"><p:push dir="u"/></p:transition>' },
      { spTree: okvir(5, 0, 0) },
    ] });
    expect(r.slajdovi.map((s) => s.cmd.prelaz)).toEqual([{ efekat: 'GURANJE', smer: 'DOLE', trajanjeMs: 750 }, null]);
    expect(ima(r, 'PRELAZ_SLAJDA')).toEqual([]);
    expect(r.upozorenja.map((u) => u.poruka)).not.toContain('Prelazi između slajdova se ne prenose.');
  });

  it('prelaz slajda: nepodržan efekat -> FADE i PRELAZ_SLAJDA sa brojem tog slajda; mc:AlternateContent se čita', async () => {
    const r = await uvezi({ slajdovi: [
      { spTree: okvir(5, 0, 0), prelaz: '<p:transition><p:fade/></p:transition>' },
      { spTree: okvir(5, 0, 0), prelaz: '<p:transition><p14:vortex/></p:transition>' },
      { spTree: okvir(5, 0, 0), prelaz: '<mc:AlternateContent><mc:Choice Requires="p14"><p:transition p14:dur="1600"><p:wipe dir="r"/>'
        + '</p:transition></mc:Choice><mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>' },
    ] });
    expect(r.slajdovi.map((s) => s.cmd.prelaz)).toEqual([
      { efekat: 'FADE', smer: null, trajanjeMs: 500 },
      { efekat: 'FADE', smer: null, trajanjeMs: 500 },
      { efekat: 'BRISANJE', smer: 'LEVO', trajanjeMs: 1600 },
    ]);
    expect(ima(r, 'PRELAZ_SLAJDA')).toEqual([expect.objectContaining({ slajd: 2, poruka: expect.stringContaining('vortex') })]);
  });

  it('skrivenSlajd: nije u slajdovi, SKRIVEN_SLAJD, ukupnoSlajdova 2', async () => {
    const r = await uvezi({ slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0), skriven: true }] });
    expect(r.ukupnoSlajdova).toBe(2);
    expect(r.slajdovi.map((s) => s.indeks)).toEqual([1]);
    expect(ima(r, 'SKRIVEN_SLAJD')).toEqual([expect.objectContaining({ slajd: 2 })]);
    expect(r.imeFajla).toBe('predavanje.pptx');
  });

  const UKRAS = oblik.geometrija(20, 'rect', 0, 0, 1270000, 635000, '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');

  it('ukrasMastera: ukras mastera je prvi sloj (m<id>), pa ukras layouta (l<id>), pa slajd', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0) }, { masterDodatak: UKRAS, layoutDodatak: UKRAS.replace('id="20"', 'id="21"') });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['m20', 'l21', 's5']);
    expect(sloj<OblikSloj>(r, 'm20')).toMatchObject({ tip: 'OBLIK', popuna: '#FF0000' });
  });

  it('showMasterSp="0" na slajdu gasi ukrase mastera i layouta; na layoutu gasi samo master', async () => {
    const naSlajdu = await jedan({ spTree: okvir(5, 0, 0), showMasterSp: false }, { masterDodatak: UKRAS, layoutDodatak: UKRAS.replace('id="20"', 'id="21"') });
    expect(platno(naSlajdu).slojevi.map((s) => s.id)).toEqual(['s5']);
    const naLayoutu = await jedan({ spTree: okvir(5, 0, 0) }, { masterDodatak: UKRAS, layoutDodatak: UKRAS.replace('id="20"', 'id="21"'), layoutShowMasterSp: false });
    expect(platno(naLayoutu).slojevi.map((s) => s.id)).toEqual(['l21', 's5']);
  });

  it('placeholderi datuma, podnožja i broja slajda se ne uvoze', async () => {
    const r = await jedan({
      spTree: okvir(5, 0, 0) + oblik.placeholder(6, '<p:ph type="sldNum" sz="quarter" idx="12"/>', pasus('7'))
        + oblik.placeholder(7, '<p:ph type="dt"/>', pasus('1.1.'), '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>'),
    });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(kodovi(r)).toEqual([]);
  });
});

describe('pretvoriPptx: neispravni delovi (Review Focus 1)', () => {
  it('slajdBezLayouta: slajd uvezen uz TEKST_PRIBLIZAN', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0), bezLayouta: true });
    expect(r.greske).toEqual([]);
    expect(sloj<TekstSloj>(r, 's5').pasusi[0].delovi[0].tekst).toBe('Tekst');
    expect(ima(r, 'TEKST_PRIBLIZAN')).toEqual([expect.objectContaining({ slajd: 1 })]);
  });

  it('slikaBezDela: slika preskočena (OBJEKAT_PRESKOCEN), ostatak slajda uvezen', async () => {
    const r = await jedan({
      spTree: oblik.slika(4, 'rIdX', 0, 0, 1270000, 1270000) + okvir(5, 0, 1270000),
      veze: [{ id: 'rIdX', tip: 'image', cilj: '../media/nema.png' }],
    });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toHaveLength(1);
    expect(r.mediji.size).toBe(0);
  });

  it('slika koju pregledač ne dekodira (SVG) se preskače pri pretvaranju: slajd uvezen, medij se ne šalje', async () => {
    const r = await uvezi({
      slajdovi: [{ spTree: oblik.slika(4, 'rIdX', 0, 0, 1270000, 1270000) + okvir(5, 0, 1270000), veze: [{ id: 'rIdX', tip: 'image', cilj: '../media/image1.svg' }] },
        { spTree: okvir(5, 0, 0) }],
      delovi: { 'ppt/media/image1.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' },
    });
    expect(r.greske).toEqual([]);
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toEqual([expect.objectContaining({ slajd: 1, poruka: "Slika 'Slika 4' nije uvezena: format slike nije podržan." })]);
    expect(r.mediji.size).toBe(0);
  });

  it('beleskeBezDela: beleske null, bez greške', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0), beleske: pasus('x') }, { bezDelova: ['ppt/notesSlides/notesSlide1.xml'] });
    expect(r.greske).toEqual([]);
    expect(r.slajdovi[0].cmd.beleske).toBeNull();
    expect(r.slajdovi[0].statistika.beleske).toBe(0);
  });

  it('slajd bez dela i slajd sa neispravnim XML-om: greška tog slajda, ostali se uvoze', async () => {
    const r = await uvezi({
      slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }],
      bezDelova: ['ppt/slides/slide2.xml'], delovi: { 'ppt/slides/slide3.xml': '<p:sld xmlns:p="x"><nije zatvoren' },
    });
    expect(r.ukupnoSlajdova).toBe(3);
    expect(r.slajdovi.map((s) => s.indeks)).toEqual([1]);
    expect(r.greske.map((g) => g.slajd)).toEqual([2, 3]);
    expect(r.greske.every((g) => g.poruka.startsWith('Slajd nije pročitan: '))).toBe(true);
  });

  it('neočekivan izuzetak (npr. prekoračen stek) -> opšta srpska poruka, bez sirove poruke JS-a; ostali slajdovi se uvoze', async () => {
    // Pravi prekoračen stek traži grupe ugnežđene ~2000 puta, a jsdom takav XML parsira desetinama sekundi: izuzetak se
    // ubacuje na prvom efektu animacije (samo slajd 1 ima `p:timing`).
    const izvorno = Element.prototype.hasAttribute;
    const spijun = vi.spyOn(Element.prototype, 'hasAttribute').mockImplementation(function (this: Element, ime: string) {
      if (ime === 'presetClass') throw new RangeError('Maximum call stack size exceeded');
      return izvorno.call(this, ime);
    });
    try {
      const r = await uvezi({ slajdovi: [{ spTree: okvir(5, 0, 0), timing: timing([fade(5)]) }, { spTree: okvir(5, 0, 0) }] });
      expect(r.greske).toEqual([{ slajd: 1, poruka: 'Slajd nije pročitan (neočekivana struktura fajla).' }]);
      expect(r.slajdovi.map((s) => s.indeks)).toEqual([2]);
    } finally {
      spijun.mockRestore();
    }
  });

  it('slajd bez dela: poruka ostaje konkretna (deo slajda ne postoji u fajlu)', async () => {
    const r = await uvezi({ slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }], bezDelova: ['ppt/slides/slide2.xml'] });
    expect(r.greske).toEqual([{ slajd: 2, poruka: 'Slajd nije pročitan: deo slajda ne postoji u fajlu.' }]);
  });

  it('greška granica (više od 300 objekata) je greška slajda, bez njegovih upozorenja', async () => {
    const mnogo = Array.from({ length: 301 }, (_, i) => okvir(100 + i, 0, 0, 'x')).join('');
    const r = await uvezi({ slajdovi: [{ spTree: mnogo + oblik.geometrija(5, 'cloud', 0, 0, 100, 100, '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>') }, { spTree: okvir(5, 0, 0) }] });
    expect(r.greske).toEqual([{ slajd: 1, poruka: 'Slajd nije pročitan: Slajd ima više od 300 objekata.' }]);
    expect(r.slajdovi.map((s) => s.indeks)).toEqual([2]);
    expect(r.upozorenja.filter((u) => u.slajd === 1)).toEqual([]);
  });

  describe('neprijateljski mali fajl: granice se proveravaju tokom gradnje', () => {
    const elipsa = (id: number) => oblik.geometrija(id, 'ellipse', 0, 0, 127000, 127000, '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');
    const grupaOd = (n: number) => oblik.grupa(10, [0, 0], [1270000, 1270000], [0, 0], [1270000, 1270000],
      Array.from({ length: n }, (_, i) => elipsa(100 + i)).join(''));
    const efektiNaGrupu = (n: number) => timing([fade(10), ...Array.from({ length: n - 1 }, () => fade(10, 'withEffect'))]);
    // Granica vremena meri ceo uvoz, sa parsiranjem XML-a u jsdom-u (~1,5 s za ovaj slajd); pre ispravke je bilo 30-36 s.
    // Stroga granica (< 2 s, bez parsiranja) je u animacije.spec.ts.
    const GRANICA_MS = 10_000;

    it('grupa od 300 oblika x 2000 efekata -> greška tog slajda (više od 400 animacija), ostali slajdovi se uvoze, bez eksplozije vremena', async () => {
      const bajtovi = napraviPptx({ slajdovi: [{ spTree: grupaOd(300), timing: efektiNaGrupu(2000) }, { spTree: okvir(5, 0, 0) }] });
      const pocetak = performance.now();
      const r = await pretvoriPptx(bajtovi, 'a.pptx');
      expect(performance.now() - pocetak).toBeLessThan(GRANICA_MS);
      expect(r.greske).toEqual([{ slajd: 1, poruka: 'Slajd nije pročitan: Slajd ima više od 400 animacija.' }]);
      expect(r.slajdovi.map((s) => s.indeks)).toEqual([2]);
      expect(r.upozorenja.filter((u) => u.slajd === 1)).toEqual([]);
    }, 60_000);

    it('grupa od 5000 oblika x 2000 efekata -> greška tog slajda (više od 300 objekata), bez eksplozije vremena', async () => {
      const bajtovi = napraviPptx({ slajdovi: [{ spTree: grupaOd(5000), timing: efektiNaGrupu(2000) }, { spTree: okvir(5, 0, 0) }] });
      const pocetak = performance.now();
      const r = await pretvoriPptx(bajtovi, 'a.pptx');
      expect(performance.now() - pocetak).toBeLessThan(GRANICA_MS);
      expect(r.greske).toEqual([{ slajd: 1, poruka: 'Slajd nije pročitan: Slajd ima više od 300 objekata.' }]);
      expect(r.slajdovi.map((s) => s.indeks)).toEqual([2]);
    }, 60_000);

    it('posle 301. sloja hod staje: formula iza granice se ne pretvara (ne troši isečke gen: sledećeg slajda)', async () => {
      const formula = {
        spTree: formulaAc(5, mp(mr('x')) + mp(mr('y'))), veze: [SLIKA_FORMULE],
        timing: timing([fade(5, 'clickEffect', { pasus: 0 }), fade(5, 'clickEffect', { pasus: 1 })]),
      };
      const r = await pretvoriPptx(napraviPptx({
        slajdovi: [{ ...formula, spTree: grupaOd(301) + formula.spTree }, formula],
        delovi: { 'ppt/media/formula1.png': slikaFormule([[2, 8], [16, 22]]) },
      }), 'a.pptx');
      expect(r.greske).toEqual([{ slajd: 1, poruka: 'Slajd nije pročitan: Slajd ima više od 300 objekata.' }]);
      expect(r.slajdovi[0].mediji).toEqual(['gen:1', 'gen:2']);
    });
  });

  it('objekat van slajda ili širi od 2880 se preskače (OBJEKAT_PRESKOCEN), njegova slika se ne šalje', async () => {
    const r = await jedan({
      spTree: okvir(5, 30000000, 0) + okvir(6, 0, 0, 'Širok', 40000000, 635000)
        + oblik.slika(7, 'rIdI', -20000000, 0, 1270000, 1270000) + okvir(8, 0, 0),
      veze: [{ id: 'rIdI', tip: 'image', cilj: '../media/image1.png' }],
    }, { delovi: { 'ppt/media/image1.png': PNG_1X1 } });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s8']);
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toHaveLength(3);
    expect(r.mediji.size).toBe(0);
    expect(r.slajdovi[0].mediji).toEqual([]);
  });

  it('isti cNvPr id dva puta -> drugi sloj dobija x<n>', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0, 'Prvi') + okvir(5, 0, 635000, 'Drugi') });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s5', 'x1']);
  });

  it('skriven objekat (cNvPr hidden) se ne uvozi', async () => {
    const r = await jedan({ spTree: okvir(5, 0, 0).replace('name="TextBox 5"', 'name="TextBox 5" hidden="1"') + okvir(6, 0, 0) });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s6']);
  });

  it('skriven objekat unutar mc:Choice (crtež, formula) se ne uvozi', async () => {
    const skriven = (xml: string, ime: string) => xml.replace(`name="${ime}"`, `name="${ime}" hidden="1"`);
    const crtez = await jedan(
      { spTree: skriven(crtezAc, 'Rukopis 4') + okvir(5, 0, 0), veze: VEZE_CRTEZA },   // samo p14:cNvPr u Choice
      { delovi: { 'ppt/media/image1.png': PNG_1X1, 'ppt/ink/ink1.xml': INK } },
    );
    expect(platno(crtez).slojevi.map((s) => s.id)).toEqual(['s5']);
    const formula = await jedan({ spTree: skriven(formulaAc(6, mp(razlomak)), 'Formula 6') + okvir(5, 0, 0), veze: [SLIKA_FORMULE] },
      { delovi: { 'ppt/media/formula1.png': PNG_1X1 } });
    expect(platno(formula).slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(formula.mediji.size).toBe(0);
  });

  it('grafikon bez slike -> OBJEKAT_PRESKOCEN; OLE sa slikom u Fallback-u -> SLIKA', async () => {
    const okvirGrafike = (id: number, uri: string, sadrzaj: string) =>
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Objekat ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="1270000"/></p:xfrm><a:graphic><a:graphicData uri="${uri}">${sadrzaj}</a:graphicData></a:graphic></p:graphicFrame>`;
    const ole = '<mc:AlternateContent><mc:Choice Requires="v"><p:oleObj r:id="rIdO"><p:embed/></p:oleObj></mc:Choice><mc:Fallback>'
      + '<p:oleObj r:id="rIdO"><p:embed/><p:pic><p:nvPicPr><p:cNvPr id="0" name=""/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
      + '<p:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/>'
      + '<a:ext cx="1270000" cy="1270000"/></a:xfrm></p:spPr></p:pic></p:oleObj></mc:Fallback></mc:AlternateContent>';
    const r = await jedan({
      spTree: okvirGrafike(5, 'http://schemas.openxmlformats.org/drawingml/2006/chart', '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdC"/>')
        + okvirGrafike(6, 'http://schemas.openxmlformats.org/presentationml/2006/ole', ole),
      veze: [{ id: 'rIdI', tip: 'image', cilj: '../media/image1.png' }],
    }, { delovi: { 'ppt/media/image1.png': PNG_1X1 } });
    expect(platno(r).slojevi.map((s) => `${s.id} ${s.tip}`)).toEqual(['s6 SLIKA']);
    expect(sloj<SlikaSloj>(r, 's6').medijId).toBe('pptx:ppt/media/image1.png');
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toHaveLength(1);
  });

  it('nepoznat mc:AlternateContent: deca Fallback-a idu kroz isti hod', async () => {
    const r = await jedan({
      spTree: `<mc:AlternateContent xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"><mc:Choice Requires="p15">${okvir(5, 0, 0, 'Novo')}</mc:Choice>`
        + `<mc:Fallback>${okvir(6, 0, 0, 'Staro')}</mc:Fallback></mc:AlternateContent>`,
    });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s6']);
  });

  it('p:contentPart bez mc:AlternateContent -> OBJEKAT_PRESKOCEN', async () => {
    const r = await jedan({
      spTree: '<p:contentPart r:id="rIdK"><p14:nvContentPartPr><p14:cNvPr id="4" name="Rukopis"/><p14:cNvContentPartPr/><p14:nvPr/></p14:nvContentPartPr></p:contentPart>'
        + okvir(5, 0, 0),
    });
    expect(platno(r).slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(ima(r, 'OBJEKAT_PRESKOCEN')).toHaveLength(1);
  });
});

describe('pretvoriPptx: napredak i prekid', () => {
  it('napredak posle svakog slajda', async () => {
    const pozivi: [number, number][] = [];
    await pretvoriPptx(napraviPptx({ slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }] }), 'a.pptx', {
      napredak: (u, n) => pozivi.push([u, n]),
    });
    expect(pozivi).toEqual([[1, 2], [2, 2]]);
  });

  it('prekid: AbortController prekinut posle prvog napretka -> AbortError', async () => {
    const ac = new AbortController();
    const bajtovi = napraviPptx({ slajdovi: [{ spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }, { spTree: okvir(5, 0, 0) }] });
    const obecanje = pretvoriPptx(bajtovi, 'a.pptx', { napredak: () => ac.abort(), prekid: ac.signal });
    await expect(obecanje).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('neispravan fajl odbija ceo uvoz (GreskaUvoza)', async () => {
    await expect(pretvoriPptx(new Uint8Array([1, 2, 3]), 'a.pptx')).rejects.toMatchObject({ name: 'GreskaUvoza' });
  });
});

describe('pretvoriPptx: kao server', () => {
  it('nepoznatFontNikadNeProlazi: fontovi iz kataloga, boje #RRGGBB, animacije ciljaju postojeće slojeve i pasuse', async () => {
    const font = (ime: string) => `<a:rPr lang="sr-Latn-RS"><a:latin typeface="${ime}"/></a:rPr>`;
    const pasusi = pasus('a', '', font('Comic Sans MS')) + pasus('b', '', font('Cambria Math')) + pasus('c', '', font('+mj-lt'))
      + pasus('d', '<a:pPr><a:buFont typeface="Wingdings"/><a:buChar char="&#61548;"/></a:pPr>', font('Nepostojeci Font 7'));
    const boja = '<a:rPr lang="sr-Latn-RS"><a:solidFill><a:schemeClr val="accent6"><a:lumMod val="50000"/><a:alpha val="40000"/></a:schemeClr></a:solidFill></a:rPr>';
    const K = 914400;
    const r = await pretvoriPptx(napraviPptx({
      slajdovi: [{
        spTree: oblik.tekst(5, 0, 0, 2540000, 1270000, pasusi)
          + oblik.tekst(6, 0, 1270000, 2540000, 635000, pasus('boja', '', boja))
          + oblik.tabela(7, K, 3 * K, [K], [tabela.red(381000, [tabela.celija('x')])]).replace('<a:rPr lang="sr-Latn-RS"/>', font('Papyrus'))
          + oblik.grupa(10, [0, 0], [K, K], [0, 0], [K, K], okvir(11, 0, 0) + okvir(12, 0, 0))
          + formulaAc(8, mp(mr('x')) + mp(mr('y'))),
        veze: [SLIKA_FORMULE],
        timing: timing([fade(5, 'clickEffect', { pasus: 3 }), fade(10), fade(8, 'withEffect', { pasus: 1 }), fade(6, 'afterEffect'), fade(99)]),
      }],
      delovi: { 'ppt/media/formula1.png': slikaFormule([[2, 8], [16, 22]]) },
    }), 'f.pptx');
    expect(r.greske).toEqual([]);
    proveriKaoServerSve(r);
    const p = platno(r);
    const fontovi = new Set(p.slojevi.flatMap((s) => (s.tip === 'TEKST' ? s.pasusi : s.tip === 'TABELA' ? s.celije.flat().flatMap((c) => c.pasusi) : []))
      .flatMap((ps) => ps.delovi.map((d) => d.font)));
    expect([...fontovi].every((f) => FONTOVI.has(f))).toBe(true);
    expect(ima(r, 'FONT_ZAMENJEN').length).toBeGreaterThan(0);
    expect(p.animacije.map(anim)).toEqual(['s5#3 FADE KLIK', 's11 FADE KLIK', 's12 FADE SA_PRETHODNIM', 's8p1 FADE SA_PRETHODNIM', 's6 FADE POSLE_PRETHODNOG']);
  });
});
