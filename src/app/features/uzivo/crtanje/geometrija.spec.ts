import { ElementCrteza, MAX_TACAKA_OLOVKE } from './crtanje.models';
import {
  crticeZa, dodajTacku, gotovElement, krajOblika, normalizuj, podeliOlovku, premali, putanjaOlovke, putanjeElementa, putanjeKes, staje,
} from './geometrija';

const el = (tip: ElementCrteza['tip'], tacke: number[], debljina = 6): ElementCrteza => ({ tip, boja: '#C62828', debljina, tacke });

describe('putanje elemenata (SVG, 7 tipova)', () => {
  it('OLOVKA: glatko kroz sredine tačaka, pravo do poslednje', () => {
    expect(putanjaOlovke([0, 0, 10, 0, 20, 10])).toBe('M0 0Q10 0 15 5L20 10');
    expect(putanjaOlovke([0, 0, 10, 0, 20, 10, 30, 10])).toBe('M0 0Q10 0 15 5Q20 10 25 10L30 10');
  });

  it('OLOVKA sa jednom tačkom je tačka, sa dve prava linija', () => {
    expect(putanjaOlovke([5, 5])).toBe('M5 5l0.01 0');
    expect(putanjaOlovke([0, 0, 4, 4])).toBe('M0 0L4 4');
    expect(putanjeElementa(el('OLOVKA', []))).toEqual([]);
  });

  it('LINIJA i ISPREKIDANA (stroke-dasharray po debljini)', () => {
    expect(putanjeElementa(el('LINIJA', [1, 2, 3, 4]))).toEqual([{ d: 'M1 2L3 4', sirina: 6, crtice: null, popunjeno: false }]);
    const [p] = putanjeElementa(el('ISPREKIDANA', [0, 0, 100, 0], 6));
    expect(p.d).toBe('M0 0L100 0');
    expect(p.crtice).toBe(crticeZa(6));
    expect(crticeZa(6)).toBe('13.2 15.6');
    expect(crticeZa(1)).toBe('4.4 5.2');
  });

  it('STRELICA: telo do osnove vrha i popunjen trougao sa šiljkom u krajnjoj tački', () => {
    const [telo, vrh] = putanjeElementa(el('STRELICA', [0, 0, 100, 0], 6));
    // dužina vrha max(16, 4 * 6) = 24, telo staje na 0,8 * 24 pre kraja
    expect(telo).toEqual({ d: 'M0 0L80.8 0', sirina: 6, crtice: null, popunjeno: false });
    expect(vrh.popunjeno).toBe(true);
    expect(vrh.d.startsWith('M100 0L')).toBe(true);
    expect(vrh.d.endsWith('Z')).toBe(true);
    expect(vrh.sirina).toBe(3);
  });

  it('PRAVOUGAONIK, KRUG i ELIPSA iz uglova prevlačenja (bilo kog smera)', () => {
    expect(putanjeElementa(el('PRAVOUGAONIK', [50, 40, 10, 20]))[0].d).toBe('M10 20H50V40H10Z');
    expect(putanjeElementa(el('ELIPSA', [0, 0, 100, 50]))[0].d).toBe('M0 25A50 25 0 1 0 100 25A50 25 0 1 0 0 25Z');
    expect(putanjeElementa(el('KRUG', [0, 0, 40, 40]))[0].d).toBe('M0 20A20 20 0 1 0 40 20A20 20 0 1 0 0 20Z');
  });

  it('oblik sa pogrešnim brojem tačaka nema putanju; keš vraća isti niz za isti objekat', () => {
    expect(putanjeElementa(el('LINIJA', [1, 2]))).toEqual([]);
    const e = el('LINIJA', [0, 0, 5, 5]);
    expect(putanjeKes(e)).toBe(putanjeKes(e));
  });
});

