import { kontekstZaTest } from './kontekst.testing';
import { formuleCelija, pretvoriFormulu } from './formula';
import { dekodirajPng, kodirajPng } from './png';
import { oblik, PNG_1X1, tabela, type OpcijeFabrike, type VezaFabrike } from './pptx-fabrika.testing';
import { pretvoriTabelu } from './tabela';
import { kutijaIzLanca } from './nasledjivanje';
import type { Kutija } from './tipovi';
import { NS } from './xml';

const SLIKA: VezaFabrike = { id: 'rIdF', tip: 'image', cilj: '../media/formula1.png' };
const KUTIJA = '<a:xfrm><a:off x="1270000" y="635000"/><a:ext cx="2540000" cy="1270000"/></a:xfrm>';   // 100,50 200 x 100
const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
const razlomak = `<m:f><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`;
const mp = (omml: string) => `<a:p><a14:m><m:oMathPara><m:oMath>${omml}</m:oMath></m:oMathPara></a14:m></a:p>`;
const tekst = (t: string, pPr = '') => `<a:p>${pPr}<a:r><a:rPr lang="sr-Latn-RS"/><a:t>${t}</a:t></a:r></a:p>`;
const prazanPasus = '<a:p><a:endParaRPr lang="sr-Latn-RS"/></a:p>';

/** PNG 4 x 30 sa crnim redovima mastila na datim opsezima redova. */
function slikaFormule(nizovi: [number, number][], visina = 30): Uint8Array {
  const piksli = new Uint8Array(4 * visina * 4);
  for (let y = 0; y < visina; y++) {
    const mastilo = nizovi.some(([a, b]) => y >= a && y < b);
    for (let x = 0; x < 4; x++) piksli.set(mastilo ? [0, 0, 0, 255] : [0, 0, 0, 0], (y * 4 + x) * 4);
  }
  return kodirajPng({ sirina: 4, visina, piksli });
}

/**
 * `mc:AlternateContent` formule: `p:sp` (id 5) u Choice, fallback `p:sp` sa slikom (ili bez nje kad je `rId` null).
 * `lstStyle` je sadržaj `a:lstStyle` oblika, `kutija` njegov `a:xfrm`.
 */
function formulaAc(pasusi: string, fillRect = '', rId: string | null = 'rIdF', o: { lstStyle?: string; kutija?: string } = {}): string {
  const nv = '<p:nvSpPr><p:cNvPr id="5" name="Formula 5"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>';
  const k = o.kutija ?? KUTIJA;
  const blip = rId ? `<a:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect ${fillRect}/></a:stretch></a:blipFill>` : '';
  return `<mc:AlternateContent><mc:Choice Requires="a14"><p:sp>${nv}<p:spPr>${k}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle>${o.lstStyle ?? ''}</a:lstStyle>${pasusi}</p:txBody></p:sp></mc:Choice>`
    + `<mc:Fallback><p:sp>${nv}<p:spPr>${k}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${blip}</p:spPr></p:sp></mc:Fallback></mc:AlternateContent>`;
}

function sa(spTree: string, png: Uint8Array = slikaFormule([[2, 6]]), o: Partial<OpcijeFabrike> = {}, veza = SLIKA) {
  const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree, veze: [veza] }], delovi: { 'ppt/media/formula1.png': png }, ...o });
  const ac = ctx.slajd.doc.getElementsByTagNameNS(NS.mc, 'AlternateContent')[0];
  return { ctx, z, ac };
}
const identitet = (k: Kutija) => k;
const kodovi = (z: { upozorenja: { kod: string }[] }) => z.upozorenja.map((u) => u.kod);

