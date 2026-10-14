import type { OblikSloj } from '../data-access/platno.models';
import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import { kutijaIzLanca } from './nasledjivanje';
import { GEOMETRIJE, ivicaIz, popunaIz, pretvoriOblik, senkaIz } from './oblik';
import { oblik, type OpcijeFabrike } from './pptx-fabrika.testing';
import { senkaIzEfekta } from './tekst';
import type { KontekstSlajda } from './tipovi';
import { dete, NS } from './xml';

const BOJA = /^#[0-9A-F]{6}$/;
const crna = '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>';

/** Slajd sa datim `spTree`; vraća kontekst i upozorenja. */
function slajd(spTree: string, o: Partial<OpcijeFabrike> = {}) {
  return kontekstZaTest({ slajdovi: [{ spTree }], ...o });
}

/** Oblik `id` sa slajda pretvoren u sloj `s<id>`. */
function pretvori(ctx: KontekstSlajda, id: number): OblikSloj | null {
  const el = oblikSaId(ctx, id);
  return pretvoriOblik(el, kutijaIzLanca([el])!, ctx, `s${id}`);
}

const kodovi = (z: { upozorenja: { kod: string }[] }) => z.upozorenja.map((u) => u.kod);
const spPr = (ctx: KontekstSlajda, id: number) => dete(oblikSaId(ctx, id), NS.p, 'spPr');
const stil = (ctx: KontekstSlajda, id: number) => dete(oblikSaId(ctx, id), NS.p, 'style');

/** Konektor sa sopstvenim `spPr` sadržajem (ln, geometrija) i atributima `a:xfrm`. */
const konektor = (id: number, cx: number, cy: number, prst: string, ln: string, xfrmAtr = '', stilXml = '') =>
  `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Konektor ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>`
  + `<a:xfrm${xfrmAtr}><a:off x="914400" y="914400"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${ln}</p:spPr>${stilXml}</p:cxnSp>`;

describe('GEOMETRIJE', () => {
  it('osnovni oblici, linije, konektori i blok strelice', () => {
    expect(GEOMETRIJE['rect']).toBe('PRAVOUGAONIK');
    expect(GEOMETRIJE['roundRect']).toBe('ZAOBLJENI_PRAVOUGAONIK');
    expect(GEOMETRIJE['ellipse']).toBe('ELIPSA');
    expect(GEOMETRIJE['triangle']).toBe('TROUGAO');
    expect(GEOMETRIJE['line']).toBe('LINIJA');
    expect(GEOMETRIJE['straightConnector1']).toBe('LINIJA');
    expect(GEOMETRIJE['bentConnector3']).toBe('LINIJA');
    expect(GEOMETRIJE['curvedConnector2']).toBe('LINIJA');
    for (const s of ['rightArrow', 'leftArrow', 'upArrow', 'downArrow']) expect(GEOMETRIJE[s]).toBe('STRELICA');
    for (const s of ['leftRightArrow', 'upDownArrow']) expect(GEOMETRIJE[s]).toBe('DVOSTRUKA_STRELICA');
    expect(Object.hasOwn(GEOMETRIJE, 'star5')).toBe(false);
  });
});

