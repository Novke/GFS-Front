import { dekodirajTrag, MAX_SIROVIH_TACAKA, NeispravanTrag, pretvoriCrtez, uprosti } from './crtez';
import { kontekstZaTest } from './kontekst.testing';
import { PNG_1X1, type VezaFabrike } from './pptx-fabrika.testing';
import type { Kutija } from './tipovi';
import { NS } from './xml';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const AINK = 'http://schemas.microsoft.com/office/drawing/2016/ink';

interface DeloviCrteza {
  requires?: string; choiceNs?: string; rId?: string; p14xfrm?: string | null; fallback?: string | null; ime?: string;
}
const xfrm = (x: number, y: number, cx: number, cy: number) => `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>`;
const PIC_FALLBACK = (ime = 'Rukopis 4') => `<p:pic><p:nvPicPr><p:cNvPr id="4" name="${ime}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`
  + '<p:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
  + `<p:spPr><a:xfrm>${xfrm(901700, 901700, 1295400, 660400)}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

/** `mc:AlternateContent` kakav PowerPoint piše za crtež rukom: Choice sa `p:contentPart`, Fallback sa `p:pic`. */
function ac(d: DeloviCrteza = {}): string {
  const p14xfrm = d.p14xfrm === undefined ? xfrm(914400, 914400, 1270000, 635000) : d.p14xfrm;
  return `<mc:AlternateContent><mc:Choice ${d.choiceNs ?? ''} Requires="${d.requires ?? 'p14'}">`
    + `<p:contentPart p14:bwMode="auto" r:id="${d.rId ?? 'rIdK'}"><p14:nvContentPartPr><p14:cNvPr id="4" name="${d.ime ?? 'Rukopis 4'}"/>`
    + '<p14:cNvContentPartPr/><p14:nvPr/></p14:nvContentPartPr>'
    + (p14xfrm === null ? '' : `<p14:xfrm>${p14xfrm}</p14:xfrm>`)
    + '</p:contentPart></mc:Choice>'
    + (d.fallback === null ? '' : `<mc:Fallback>${d.fallback ?? PIC_FALLBACK(d.ime)}</mc:Fallback>`)
    + '</mc:AlternateContent>';
}

interface DeloviInka { kanali?: string[]; rezolucija?: string | null; cetka?: string | null; tragovi?: string[]; koren?: string; }
/** InkML deo (`ppt/ink/ink1.xml`) sa kontekstom `ctx0` i četkom `br0`. */
function ink(d: DeloviInka = {}): string {
  const kanali = (d.kanali ?? ['X', 'Y']).map((k) => `<inkml:channel name="${k}" type="integer" units="cm"/>`).join('');
  const rez = d.rezolucija === null ? '' : `<inkml:channelProperties>`
    + `<inkml:channelProperty channel="X" name="resolution" value="${d.rezolucija ?? '1000'}" units="1/cm"/>`
    + `<inkml:channelProperty channel="Y" name="resolution" value="${d.rezolucija ?? '1000'}" units="1/cm"/></inkml:channelProperties>`;
  const cetka = d.cetka === null ? '' : `<inkml:brush xml:id="br0">${d.cetka
    ?? '<inkml:brushProperty name="width" value="0.1" units="cm"/><inkml:brushProperty name="height" value="0.1" units="cm"/><inkml:brushProperty name="color" value="#FF0000"/>'}</inkml:brush>`;
  const tragovi = (d.tragovi ?? ['0 0, 3528 1764']).map((t) => `<inkml:trace contextRef="#ctx0" brushRef="#br0">${t}</inkml:trace>`).join('');
  return `${XML}<${d.koren ?? 'inkml:ink'} xmlns:inkml="http://www.w3.org/2003/InkML"><inkml:definitions><inkml:context xml:id="ctx0">`
    + `<inkml:inkSource xml:id="inkSrc0"><inkml:traceFormat>${kanali}</inkml:traceFormat>${rez}</inkml:inkSource></inkml:context>`
    + `${cetka}</inkml:definitions>${tragovi}</${d.koren ?? 'inkml:ink'}>`;
}

const VEZE: VezaFabrike[] = [{ id: 'rIdI', tip: 'image', cilj: '../media/image1.png' }, { id: 'rIdK', tip: 'customXml', cilj: '../ink/ink1.xml' }];
const bez = (k: Kutija) => k;

function crtez(d: DeloviCrteza = {}, inkml: string | null = ink(), kutijaGrupe: (k: Kutija) => Kutija = bez) {
  const delovi: Record<string, string | Uint8Array> = { 'ppt/media/image1.png': PNG_1X1 };
  if (inkml !== null) delovi['ppt/ink/ink1.xml'] = inkml;
  const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: ac(d), veze: VEZE }], delovi });
  const el = ctx.slajd.doc.getElementsByTagNameNS(NS.mc, 'AlternateContent')[0];
  return { s: pretvoriCrtez(el, kutijaGrupe, ctx, 's4'), z };
}
const kodovi = (z: { upozorenja: { kod: string }[] }) => z.upozorenja.map((u) => u.kod);

describe('dekodirajTrag', () => {
  it('eksplicitne vrednosti, prva i druga razlika (važe dok se ne promene)', () => {
    expect(dekodirajTrag('10 20, 12 21, \'1\'1, "0"0, "1"-1', 2)).toEqual([[10, 20], [12, 21], [13, 22], [14, 23], [16, 23]]);
  });

  it('lepljeni znaci', () => {
    expect(dekodirajTrag("5 5,'-1'-2,'-1'-2", 2)).toEqual([[5, 5], [4, 3], [3, 1]]);
  });

  it('oznaka važi za svoj kanal i u sledećim tačkama, ne prelazi na sledeću vrednost iste tačke (W3C InkML 3.2.1)', () => {
    expect(dekodirajTrag("10 20, 12 21, '1 1", 2)).toEqual([[10, 20], [12, 21], [13, 1]]);
    expect(dekodirajTrag("5 5,'-1-2", 2)).toEqual([[5, 5], [4, -2]]);
    expect(dekodirajTrag("1 1 9 9, '1 '2 !8, 1 2 0, !0.5 1e1 3", 3)).toEqual([[1, 1, 9], [2, 3, 8], [3, 5, 0], [0.5, 15, 3]]);
  });

  it('primer iz W3C InkML 3.2.1 (X, Y redovni kanali; isprekidani B1, B2 se ne čitaju)', () => {
    const trag = '1125 18432,\'23\'43,"7"-8,3-5,7 -3,6 2,6 8,3 6 T,2 4*T,3 6,3-6 F F';
    expect(dekodirajTrag(trag, 2)).toEqual([
      [1125, 18432], [1148, 18475], [1178, 18510], [1211, 18540], [1251, 18567], [1297, 18596],
      [1349, 18633], [1404, 18676], [1461, 18723], [1521, 18776], [1584, 18823],
    ]);
  });

  it('razmak između oznake, minusa i broja je dozvoljen', () => {
    expect(dekodirajTrag("10 20,' 1' 1", 2)).toEqual([[10, 20], [11, 21]]);
    expect(dekodirajTrag("10 20,' - 1 ' -\t1, - 2 3", 2)).toEqual([[10, 20], [9, 19], [7, 22]]); // treća tačka bez oznake: i dalje prva razlika
  });

  it('džoker, T/F, heks, nepoznat znak ili beskonačan broj u čitanom kanalu -> NeispravanTrag', () => {
    for (const t of ['1 2, * 3', '1 2, 3 ?', '1 2, T 3', '1 2, 3 F', '1 2, #1A 3', '1 2, 3 x', "1 2, ' ", '1 2, 3 1e', '1 2, 1e400 3', '1 2, -']) {
      expect(() => dekodirajTrag(t, 2), t).toThrow(NeispravanTrag);
    }
  });

  it('prazni komadi se preskaču; najvise prekida dekodiranje čim se pređe', () => {
    expect(dekodirajTrag(' , 1 2,, 3 4 ', 2)).toEqual([[1, 2], [3, 4]]);
    expect(dekodirajTrag('1 1, 2 2, 3 3, 4 4', 2, 2)).toEqual([[1, 1], [2, 2], [3, 3]]);
  });
});

describe('uprosti', () => {
  it('tačke na pravoj -> samo krajnje', () => {
    const tacke = Array.from({ length: 11 }, (_, i) => [i, 0]).flat();
    expect(uprosti(tacke, 0.3)).toEqual([0, 0, 10, 0]);
  });

  it('ugao ostaje: (0,0),(5,0),(5,5) -> sve tri', () => {
    expect(uprosti([0, 0, 5, 0, 5, 5], 0.3)).toEqual([0, 0, 5, 0, 5, 5]);
  });

  it('manje od 3 tačke se vraćaju zaokružene na 0,1; rezultat se zaokružuje na 0,1', () => {
    expect(uprosti([1.234, 5.678], 0.3)).toEqual([1.2, 5.7]);
    expect(uprosti([0.04, 0, 5.06, 0.2, 10.01, 0], 0.3)).toEqual([0, 0, 10, 0]);
  });

  it('rastojanje od duži, ne od prave: tačka iza kraja duži ostaje', () => {
    expect(uprosti([0, 0, 20, 0, 10, 0], 0.3)).toEqual([0, 0, 20, 0, 10, 0]);
  });

  it('zatvoren potez (iste krajnje tačke) ne gubi oblik', () => {
    expect(uprosti([0, 0, 10, 0, 10, 10, 0, 0], 0.3)).toEqual([0, 0, 10, 0, 10, 10, 0, 0]);
  });

  it('cik-cak sa mnogo tačaka ostaje ceo (i preko granice prozora)', () => {
    const tacke = Array.from({ length: 5001 }, (_, i) => [i, (i % 2) * 5]).flat();
    expect(uprosti(tacke, 0.3).length).toBe(tacke.length);
  });

  it('najvise: uprošćavanje staje čim zadržanih tačaka bude više od granice', () => {
    const tacke = Array.from({ length: 5001 }, (_, i) => [i, (i % 2) * 5]).flat();
    const n = uprosti(tacke, 0.3, 100).length / 2;
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(200);
    expect(uprosti(tacke, 0.3, 5001).length).toBe(tacke.length);
  });
});

describe('pretvoriCrtez', () => {
  it('crtež iz fabrike: sloj u kutiji fallback slike, potez preslikan u p14:xfrm, boja i debljina četke', () => {
    const { s, z } = crtez();
    expect(s).toEqual({
      id: 's4', tip: 'CRTEZ', naziv: 'Rukopis 4', x: 71, y: 71, sirina: 102, visina: 52, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, medijId: 'pptx:ppt/media/image1.png',
      potezi: [{ boja: '#FF0000', debljina: 2.83, tacke: [1, 1, 101, 51] }],
    });
    expect([...z.mediji.keys()]).toEqual(['pptx:ppt/media/image1.png']);
    expect(z.upozorenja).toEqual([]);
  });

  it('Requires="p14 aink" je poznat', () => {
    const { s, z } = crtez({ requires: 'p14 aink', choiceNs: `xmlns:aink="${AINK}"` });
    expect(s!.potezi).toHaveLength(1);
    expect(z.upozorenja).toEqual([]);
  });

  it('prefiksi se razrešavaju po imenskom prostoru, ne po imenu', () => {
    const { s } = crtez({ requires: 'pp', choiceNs: `xmlns:pp="${P14}"` });
    expect(s!.potezi).toHaveLength(1);
  });

  it('nepoznat prefiks u Requires -> samo Fallback: sloj bez poteza + CRTEZ_BEZ_POTEZA', () => {
    const { s, z } = crtez({ requires: 'p14 xyz', choiceNs: 'xmlns:xyz="urn:nepoznato"' });
    expect(s).toMatchObject({ tip: 'CRTEZ', medijId: 'pptx:ppt/media/image1.png', potezi: null });
    expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
  });

  it('bezInkml: deo crteža ne postoji -> potezi null + CRTEZ_BEZ_POTEZA, sloj postoji', () => {
    const { s, z } = crtez({}, null);
    expect(s).toMatchObject({ tip: 'CRTEZ', x: 71, y: 71, sirina: 102, visina: 52, potezi: null });
    expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
  });

  it('neispravan InkML (nije XML, pogrešan koren, tačka bez Y, bez tragova, nema p14:xfrm) -> potezi null', () => {
    const slucajevi: [DeloviCrteza, string | null][] = [
      [{}, '<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML"><inkml:trace>1 2'],
      [{}, ink({ koren: 'inkml:nesto' })],
      [{}, ink({ tragovi: ['0 0, 5'] })],
      [{}, ink({ tragovi: [] })],
      [{}, ink({ kanali: ['X', 'F'] })],
      [{ p14xfrm: null }, ink()],
      [{ rId: 'rIdNema' }, ink()],
    ];
    for (const [d, inkml] of slucajevi) {
      const { s, z } = crtez(d, inkml);
      expect(s).toMatchObject({ tip: 'CRTEZ', potezi: null });
      expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
    }
  });

  // Cik-cak sa korakom 1 jedinice i amplitudom 20 (kutija p14:xfrm 1 sirova jedinica = 1 jedinica platna): nijedna tačka
  // nije bliža od 0,3 nekoj tetivi RDP-a, pa uprošćavanje ne uklanja ništa.
  const cikcak = (n: number) => Array.from({ length: n }, (_, i) => `${i} ${(i % 2) * 20}`).join(', ');
  const velikaKutija = (sirina: number) => xfrm(0, 0, sirina * 12700, 20 * 12700);

  it('previseTacaka: 20 001 tačka u cik-cak (RDP ih ne uklanja) -> potezi null', () => {
    const ok = crtez({ p14xfrm: velikaKutija(19999) }, ink({ tragovi: [cikcak(20000)] }));
    expect(ok.s!.potezi![0].tacke.length).toBe(40000);
    const { s, z } = crtez({ p14xfrm: velikaKutija(20000) }, ink({ tragovi: [cikcak(20001)] }));
    expect(s).toMatchObject({ tip: 'CRTEZ', potezi: null });
    expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
  });

  it('granica se broji posle uprošćavanja, za sve poteze sloja zajedno', () => {
    const prava = Array.from({ length: 1000 }, (_, i) => `${i} 10`).join(', ');
    // 1000 sirovih tačaka na pravoj (jedan prozor uprošćavanja) -> 2; dva cik-cak poteza po 9 999 -> ukupno 20 000: prolazi
    const { s } = crtez({ p14xfrm: velikaKutija(9998) }, ink({ tragovi: [prava, cikcak(9999), cikcak(9999)] }));
    expect(s!.potezi!.map((p) => p.tacke.length / 2)).toEqual([2, 9999, 9999]);
    // jedna tačka više -> preko granice
    expect(crtez({ p14xfrm: velikaKutija(9999) }, ink({ tragovi: [prava, cikcak(9999), cikcak(10000)] })).s!.potezi).toBeNull();
  });

  it(`više od ${MAX_SIROVIH_TACAKA} sirovih tačaka -> potezi null bez dekodiranja ostatka`, () => {
    const trag = `0 0, '${Array(MAX_SIROVIH_TACAKA + 1).fill('1 0').join(', ')}`;
    const { s, z } = crtez({}, ink({ tragovi: [trag] }));
    expect(s!.potezi).toBeNull();
    expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
  });

  it('džoker ili T/F u čitanom kanalu traga -> potezi null + CRTEZ_BEZ_POTEZA (sloj ostaje kao slika)', () => {
    for (const trag of ['0 0, * 1764, 3528 1764', '0 0, 3528 T']) {
      const { s, z } = crtez({}, ink({ tragovi: [trag] }));
      expect(s).toMatchObject({ tip: 'CRTEZ', medijId: 'pptx:ppt/media/image1.png', potezi: null });
      expect(kodovi(z)).toEqual(['CRTEZ_BEZ_POTEZA']);
    }
  });

  it('trag u definicijama se ne crta; rezolucija samo iz inkSource-a kome traceFormat pripada', () => {
    const inkml = `${XML}<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML"><inkml:definitions>`
      + '<inkml:traceFormat xml:id="tf0"><inkml:channel name="X"/><inkml:channel name="Y"/></inkml:traceFormat>'
      + '<inkml:inkSource xml:id="drugi"><inkml:channelProperties>'
      + '<inkml:channelProperty channel="X" name="resolution" value="500" units="1/cm"/>'
      + '<inkml:channelProperty channel="Y" name="resolution" value="500" units="1/cm"/></inkml:channelProperties></inkml:inkSource>'
      + '<inkml:brush xml:id="br0"><inkml:brushProperty name="width" value="0.1" units="cm"/></inkml:brush>'
      + '<inkml:trace xml:id="sablon">99999 99999, -99999 -99999</inkml:trace>'
      + '</inkml:definitions><inkml:trace brushRef="#br0">0 0, 3528 1764</inkml:trace></inkml:ink>';
    const { s, z } = crtez({}, inkml);
    // bez rezolucije razmera je 1 (sa tuđom rezolucijom 500 bi bila 0,5 -> 1,42)
    expect(s!.potezi).toEqual([{ boja: '#000000', debljina: 2.83, tacke: [1, 1, 101, 51] }]);
    expect(z.upozorenja).toEqual([]);
  });

  it('bez fallback slike -> null + OBJEKAT_PRESKOCEN', () => {
    const { s, z } = crtez({ fallback: null });
    expect(s).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('fallback slika bez dela -> null (pretvoriSliku prijavljuje)', () => {
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: ac(), veze: VEZE }], delovi: { 'ppt/ink/ink1.xml': ink() } });
    const s = pretvoriCrtez(ctx.slajd.doc.getElementsByTagNameNS(NS.mc, 'AlternateContent')[0], bez, ctx, 's4');
    expect(s).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('kutijaGrupe se primenjuje i na fallback i na p14:xfrm (pomeraj i razmera 2x)', () => {
    const grupa = (k: Kutija): Kutija => ({ x: k.x * 2, y: k.y * 2, w: k.w * 2, h: k.h * 2, rot: k.rot });
    const { s } = crtez({}, ink(), grupa);
    expect(s).toMatchObject({ x: 142, y: 142, sirina: 204, visina: 104 });
    expect(s!.potezi).toEqual([{ boja: '#FF0000', debljina: 5.67, tacke: [2, 2, 202, 102] }]);
  });

  it('četka: podrazumevano #000000, boja malim slovima -> velika, debljina u granicama 0,25..20, mm i in', () => {
    const debljina = (cetka: string | null) => crtez({}, ink({ cetka })).s!.potezi![0];
    expect(debljina(null).boja).toBe('#000000');
    expect(debljina('<inkml:brushProperty name="color" value="#00ff7f"/>').boja).toBe('#00FF7F');
    expect(debljina('<inkml:brushProperty name="color" value="crvena"/>').boja).toBe('#000000');
    expect(debljina('<inkml:brushProperty name="width" value="0.001" units="cm"/>').debljina).toBe(0.25);
    expect(debljina('<inkml:brushProperty name="width" value="5" units="cm"/>').debljina).toBe(20);
    expect(debljina('<inkml:brushProperty name="width" value="1" units="mm"/>').debljina).toBe(2.83);
    expect(debljina('<inkml:brushProperty name="width" value="0.05" units="in"/>').debljina).toBe(3.6);
  });

  it('debljina se zaokružuje HALF_UP na 2 decimale kao server (2,835 -> 2,84, Math.round bi dao 2,83)', () => {
    const cetka = '<inkml:brushProperty name="width" value="2.835" units="pt"/>';
    expect(crtez({}, ink({ cetka, rezolucija: null })).s!.potezi![0].debljina).toBe(2.84);
  });

  it('dodatni kanali (F, vreme) se čitaju i odbacuju; X i Y po imenu', () => {
    const { s } = crtez({}, ink({ kanali: ['F', 'X', 'Y'], tragovi: ['500 0 0, 700 3528 1764'] }));
    expect(s!.potezi![0].tacke).toEqual([1, 1, 101, 51]);
  });

  it('raspon 0 po jednoj osi -> potez u sredini te ose; tačka -> sredina kutije', () => {
    expect(crtez({}, ink({ tragovi: ['100 0, 100 1764'] })).s!.potezi![0].tacke).toEqual([51, 1, 51, 51]);
    expect(crtez({}, ink({ tragovi: ['7 7'] })).s!.potezi![0].tacke).toEqual([51, 26]);
  });

  it('više tragova dele okvir svih tačaka', () => {
    const { s } = crtez({}, ink({ tragovi: ['0 0, 1764 0', '1764 1764, 3528 1764'] }));
    expect(s!.potezi!.map((p) => p.tacke)).toEqual([[1, 1, 51, 1], [51, 51, 101, 51]]);
  });
});
