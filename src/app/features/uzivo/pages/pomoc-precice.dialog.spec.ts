import { precice } from './pomoc-precice.dialog';

describe('precice (tabela pomoći)', () => {
  it('Shift+R (rešenje zadatka) odmah posle R, u publici i u konzoli', () => {
    for (const kontekst of ['publika', 'konzola'] as const) {
      const redovi = precice(kontekst);
      const r = redovi.findIndex(red => red.tasteri.length === 1 && red.tasteri[0] === 'R');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(redovi[r + 1]).toEqual({ tasteri: ['Shift', 'R'], opis: 'Rešenje zadatka (posle zatvaranja)' });
    }
  });

  it('A (brza anketa) samo u konzoli, pre pomoći', () => {
    const konzola = precice('konzola');
    const a = konzola.findIndex(red => red.tasteri.length === 1 && red.tasteri[0] === 'A');
    expect(a).toBe(konzola.length - 2);
    expect(konzola[a].opis).toContain('Brza anketa');
    expect(precice('publika').some(red => red.tasteri[0] === 'A')).toBe(false);
  });
});