describe('pretvoriOblik: oblici', () => {
  it('ellipse sa solidFill accent1 i ln w=25400 -> ELIPSA, #4472C4, debljina 2', () => {
    const { ctx } = slajd(oblik.geometrija(5, 'ellipse', 914400, 914400, 1828800, 914400,
      `<a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln w="25400">${crna}</a:ln>`));
    expect(pretvori(ctx, 5)).toEqual({
      id: 's5', tip: 'OBLIK', naziv: 'Oblik 5', x: 72, y: 72, sirina: 144, visina: 72, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, oblik: 'ELIPSA', popuna: '#4472C4',
      ivica: { boja: '#000000', debljina: 2, crtica: 'PUNA' }, od: null, do: null,
    });
  });

  it('p:style: fillRef idx 1 accent1 i lnRef idx 2 accent1 shade 50% bez boja u spPr', () => {
    const style = '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef>'
      + '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>'
      + '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>';
    const { ctx } = slajd(oblik.geometrija(5, 'roundRect', 0, 0, 1270000, 635000, '', style));
    const s = pretvori(ctx, 5)!;
    expect(s.oblik).toBe('ZAOBLJENI_PRAVOUGAONIK');
    expect(s.popuna).toBe('#4472C4');
    expect(s.ivica).toEqual({ boja: '#2F528F', debljina: 1, crtica: 'PUNA' });
  });

  it('custGeom i nepoznata prstGeom -> null (pozivalac odlučuje)', () => {
    const cust = '<p:sp><p:nvSpPr><p:cNvPr id="6" name="Slobodan"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>'
      + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="12700" cy="12700"/></a:xfrm><a:custGeom><a:pathLst/></a:custGeom></p:spPr></p:sp>';
    const { ctx, z } = slajd(cust + oblik.geometrija(7, 'star5', 0, 0, 12700, 12700));
    expect(pretvori(ctx, 6)).toBeNull();
    expect(pretvori(ctx, 7)).toBeNull();
    expect(z.upozorenja).toEqual([]);
  });

  it('rotacija i naziv (najviše 60 znakova)', () => {
    const dugo = 'N'.repeat(70);
    const xml = oblik.geometrija(5, 'triangle', 0, 0, 1270000, 1270000).replace('name="Oblik 5"', `name="${dugo}"`)
      .replace('<a:xfrm>', '<a:xfrm rot="5400000">');
    const { ctx } = slajd(xml);
    const s = pretvori(ctx, 5)!;
    expect(s.oblik).toBe('TROUGAO');
    expect(s.rotacija).toBe(90);
    expect(s.naziv).toBe('N'.repeat(60));
  });

  it('pravougaonik visine 0 -> visina 1, centriran na prvobitnoj ivici', () => {
    const { ctx } = slajd(oblik.geometrija(5, 'rect', 914400, 914400, 1270000, 0, `<a:ln w="12700">${crna}</a:ln>`));
    const s = pretvori(ctx, 5)!;
    expect(s.visina).toBe(1);
    expect(s.y).toBe(71.5);
  });
});

