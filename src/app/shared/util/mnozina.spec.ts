import { brojAdresaTekst, brojStudenataTekst } from './mnozina';

describe('mnozina', () => {
  it('brojStudenataTekst: 1, 2-4, 5+ i 11-14', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25].map(brojStudenataTekst)).toEqual([
      '1 student', '2 studenta', '5 studenata', '11 studenata', '12 studenata', '21 student', '22 studenta', '25 studenata',
    ]);
  });

  it('brojAdresaTekst: 1 adresa, 2-4 adrese, 5+ adresa, 11-14 adresa', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 100, 102, 111, 112].map(brojAdresaTekst)).toEqual([
      '1 adresa', '2 adrese', '4 adrese', '5 adresa', '11 adresa', '12 adresa', '14 adresa', '21 adresa', '22 adrese',
      '24 adrese', '25 adresa', '100 adresa', '102 adrese', '111 adresa', '112 adresa',
    ]);
  });
});
