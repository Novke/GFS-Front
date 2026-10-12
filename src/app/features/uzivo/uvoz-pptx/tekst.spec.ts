import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import { lanacPlaceholdera, placeholderOblika, stiloviNivoa, vrstaTeksta } from './nasledjivanje';
import { oblik, type OpcijeFabrike } from './pptx-fabrika.testing';
import { podrazumevaniStopovi, pretvoriTekst, senkaIzEfekta, type OpcijeTeksta, type RezultatTeksta } from './tekst';
import type { KontekstSlajda } from './tipovi';
import { dete, NS, potomak } from './xml';

/** Tekst oblika `id` iz konteksta (lanac, nivoi i bodyPr kao u pozivaocu F5/F12). */
function tekstOblika(ctx: KontekstSlajda, id: number, sirina = 400, o?: OpcijeTeksta): RezultatTeksta {
  const sp = oblikSaId(ctx, id);
  const lanac = lanacPlaceholdera(sp, ctx);
  const vrsta = vrstaTeksta(placeholderOblika(sp));
  return pretvoriTekst(dete(sp, NS.p, 'txBody')!, (n) => stiloviNivoa(lanac, vrsta, ctx, n), lanac, ctx, sirina, o);
}

/** Tekst-okvir (id 5) sa datim pasusima; vraća rezultat i kontekst. */
function tekstOkvir(pasusi: string, bodyPr?: string, o: Partial<OpcijeFabrike> = {}, opcije?: OpcijeTeksta) {
  const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: oblik.tekst(5, 0, 0, 1270000, 635000, pasusi, undefined, bodyPr) }], ...o });
  return { r: tekstOblika(ctx, 5, 400, opcije), ctx, z };
}

const run = (tekst: string, rPr = '<a:rPr lang="sr-Latn-RS"/>') => `<a:r>${rPr}<a:t>${tekst}</a:t></a:r>`;
const p = (sadrzaj: string, pPr = '') => `<a:p>${pPr}${sadrzaj}</a:p>`;

