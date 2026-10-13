import type { Celija, Ivica } from '../data-access/platno.models';
import { kontekstZaTest, oblikSaId } from './kontekst.testing';
import { kutijaIzLanca } from './nasledjivanje';
import { oblik, tabela, type OpcijeFabrike } from './pptx-fabrika.testing';
import { pretvoriTabelu, type RezultatTabele } from './tabela';
import { UGRADJENI_STILOVI, ugradjeniStil } from './tabela-stilovi';
import type { KontekstSlajda, Kutija } from './tipovi';

const MEDIUM_2 = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}';
const KOL = 914400;   // 72 jedinice (16:9, s = 1)
const RED = 381000;   // 30 jedinice
const { red, celija } = tabela;

const tblPr = (atributi: string, styleId: string | null = MEDIUM_2, dodatak = '') =>
  `<a:tblPr ${atributi}>${dodatak}${styleId ? `<a:tableStyleId>${styleId}</a:tableStyleId>` : ''}</a:tblPr>`;
const crvenaLinija = (ime: string, w = 25400) => `<a:${ime} w="${w}"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:${ime}>`;
const bela = (debljina: number): Ivica => ({ boja: '#FFFFFF', debljina, crtica: 'PUNA' });
const kodovi = (z: { upozorenja: { kod: string }[] }) => z.upozorenja.map((u) => u.kod);

/** Slajd sa jednom tabelom (id 5) na (914400, 914400); vraća rezultat i upozorenja. */
function pretvori(kolone: number[], redovi: { h: number; xml: string }[], pr: string, o: Partial<OpcijeFabrike> = {},
                  kutija?: (k: Kutija) => Kutija): { r: RezultatTabele | null; z: { upozorenja: { kod: string; poruka: string }[] }; ctx: KontekstSlajda } {
  const { ctx, z } = kontekstZaTest({ slajdovi: [{ spTree: oblik.tabela(5, KOL, KOL, kolone, redovi, pr) }], ...o });
  const gf = oblikSaId(ctx, 5);
  const k = kutijaIzLanca([gf])!;
  return { r: pretvoriTabelu(gf, kutija ? kutija(k) : k, ctx, 's5'), z, ctx };
}

/** 3 x 3: (0,0) gridSpan 2, (1,0) rowSpan 2 sa anchor ctr, (1,1) lnL crvena 2 pt. */
function tabela3x3(pr = tblPr('firstRow="1" bandRow="1"'), o: Partial<OpcijeFabrike> = {}) {
  return pretvori([KOL, KOL, KOL], [
    red(RED, [celija('A', 'gridSpan="2"'), celija('', 'hMerge="1"'), celija('C')]),
    red(RED, [celija('D', 'rowSpan="2"', '<a:tcPr anchor="ctr"/>'), celija('E', '', `<a:tcPr>${crvenaLinija('lnL')}</a:tcPr>`), celija('F')]),
    red(RED, [celija('', 'vMerge="1"'), celija('H'), celija('I')]),
  ], pr, o);
}

const deo = (c: Celija) => c.pasusi[0].delovi[0];

describe('UGRADJENI_STILOVI', () => {
  it('tri Office stila, parsiraju se u a:tblStyle sa istim styleId', () => {
    expect(Object.keys(UGRADJENI_STILOVI).sort()).toEqual([
      '{2D5ABB26-0587-4C30-8999-92F81FD0307C}', '{5940675A-B579-460E-94D1-54222C63F5DA}', MEDIUM_2,
    ]);
    for (const id of Object.keys(UGRADJENI_STILOVI)) {
      const el = ugradjeniStil(id.toLowerCase());
      expect(el?.localName).toBe('tblStyle');
      expect(el?.getAttribute('styleId')).toBe(id);
    }
    expect(ugradjeniStil('{00000000-0000-0000-0000-000000000000}')).toBeNull();
  });
});

