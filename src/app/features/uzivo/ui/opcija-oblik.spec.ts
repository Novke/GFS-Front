import { OBLICI, oblikOpcije } from './opcija-oblik';

describe('OBLICI', () => {
  it('ima šest oblika, slova A-F redom', () => {
    expect(OBLICI.length).toBe(6);
    expect(OBLICI.map(o => o.slovo).join('')).toBe('ABCDEF');
  });

  it('boje i simboli su po spec-u 2.13', () => {
    expect(OBLICI.map(o => o.boja)).toEqual(['#d6363c', '#2456a6', '#9a6a00', '#1d7a55', '#7a4bd6', '#0f7d8c']);
    expect(OBLICI.map(o => o.simbol).join('')).toBe('▲◆●■★⬟');
  });

  it('beli simbol i slovo imaju bar 4.5:1 na svakoj boji (AA; boje su iste u oba režima)', () => {
    const kanal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const sjaj = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => kanal(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const kontrast = (hex: string) => 1.05 / (sjaj(hex) + 0.05);
    for (const o of OBLICI) {
      expect(kontrast(o.boja), `${o.slovo} ${o.boja}`).toBeGreaterThanOrEqual(4.5);
    }
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