describe('pretvoriTekst: delovi', () => {
  it('delovi: svojstva dela iz rPr', () => {
    const { r } = tekstOkvir(p(run('A', '<a:rPr b="1" i="1" u="sng" sz="2400"><a:solidFill><a:srgbClr val="ff0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>')));
    expect(r.pasusi).toHaveLength(1);
    expect(r.pasusi[0].delovi).toEqual([{
      tekst: 'A', font: 'Arimo', velicina: 24, boja: '#FF0000',
      podebljano: true, kurziv: true, podvuceno: true, precrtano: false, polozaj: 'OBICAN',
    }]);
    expect(r.prazan).toBe(false);
  });

  it('podrazumevano: 18 pt, font tela teme (Carlito), boja tx1', () => {
    const { r } = tekstOkvir(p(`<a:r><a:t>x</a:t></a:r>`));
    expect(r.pasusi[0].delovi[0]).toMatchObject({ font: 'Carlito', velicina: 18, boja: '#000000', polozaj: 'OBICAN' });
  });

  it('spajanjeDelova: susedni delovi istih svojstava -> jedan deo', () => {
    const { r } = tekstOkvir(p(run('A') + run('B')));
    expect(r.pasusi[0].delovi.map((d) => d.tekst)).toEqual(['AB']);
  });

  it('različita svojstva se ne spajaju', () => {
    const { r } = tekstOkvir(p(run('A') + run('B', '<a:rPr b="1"/>')));
    expect(r.pasusi[0].delovi.map((d) => [d.tekst, d.podebljano])).toEqual([['A', false], ['B', true]]);
  });

  it('prelomIFld: a:r, a:br, a:fld -> x\\n5', () => {
    const { r } = tekstOkvir(p(run('x') + '<a:br><a:rPr lang="sr-Latn-RS"/></a:br>'
      + '<a:fld id="{00000000-0000-0000-0000-000000000001}" type="slidenum"><a:rPr lang="sr-Latn-RS"/><a:t>5</a:t></a:fld>'));
    expect(r.pasusi[0].delovi.map((d) => d.tekst)).toEqual(['x\n5']);
  });

  it('prazni a:t se preskaču', () => {
    const { r } = tekstOkvir(p(run('') + run('a', '<a:rPr b="1"/>') + run('', '<a:rPr i="1"/>')));
    expect(r.pasusi[0].delovi.map((d) => d.tekst)).toEqual(['a']);
  });

  it('eksponent i indeks iz baseline; precrtano', () => {
    const { r } = tekstOkvir(p(run('a', '<a:rPr baseline="30000"/>') + run('b', '<a:rPr baseline="-25000"/>')
      + run('c', '<a:rPr strike="sngStrike"/>')));
    expect(r.pasusi[0].delovi.map((d) => [d.tekst, d.polozaj, d.precrtano]))
      .toEqual([['a', 'EKSPONENT', false], ['b', 'INDEKS', false], ['c', 'OBICAN', true]]);
  });

  it('capAll: cap="all" -> velika slova', () => {
    const { r } = tekstOkvir(p(run('abc', '<a:rPr cap="all"/>')));
    expect(r.pasusi[0].delovi[0].tekst).toBe('ABC');
  });

  it('cap="small" -> velika slova, 0,8 veličine i TEKST_PRIBLIZAN', () => {
    const { r, z } = tekstOkvir(p(run('abc', '<a:rPr cap="small" sz="2000"/>')));
    expect(r.pasusi[0].delovi[0]).toMatchObject({ tekst: 'ABC', velicina: 16 });
    expect(z.upozorenja.map((u) => u.kod)).toContain('TEKST_PRIBLIZAN');
  });

  it('skalaSlajda: t.s = 0,75 -> 24 pt postaje 18', () => {
    const { ctx } = kontekstZaTest({
      velicina: { cx: 16256000, cy: 9144000 },
      slajdovi: [{ spTree: oblik.tekst(5, 0, 0, 1270000, 635000, p(run('a', '<a:rPr sz="2400"/>'))) }],
    });
    expect(ctx.t.s).toBeCloseTo(0.75, 10);
    expect(tekstOblika(ctx, 5).pasusi[0].delovi[0].velicina).toBe(18);
  });

  it('veličina se ograničava na 1..400', () => {
    const { r } = tekstOkvir(p(run('a', '<a:rPr sz="100000"/>')));
    expect(r.pasusi[0].delovi[0].velicina).toBe(400);
  });

  it('bezBoje -> boja pozadine; alfa se meša sa pozadinom', () => {
    const { r } = tekstOkvir(p(run('a', '<a:rPr><a:noFill/></a:rPr>')
      + run('b', '<a:rPr><a:solidFill><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:solidFill></a:rPr>')));
    expect(r.pasusi[0].delovi.map((d) => d.boja)).toEqual(['#FFFFFF', '#808080']);
  });

  it('nepoznatFont: Comic Sans MS -> Carlito, FONT_ZAMENJEN jednom za dva dela', () => {
    const rPr = (b: string) => `<a:rPr b="${b}"><a:latin typeface="Comic Sans MS"/></a:rPr>`;
    const { r, z } = tekstOkvir(p(run('a', rPr('0')) + run('b', rPr('1'))));
    expect(r.pasusi[0].delovi.map((d) => d.font)).toEqual(['Carlito', 'Carlito']);
    expect(z.upozorenja.filter((u) => u.kod === 'FONT_ZAMENJEN')).toHaveLength(1);
    expect(z.upozorenja[0]).toMatchObject({ slajd: 1, kod: 'FONT_ZAMENJEN' });
  });

  it('FONT_ZAMENJEN jednom po fontu po slajdu i kroz više okvira', () => {
    const rPr = '<a:rPr><a:latin typeface="Comic Sans MS"/></a:rPr>';
    const spTree = oblik.tekst(5, 0, 0, 12700, 12700, p(run('a', rPr))) + oblik.tekst(6, 0, 0, 12700, 12700, p(run('b', rPr)));
    const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree }] });
    tekstOblika(ctx, 5);
    tekstOblika(ctx, 6);
    expect(z.upozorenja.filter((u) => u.kod === 'FONT_ZAMENJEN')).toHaveLength(1);
  });

  it('opcije: stil oblika je slabiji od sopstvenog rPr, a jači od nasleđenih stilova', () => {
    const opcije: OpcijeTeksta = { podrazumevanaBoja: '#FFFFFF', fontIzStila: 'Times New Roman', podebljanoIzStila: true };
    const { r } = tekstOkvir(p(run('a') + run('b', '<a:rPr b="0"><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>')),
      undefined, {}, opcije);
    expect(r.pasusi[0].delovi.map((d) => [d.tekst, d.boja, d.font, d.podebljano]))
      .toEqual([['a', '#FFFFFF', 'Tinos', true], ['b', '#00FF00', 'Arimo', false]]);
  });

  it('hiperveza: boja hlink i podvučeno, osim kad deo ima svoju boju ili u', () => {
    const veza = '<a:hlinkClick r:id="rId9"/>';
    const { r } = tekstOkvir(p(run('a', `<a:rPr>${veza}</a:rPr>`)
      + run('b', `<a:rPr u="none"><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>${veza}</a:rPr>`)
      + run('c')), undefined, {}, { podrazumevanaBoja: '#FFFFFF' });
    expect(r.pasusi[0].delovi.map((d) => [d.tekst, d.boja, d.podvuceno]))
      .toEqual([['a', '#0563C1', true], ['b', '#00FF00', false], ['c', '#FFFFFF', false]]);
  });
});

