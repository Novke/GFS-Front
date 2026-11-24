import { describe, expect, it } from 'vitest';

import { naslovTable, publikaTable, tablaPredavanja } from './tabla';

describe('tabla predavanja: naslov i putanje', () => {
  const p = { rb: 12, datum: '2026-11-24', predmet: { id: 1, naziv: 'Uvod u računarstvo' } };

  it('„Tabla · <predmet>, predavanje <datum>”', () => {
    expect(naslovTable(p)).toBe('Tabla · Uvod u računarstvo, predavanje 24. 11. 2026.');
  });

  it('bez datuma redni broj, bez predmeta samo predavanje, bez podataka „Tabla”', () => {
    expect(naslovTable({ ...p, datum: null })).toBe('Tabla · Uvod u računarstvo, predavanje 12');
    expect(naslovTable({ ...p, predmet: null })).toBe('Tabla · predavanje 24. 11. 2026.');
    expect(naslovTable(null)).toBe('Tabla');
  });

  it('putanje table i publike', () => {
    expect(tablaPredavanja(5)).toBe('predavanja/5/tabla');
    expect(publikaTable(5)).toBe('predavanja/5/tabla/publika');
  });
});
