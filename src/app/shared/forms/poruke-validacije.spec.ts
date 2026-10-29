import { describe, expect, it } from 'vitest';

import { porukaValidacije } from './poruke-validacije';

describe('porukaValidacije', () => {
  it('bez grešaka vraća null', () => {
    expect(porukaValidacije(null, 'Ime')).toBeNull();
    expect(porukaValidacije({}, 'Ime')).toBeNull();
  });

  it.each([
    [{ required: true }, 'Prezime je obavezno.'],
    [{ email: true }, 'Email nije ispravan.'],
    [{ min: { min: 1, actual: 0 } }, 'Najmanje 1.'],
    [{ max: { max: 10, actual: 11 } }, 'Najviše 10.'],
    [{ maxlength: { requiredLength: 20, actualLength: 25 } }, 'Najviše 20 znakova.'],
    [{ minlength: { requiredLength: 2, actualLength: 1 } }, 'Najmanje 2 znakova.'],
    [{ pattern: { requiredPattern: '^x$', actualValue: 'y' } }, 'Neispravan format.'],
  ])('%j -> %s', (errors, poruka) => {
    expect(porukaValidacije(errors, 'Prezime')).toBe(poruka);
  });

  it('nepoznat ključ daje opštu poruku', () => {
    expect(porukaValidacije({ custom: true }, 'Ime')).toBe('Neispravna vrednost.');
  });

  it('prvi ključ po prioritetu: required pre ostalih', () => {
    expect(porukaValidacije({ pattern: {}, required: true }, 'Indeks')).toBe('Indeks je obavezno.');
  });

  it('neispravno ukucan datum ili vreme ima prednost nad required (polje tada nema vrednost, ali nije prazno)', () => {
    expect(porukaValidacije({ matDatepickerParse: { text: '31. 2. 2030.' }, required: true }, 'Datum'))
      .toBe('Datum nije ispravan (npr. 29. 10. 2026.).');
    expect(porukaValidacije({ matTimepickerParse: { text: '25:00' } }, 'Vreme')).toBe('Vreme nije ispravno (npr. 08:30).');
  });
});