describe('pretvoriTekst: pasusi', () => {
  it('poravnanje, nivo, uvlačenje, prored i razmaci iz pPr', () => {
    const pPr = '<a:pPr algn="ctr" lvl="1" marL="254000" indent="-127000"><a:lnSpc><a:spcPct val="85000"/></a:lnSpc>'
      + '<a:spcBef><a:spcPts val="600"/></a:spcBef><a:spcAft><a:spcPct val="50000"/></a:spcAft></a:pPr>';
    const { r } = tekstOkvir(p(run('a', '<a:rPr sz="2000"/>'), pPr));
    expect(r.pasusi[0]).toMatchObject({
      poravnanje: 'CENTAR', nivo: 1, uvlacenje: { levo: 20, prviRed: -10 }, proredProcenat: 85, razmakPre: 6, razmakPosle: 12,
    });
  });

  it('poravnanje: r -> DESNO, just/dist -> OBOSTRANO, nema -> LEVO', () => {
    const { r } = tekstOkvir(p(run('a'), '<a:pPr algn="r"/>') + p(run('b'), '<a:pPr algn="just"/>')
      + p(run('c'), '<a:pPr algn="dist"/>') + p(run('d')));
    expect(r.pasusi.map((x) => x.poravnanje)).toEqual(['DESNO', 'OBOSTRANO', 'OBOSTRANO', 'LEVO']);
  });

  it('prored u tačkama: pts / (1,2 x najveća veličina) x 100, ograničen na 50..300', () => {
    const lnSpc = (v: number) => `<a:pPr><a:lnSpc><a:spcPts val="${v}"/></a:lnSpc></a:pPr>`;
    const { r } = tekstOkvir(p(run('a', '<a:rPr sz="1000"/>') + run('b', '<a:rPr sz="2000"/>'), lnSpc(3600))
      + p(run('c', '<a:rPr sz="2000"/>'), lnSpc(100)) + p(run('d', '<a:rPr sz="1000"/>'), lnSpc(100000)));
    expect(r.pasusi.map((x) => x.proredProcenat)).toEqual([150, 50, 300]);
  });

  it('nasledjenaLista: telo bez pPr -> znak, uvlačenje, prored i razmak iz mastera', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: oblik.placeholder(3, '<p:ph idx="1"/>', p(run('a'))) }] });
    const pas = tekstOblika(ctx, 3).pasusi[0];
    expect(pas.lista).toEqual({ vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null });
    expect(pas.uvlacenje).toEqual({ levo: 18, prviRed: -18 });
    expect(pas.proredProcenat).toBe(90);
    expect(pas.razmakPre).toBe(10);
    expect(pas.delovi[0]).toMatchObject({ velicina: 28, font: 'Carlito' });
  });

  it('prazanPasusCuvaVisinu: endParaRPr sz=3600 -> jedan deo "" veličine 36', () => {
    const { r } = tekstOkvir(p(run('a')) + '<a:p><a:endParaRPr sz="3600"/></a:p>');
    expect(r.pasusi).toHaveLength(2);
    expect(r.pasusi[1].delovi).toHaveLength(1);
    expect(r.pasusi[1].delovi[0]).toMatchObject({ tekst: '', velicina: 36 });
  });

  it('prazan pasus bez endParaRPr uzima veličinu iz lanca; indeksi pasusa 1:1', () => {
    const { r } = tekstOkvir('<a:p/>' + p(run('a')) + '<a:p/>');
    expect(r.pasusi.map((x) => x.delovi.map((d) => [d.tekst, d.velicina]))).toEqual([[['', 18]], [['a', 18]], [['', 18]]]);
  });

  it('prazan: samo razmaci i prelomi su prazan tekst', () => {
    expect(tekstOkvir(p(run('  ') + '<a:br/>') + '<a:p/>').r.prazan).toBe(true);
    expect(tekstOkvir('<a:p/>').r.prazan).toBe(true);
    expect(tekstOkvir(p(run(' x '))).r.prazan).toBe(false);
  });
});

