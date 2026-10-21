import type { OblikSloj, Platno, Sloj, Tema, TekstSloj, VrstaOblika } from './platno.models';
import {
  OKVIR_NOVOG, ZNAK_LISTE, deoTeme, novaFormula, novaSlika, novaTabela, noviKrug, noviOblik, noviTekst, novoPlatno, pasusSa,
  uSredini,
} from './platno-novo';
import { proveriKaoServer, zaokruziKaoServer } from './platno-provera';
import { TEME } from '../ui/teme';

const SVE_TEME = Object.keys(TEME) as Tema[];
const VRSTE: VrstaOblika[] = ['PRAVOUGAONIK', 'ZAOBLJENI_PRAVOUGAONIK', 'ELIPSA', 'TROUGAO', 'LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA'];
const LINIJSKE: VrstaOblika[] = ['LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA'];

const naPlatnu = (tema: Tema, sloj: Sloj): Platno =>
  ({ verzija: 1, pozadina: { boja: TEME[tema].pozadina, medijId: null }, slojevi: [sloj], animacije: [] });

describe('platno-novo: fabrike prolaze proveru servera', () => {
  it('ima svih 5 tema', () => {
    expect(SVE_TEME).toHaveLength(5);
  });

  it.each(SVE_TEME)('%s: svaka fabrika daje dokument koji server prima', (tema) => {
    const slojevi: Sloj[] = [
      noviTekst('s1', tema, { x: 10, y: 10, sirina: 300, visina: 80 }),
      noviTekst('s1', tema, { x: 10, y: 10, sirina: 300, visina: 80 }, 'naslov', 40),
      ...VRSTE.map((v) => noviOblik('s1', tema, v)),
      noviOblik('s1', tema, 'STRELICA', 'ISPREKIDANA'),
      noviKrug('s1', tema),
      novaSlika('s1', '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87', 1920, 1080),
      novaSlika('s1', '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87', 1, 1, { x: 1920, y: -960 }),
      novaTabela('s1', tema, 3, 3),
      novaTabela('s1', tema, 30, 7),
      novaFormula('s1', tema, '\\frac{a}{b}'),
    ];
    for (const s of slojevi) expect(proveriKaoServer(naPlatnu(tema, s)), `${s.tip}`).toBeNull();
    expect(proveriKaoServer(novoPlatno(tema, 'PRAZNO'))).toBeNull();
    expect(proveriKaoServer(novoPlatno(tema, 'NASLOV_I_TEKST'))).toBeNull();
  });
});

describe('platno-novo: oblici', () => {
  it.each(VRSTE)('%s: linijski imaju od/do i popuna null, zatvoreni od/do null i popunu akcenta', (vrsta) => {
    const o = noviOblik('s3', 'BELA', vrsta);
    expect(o).toMatchObject({ id: 's3', tip: 'OBLIK', oblik: vrsta, rotacija: 0, providnost: 1, zakljucan: false, naziv: null });
    if (LINIJSKE.includes(vrsta)) {
      expect(o.popuna).toBeNull();
      expect(o.od).toEqual({ x: 0, y: o.visina / 2 });
      expect(o.do).toEqual({ x: o.sirina, y: o.visina / 2 });
    } else {
      expect(o.popuna).toBe(TEME.BELA.akcenti[0]);
      expect(o.od).toBeNull();
      expect(o.do).toBeNull();
    }
    expect(o.ivica?.boja).toBe(TEME.BELA.akcenti[0]);
    expect(o.ivica?.crtica).toBe('PUNA');
  });

  it('crtica se prenosi: STRELICA ISPREKIDANA', () => {
    expect(noviOblik('s1', 'NACRT', 'STRELICA', 'ISPREKIDANA').ivica?.crtica).toBe('ISPREKIDANA');
  });

  it('oblik je centriran na platnu', () => {
    const o: OblikSloj = noviOblik('s1', 'NACRT', 'PRAVOUGAONIK');
    expect(o.x + o.sirina / 2).toBe(480);
    expect(o.y + o.visina / 2).toBe(270);
  });

  it('noviKrug je ELIPSA 140 x 140 u centru', () => {
    expect(noviKrug('s1', 'NACRT')).toMatchObject({ oblik: 'ELIPSA', sirina: 140, visina: 140, x: 410, y: 200 });
  });

  it('uSredini zaokružuje kao server', () => {
    expect(uSredini(200, 120)).toEqual({ x: 380, y: 210 });
    expect(uSredini(100.005, 0)).toEqual({ x: zaokruziKaoServer((960 - 100.005) / 2), y: 270 });
  });
});

describe('platno-novo: slika', () => {
  const ID = 'm';
  it('velika slika staje u 480 x 270 i centrira se', () => {
    expect(novaSlika('s1', ID, 1920, 1080)).toMatchObject({ x: 240, y: 135, sirina: 480, visina: 270 });
  });

  it('mala slika ostaje u prirodnoj veličini', () => {
    expect(novaSlika('s1', ID, 100, 50)).toMatchObject({ x: 430, y: 245, sirina: 100, visina: 50 });
  });

  it('centar na mestu spuštanja', () => {
    expect(novaSlika('s1', ID, 1920, 1080, { x: 0, y: 0 })).toMatchObject({ x: -240, y: -135 });
  });

  it('nosi medij i prazan isečak', () => {
    expect(novaSlika('s1', ID, 10, 10)).toMatchObject({ tip: 'SLIKA', medijId: ID, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 } });
  });
});