describe('pretvoriFormulu: ceo okvir', () => {
  it('jedan FORMULA sloj u pravougaoniku slike (fillRect l=-10%), LaTeX iz pasusa', () => {
    const { ctx, z, ac } = sa(formulaAc(mp(razlomak), 'l="-10000"'), PNG_1X1);
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!;
    expect(rez.slojevi).toEqual([{
      id: 's5', tip: 'FORMULA', naziv: 'Formula 5', x: 80, y: 50, sirina: 220, visina: 100, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, latex: '\\frac{a}{b}', boja: '#000000', velicina: 18, poravnanje: 'CENTAR',
      slikaIzvora: 'pptx:ppt/media/formula1.png',
    }]);
    expect(rez.pasusUSloj.size).toBe(0);
    expect(z.upozorenja).toEqual([]);
  });

  it('fillRect na sve strane: t, r, b (1/1000 %)', () => {
    const { ctx, ac } = sa(formulaAc(mp(razlomak), 't="10000" r="20000" b="-10000"'));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect([s.x, s.y, s.sirina, s.visina]).toEqual([100, 60, 160, 100]);   // y1 = 150 + 10
  });

  it('boja, veličina i poravnanje iz prvog dela / pasusa', () => {
    const rPr = '<a:rPr lang="sr-Latn-RS" sz="2400"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>';
    const p = `<a:p><a:pPr algn="r"/><a:r>${rPr}<a:t>x</a:t></a:r></a:p>`;
    const { ctx, ac } = sa(formulaAc(p));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s).toMatchObject({ boja: '#FF0000', velicina: 24, poravnanje: 'DESNO', latex: '\\text{x}' });
  });

  it('boja i veličina iz a:rPr matematičkog dela (m:r), boja sa alfom pomešana sa pozadinom', () => {
    const rPr = (boja: string) => `<a:rPr lang="en-US" sz="2000" i="1"><a:solidFill>${boja}</a:solidFill><a:latin typeface="Cambria Math"/></a:rPr>`;
    const mr = (boja: string) => `<a:p><a14:m><m:oMath><m:r>${rPr(boja)}<m:t>x</m:t></m:r></m:oMath></a14:m></a:p>`;
    const zelena = sa(formulaAc(mr('<a:srgbClr val="00FF00"/>')));
    expect(pretvoriFormulu(zelena.ac, identitet, zelena.ctx, 's5', new Set())!.slojevi[0])
      .toMatchObject({ boja: '#00FF00', velicina: 20, poravnanje: 'LEVO', latex: 'x' });
    const siva = sa(formulaAc(mr('<a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr>')));
    expect(pretvoriFormulu(siva.ac, identitet, siva.ctx, 's5', new Set())!.slojevi[0].boja).toBe('#808080');
  });

  it('poravnanje prikazne formule iz m:oMathParaPr/m:jc (podrazumevano centrirano)', () => {
    const p = `<a:p><a14:m><m:oMathPara><m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr><m:oMath>${r('x')}</m:oMath></m:oMathPara></a14:m></a:p>`;
    const { ctx, ac } = sa(formulaAc(p));
    expect(pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0].poravnanje).toBe('LEVO');
  });

  it('rotiran okvir: pravougaonik slike (fillRect) se pomera u rotiranom sistemu oblika', () => {
    const rot = '<a:xfrm rot="5400000"><a:off x="1270000" y="635000"/><a:ext cx="2540000" cy="1270000"/></a:xfrm>';
    const { ctx, ac } = sa(formulaAc(mp(razlomak), 'l="-10000"', 'rIdF', { kutija: rot }));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    // centar oblika (200, 100); centar slike je 10 levo u sistemu oblika, posle 90° to je 10 gore
    expect([s.x, s.y, s.sirina, s.visina, s.rotacija]).toEqual([90, 40, 220, 100, 90]);
  });

  it('kutija ide kroz kutijaGrupe', () => {
    const { ctx, ac } = sa(formulaAc(mp(razlomak)));
    const s = pretvoriFormulu(ac, (k) => ({ ...k, x: k.x + 1270000 }), ctx, 's5', new Set())!.slojevi[0];
    expect(s.x).toBe(200);
  });

  it('bez fallback slike: slikaIzvora null + FORMULA_ZA_PROVERU', () => {
    const { ctx, z, ac } = sa(formulaAc(mp(razlomak), '', null));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.slikaIzvora).toBeNull();
    expect(kodovi(z)).toEqual(['FORMULA_ZA_PROVERU']);
  });

  it('OMML koji konvertor ne zna u potpunosti -> FORMULA_ZA_PROVERU jednom po sloju', () => {
    const { ctx, z, ac } = sa(formulaAc(mp(`<m:foo>${r('z')}</m:foo>`)));
    pretvoriFormulu(ac, identitet, ctx, 's5', new Set());
    expect(kodovi(z)).toEqual(['FORMULA_ZA_PROVERU']);
    expect(z.upozorenja[0].poruka).toContain('s5');
  });

  it('fallback slika u formatu koji pregledač ne dekodira (EMF): bez slike + FORMULA_ZA_PROVERU, medij se ne registruje', () => {
    const emf: VezaFabrike = { id: 'rIdF', tip: 'image', cilj: '../media/formula1.emf' };
    const { ctx, z, ac } = sa(formulaAc(mp(razlomak)), slikaFormule([[2, 6]]), { delovi: { 'ppt/media/formula1.emf': Uint8Array.from([1, 2]) } }, emf);
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.slikaIzvora).toBeNull();
    expect(kodovi(z)).toEqual(['FORMULA_ZA_PROVERU']);
    expect(z.mediji.size).toBe(0);
  });

  it('placeholder bez a:xfrm: položaj iz layouta, znak liste stila tela se ne dodaje', () => {
    const nv = '<p:nvSpPr><p:cNvPr id="5" name="Sadržaj"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>';
    const blip = '<a:blipFill><a:blip r:embed="rIdF"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>';
    const ac = `<mc:AlternateContent><mc:Choice Requires="a14"><p:sp>${nv}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${mp(razlomak)}</p:txBody></p:sp></mc:Choice>`
      + `<mc:Fallback><p:sp>${nv}<p:spPr>${blip}</p:spPr></p:sp></mc:Fallback></mc:AlternateContent>`;
    const { ctx, ac: el } = sa(ac);
    const s = pretvoriFormulu(el, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect([s.x, s.y, s.sirina, s.latex, s.velicina]).toEqual([66, 150, 828, '\\frac{a}{b}', 28]);
  });

  it('nema položaja ni u Fallback ni u Choice -> null + OBJEKAT_PRESKOCEN', () => {
    const ac = '<mc:AlternateContent><mc:Choice Requires="a14"><p:sp><p:nvSpPr><p:cNvPr id="5" name="F"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Choice></mc:AlternateContent>';
    const { ctx, z, ac: el } = sa(ac);
    expect(pretvoriFormulu(el, identitet, ctx, 's5', new Set())).toBeNull();
    expect(kodovi(z)).toEqual(['OBJEKAT_PRESKOCEN']);
  });

  it('automatska numeracija pasusa ostaje kao tekst: 1. 2. (prazan pasus ne troši broj)', () => {
    const num = '<a:pPr marL="342900" indent="-342900"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/></a:pPr>';
    const pasusi = `<a:p>${num}<a14:m><m:oMath>${r('NOT')}</m:oMath></a14:m></a:p>${prazanPasus}`
      + `<a:p>${num}<a14:m><m:oMath>${r('AND')}</m:oMath></a14:m></a:p>`;
    const { ctx, ac } = sa(formulaAc(pasusi));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.latex).toBe('\\begin{gathered}\\text{1. }NOT\\\\\\text{2. }AND\\end{gathered}');
  });

  it('numeracija: format i početak (startAt, alphaLcParenR), dublji nivo ne prekida plići', () => {
    const lista = (tip: string, lvl: number, startAt = '') =>
      `<a:pPr lvl="${lvl}"><a:buAutoNum type="${tip}"${startAt}/></a:pPr>`;
    const pasusi = `<a:p>${lista('alphaLcParenR', 0, ' startAt="3"')}${'<a:r><a:t>x</a:t></a:r>'}</a:p>`
      + `<a:p>${lista('arabicPlain', 1)}<a:r><a:t>y</a:t></a:r></a:p>`
      + `<a:p>${lista('alphaLcParenR', 0, ' startAt="3"')}<a:r><a:t>z</a:t></a:r></a:p>`;
    const { ctx, ac } = sa(formulaAc(pasusi));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.latex).toBe('\\begin{gathered}\\text{c) x}\\\\\\text{1 y}\\\\\\text{d) z}\\end{gathered}');
  });

  it('numeracija nasleđena iz lstStyle oblika; pasus sa buNone je bez broja i prekida brojanje', () => {
    const lst = '<a:lvl1pPr marL="342900" indent="-342900"><a:buAutoNum type="arabicParenR"/></a:lvl1pPr>';
    const pasusi = '<a:p><a:r><a:t>x</a:t></a:r></a:p><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>y</a:t></a:r></a:p>'
      + '<a:p><a:r><a:t>z</a:t></a:r></a:p>';
    const { ctx, ac } = sa(formulaAc(pasusi, '', 'rIdF', { lstStyle: lst }));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.latex).toBe('\\begin{gathered}\\text{1) x}\\\\\\text{y}\\\\\\text{1) z}\\end{gathered}');
  });

  it('razmak na početku numerisanog pasusa se ne udvaja posle oznake', () => {
    const num = '<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>';
    const pasusi = `<a:p>${num}<a:r><a:t> x</a:t></a:r></a:p><a:p>${num}<a:r><a:t> </a:t></a:r><a14:m><m:oMath>${r('y')}</m:oMath></a14:m></a:p>`;
    const { ctx, ac } = sa(formulaAc(pasusi));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.latex).toBe('\\begin{gathered}\\text{1. x}\\\\\\text{2. }y\\end{gathered}');
  });

  it('znak liste (buChar) se ne dodaje, ali prekida brojanje kao u prikazu teksta', () => {
    const num = '<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>';
    const pasusi = `<a:p>${num}<a:r><a:t>a</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>b</a:t></a:r></a:p>`
      + `<a:p>${num}<a:r><a:t>c</a:t></a:r></a:p>`;
    const { ctx, ac } = sa(formulaAc(pasusi));
    const s = pretvoriFormulu(ac, identitet, ctx, 's5', new Set())!.slojevi[0];
    expect(s.latex).toBe('\\begin{gathered}\\text{1. a}\\\\\\text{b}\\\\\\text{1. c}\\end{gathered}');
  });
});