describe('pretvoriTabelu: Medium Style 2 - Accent 1 (ugrađen, bez tableStyles.xml)', () => {
  it('mreža, kutija, spajanje i sidro', () => {
    const { r, z } = tabela3x3();
    const t = r!.tabela;
    expect(t).toMatchObject({
      id: 's5', tip: 'TABELA', naziv: 'Tabela 5', x: 72, y: 72, sirina: 216, visina: 90, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, kolone: [72, 72, 72], redovi: [30, 30, 30],
    });
    expect(t.celije.length).toBe(3);
    expect(t.celije.every((red) => red.length === 3)).toBe(true);
    expect(t.celije[0][0]).toMatchObject({ spojDesno: 1, spojDole: 0, pokrivena: false });
    expect(t.celije[0][1]).toMatchObject({ pokrivena: true, pasusi: [], spojDesno: 0, spojDole: 0 });
    expect(t.celije[1][0]).toMatchObject({ spojDesno: 0, spojDole: 1, pokrivena: false, sidro: 'SREDINA' });
    expect(t.celije[2][0]).toMatchObject({ pokrivena: true, pasusi: [] });
    expect(t.celije[1][1].sidro).toBe('VRH');
    expect(r!.celijeSaSlikom).toEqual([]);
    expect(z.upozorenja).toEqual([]);
  });

  it('zaglavlje #4472C4, beo podebljan tekst, donja ivica zaglavlja 3 pt bela', () => {
    const t = tabela3x3().r!.tabela;
    const a = t.celije[0][0];
    expect(a.popuna).toBe('#4472C4');
    expect(deo(a)).toMatchObject({ tekst: 'A', boja: '#FFFFFF', podebljano: true, font: 'Carlito', velicina: 18 });
    expect(a.ivice).toEqual({ gore: bela(1), dole: bela(3), levo: bela(1), desno: bela(1) });
    expect(t.celije[0][2].ivice.dole).toEqual(bela(3));
  });

  it('band1H (red 2) ≈ #CFD5EA, band2H (red 3) pada na wholeTbl ≈ #E9EBF5, tekst dk1 bez podebljanja', () => {
    const t = tabela3x3().r!.tabela;
    expect(t.celije[1][1].popuna).toBe('#CFD5EA');
    expect(t.celije[1][2].popuna).toBe('#CFD5EA');
    expect(t.celije[2][1].popuna).toBe('#E9EBF5');
    expect(deo(t.celije[1][2])).toMatchObject({ boja: '#000000', podebljano: false });
    // Spojena ćelija (1,0) dobija traku po svom prvom redu.
    expect(t.celije[1][0].popuna).toBe('#CFD5EA');
  });

  it('lnL ćelije (crvena 2 pt) prepisuje ivicu stila; ostale strane ostaju iz stila', () => {
    const c = tabela3x3().r!.tabela.celije[1][1];
    expect(c.ivice.levo).toEqual({ boja: '#FF0000', debljina: 2, crtica: 'PUNA' });
    expect(c.ivice.desno).toEqual(bela(1));
  });

  it('pokrivene ćelije nemaju popunu ni ivice', () => {
    const c = tabela3x3().r!.tabela.celije[0][1];
    expect(c).toEqual({
      pasusi: [], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null },
      spojDesno: 0, spojDole: 0, pokrivena: true, sidro: 'VRH',
    });
  });

  it('bez firstRow i bandRow: sve ćelije wholeTbl, tekst nije podebljan', () => {
    const t = tabela3x3(tblPr('')).r!.tabela;
    expect(t.celije[0][0].popuna).toBe('#E9EBF5');
    expect(t.celije[1][1].popuna).toBe('#E9EBF5');
    expect(deo(t.celije[0][0]).podebljano).toBe(false);
    expect(t.celije[0][0].ivice.dole).toEqual(bela(1));
  });

  it('lastRow: gornja ivica 3 pt i accent1; lastCol: accent1 i podebljan tekst; bandCol uz firstCol', () => {
    const t = pretvori([KOL, KOL, KOL, KOL], [
      red(RED, [celija('a'), celija('b'), celija('c'), celija('d')]),
      red(RED, [celija('e'), celija('f'), celija('g'), celija('h')]),
    ], tblPr('lastRow="1" lastCol="1" firstCol="1" bandCol="1"')).r!.tabela;
    expect(t.celije[1][1].popuna).toBe('#4472C4');
    expect(t.celije[1][1].ivice.gore).toEqual(bela(3));
    expect(t.celije[0][3].popuna).toBe('#4472C4');
    expect(deo(t.celije[0][3]).podebljano).toBe(true);
    expect(t.celije[0][0].popuna).toBe('#4472C4');
    // k' = k - 1: kolona 1 -> band1V, kolona 2 -> band2V (wholeTbl).
    expect(t.celije[0][1].popuna).toBe('#CFD5EA');
    expect(t.celije[0][2].popuna).toBe('#E9EBF5');
  });
});