describe('pretvoriOblik: linije i strelice', () => {
  const lnStrelica = `<a:ln w="12700">${crna}<a:prstDash val="dash"/><a:tailEnd type="triangle"/></a:ln>`;

  it('konektor sa tailEnd -> STRELICA, ISPREKIDANA, od {0,0} do {sirina, visina}', () => {
    const { ctx } = slajd(oblik.konektor(5, 914400, 914400, 1828800, 914400, lnStrelica));
    const s = pretvori(ctx, 5)!;
    expect(s).toMatchObject({
      oblik: 'STRELICA', popuna: null, x: 72, y: 72, sirina: 144, visina: 72,
      ivica: { boja: '#000000', debljina: 1, crtica: 'ISPREKIDANA' }, od: { x: 0, y: 0 }, do: { x: 144, y: 72 },
    });
  });

  it('horizontalni konektor (cy=0) -> visina 1, od.y = do.y = 0.5, linija ostaje na istom mestu', () => {
    const { ctx } = slajd(oblik.konektor(5, 914400, 914400, 1828800, 0, lnStrelica));
    const s = pretvori(ctx, 5)!;
    expect(s.visina).toBe(1);
    expect(s.y).toBe(71.5);
    expect(s.od).toEqual({ x: 0, y: 0.5 });
    expect(s.do).toEqual({ x: 144, y: 0.5 });
  });

  it('vertikalni konektor (cx=0) -> sirina 1, od.x = do.x = 0.5', () => {
    const { ctx } = slajd(oblik.konektor(5, 914400, 914400, 0, 914400, lnStrelica));
    const s = pretvori(ctx, 5)!;
    expect(s).toMatchObject({ sirina: 1, x: 71.5, visina: 72, od: { x: 0.5, y: 0 }, do: { x: 0.5, y: 72 } });
  });

  it('flipH -> od.x = sirina; flipV -> od.y = visina', () => {
    const { ctx } = slajd(oblik.konektor(5, 0, 0, 1828800, 914400, lnStrelica, ' flipH="1"')
      + oblik.konektor(6, 0, 0, 1828800, 914400, lnStrelica, ' flipV="1"'));
    expect(pretvori(ctx, 5)).toMatchObject({ od: { x: 144, y: 0 }, do: { x: 0, y: 72 } });
    expect(pretvori(ctx, 6)).toMatchObject({ od: { x: 0, y: 72 }, do: { x: 144, y: 0 } });
  });

  it('headEnd -> STRELICA sa zamenjenim od/do; oba kraja -> DVOSTRUKA_STRELICA; bez krajeva -> LINIJA', () => {
    const ln = (krajevi: string) => `<a:ln w="12700">${crna}${krajevi}</a:ln>`;
    const { ctx } = slajd(oblik.konektor(5, 0, 0, 1828800, 914400, ln('<a:headEnd type="arrow"/>'))
      + oblik.konektor(6, 0, 0, 1828800, 914400, ln('<a:headEnd type="arrow"/><a:tailEnd type="stealth"/>'))
      + oblik.konektor(7, 0, 0, 1828800, 914400, ln('<a:headEnd type="none"/><a:tailEnd type="none"/>')));
    expect(pretvori(ctx, 5)).toMatchObject({ oblik: 'STRELICA', od: { x: 144, y: 72 }, do: { x: 0, y: 0 } });
    expect(pretvori(ctx, 6)).toMatchObject({ oblik: 'DVOSTRUKA_STRELICA', od: { x: 0, y: 0 }, do: { x: 144, y: 72 } });
    expect(pretvori(ctx, 7)).toMatchObject({ oblik: 'LINIJA', od: { x: 0, y: 0 }, do: { x: 144, y: 72 } });
  });

  it('linija bez ivice dobija tx1, 0,75, PUNA; nevidljiva linija (ln/noFill) -> null', () => {
    const { ctx } = slajd(konektor(5, 1828800, 914400, 'line', '')
      + konektor(6, 1828800, 914400, 'straightConnector1', '<a:ln w="12700"><a:noFill/></a:ln>'));
    expect(pretvori(ctx, 5)).toMatchObject({ oblik: 'LINIJA', popuna: null, ivica: { boja: '#000000', debljina: 0.75, crtica: 'PUNA' } });
    expect(pretvori(ctx, 6)).toBeNull();
  });

  it('odbačena (nevidljiva) linija ne prijavljuje SENKA', () => {
    const { ctx, z } = slajd(konektor(5, 1828800, 914400, 'straightConnector1',
      '<a:ln w="12700"><a:noFill/></a:ln><a:effectLst><a:glow rad="63500"><a:srgbClr val="FF0000"/></a:glow></a:effectLst>'));
    expect(pretvori(ctx, 5)).toBeNull();
    expect(z.upozorenja).toEqual([]);
  });

  it('linija sa lnRef stila: boja i debljina iz stila', () => {
    const style = '<p:style><a:lnRef idx="1"><a:schemeClr val="accent2"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>'
      + '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style>';
    const { ctx } = slajd(konektor(5, 1828800, 914400, 'straightConnector1', '', '', style));
    expect(pretvori(ctx, 5)).toMatchObject({ oblik: 'LINIJA', popuna: null, ivica: { boja: '#ED7D31', debljina: 0.5, crtica: 'PUNA' } });
  });

  it('izlomljen konektor -> LINIJA od početka do kraja + OBLIK_PRIBLIZAN', () => {
    const { ctx, z } = slajd(konektor(5, 1828800, 914400, 'bentConnector3', `<a:ln w="12700">${crna}<a:tailEnd type="triangle"/></a:ln>`));
    expect(pretvori(ctx, 5)).toMatchObject({ oblik: 'STRELICA', od: { x: 0, y: 0 }, do: { x: 144, y: 72 } });
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('rightArrow -> STRELICA (boja popune, debljina pola kraće strane) + OBLIK_PRIBLIZAN', () => {
    const { ctx, z } = slajd(oblik.geometrija(5, 'rightArrow', 914400, 914400, 1828800, 508000,
      '<a:solidFill><a:srgbClr val="70AD47"/></a:solidFill>'));
    expect(pretvori(ctx, 5)).toMatchObject({
      oblik: 'STRELICA', popuna: null, sirina: 144, visina: 40,
      ivica: { boja: '#70AD47', debljina: 20, crtica: 'PUNA' }, od: { x: 0, y: 20 }, do: { x: 144, y: 20 },
    });
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('blok strelice: smerovi i debljina najviše 20', () => {
    const p = '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>';
    const { ctx } = slajd(oblik.geometrija(5, 'leftArrow', 0, 0, 1270000, 254000, p)
      + oblik.geometrija(6, 'upArrow', 0, 0, 254000, 1270000, p)
      + oblik.geometrija(7, 'downArrow', 0, 0, 254000, 1270000, p)
      + oblik.geometrija(8, 'upDownArrow', 0, 0, 254000, 1270000, p)
      + oblik.geometrija(9, 'leftRightArrow', 0, 0, 1270000, 254000, p));
    expect(pretvori(ctx, 5)).toMatchObject({ oblik: 'STRELICA', od: { x: 100, y: 10 }, do: { x: 0, y: 10 }, ivica: { debljina: 10 } });
    expect(pretvori(ctx, 6)).toMatchObject({ oblik: 'STRELICA', od: { x: 10, y: 100 }, do: { x: 10, y: 0 } });
    expect(pretvori(ctx, 7)).toMatchObject({ oblik: 'STRELICA', od: { x: 10, y: 0 }, do: { x: 10, y: 100 } });
    expect(pretvori(ctx, 8)).toMatchObject({ oblik: 'DVOSTRUKA_STRELICA', od: { x: 10, y: 0 }, do: { x: 10, y: 100 } });
    expect(pretvori(ctx, 9)).toMatchObject({ oblik: 'DVOSTRUKA_STRELICA', od: { x: 0, y: 10 }, do: { x: 100, y: 10 } });
  });

  it('OBLIK_PRIBLIZAN se prijavljuje jednom po slajdu za istu pojavu', () => {
    const p = '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>';
    const { ctx, z } = slajd(oblik.geometrija(5, 'rightArrow', 0, 0, 1270000, 254000, p) + oblik.geometrija(6, 'rightArrow', 0, 0, 1270000, 254000, p));
    pretvori(ctx, 5);
    pretvori(ctx, 6);
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });
});

describe('popunaIz', () => {
  const popuna = (sadrzaj: string, o: { stil?: string } = {}) => {
    const { ctx, z } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, sadrzaj, o.stil ?? ''));
    return { p: popunaIz(spPr(ctx, 5), ctx, stil(ctx, 5)), ctx, z };
  };

  it('noFill -> null; bez popune i bez stila -> null', () => {
    expect(popuna('<a:noFill/>').p).toBeNull();
    expect(popuna('').p).toBeNull();
    expect(popunaIz(null, slajd('').ctx)).toBeNull();
  });

  it('solidFill sa alfom se meša sa pozadinom slajda', () => {
    expect(popuna('<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill>').p).toBe('#FF8080');
  });

  it('gradFill -> prvi a:gs + OBLIK_PRIBLIZAN', () => {
    const { p, z } = popuna('<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="112233"/></a:gs><a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill>');
    expect(p).toBe('#112233');
    expect(kodovi(z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('pattFill -> fgClr + OBLIK_PRIBLIZAN; blipFill -> null + OBLIK_PRIBLIZAN', () => {
    const a = popuna('<a:pattFill prst="pct5"><a:fgClr><a:srgbClr val="AA0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>');
    expect(a.p).toBe('#AA0000');
    expect(kodovi(a.z)).toEqual(['OBLIK_PRIBLIZAN']);
    const b = popuna('<a:blipFill><a:blip r:embed="rIdX"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>');
    expect(b.p).toBeNull();
    expect(kodovi(b.z)).toEqual(['OBLIK_PRIBLIZAN']);
  });

  it('fillRef idx 0 -> nema popune; sopstvena popuna je jača od stila', () => {
    const stilXml = (idx: number) => `<p:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="${idx}"><a:schemeClr val="accent2"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"/></p:style>`;
    expect(popuna('', { stil: stilXml(0) }).p).toBeNull();
    expect(popuna('<a:noFill/>', { stil: stilXml(1) }).p).toBeNull();
    expect(popuna('', { stil: stilXml(3) }).p).toBe('#ED7D31');
  });

  it('grpFill -> popuna grupe iz konteksta (nema je -> null)', () => {
    const { ctx } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, '<a:grpFill/>'));
    expect(popunaIz(spPr(ctx, 5), ctx)).toBeNull();
    ctx.popunaGrupe = '#123456';
    expect(popunaIz(spPr(ctx, 5), ctx)).toBe('#123456');
  });
});

describe('ivicaIz', () => {
  const ivica = (lnXml: string) => {
    const { ctx, z } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, lnXml));
    const sp = spPr(ctx, 5)!;
    return { i: ivicaIz(dete(sp, NS.a, 'ln'), ctx, stil(ctx, 5)), z };
  };

  it('noFill -> null; nema ln ni lnRef -> null; ln bez boje i bez stila -> null (PowerPoint je ne crta)', () => {
    expect(ivica('<a:ln w="12700"><a:noFill/></a:ln>').i).toBeNull();
    expect(ivica('').i).toBeNull();
    expect(ivica('<a:ln w="12700"/>').i).toBeNull();
  });

  it('crtice: dash/lgDash/sysDashDot -> ISPREKIDANA, dot/sysDot -> TACKASTA, solid -> PUNA', () => {
    const c = (v: string) => ivica(`<a:ln>${crna}<a:prstDash val="${v}"/></a:ln>`).i!.crtica;
    for (const v of ['dash', 'lgDash', 'sysDash', 'dashDot', 'lgDashDot', 'lgDashDotDot', 'sysDashDot', 'sysDashDotDot']) {
      expect(c(v)).toBe('ISPREKIDANA');
    }
    expect(c('dot')).toBe('TACKASTA');
    expect(c('sysDot')).toBe('TACKASTA');
    expect(c('solid')).toBe('PUNA');
  });

  it('debljina: podrazumevano 9525 EMU = 0,75; granice 0,25..20', () => {
    expect(ivica(`<a:ln>${crna}</a:ln>`).i!.debljina).toBe(0.75);
    expect(ivica(`<a:ln w="0">${crna}</a:ln>`).i!.debljina).toBe(0.25);
    expect(ivica(`<a:ln w="1270000">${crna}</a:ln>`).i!.debljina).toBe(20);
  });

  it('debljina se skalira transformacijom slajda', () => {
    const { ctx } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, `<a:ln w="25400">${crna}</a:ln>`), { velicina: { cx: 24384000, cy: 13716000 } });
    expect(ctx.t.s).toBe(0.5);
    expect(ivicaIz(dete(spPr(ctx, 5)!, NS.a, 'ln'), ctx)!.debljina).toBe(1);
  });

  it('svaka izlazna boja je #RRGGBB', () => {
    expect(ivica(`<a:ln><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></a:solidFill></a:ln>`).i!.boja).toMatch(BOJA);
  });
});