describe('pretvoriFormulu: po pasusu (PNG pojasevi)', () => {
  const tri = () => mp(razlomak) + prazanPasus + tekst('tekst');

  it('animacije na pasusima {0, 2}: dva sloja s5p0 i s5p2 sa visinama po pojasevima', () => {
    const { ctx, z, ac } = sa(formulaAc(tri()), slikaFormule([[2, 6], [22, 26]]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.map((s) => s.id)).toEqual(['s5p0', 's5p2']);
    expect(rez.slojevi.map((s) => [s.x, s.sirina])).toEqual([[100, 200], [100, 200]]);
    // pojasevi [0, 14) i [14, 30) od 30 redova, visina okvira 100 (y 50..150)
    expect(rez.slojevi.map((s) => [s.y, s.visina])).toEqual([[50, 46.67], [96.67, 53.33]]);
    expect([...rez.pasusUSloj]).toEqual([[0, 's5p0'], [2, 's5p2']]);
    expect(rez.slojevi[0]).toMatchObject({ latex: '\\frac{a}{b}', slikaIzvora: 'gen:1' });
    expect(rez.slojevi[1]).toMatchObject({ latex: '\\text{tekst}', slikaIzvora: 'gen:2' });
    expect([...z.mediji.keys()]).toEqual(['gen:1', 'gen:2']);
    expect(kodovi(z)).toEqual([]);
  });

  it('generisani medij je PNG visine pojasa', () => {
    const { ctx, z, ac } = sa(formulaAc(tri()), slikaFormule([[2, 6], [22, 26]]));
    pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]));
    const b = z.mediji.get('gen:1')!;
    expect(b.ime).toBe('formula.png');
    const bajtovi = b.bajtovi()!;
    expect(Array.from(bajtovi.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(new DataView(bajtovi.buffer, bajtovi.byteOffset).getUint32(20)).toBe(14);   // IHDR visina
  });

  it('tri niza mastila za dva pasusa: spaja se na 2 i uspeva', () => {
    const { ctx, z, ac } = sa(formulaAc(tri()), slikaFormule([[2, 6], [10, 14], [22, 26]]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.length).toBe(2);
    expect(kodovi(z)).toEqual([]);
  });

  it('jedan niz mastila za dva pasusa: jedan sloj + FORMULA_ODJEDNOM, pasusUSloj prazan', () => {
    const { ctx, z, ac } = sa(formulaAc(tri()), slikaFormule([[2, 26]]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.map((s) => s.id)).toEqual(['s5']);
    expect(rez.slojevi[0].slikaIzvora).toBe('pptx:ppt/media/formula1.png');
    expect(rez.pasusUSloj.size).toBe(0);
    expect(kodovi(z)).toEqual(['FORMULA_ODJEDNOM']);
  });

  it('slika koja nije PNG: isto kao neuspeh (jedan sloj + FORMULA_ODJEDNOM)', () => {
    const { ctx, z, ac } = sa(formulaAc(tri()), Uint8Array.from([1, 2, 3, 4]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.length).toBe(1);
    expect(kodovi(z)).toEqual(['FORMULA_ODJEDNOM']);
  });

  it('bez fallback slike pasusi se ne razdvajaju: jedan sloj + FORMULA_ZA_PROVERU + FORMULA_ODJEDNOM', () => {
    const { ctx, z, ac } = sa(formulaAc(tri(), '', null));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.length).toBe(1);
    expect(kodovi(z).sort()).toEqual(['FORMULA_ODJEDNOM', 'FORMULA_ZA_PROVERU']);
  });

  it('pasus samo sa razmakom nema mastila: ne broji se kao neprazan', () => {
    const { ctx, z, ac } = sa(formulaAc(mp(razlomak) + tekst(' ') + tekst('tekst')), slikaFormule([[2, 6], [22, 26]]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([0, 2]))!;
    expect(rez.slojevi.map((s) => s.id)).toEqual(['s5p0', 's5p2']);
    expect(kodovi(z)).toEqual([]);
  });

  it('pojas od jednog reda u visokoj slici ima visinu bar 0,01 (server traži > 0)', () => {
    const { ctx, ac } = sa(formulaAc(mp(razlomak) + tekst('tekst')), slikaFormule([[0, 1], [2, 3]], 30000));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([1]))!;
    expect(rez.slojevi.map((s) => s.visina)).toEqual([0.01, 100]);
  });

  it('numeracija se prenosi i u sloj pasusa (broj računat u celom okviru)', () => {
    const num = '<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>';
    const pasusi = `<a:p>${num}<a:r><a:t>NOT</a:t></a:r></a:p><a:p>${num}<a:r><a:t>AND</a:t></a:r></a:p>`;
    const { ctx, ac } = sa(formulaAc(pasusi), slikaFormule([[2, 6], [22, 26]]));
    const rez = pretvoriFormulu(ac, identitet, ctx, 's5', new Set([1]))!;
    expect(rez.slojevi.map((s) => s.latex)).toEqual(['\\text{1. NOT}', '\\text{2. AND}']);
  });
});

describe('formuleCelija', () => {
  const KOL = 914400;
  const RED = 381000;

  it('formula u ćeliji (1, 2): TABELA + jedan FORMULA sloj u kutiji ćelije', () => {
    const blip = '<a:tcPr><a:blipFill><a:blip r:embed="rIdF"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></a:tcPr>';
    const formulaCelija = `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${mp(razlomak)}</a:txBody><a:tcPr/></a:tc>`;
    const tbl = (c12: string) => oblik.tabela(5, KOL, KOL, [KOL, KOL, KOL * 2], [
      tabela.red(RED, [tabela.celija('a'), tabela.celija('b'), tabela.celija('c')]),
      tabela.red(RED, [tabela.celija('d'), tabela.celija('e'), c12]),
    ], '<a:tblPr/>');
    const spTree = `<mc:AlternateContent><mc:Choice Requires="a14">${tbl(formulaCelija)}</mc:Choice>`
      + `<mc:Fallback>${tbl(tabela.celija('', '', blip))}</mc:Fallback></mc:AlternateContent>`;
    const { ctx, z, ac } = sa(spTree);
    const fallbackGf = ac.getElementsByTagNameNS(NS.mc, 'Fallback')[0].firstElementChild!;
    const rt = pretvoriTabelu(fallbackGf, kutijaIzLanca([fallbackGf])!, ctx, 's5')!;
    expect(rt.tabela.tip).toBe('TABELA');
    const slojevi = formuleCelija(ac, rt, ctx, 's5');
    expect(slojevi).toEqual([{
      id: 's5c1x2', tip: 'FORMULA', naziv: null, x: 216, y: 102, sirina: 144, visina: 30, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, latex: '\\frac{a}{b}', boja: '#000000', velicina: 18, poravnanje: 'CENTAR',
      slikaIzvora: 'pptx:ppt/media/formula1.png',
    }]);
    expect(kodovi(z)).toEqual([]);
  });

  /** Slika cele tabele 40 x 20: R = 8x, G = 12y (svaki piksel se prepoznaje po boji). */
  function slikaTabele(): Uint8Array {
    const piksli = new Uint8Array(40 * 20 * 4);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 40; x++) piksli.set([x * 6, y * 12, 0, 255], (y * 40 + x) * 4);
    return kodirajPng({ sirina: 40, visina: 20, piksli });
  }
  /** Tabela 2 x 3 (kolone K, K, 2K); ćelije (1, 1) i (1, 2) dele istu sliku cele tabele, svaka bira svoj deo `fillRect`-om. */
  function tabelaSaDeljenomSlikom(png: Uint8Array) {
    const blip = (fr: string) => `<a:tcPr><a:blipFill><a:blip r:embed="rIdF"/><a:stretch><a:fillRect ${fr}/></a:stretch></a:blipFill></a:tcPr>`;
    const mat = (t: string) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${mp(r(t))}</a:txBody><a:tcPr/></a:tc>`;
    const tbl = (c11: string, c12: string) => oblik.tabela(5, KOL, KOL, [KOL, KOL, KOL * 2], [
      tabela.red(RED, [tabela.celija('a'), tabela.celija('b'), tabela.celija('c')]),
      tabela.red(RED, [tabela.celija('d'), c11, c12]),
    ], '<a:tblPr/>');
    // (1, 1): slika počinje jednu širinu ćelije levo i jednu visinu gore, završava se 2 širine desno
    // (1, 2): ćelija je duplo šira, slika počinje jednu njenu širinu levo i jednu visinu gore
    const spTree = `<mc:AlternateContent><mc:Choice Requires="a14">${tbl(mat('x'), mat('y'))}</mc:Choice>`
      + `<mc:Fallback>${tbl(tabela.celija('', '', blip('l="-100000" t="-100000" r="-200000"')),
        tabela.celija('', '', blip('l="-100000" t="-100000"')))}</mc:Fallback></mc:AlternateContent>`;
    const { ctx, z, ac } = sa(spTree, png);
    const fallbackGf = ac.getElementsByTagNameNS(NS.mc, 'Fallback')[0].firstElementChild!;
    const rt = pretvoriTabelu(fallbackGf, kutijaIzLanca([fallbackGf])!, ctx, 's5')!;
    return { slojevi: formuleCelija(ac, rt, ctx, 's5'), z };
  }

  it('ćelije dele sliku cele tabele: svaka dobija isečak po svom fillRect-u, u kutiji ćelije', () => {
    const { slojevi, z } = tabelaSaDeljenomSlikom(slikaTabele());
    expect(slojevi.map((s) => [s.id, s.x, s.y, s.sirina, s.visina, s.latex, s.slikaIzvora])).toEqual([
      ['s5c1x1', 144, 102, 72, 30, 'x', 'gen:1'],
      ['s5c1x2', 216, 102, 144, 30, 'y', 'gen:2'],
    ]);
    expect([...z.mediji.keys()]).toEqual(['gen:1', 'gen:2']);   // cela slika tabele se ne šalje
    const c11 = dekodirajPng(z.mediji.get('gen:1')!.bajtovi()!)!;
    expect([c11.sirina, c11.visina]).toEqual([10, 10]);          // kolone 10..20, redovi 10..20
    expect(Array.from(c11.piksli.slice(0, 4))).toEqual([60, 120, 0, 255]);
    const c12 = dekodirajPng(z.mediji.get('gen:2')!.bajtovi()!)!;
    expect([c12.sirina, c12.visina]).toEqual([20, 10]);          // kolone 20..40, redovi 10..20
    expect(Array.from(c12.piksli.slice(0, 4))).toEqual([120, 120, 0, 255]);
    expect(Array.from(c12.piksli.slice(-4))).toEqual([234, 228, 0, 255]);
    expect(kodovi(z)).toEqual([]);
  });

  it('isečak ćelije ne uspeva (slika nije PNG): bez slike + FORMULA_ZA_PROVERU, nikad cela slika', () => {
    const { slojevi, z } = tabelaSaDeljenomSlikom(Uint8Array.from([1, 2, 3]));
    expect(slojevi.map((s) => s.slikaIzvora)).toEqual([null, null]);
    expect(z.mediji.size).toBe(0);
    expect(kodovi(z)).toEqual(['FORMULA_ZA_PROVERU', 'FORMULA_ZA_PROVERU']);
  });
});
