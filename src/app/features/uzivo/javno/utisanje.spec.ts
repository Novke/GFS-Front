import { porukaUtisanja } from './utisanje';

describe('porukaUtisanja', () => {
  it('pitalice gase samo pitanje, sve gasi i zadatak', () => {
    expect(porukaUtisanja(null, false)).toBeNull();
    expect(porukaUtisanja(undefined, true)).toBeNull();
    expect(porukaUtisanja('PITALICE', false)).toBe('Nastavnik ti je isključio odgovaranje na pitalice.');
    expect(porukaUtisanja('PITALICE', true)).toBeNull();
    expect(porukaUtisanja('SVE', false)).toBe('Nastavnik ti je isključio odgovaranje na pitalice i zadatke.');
    expect(porukaUtisanja('SVE', true)).toBe('Nastavnik ti je isključio odgovaranje na pitalice i zadatke.');
  });
});
