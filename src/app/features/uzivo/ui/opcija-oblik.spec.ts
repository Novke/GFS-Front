import { OBLICI, oblikOpcije } from './opcija-oblik';

describe('OBLICI', () => {
  it('ima šest oblika, slova A-F redom', () => {
    expect(OBLICI.length).toBe(6);
    expect(OBLICI.map(o => o.slovo).join('')).toBe('ABCDEF');
  });

  it('boje i simboli su po spec-u 2.13', () => {
    expect(OBLICI.map(o => o.boja)).toEqual(['#d6363c', '#2456a6', '#c98a00', '#1d7a55', '#7a4bd6', '#0f7d8c']);
    expect(OBLICI.map(o => o.simbol).join('')).toBe('▲◆●■★⬟');
  });

  it('boje, simboli i nazivi su jedinstveni', () => {
    expect(new Set(OBLICI.map(o => o.boja.toLowerCase())).size).toBe(6);
    expect(new Set(OBLICI.map(o => o.simbol)).size).toBe(6);
    expect(new Set(OBLICI.map(o => o.naziv)).size).toBe(6);
  });

  it('naziv služi za aria-label', () => {
    expect(OBLICI[0].naziv).toBe('crveni trougao');
    expect(OBLICI.every(o => o.naziv.trim().length > 0)).toBe(true);
  });
});

describe('oblikOpcije', () => {
  it('vraća oblik po indeksu opcije', () => {
    expect(oblikOpcije(0)).toBe(OBLICI[0]);
    expect(oblikOpcije(5).slovo).toBe('F');
  });

  it('indeks van opsega se ne lomi (kruži)', () => {
    expect(oblikOpcije(6)).toBe(OBLICI[0]);
    expect(oblikOpcije(-1)).toBe(OBLICI[5]);
  });
});