describe('pretvoriTekst: liste', () => {
  const lista = (pPr: string) => tekstOkvir(p(run('a'), `<a:pPr>${pPr}</a:pPr>`));

  it('listaBrojBezTacke: arabicPlain startAt=3 -> ARAPSKI od 3', () => {
    expect(lista('<a:buAutoNum type="arabicPlain" startAt="3"/>').r.pasusi[0].lista)
      .toEqual({ vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI', pocetak: 3 });
  });

  it('poznate šeme brojeva bez upozorenja', () => {
    const seme: [string, string][] = [
      ['arabicPeriod', 'ARAPSKI_TACKA'], ['arabicParenR', 'ARAPSKI_ZAGRADA'], ['alphaLcParenR', 'MALA_SLOVA_ZAGRADA'],
      ['alphaUcPeriod', 'VELIKA_SLOVA_TACKA'], ['romanUcPeriod', 'RIMSKI_VELIKI_TACKA'], ['romanLcPeriod', 'RIMSKI_MALI_TACKA'],
    ];
    for (const [sema, format] of seme) {
      const { r, z } = lista(`<a:buAutoNum type="${sema}"/>`);
      expect(r.pasusi[0].lista).toEqual({ vrsta: 'BROJ', znak: null, boja: null, format, pocetak: 1 });
      expect(z.upozorenja).toEqual([]);
    }
  });

  it('ostale šeme po vrsti + TEKST_PRIBLIZAN', () => {
    const seme: [string, string][] = [
      ['alphaLcPeriod', 'MALA_SLOVA_ZAGRADA'], ['alphaUcParenBoth', 'VELIKA_SLOVA_TACKA'], ['romanUcParenR', 'RIMSKI_VELIKI_TACKA'],
      ['romanLcParenBoth', 'RIMSKI_MALI_TACKA'], ['circleNumDbPlain', 'ARAPSKI_TACKA'], ['arabicParenBoth', 'ARAPSKI_TACKA'],
    ];
    for (const [sema, format] of seme) {
      const { r, z } = lista(`<a:buAutoNum type="${sema}"/>`);
      expect(r.pasusi[0].lista?.format).toBe(format);
      expect(z.upozorenja.map((u) => u.kod)).toEqual(['TEKST_PRIBLIZAN']);
    }
  });

  it('wingdings: § -> ▪; ostali znaci simbolskih fontova', () => {
    expect(lista('<a:buFont typeface="Wingdings"/><a:buChar char="&#167;"/>').r.pasusi[0].lista?.znak).toBe('▪');
    const parovi: [string, string, string][] = [
      ['Wingdings', 'l', '●'], ['Wingdings', 'n', '■'], ['Wingdings', 'q', '❑'], ['Wingdings', 'v', '❖'],
      ['Wingdings', 'Ø', '➢'], ['Wingdings', 'ü', '✓'], ['Wingdings', 'à', '➔'], ['Symbol', '·', '•'],
      ['Wingdings', '&#xF0A7;', '▪'], ['Symbol', '&#xF0B7;', '•'],
    ];
    for (const [font, znak, ocekivan] of parovi) {
      const { r, z } = lista(`<a:buFont typeface="${font}"/><a:buChar char="${znak}"/>`);
      expect(r.pasusi[0].lista?.znak).toBe(ocekivan);
      expect(z.upozorenja).toEqual([]);
    }
  });

  it('nepoznat znak simbolskog fonta -> • + TEKST_PRIBLIZAN; običan font zadržava znak', () => {
    const { r, z } = lista('<a:buFont typeface="Wingdings"/><a:buChar char="X"/>');
    expect(r.pasusi[0].lista?.znak).toBe('•');
    expect(z.upozorenja.map((u) => u.kod)).toEqual(['TEKST_PRIBLIZAN']);
    const obican = lista('<a:buFont typeface="Arial"/><a:buChar char="–"/>');
    expect(obican.r.pasusi[0].lista?.znak).toBe('–');
    expect(obican.z.upozorenja).toEqual([]);
  });

  it('pravi Unicode znak u simbolskom fontu ostaje, bez upozorenja', () => {
    const { r, z } = lista('<a:buFont typeface="Wingdings"/><a:buChar char="•"/>');
    expect(r.pasusi[0].lista?.znak).toBe('•');
    expect(z.upozorenja).toEqual([]);
    expect(lista('<a:buFont typeface="Symbol"/><a:buChar char="–"/>').r.pasusi[0].lista?.znak).toBe('–');
  });

  it('znak razmak -> bez liste; buNone -> bez liste', () => {
    expect(lista('<a:buFont typeface="Arial"/><a:buChar char=" "/>').r.pasusi[0].lista).toBeNull();
    expect(lista('<a:buNone/>').r.pasusi[0].lista).toBeNull();
  });

  it('boja liste: buClr -> hex, buClrTx -> null', () => {
    expect(lista('<a:buClr><a:srgbClr val="00ff00"/></a:buClr><a:buChar char="•"/>').r.pasusi[0].lista?.boja).toBe('#00FF00');
    expect(lista('<a:buClrTx/><a:buChar char="•"/>').r.pasusi[0].lista?.boja).toBeNull();
  });
});

describe('pretvoriTekst: tab-stopovi', () => {
  it('tabOstajeUTekstu: tekst-okvir (defTabSz 36 pt) -> \\t u tekstu, bez stopova', () => {
    const { r } = tekstOkvir(p(run('2\t-&gt; 10')));
    expect(r.pasusi[0].delovi[0].tekst).toBe('2\t-> 10');
    expect(r.pasusi[0].tabulatori).toEqual([]);
  });

  it('tabUPlaceholderu: defTabSz 72 pt, širina 828 -> LEVO 72..792; pasus bez \\t -> []', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: oblik.placeholder(3, '<p:ph idx="1"/>', p(run('a\tb')) + p(run('c'))) }] });
    const r = tekstOblika(ctx, 3, 828);
    expect(r.pasusi[0].tabulatori).toEqual(Array.from({ length: 11 }, (_, i) => ({ poz: 72 * (i + 1), poravnanje: 'LEVO' })));
    expect(r.pasusi[1].tabulatori).toEqual([]);
  });

  it('sopstveni stopovi; podrazumevani tek posle poslednjeg; ne-LEVO -> TABULATORI', () => {
    const tabovi = '<a:tabLst><a:tab pos="914400" algn="l"/><a:tab pos="2032000" algn="ctr"/></a:tabLst>';
    const { ctx, z } = kontekstZaTest({
      slajdovi: [{ spTree: oblik.placeholder(3, '<p:ph idx="1"/>', p(run('a\tb'), `<a:pPr>${tabovi}</a:pPr>`)) }],
    });
    expect(tekstOblika(ctx, 3, 400).pasusi[0].tabulatori).toEqual([
      { poz: 72, poravnanje: 'LEVO' }, { poz: 160, poravnanje: 'CENTAR' },
      { poz: 216, poravnanje: 'LEVO' }, { poz: 288, poravnanje: 'LEVO' }, { poz: 360, poravnanje: 'LEVO' },
    ]);
    expect(z.upozorenja.map((u) => u.kod)).toEqual(['TABULATORI']);
  });

  it('desni i decimalni stop; bez \\t u pasusu nema TABULATORI', () => {
    const { r, z } = tekstOkvir(p(run('a'), '<a:pPr><a:tabLst><a:tab pos="127000" algn="r"/><a:tab pos="254000" algn="dec"/></a:tabLst></a:pPr>'));
    expect(r.pasusi[0].tabulatori).toEqual([{ poz: 10, poravnanje: 'DESNO' }, { poz: 20, poravnanje: 'DECIMALNO' }]);
    expect(z.upozorenja).toEqual([]);
  });

  it('defTabSz="1" i daleki sopstveni stop: bez podrazumevanih stopova, brzo', () => {
    const okvir = (defTabSz: number) => kontekstZaTest({
      slajdovi: [{ spTree: oblik.placeholder(3, '<p:ph idx="1"/>',
        p(run('a\tb'), `<a:pPr defTabSz="${defTabSz}"><a:tabLst><a:tab pos="36563300"/></a:tabLst></a:pPr>`)) }],
    }).ctx;
    const ctx = okvir(1);
    tekstOblika(ctx, 3, 2880);
    const pocetak = performance.now();
    const r = tekstOblika(ctx, 3, 2880);
    // Stara petlja (od k = 1, korak 1/12700 pt) je ovde trajala oko 0,5 s po pasusu.
    expect(performance.now() - pocetak).toBeLessThan(50);
    expect(r.pasusi[0].tabulatori).toEqual([{ poz: 2879, poravnanje: 'LEVO' }]);
    // 1 pt je najmanji dozvoljen: stop se dodaje samo iza poslednjeg sopstvenog.
    expect(tekstOblika(okvir(12700), 3, 2880).pasusi[0].tabulatori).toEqual([{ poz: 2879, poravnanje: 'LEVO' }, { poz: 2880, poravnanje: 'LEVO' }]);
  });

  it('podrazumevaniStopovi: petlja počinje iza poslednjeg sopstvenog stopa', () => {
    expect(podrazumevaniStopovi(72, 160, 400, 32)).toEqual([216, 288, 360]);
    expect(podrazumevaniStopovi(0.01, 2879.5, 2880, 32)).toHaveLength(32);
    expect(podrazumevaniStopovi(0.01, 2879.5, 2880, 32)[0]).toBe(2879.51);
    expect(podrazumevaniStopovi(0.0001, 0, 2880, 3)).toEqual([]);
    expect(podrazumevaniStopovi(0, 0, 2880, 32)).toEqual([]);
  });

  it('najviše 32 stopa', () => {
    const { ctx } = kontekstZaTest({
      slajdovi: [{ spTree: oblik.placeholder(3, '<p:ph idx="1"/>', p(run('a\tb'), '<a:pPr defTabSz="127000"/>')) }],
    });
    const stopovi = tekstOblika(ctx, 3, 900).pasusi[0].tabulatori;
    expect(stopovi).toHaveLength(32);
    expect(stopovi[31]).toEqual({ poz: 320, poravnanje: 'LEVO' });
  });
});

