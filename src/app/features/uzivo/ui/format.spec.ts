import { bezProtokola, decimalni, grupisiCifre, kodSaRazmakom } from './format';

const NBSP = ' ';

describe('grupisiCifre', () => {
  it('hiljade razdvaja razmakom (3 450)', () => {
    expect(grupisiCifre(3450)).toBe(`3${NBSP}450`);
    expect(grupisiCifre(1234567)).toBe(`1${NBSP}234${NBSP}567`);
  });

  it('mali, nula i negativni brojevi', () => {
    expect(grupisiCifre(0)).toBe('0');
    expect(grupisiCifre(999)).toBe('999');
    expect(grupisiCifre(-1200)).toBe(`-1${NBSP}200`);
  });
});

describe('decimalni', () => {
  it('decimalni zarez, najviše dve decimale, bez nula na kraju', () => {
    expect(decimalni(3.82)).toBe('3,82');
    expect(decimalni(2.5)).toBe('2,5');
    expect(decimalni(3.14159)).toBe('3,14');
    expect(decimalni(4)).toBe('4');
    expect(decimalni(4.001)).toBe('4');
  });

  it('veliki brojevi su grupisani', () => {
    expect(decimalni(1234.5)).toBe(`1${NBSP}234,5`);
  });

  it('negativni', () => {
    expect(decimalni(-0.75)).toBe('-0,75');
  });
});

describe('kodSaRazmakom', () => {
  it('šest cifara u dve grupe', () => {
    expect(kodSaRazmakom('123456')).toBe('123 456');
  });

  it('drugi oblici ostaju kakvi jesu', () => {
    expect(kodSaRazmakom('12345')).toBe('12345');
    expect(kodSaRazmakom('')).toBe('');
  });
});

describe('bezProtokola', () => {
  it('skida http(s):// i kosu crtu na kraju', () => {
    expect(bezProtokola('https://gfs.trif.rs/gfs/uzivo/123456')).toBe('gfs.trif.rs/gfs/uzivo/123456');
    expect(bezProtokola('http://localhost:4200/')).toBe('localhost:4200');
  });

  it('bez protokola ostaje isto', () => {
    expect(bezProtokola('novica-dev/gfs/uzivo')).toBe('novica-dev/gfs/uzivo');
  });
});
