import { animacija, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PAUZA_IZMEDJU_GRUPA_MS, korakPreAnimacije, planPustanja } from './pregled';

/** Grupa 0 (FADE 500, sama), pa KLIK 500 i KLIK 300 (sa jednom SA_PRETHODNIM u drugoj grupi). */
const p = platnoSaAnimacijama([
  animacija('a0', 's1', { okidac: 'POSLE_PRETHODNOG' }),
  animacija('a1', 's1'),
  animacija('a2', 's2', { trajanjeMs: 300 }),
  animacija('a3', 's3', { okidac: 'SA_PRETHODNIM', trajanjeMs: 200 }),
]);

describe('pregled (F18)', () => {
  it('pauza između grupa je 400 ms', () => {
    expect(PAUZA_IZMEDJU_GRUPA_MS).toBe(400);
  });

  it('planPustanja od 0: grupa 0 se pušta sama, svaka sledeća posle kraja prethodne + pauza', () => {
    expect(planPustanja(p, 0)).toEqual([{ korak: 1, posleMs: 900 }, { korak: 2, posleMs: 900 }]);
  });

  it('planPustanja od koraka 1: samo pauza do sledeće grupe (korak 1 je već nacrtan)', () => {
    expect(planPustanja(p, 1)).toEqual([{ korak: 2, posleMs: 400 }]);
    expect(planPustanja(p, 2)).toEqual([]);
  });

  it('bez animacija nema plana; bez grupe 0 prvi korak posle same pauze', () => {
    expect(planPustanja(platnoSaAnimacijama([]), 0)).toEqual([]);
    expect(planPustanja(platnoSaAnimacijama([animacija('a1', 's1')]), 0)).toEqual([{ korak: 1, posleMs: 400 }]);
  });

  it('korakPreAnimacije: stanje pre grupe izabrane animacije; grupa 0 i nepostojeća -> 0', () => {
    expect(korakPreAnimacije(p, 'a3')).toBe(1);
    expect(korakPreAnimacije(p, 'a2')).toBe(1);
    expect(korakPreAnimacije(p, 'a1')).toBe(0);
    expect(korakPreAnimacije(p, 'a0')).toBe(0);
    expect(korakPreAnimacije(p, 'nema')).toBe(0);
  });
});