describe('pretvoriTabelu: izvor stila', () => {
  it('tableStyles.xml koji definiše stil (crven wholeTbl) ima prednost nad ugrađenim', () => {
    const def = `<a:tblStyle styleId="${MEDIUM_2}" styleName="Crveni"><a:wholeTbl><a:tcStyle><a:tcBdr/>`
      + '<a:fill><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle>';
    const { r, z } = tabela3x3(undefined, { tableStyles: def });
    const t = r!.tabela;
    expect(t.celije[0][0].popuna).toBe('#FF0000');
    expect(t.celije[1][1].popuna).toBe('#FF0000');
    expect(t.celije[2][2].popuna).toBe('#FF0000');
    expect(deo(t.celije[0][0])).toMatchObject({ boja: '#000000', podebljano: false });
    expect(t.celije[0][0].ivice.dole).toBeNull();
    expect(z.upozorenja).toEqual([]);
  });

  it('tableStyles.xml bez tog stila -> ugrađeni', () => {
    const drugi = '<a:tblStyle styleId="{11111111-2222-3333-4444-555555555555}" styleName="Drugi"><a:wholeTbl><a:tcStyle>'
      + '<a:fill><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle>';
    expect(tabela3x3(undefined, { tableStyles: drugi }).r!.tabela.celije[0][0].popuna).toBe('#4472C4');
  });

  it('nepoznat tableStyleId -> bez popune i ivica + STIL_TABELE', () => {
    const { r, z } = tabela3x3(tblPr('firstRow="1"', '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}'));
    const t = r!.tabela;
    for (const red of t.celije) {
      for (const c of red) {
        expect(c.popuna).toBeNull();
        if (c !== t.celije[1][1]) expect(c.ivice).toEqual({ gore: null, dole: null, levo: null, desno: null });
      }
    }
    expect(deo(t.celije[0][0])).toMatchObject({ boja: '#000000', podebljano: false });
    expect(kodovi(z)).toEqual(['STIL_TABELE']);
  });

  it('bez tableStyleId: podrazumevani stil iz tableStyles.xml (def), a bez njega bez stila i bez upozorenja', () => {
    const def = `<a:tblStyle styleId="${MEDIUM_2}" styleName="Crveni"><a:wholeTbl><a:tcStyle>`
      + '<a:fill><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle>';
    expect(tabela3x3(tblPr('', null), { tableStyles: def }).r!.tabela.celije[0][0].popuna).toBe('#FF0000');
    const bez = tabela3x3(tblPr('', null));
    expect(bez.r!.tabela.celije[0][0].popuna).toBeNull();
    expect(bez.z.upozorenja).toEqual([]);
  });

  it('No Style, Table Grid: crne ivice 1 pt tx1, bez popune', () => {
    const t = tabela3x3(tblPr('firstRow="1"', '{5940675A-B579-460E-94D1-54222C63F5DA}')).r!.tabela;
    const crna: Ivica = { boja: '#000000', debljina: 1, crtica: 'PUNA' };
    expect(t.celije[2][2]).toMatchObject({ popuna: null, ivice: { gore: crna, dole: crna, levo: crna, desno: crna } });
  });
});

