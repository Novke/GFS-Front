import { describe, expect, it } from 'vitest';
import { kontrast, promenljiveTeme, TEME } from './teme';
import type { Tema } from '../data-access/platno.models';

const SVE: Tema[] = ['NACRT', 'BELA', 'PAPIR', 'TAMNA', 'PONOC'];

describe('teme', () => {
  it('ima svih pet tema', () => {
    expect(Object.keys(TEME).sort()).toEqual([...SVE].sort());
    for (const t of SVE) expect(TEME[t].tema).toBe(t);
  });

  for (const t of SVE) {
    it(`${t}: kontrast teksta, naslova i zaglavlja tabele je najmanje 4.5`, () => {
      const o = TEME[t];
      expect(kontrast(o.tekst, o.pozadina)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(o.naslov, o.pozadina)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(o.tabelaZaglavljeTekst, o.tabelaZaglavlje)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('kontrast crne i bele je 21', () => {
    expect(kontrast('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(kontrast('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
    expect(kontrast('#777', '#777')).toBeCloseTo(1, 5);
  });

  it('promenljive teme nose fontove i boje', () => {
    const p = promenljiveTeme('BELA');
    expect(p['--uz-tema-font-tela']).toContain('Carlito');
    expect(p['--uz-tema-pozadina']).toBe('#FFFFFF');
    expect(p['--uz-tema-akcent-1']).toBe('#4472C4');
    expect(p['--uz-tema-akcent-6']).toBe('#70AD47');
    expect(promenljiveTeme('PAPIR')['--uz-tema-font-naslova']).toContain('Caladea');
  });
});