describe('platno-novo: tabela', () => {
  it.each(SVE_TEME)('%s: 3 x 3 sa zaglavljem i trakom iz teme', (tema) => {
    const t = TEME[tema];
    const tab = novaTabela('s1', tema, 3, 3);
    expect(zaokruziKaoServer(tab.kolone.reduce((a, b) => a + b, 0))).toBe(640);
    expect(tab.redovi).toEqual([40, 40, 40]);
    expect(tab.visina).toBe(120);
    for (let k = 0; k < 3; k++) {
      const z = tab.celije[0][k];
      expect(z.popuna).toBe(t.tabelaZaglavlje);
      expect(z.pasusi[0].delovi[0]).toMatchObject({ podebljano: true, boja: t.tabelaZaglavljeTekst, font: t.fontTela });
      expect(tab.celije[1][k].popuna).toBe(t.tabelaTraka);
      expect(tab.celije[1][k].pasusi[0].delovi[0]).toMatchObject({ podebljano: false, boja: t.tekst });
      expect(tab.celije[2][k].popuna).toBeNull();
    }
  });

  it('30 x 7: zbir kolona je 640 i posle zaokruživanja, prolazi proveru', () => {
    const tab = novaTabela('s1', 'NACRT', 30, 7);
    expect(tab.kolone).toHaveLength(7);
    expect(tab.kolone.every((k) => zaokruziKaoServer(k) === k)).toBe(true);
    expect(zaokruziKaoServer(tab.kolone.reduce((a, b) => a + b, 0))).toBe(640);
    expect(tab.celije).toHaveLength(30);
    expect(proveriKaoServer(naPlatnu('NACRT', tab))).toBeNull();
  });
});

describe('platno-novo: tekst, formula i nov slajd', () => {
  it('deoTeme: naslov uzima font i boju naslova, telo font i boju teksta', () => {
    expect(deoTeme('PAPIR', 'naslov', 40)).toMatchObject({ tekst: '', font: 'Caladea', boja: TEME.PAPIR.naslov, velicina: 40 });
    expect(deoTeme('PAPIR', 'telo', 18, 'x')).toMatchObject({ tekst: 'x', font: 'Carlito', boja: TEME.PAPIR.tekst, velicina: 18 });
  });

  it('pasusSa: podrazumevani pasus sa jednim delom, izmene se primenjuju', () => {
    const d = deoTeme('NACRT', 'telo', 24);
    expect(pasusSa(d)).toEqual({
      poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0,
      proredProcenat: 100, tabulatori: [], delovi: [d],
    });
    expect(pasusSa(d, { poravnanje: 'CENTAR' }).poravnanje).toBe('CENTAR');
  });

  it('noviTekst: jedan prazan pasus sa jednim praznim delom; naslov ima sidro SREDINA, telo VRH', () => {
    const telo: TekstSloj = noviTekst('s2', 'NACRT', { x: 1, y: 2, sirina: 3, visina: 4 });
    expect(telo.pasusi).toHaveLength(1);
    expect(telo.pasusi[0].delovi).toEqual([deoTeme('NACRT', 'telo', 24)]);
    expect(telo.okvir).toEqual(OKVIR_NOVOG);
    expect(noviTekst('s2', 'NACRT', { x: 1, y: 2, sirina: 3, visina: 4 }, 'naslov').okvir.sidro).toBe('SREDINA');
  });

  it('novaFormula: boja teksta teme, 28 pt, centrirana, bez slike izvora', () => {
    expect(novaFormula('s1', 'TAMNA', 'x^2')).toMatchObject({
      tip: 'FORMULA', latex: 'x^2', boja: TEME.TAMNA.tekst, velicina: 28, poravnanje: 'CENTAR', slikaIzvora: null,
    });
  });

  it.each(SVE_TEME)('%s: PRAZNO = pozadina teme, bez slojeva i animacija', (tema) => {
    expect(novoPlatno(tema, 'PRAZNO')).toEqual({ verzija: 1, pozadina: { boja: TEME[tema].pozadina, medijId: null }, slojevi: [], animacije: [] });
  });

  it.each(SVE_TEME)('%s: NASLOV_I_TEKST = naslov s1 i telo s2 sa listom', (tema) => {
    const t = TEME[tema];
    const p = novoPlatno(tema, 'NASLOV_I_TEKST');
    expect(p.pozadina.boja).toBe(t.pozadina);
    const [s1, s2] = p.slojevi as TekstSloj[];
    expect(s1.id).toBe('s1');
    expect(s1.pasusi[0].delovi[0]).toMatchObject({ font: t.fontNaslova, boja: t.naslov, velicina: 40 });
    expect(s1.okvir.sidro).toBe('SREDINA');
    expect(s2.id).toBe('s2');
    expect(s2.pasusi[0].delovi[0]).toMatchObject({ font: t.fontTela, boja: t.tekst, velicina: 28 });
    expect(s2.pasusi[0].lista).toEqual({ vrsta: 'ZNAK', znak: ZNAK_LISTE, boja: null, format: null, pocetak: null });
    expect(ZNAK_LISTE).toBe('•');
    expect(s2.pasusi[0].uvlacenje).toEqual({ levo: 18, prviRed: -18 });
    expect(s2.okvir.sidro).toBe('VRH');
  });
});
