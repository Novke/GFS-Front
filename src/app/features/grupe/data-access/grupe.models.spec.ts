import { describe, expect, it } from 'vitest';

import { emailoviZaKopiranje, grupeZaPremestanje, imeStudenta, procenat, SEPARATOR_EMAILOVA, stanjeCelije } from './grupe.models';

describe('emailoviZaKopiranje (G6)', () => {
  it('bez praznih i bez duplikata (velika slova i razmaci se ne računaju), redosledom studenata', () => {
    const adrese = emailoviZaKopiranje([
      { email: 'ana@example.com' },
      { email: null },
      { email: '' },
      { email: '   ' },
      { email: ' Boris@Example.com ' },
      { email: 'ANA@example.com' },
      { email: 'boris@example.com' },
      { email: 'cveta@example.com' },
    ]);
    expect(adrese).toEqual(['ana@example.com', 'Boris@Example.com', 'cveta@example.com']);
    expect(adrese.join(SEPARATOR_EMAILOVA)).toBe('ana@example.com; Boris@Example.com; cveta@example.com');
  });

  it('prazna grupa i studenti bez emaila daju prazan niz', () => {
    expect(emailoviZaKopiranje([])).toEqual([]);
    expect(emailoviZaKopiranje([{ email: null }, { email: undefined as unknown as null }])).toEqual([]);
  });
});

describe('grupeZaPremestanje (G8)', () => {
  const g = (id: number, naziv: string) => ({ id, naziv, godinaUpisa: 2025, brojStudenata: 1 });

  it('ne nudi trenutnu grupu, ostale po nazivu', () => {
    const opcije = grupeZaPremestanje([g(3, 'GD-2025'), g(1, 'AR-2025'), g(2, 'ČS-2024')], 3);
    expect(opcije.map(x => x.id)).toEqual([1, 2]);
    expect(opcije.some(x => x.id === 3)).toBe(false);
  });

  it('student bez grupe (null) vidi sve grupe', () => {
    expect(grupeZaPremestanje([g(1, 'A'), g(2, 'B')], null)).toHaveLength(2);
  });
});

describe('stanjeCelije (G3)', () => {
  it('nema aktivnosti = odsutan; ZADATAK i SA_ZVEZDICOM su prisustvo sa aktivnošću', () => {
    expect(stanjeCelije(undefined)).toBe(0);
    expect(stanjeCelije(null)).toBe(0);
    expect(stanjeCelije('PRISUSTVO')).toBe(1);
    expect(stanjeCelije('ZADATAK')).toBe(2);
    expect(stanjeCelije('SA_ZVEZDICOM')).toBe(3);
    expect(stanjeCelije('NEPOZNAT')).toBe(1);
  });
});

describe('imeStudenta i procenat', () => {
  it('prezime pa ime; bez podataka —', () => {
    expect(imeStudenta({ ime: 'Ana', prezime: 'Anić' })).toBe('Anić Ana');
    expect(imeStudenta({ ime: null, prezime: null })).toBe('—');
    expect(imeStudenta(null)).toBe('—');
  });

  it('procenat bez imenioca je null', () => {
    expect(procenat(3, 4)).toBe(75);
    expect(procenat(0, 0)).toBeNull();
    expect(procenat(null, 4)).toBeNull();
  });
});