describe('pretvoriTabelu: ćelije', () => {
  it('tcPr solidFill i noFill prepisuju stil; lnB noFill briše ivicu stila', () => {
    const { r } = pretvori([KOL, KOL], [
      red(RED, [
        celija('x', '', '<a:tcPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></a:tcPr>'),
        celija('y', '', '<a:tcPr anchor="b"><a:lnB w="12700"><a:noFill/></a:lnB><a:noFill/></a:tcPr>'),
      ]),
    ], tblPr('firstRow="1"'));
    const [x, y] = r!.tabela.celije[0];
    expect(x.popuna).toBe('#00FF00');
    expect(y.popuna).toBeNull();
    expect(y.ivice.dole).toBeNull();
    expect(y.sidro).toBe('DNO');
  });

  it('sopstveni rPr ćelije (b="0", crvena boja) je jači od stila tabele', () => {
    const tc = '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="sr-Latn-RS" b="0"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>'
      + '<a:t>z</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>';
    const c = pretvori([KOL], [red(RED, [tc])], tblPr('firstRow="1"')).r!.tabela.celije[0][0];
    expect(deo(c)).toMatchObject({ boja: '#FF0000', podebljano: false });
  });

  it('marL različit od podrazumevanog -> TEKST_PRIBLIZAN jednom', () => {
    const { z } = pretvori([KOL, KOL], [
      red(RED, [celija('a', '', '<a:tcPr marL="0"/>'), celija('b', '', '<a:tcPr marT="0"/>')]),
      red(RED, [celija('c', '', '<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720"/>'), celija('d')]),
    ], tblPr(''));
    expect(kodovi(z)).toEqual(['TEKST_PRIBLIZAN']);
  });

  it('ćelija sa blipFill -> bez popune i teksta, u celijeSaSlikom sa kutijom ćelije (EMU)', () => {
    const blip = '<a:tcPr><a:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></a:tcPr>';
    const { r } = pretvori([KOL, KOL * 2, KOL], [
      red(RED, [celija('a'), celija('b'), celija('c')]),
      red(RED * 2, [celija('d'), celija('', 'gridSpan="2"', blip), celija('', 'hMerge="1"')]),
    ], tblPr('firstRow="1" bandRow="1"'));
    const c = r!.tabela.celije[1][1];
    expect(c).toMatchObject({ popuna: null, pasusi: [], spojDesno: 1 });
    expect(r!.celijeSaSlikom.length).toBe(1);
    const s = r!.celijeSaSlikom[0];
    expect({ red: s.red, kolona: s.kolona, kutija: s.kutija }).toEqual({
      red: 1, kolona: 1, kutija: { x: KOL + KOL, y: KOL + RED, w: KOL * 3, h: RED * 2, rot: 0 },
    });
    expect(s.tcPr.localName).toBe('tcPr');
  });

  it('red sa manje ćelija se dopunjuje praznim, višak se odbacuje', () => {
    const t = pretvori([KOL, KOL], [
      red(RED, [celija('a')]),
      red(RED, [celija('b'), celija('c'), celija('d')]),
    ], tblPr('')).r!.tabela;
    expect(t.celije.map((r) => r.length)).toEqual([2, 2]);
    expect(t.celije[0][1]).toMatchObject({ pokrivena: false, pasusi: [] });
  });

  it('spajanje se seče na ivici tabele i na već pokrivenim ćelijama; hMerge bez sidra ostaje vidljiv', () => {
    const t = pretvori([KOL, KOL, KOL], [
      red(RED, [celija('a'), celija('b', 'rowSpan="5"'), celija('c', 'gridSpan="4"')]),
      red(RED, [celija('d', 'gridSpan="3"'), celija('', 'vMerge="1"'), celija('f', 'hMerge="1"')]),
    ], tblPr('')).r!.tabela;
    expect(t.celije[0][1]).toMatchObject({ spojDole: 1, spojDesno: 0 });
    expect(t.celije[0][2]).toMatchObject({ spojDesno: 0, spojDole: 0 });
    expect(t.celije[1][0]).toMatchObject({ spojDesno: 0, pokrivena: false });
    expect(t.celije[1][1].pokrivena).toBe(true);
    expect(t.celije[1][2]).toMatchObject({ pokrivena: false, spojDesno: 0 });
    expect(deo(t.celije[1][2]).tekst).toBe('f');
  });
});