describe('pretvoriTekst: okvir', () => {
  it('podrazumevani bodyPr: margine 7,2 / 3,6, vrh, prelom, bez skale', () => {
    expect(tekstOkvir(p(run('a'))).r.okvir).toEqual({
      unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1,
    });
  });

  it('margine, sidro i prelom iz bodyPr', () => {
    const { r } = tekstOkvir(p(run('a')), '<a:bodyPr wrap="none" lIns="0" tIns="12700" rIns="25400" bIns="38100" anchor="b"/>');
    expect(r.okvir).toMatchObject({ unutraLevo: 0, unutraGore: 1, unutraDesno: 2, unutraDole: 3, sidro: 'DNO', prelom: false });
    expect(tekstOkvir(p(run('a')), '<a:bodyPr anchor="ctr"/>').r.okvir.sidro).toBe('SREDINA');
    expect(tekstOkvir(p(run('a')), '<a:bodyPr anchor="just"/>').r.okvir.sidro).toBe('VRH');
  });

  it('autofit: fontScale 62,5 %, lnSpcReduction 20 % -> skala 0,63 (server zaokružuje na 2 decimale), skalaProreda 0,8', () => {
    const { r } = tekstOkvir(p(run('a')), '<a:bodyPr><a:normAutofit fontScale="62500" lnSpcReduction="20000"/></a:bodyPr>');
    expect(r.okvir.skala).toBe(0.63);
    expect(r.okvir.skalaProreda).toBe(0.8);
  });

  it('skala i skalaProreda se ograničavaju (0,25..1 i 0,5..1)', () => {
    const { r } = tekstOkvir(p(run('a')), '<a:bodyPr><a:normAutofit fontScale="10000" lnSpcReduction="90000"/></a:bodyPr>');
    expect(r.okvir).toMatchObject({ skala: 0.25, skalaProreda: 0.5 });
  });

  it('uspravan tekst ili više kolona -> TEKST_PRIBLIZAN', () => {
    expect(tekstOkvir(p(run('a')), '<a:bodyPr vert="vert270"/>').z.upozorenja.map((u) => u.kod)).toEqual(['TEKST_PRIBLIZAN']);
    expect(tekstOkvir(p(run('a')), '<a:bodyPr numCol="2"/>').z.upozorenja.map((u) => u.kod)).toEqual(['TEKST_PRIBLIZAN']);
  });
});

