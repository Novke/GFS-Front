import { strToU8 } from 'fflate';
import { FONTOVI_PLATNA } from '../ui/platno-fontovi';
import { otvoriPaket } from './paket';
import { presetBoja } from './preset-boje';
import { napraviPptx } from './pptx-fabrika.testing';
import {
  Boja, bojaIz, KontekstBoja, mapaBoja, PODRAZUMEVANA_TEMA, pomesaj, primeniModifikatore, procitajTemu, zamenaFonta,
} from './tema';
import { NS, parsirajXml } from './xml';

const kanali = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Hex boja jednaka očekivanoj uz toleranciju ±1 po kanalu. */
function priblizno(dobijeno: string, ocekivano: string): void {
  expect(dobijeno).toMatch(/^#[0-9A-F]{6}$/);
  const d = kanali(dobijeno);
  const o = kanali(ocekivano);
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(d[i] - o[i]), `${dobijeno} ≈ ${ocekivano}`).toBeLessThanOrEqual(1);
  }
}

const mod = (ime: string, val: number) => ({ ime, val });

/** Element `<a:solidFill>` sa datom decom (bojom). */
function popuna(boja: string): Element {
  return parsirajXml(strToU8(`<a:solidFill xmlns:a="${NS.a}">${boja}</a:solidFill>`), 'test').documentElement;
}

function paketFabrike(clrMapOvr?: string) {
  return otvoriPaket(napraviPptx({ slajdovi: [{ spTree: '', clrMapOvr }] }), 'tema.pptx');
}