describe('pretvoriTabelu: okvir', () => {
  it('31 kolona ili 31 red -> null + GRANICA', () => {
    const kolone = Array.from({ length: 31 }, () => 100000);
    const siroka = pretvori(kolone, [red(RED, kolone.map(() => celija('')))], tblPr(''));
    expect(siroka.r).toBeNull();
    expect(siroka.z.upozorenja).toEqual([{ slajd: 1, kod: 'GRANICA', poruka: 'Tabela veća od 30 x 30 nije uvezena.' }]);
    const visoka = pretvori([KOL], Array.from({ length: 31 }, () => red(100000, [celija('')])), tblPr(''));
    expect(visoka.r).toBeNull();
    expect(kodovi(visoka.z)).toEqual(['GRANICA']);
    const najveca = pretvori(Array.from({ length: 30 }, () => 100000), Array.from({ length: 30 }, () => red(100000, Array.from({ length: 30 }, () => celija('')))), tblPr(''));
    expect(najveca.r?.tabela.celije.length).toBe(30);
  });

  it('senka iz a:tblPr/a:effectLst/a:outerShdw', () => {
    const efekat = '<a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="5400000"><a:srgbClr val="000000"/></a:outerShdw></a:effectLst>';
    const t = tabela3x3(tblPr('firstRow="1"', MEDIUM_2, efekat)).r!.tabela;
    expect(t.senka).toEqual({ boja: '#000000', pomerajX: 0, pomerajY: 3, zamucenje: 3 });
  });

  it('popuna tabele (tblPr solidFill) je ispod ćelija bez popune', () => {
    const t = pretvori([KOL], [red(RED, [celija('a')])], tblPr('', null, '<a:solidFill><a:srgbClr val="123456"/></a:solidFill>')).r!.tabela;
    expect(t.celije[0][0].popuna).toBe('#123456');
  });

  it('kutija grupe (dvostruko šira i viša) skalira kolone i redove; položaj iz kutije', () => {
    const { r } = pretvori([KOL, KOL], [red(RED, [celija('a'), celija('b')])], tblPr(''), {},
      (k) => ({ ...k, x: 0, y: 0, w: k.w * 2, h: k.h * 2 }));
    expect(r!.tabela).toMatchObject({ x: 0, y: 0, kolone: [144, 144], redovi: [60], sirina: 288, visina: 60 });
  });

  it('kolona širine 0 postaje 0,01 (server traži > 0)', () => {
    const t = pretvori([0, KOL], [red(RED, [celija('a'), celija('b')])], tblPr('')).r!.tabela;
    expect(t.kolone).toEqual([0.01, 72]);
    expect(t.sirina).toBe(72.01);
  });

  it('graphicFrame bez a:tbl -> null', () => {
    const { ctx } = kontekstZaTest({ slajdovi: [{ spTree: oblik.tabela(5, 0, 0, [KOL], [red(RED, [celija('a')])]) }] });
    const gf = oblikSaId(ctx, 5);
    const tbl = gf.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'tbl')[0];
    tbl.parentNode!.removeChild(tbl);
    expect(pretvoriTabelu(gf, kutijaIzLanca([gf])!, ctx, 's5')).toBeNull();
  });
});
