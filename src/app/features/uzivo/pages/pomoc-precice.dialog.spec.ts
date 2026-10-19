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
});