describe('senkaIz', () => {
  it('outerShdw na spPr -> senka (kao senkaIzEfekta)', () => {
    const shdw = '<a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw>';
    const { ctx, z } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, `<a:effectLst>${shdw}</a:effectLst>`));
    const sp = spPr(ctx, 5)!;
    const s = senkaIz(sp, ctx);
    expect(s).toEqual(senkaIzEfekta(dete(dete(sp, NS.a, 'effectLst')!, NS.a, 'outerShdw')!, ctx));
    expect(s).toMatchObject({ boja: '#999999', pomerajX: 2.12, pomerajY: 2.12, zamucenje: 4 });
    expect(pretvori(ctx, 5)!.senka).toEqual(s);
    expect(z.upozorenja).toEqual([]);
  });

  it('glow/softEdge/reflection/innerShdw -> SENKA jednom po slajdu; bez effectLst -> null', () => {
    const { ctx, z } = slajd(oblik.geometrija(5, 'ellipse', 0, 0, 12700, 12700, '<a:effectLst><a:glow rad="63500"><a:srgbClr val="FF0000"/></a:glow></a:effectLst>')
      + oblik.geometrija(6, 'ellipse', 0, 0, 12700, 12700, '<a:effectLst><a:softEdge rad="12700"/><a:reflection/></a:effectLst>')
      + oblik.geometrija(7, 'ellipse', 0, 0, 12700, 12700));
    expect(senkaIz(spPr(ctx, 5), ctx)).toBeNull();
    expect(senkaIz(spPr(ctx, 6), ctx)).toBeNull();
    expect(senkaIz(spPr(ctx, 7), ctx)).toBeNull();
    expect(senkaIz(null, ctx)).toBeNull();
    expect(kodovi(z)).toEqual(['SENKA']);
  });
});
