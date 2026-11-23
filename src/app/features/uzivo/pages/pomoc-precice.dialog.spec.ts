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

  it('R se u oba prozora pritiska dvaput; Shift+M i Shift+D umesto M i D', () => {
    for (const kontekst of ['publika', 'konzola'] as const) {
      const redovi = precice(kontekst);
      expect(redovi).toContainEqual({ tasteri: ['R'], opis: 'Ponovi pitanje (pritisni R dvaput)' });
      expect(redovi.some(r => r.tasteri.join('+') === 'Shift+M')).toBe(true);
      expect(redovi.some(r => r.tasteri.join('+') === 'Shift+D')).toBe(true);
      expect(redovi.some(r => r.tasteri.join('+') === 'M')).toBe(false);
      expect(redovi.find(r => r.tasteri.join('+') === 'W')?.opis).toContain('bela tabla');
    }
  });

  it('D (crtanje, sa 1–7 i Ctrl+Z) postoji samo u konzoli', () => {
    const d = precice('konzola').find(r => r.tasteri.join('+') === 'D');
    expect(d?.opis).toContain('Crtanje');
    expect(d?.opis).toContain('1–7');
    expect(d?.opis).toContain('Ctrl+Z');
    expect(precice('publika').some(r => r.tasteri.join('+') === 'D')).toBe(false);
  });
});
