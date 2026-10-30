import { describe, expect, it } from 'vitest';

import { adresaStavke, kadaStiglo } from './obavestenja.pravila';

describe('adresaStavke', () => {
  it.each([
    ['nalog', '/nalog'],
    ['nalog/cas', '/nalog/cas'],
    ['nalog/predmet/7', '/nalog/predmet/7'],
    ['nalog/predmet/7?tab=materijali', '/nalog/predmet/7?tab=materijali'],
    ['raspored/termini?od=2026-11-03', '/nalog'],
    ['?obavestenja=otvori', '/nalog'],
    ['https://evil.example/nalog', '/nalog'],
    ['//evil.example/nalog', '/nalog'],
    ['nalog/../raspored', '/nalog'],
    ['nalogx', '/nalog'],
    ['', '/nalog'],
  ])('%s', (putanja, adresa) => {
    expect(adresaStavke(putanja)).toBe(adresa);
  });
});

describe('kadaStiglo', () => {
  const sada = new Date(2026, 10, 5, 12, 0);
  it('danas, juče, ranije', () => {
    expect(kadaStiglo('2026-11-05T09:05:00', sada)).toBe('danas 9:05');
    expect(kadaStiglo('2026-11-04T18:30:00', sada)).toBe('juče 18:30');
    expect(kadaStiglo('2026-10-28T07:00:00', sada)).toBe('28. 10. 7:00');
    expect(kadaStiglo('nije datum', sada)).toBe('');
  });
});