describe('tema fajla', () => {
  const p = paketFabrike();
  const tema = procitajTemu(p.xml('ppt/theme/theme1.xml'));
  const master = p.xml('ppt/slideMasters/slideMaster1.xml');
  const k: KontekstBoja = { tema, mapaBoja: mapaBoja(master) };

  it('procitajTemu čita boje, fontove i debljine linija iz fabrike', () => {
    expect(tema.fontTela).toBe('Calibri');
    expect(tema.fontNaslova).toBe('Calibri Light');
    expect(tema.boje['accent2']).toBe('#ED7D31');
    expect(tema.boje['dk1']).toBe('#000000');
    expect(tema.boje['lt1']).toBe('#FFFFFF');
    expect(tema.debljineLinija).toEqual([0.5, 1, 1.5]);
  });

  it('procitajTemu: null ili neispravna tema -> PODRAZUMEVANA_TEMA', () => {
    expect(procitajTemu(null)).toBe(PODRAZUMEVANA_TEMA);
    expect(procitajTemu(parsirajXml(strToU8(`<a:nesto xmlns:a="${NS.a}"/>`), 'x'))).toBe(PODRAZUMEVANA_TEMA);
    expect(PODRAZUMEVANA_TEMA.boje['accent1']).toBe('#4472C4');
    expect(PODRAZUMEVANA_TEMA.fontNaslova).toBe('Calibri Light');
    expect(PODRAZUMEVANA_TEMA.fontTela).toBe('Calibri');
    expect(PODRAZUMEVANA_TEMA.debljineLinija).toEqual([0.5, 1, 1.5]);
  });

  it('mapaBoja: clrMap mastera i overrideClrMapping preko njega; masterClrMapping ne menja ništa', () => {
    expect(k.mapaBoja['tx1']).toBe('dk1');
    expect(k.mapaBoja['bg1']).toBe('lt1');
    const s = paketFabrike('<p:clrMapOvr><a:overrideClrMapping bg1="dk1"/></p:clrMapOvr>');
    const m = mapaBoja(s.xml('ppt/slideMasters/slideMaster1.xml'), s.xml('ppt/slideLayouts/slideLayout1.xml'),
      s.xml('ppt/slides/slide1.xml'));
    expect(m['bg1']).toBe('dk1');
    expect(m['tx1']).toBe('dk1');
    expect(mapaBoja(null)['tx2']).toBe('dk2');
  });

  it('bojaIz: schemeClr kroz mapu boja, phClr, preset, sysClr, scrgbClr, hslClr', () => {
    expect(bojaIz(popuna('<a:schemeClr val="tx1"/>'), k)).toEqual<Boja>({ hex: '#000000', alfa: 1 });
    expect(bojaIz(popuna('<a:schemeClr val="bg1"/>'), k)?.hex).toBe('#FFFFFF');
    expect(bojaIz(popuna('<a:schemeClr val="accent1"/>'), k)?.hex).toBe('#4472C4');
    expect(bojaIz(popuna('<a:schemeClr val="phClr"/>'), { ...k, phClr: '#123456' })?.hex).toBe('#123456');
    expect(bojaIz(popuna('<a:prstClr val="red"/>'), k)?.hex).toBe('#FF0000');
    expect(bojaIz(popuna('<a:prstClr val="nepostoji"/>'), k)).toBeNull();
    expect(bojaIz(popuna('<a:sysClr val="windowText" lastClr="1F1F1F"/>'), k)?.hex).toBe('#1F1F1F');
    expect(bojaIz(popuna('<a:sysClr val="windowText"/>'), k)?.hex).toBe('#000000');
    expect(bojaIz(popuna('<a:sysClr val="window"/>'), k)?.hex).toBe('#FFFFFF');
    expect(bojaIz(popuna('<a:scrgbClr r="100000" g="0" b="21586"/>'), k)?.hex).toBe('#FF0080');
    expect(bojaIz(popuna('<a:hslClr hue="14400000" sat="100000" lum="50000"/>'), k)?.hex).toBe('#0000FF');
    expect(bojaIz(popuna('<a:srgbClr val="4472c4"><a:alpha val="40000"/></a:srgbClr>'), k)).toEqual<Boja>({ hex: '#4472C4', alfa: 0.4 });
    expect(bojaIz(popuna('<a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr>'), k)?.hex).toMatch(/^#2F5[45]9[67]$/);
    expect(bojaIz(popuna(''), k)).toBeNull();
    expect(bojaIz(null, k)).toBeNull();
  });
});

describe('modifikatori boja', () => {
  it('tint i shade u linearnom RGB-u', () => {
    priblizno(primeniModifikatore('#4472C4', [mod('tint', 20000)]).hex, '#E9EBF5');
    priblizno(primeniModifikatore('#4472C4', [mod('tint', 40000)]).hex, '#CFD5EA');
    priblizno(primeniModifikatore('#4472C4', [mod('shade', 50000)]).hex, '#2F528F');
  });

  it('lumMod i lumOff u HSL-u', () => {
    priblizno(primeniModifikatore('#4472C4', [mod('lumMod', 60000), mod('lumOff', 40000)]).hex, '#8FAADC');
    priblizno(primeniModifikatore('#4472C4', [mod('lumMod', 75000)]).hex, '#2F5597');
    priblizno(primeniModifikatore('#44546A', [mod('lumMod', 75000)]).hex, '#333F50');
    priblizno(primeniModifikatore('#FFFFFF', [mod('lumMod', 75000)]).hex, '#BFBFBF');
    priblizno(primeniModifikatore('#000000', [mod('lumMod', 50000), mod('lumOff', 50000)]).hex, '#808080');
  });

  it('alpha, inv, comp, gray; nepoznat modifikator se zanemaruje', () => {
    expect(primeniModifikatore('#4472C4', [mod('alpha', 40000)])).toEqual<Boja>({ hex: '#4472C4', alfa: 0.4 });
    expect(primeniModifikatore('#FF0000', [mod('inv', 0)]).hex).toBe('#00FFFF');
    expect(primeniModifikatore('#FF0000', [mod('comp', 0)]).hex).toBe('#00FFFF');
    const siva = primeniModifikatore('#FF0000', [mod('gray', 0)]).hex;
    expect(siva.slice(1, 3)).toBe(siva.slice(3, 5));
    expect(siva.slice(3, 5)).toBe(siva.slice(5, 7));
    expect(primeniModifikatore('#4472C4', [mod('nepoznat', 1)])).toEqual<Boja>({ hex: '#4472C4', alfa: 1 });
  });

  it('pomesaj: alfa preko pozadine', () => {
    priblizno(pomesaj({ hex: '#000000', alfa: 0.4 }, '#FFFFFF'), '#999999');
    expect(pomesaj({ hex: '#4472C4', alfa: 1 }, '#FFFFFF')).toBe('#4472C4');
  });
});

describe('preset boje', () => {
  it('DrawingML imena -> CSS imenovane boje', () => {
    expect(presetBoja('red')).toBe('#FF0000');
    expect(presetBoja('green')).toBe('#008000');
    expect(presetBoja('dkBlue')).toBe('#00008B');
    expect(presetBoja('ltGray')).toBe('#D3D3D3');
    expect(presetBoja('medSeaGreen')).toBe('#3CB371');
    expect(presetBoja('mediumSeaGreen')).toBe('#3CB371');
    expect(presetBoja('dkSlateGrey')).toBe('#2F4F4F');
    expect(presetBoja('nepostoji')).toBeNull();
  });
});

describe('zamena fontova', () => {
  const t = PODRAZUMEVANA_TEMA;
  const nazivi = FONTOVI_PLATNA.map((f) => f.naziv);
  const slucajevi: [string | null, string, string | null][] = [
    ['+mn-lt', 'Carlito', null],
    ['+mj-lt', 'Carlito', null],
    [null, 'Carlito', null],
    ['', 'Carlito', null],
    ['Calibri', 'Carlito', null],
    ['Calibri Light', 'Carlito', null],
    ['Arial', 'Arimo', null],
    ['arial', 'Arimo', null],
    ['Times New Roman', 'Tinos', null],
    ['Courier New', 'Cousine', null],
    ['IBM Plex Sans', 'IBM Plex Sans', null],
    ['Aptos', 'Carlito', "Font 'Aptos' zamenjen fontom Carlito (metrike nisu iste)."],
    ['Aptos Display', 'Carlito', "Font 'Aptos Display' zamenjen fontom Carlito (metrike nisu iste)."],
    ['Comic Sans MS', 'Carlito', "Font 'Comic Sans MS' zamenjen fontom Carlito."],
    ['Book Antiqua', 'Tinos', "Font 'Book Antiqua' zamenjen fontom Tinos."],
    ['Georgia', 'Tinos', "Font 'Georgia' zamenjen fontom Tinos."],
    ['Cambria Math', 'Caladea', "Font 'Cambria Math' zamenjen fontom Caladea."],
    ['Microsoft Sans Serif', 'Carlito', "Font 'Microsoft Sans Serif' zamenjen fontom Carlito."],
    ['Consolas', 'Cousine', "Font 'Consolas' zamenjen fontom Cousine."],
    ['Lucida Console', 'Cousine', "Font 'Lucida Console' zamenjen fontom Cousine."],
    ['Andale Mono', 'Cousine', "Font 'Andale Mono' zamenjen fontom Cousine."],
    ['DejaVu Sans Mono', 'Cousine', "Font 'DejaVu Sans Mono' zamenjen fontom Cousine."],
    // "Mono" samo kao zasebna reč: Monotype* nisu monospace.
    ['Monotype Corsiva', 'Carlito', "Font 'Monotype Corsiva' zamenjen fontom Carlito."],
    ['Monotype Sorts', 'Carlito', "Font 'Monotype Sorts' zamenjen fontom Carlito."],
  ];

  it.each(slucajevi)('%s -> %s', (ime, font, upozorenje) => {
    const r = zamenaFonta(ime, t);
    expect(r).toEqual({ font, upozorenje });
    expect(nazivi).toContain(r.font);
  });

  it('+mj-* i +mn-* idu na fontove teme', () => {
    const tema = { ...t, fontNaslova: 'Georgia', fontTela: 'Arial' };
    expect(zamenaFonta('+mj-lt', tema).font).toBe('Tinos');
    expect(zamenaFonta('+mj-ea', tema).font).toBe('Tinos');
    expect(zamenaFonta('+mn-cs', tema)).toEqual({ font: 'Arimo', upozorenje: null });
    expect(zamenaFonta(null, tema).font).toBe('Arimo');
  });
});