describe('senka teksta', () => {
  const senka = (dist: number, boja = '000000') =>
    `<a:effectLst><a:outerShdw blurRad="38100" dist="${dist}" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="${boja}"/></a:outerShdw></a:effectLst>`;

  it('senkaTeksta: ista senka na dva dela -> senka; različite -> "razlicite"', () => {
    const isti = tekstOkvir(p(run('a', `<a:rPr>${senka(38100)}</a:rPr>`) + run('b', `<a:rPr b="1">${senka(38100)}</a:rPr>`)));
    expect(isti.r.senka).not.toBeNull();
    expect(isti.r.senka).not.toBe('razlicite');
    const s = isti.r.senka as Exclude<RezultatTeksta['senka'], null | 'razlicite'>;
    expect(s.pomerajX).toBeCloseTo(2.12, 2);
    expect(s.pomerajY).toBeCloseTo(2.12, 2);
    expect(s.zamucenje).toBe(3);
    expect(s.boja).toBe('#000000');

    const razlicite = tekstOkvir(p(run('a', `<a:rPr>${senka(38100)}</a:rPr>`) + run('b', `<a:rPr>${senka(76200)}</a:rPr>`)));
    expect(razlicite.r.senka).toBe('razlicite');
    const delimicna = tekstOkvir(p(run('a', `<a:rPr>${senka(38100)}</a:rPr>`) + run('b')));
    expect(delimicna.r.senka).toBe('razlicite');
  });

  it('bez senke -> null; prazni delovi se ne računaju', () => {
    expect(tekstOkvir(p(run('a'))).r.senka).toBeNull();
    expect(tekstOkvir(p(run('a', `<a:rPr>${senka(38100)}</a:rPr>`) + run(' '))).r.senka).not.toBe('razlicite');
  });

  it('senkaIzEfekta: boja sa alfom se meša sa pozadinom, pomeraji ograničeni', () => {
    const { ctx } = tekstOkvir(p(run('a')));
    const doc = new DOMParser().parseFromString(
      `<a:outerShdw xmlns:a="${NS.a}" blurRad="12700000" dist="12700000" dir="10800000"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw>`,
      'application/xml');
    expect(senkaIzEfekta(doc.documentElement, ctx)).toEqual({ boja: '#808080', pomerajX: -100, pomerajY: 0, zamucenje: 100 });
  });

  it('senka iz lanca stilova (lstStyle) važi za delove', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: oblik.tekst(5, 0, 0, 12700, 12700, p(run('a'))) }] });
    const lst = potomak(oblikSaId(ctx, 5), NS.a, 'lstStyle')!;
    lst.appendChild(new DOMParser().parseFromString(
      `<a:lvl1pPr xmlns:a="${NS.a}"><a:defRPr>${senka(38100)}</a:defRPr></a:lvl1pPr>`, 'application/xml').documentElement);
    const r = tekstOblika(ctx, 5);
    expect(r.senka).not.toBeNull();
    expect(r.senka).not.toBe('razlicite');
  });
});
