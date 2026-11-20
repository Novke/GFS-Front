import { naslovIshoda } from './naslov-ishoda';

describe('naslovIshoda', () => {
  it('bez udela (Zadatak, stari backend) kao ranije: Tačno! sa poenima, Netačno, primljen, nije odgovorio', () => {
    expect(naslovIshoda({ odgovorio: true, tacno: true, poeni: 850 }, true)).toBe('Tačno! +850');
    expect(naslovIshoda({ odgovorio: true, tacno: true, poeni: 850 }, false)).toBe('Tačno!');
    expect(naslovIshoda({ odgovorio: true, tacno: false, poeni: 0 }, true)).toBe('Netačno');
    expect(naslovIshoda({ odgovorio: true, tacno: null, poeni: null }, false)).toBe('Odgovor primljen');
    expect(naslovIshoda({ odgovorio: false, tacno: null, poeni: null }, true)).toBe('Nisi odgovorio');
  });

  it('udeo između 0 i 1: "Delimično tačno" (+ poeni u takmičenju); 0 Netačno, 1 Tačno!', () => {
    expect(naslovIshoda({ odgovorio: true, tacno: false, poeni: 425, udeo: 0.5 }, true)).toBe('Delimično tačno +425');
    expect(naslovIshoda({ odgovorio: true, tacno: false, poeni: 425, udeo: 0.5 }, false)).toBe('Delimično tačno');
    expect(naslovIshoda({ odgovorio: true, tacno: false, poeni: 0, udeo: 0 }, true)).toBe('Netačno');
    expect(naslovIshoda({ odgovorio: true, tacno: true, poeni: 900, udeo: 1 }, true)).toBe('Tačno! +900');
    expect(naslovIshoda({ odgovorio: true, tacno: false, poeni: null, udeo: null }, false)).toBe('Netačno');
  });
});