describe('Shift ograničenja i krug', () => {
  it('KRUG je uvek u kvadratu (veća razlika, u smeru pokazivača)', () => {
    expect(krajOblika('KRUG', 10, 10, 40, 20, false)).toEqual([40, 40]);
    expect(krajOblika('KRUG', 10, 10, 0, 50, false)).toEqual([-30, 50]);
  });

  it('Shift: pravougaonik kvadrat, elipsa krug; bez Shift-a slobodno', () => {
    expect(krajOblika('PRAVOUGAONIK', 0, 0, 30, -10, true)).toEqual([30, -30]);
    expect(krajOblika('ELIPSA', 0, 0, 10, 25, true)).toEqual([25, 25]);
    expect(krajOblika('PRAVOUGAONIK', 0, 0, 30, -10, false)).toEqual([30, -10]);
  });

  it('Shift: linija, isprekidana i strelica na 45°', () => {
    expect(krajOblika('LINIJA', 0, 0, 100, 10, true)).toEqual([100.5, 0]);
    const [x, y] = krajOblika('STRELICA', 0, 0, 100, 90, true);
    expect(x).toBeCloseTo(y, 1);
    expect(krajOblika('ISPREKIDANA', 0, 0, 5, 100, true)).toEqual([0, 100.1]);
    expect(krajOblika('LINIJA', 0, 0, 100, 10, false)).toEqual([100, 10]);
  });
});

describe('proređivanje, premali oblici, granice', () => {
  it('tačka bliža od 1 jedinice od poslednje se ne dodaje', () => {
    const t = [0, 0];
    expect(dodajTacku(t, 0.5, 0.5)).toBe(false);
    expect(dodajTacku(t, 1, 0)).toBe(true);
    expect(dodajTacku(t, 1.4, 0.5)).toBe(false);
    expect(t).toEqual([0, 0, 1, 0]);
  });

  it('oblik kraći od 4 jedinice se odbacuje, olovka (i jedna tačka) ne', () => {
    expect(premali(el('LINIJA', [0, 0, 2, 3]))).toBe(true);
    expect(premali(el('PRAVOUGAONIK', [0, 0, 2, 2]))).toBe(true);
    expect(premali(el('KRUG', [0, 0, 4, 0]))).toBe(false);
    expect(premali(el('OLOVKA', [5, 5]))).toBe(false);
    expect(gotovElement(el('STRELICA', [0, 0, 1, 1]))).toEqual([]);
  });

  it('normalizuj: boja velikim slovima, debljina 1–40, koordinate ±2000 na desetinu', () => {
    expect(normalizuj({ tip: 'LINIJA', boja: '#c62828', debljina: 99, tacke: [-5000, 1.26, 3000, Number.NaN] }))
      .toEqual({ tip: 'LINIJA', boja: '#C62828', debljina: 40, tacke: [-2000, 1.3, 2000, 0] });
    expect(normalizuj(el('LINIJA', [0, 0, 9, 9], 0.2)).debljina).toBe(1);
  });

  it('olovka duža od 5000 tačaka se deli, delovi se nastavljaju u istoj tački', () => {
    const tacke = Array.from({ length: 12_001 * 2 }, (_, i) => i);
    const delovi = podeliOlovku(el('OLOVKA', tacke));
    expect(delovi.length).toBe(3);
    for (const d of delovi) expect(d.tacke.length).toBeLessThanOrEqual(MAX_TACAKA_OLOVKE * 2);
    expect(delovi[1].tacke.slice(0, 2)).toEqual(delovi[0].tacke.slice(-2));
    expect(delovi[2].tacke.slice(-2)).toEqual(tacke.slice(-2));
    expect(podeliOlovku(el('OLOVKA', [1, 2]))).toHaveLength(1);
  });

  it('staje: najviše 2000 elemenata', () => {
    const jedan = el('LINIJA', [0, 0, 10, 10]);
    expect(staje(Array(2000).fill(jedan))).toBe(true);
    expect(staje(Array(2001).fill(jedan))).toBe(false);
  });
});
