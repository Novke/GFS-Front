import { describe, expect, it } from 'vitest';

import {
  greskaPozivnog,
  greskaTelefona,
  PORUKE_TELEFONA,
  prepoznajZemlju,
  prikazTelefona,
  razdvojiMedjunarodni,
  uE164,
  ZEMLJE,
} from './telefon';

// Sintetički brojevi (oblici iz baze, ne pravi brojevi).
describe('telefon u E.164', () => {
  it('lokalni broj dobija pozivni izabrane zemlje bez vodeće nule', () => {
    expect(uE164('RS', '', '0641234567')).toBe('+381641234567');
    expect(uE164('RS', '', '064 123 4567')).toBe('+381641234567');
    expect(uE164('RS', '', '(064) 123-45-67')).toBe('+381641234567');
    expect(uE164('RS', '', '641234567')).toBe('+381641234567');
    expect(uE164('BA', '', '065 123 456')).toBe('+38765123456');
    expect(uE164('HU', '', '06 30 123 4567')).toBe('+36301234567');
  });

  it('međunarodni unos važi bez obzira na izbor zemlje', () => {
    expect(uE164('RS', '', '+387 65 123 456')).toBe('+38765123456');
    expect(uE164('RS', '', '00387 65 123 456')).toBe('+38765123456');
    expect(uE164('BA', '', '+38164 1234 567')).toBe('+381641234567');
    expect(uE164('RS', '', '+44 7700 900123')).toBe('+447700900123');
    // cifre koje već počinju pozivnim brojem izabrane zemlje: međunarodni broj bez plusa
    expect(uE164('RS', '', '381641234567')).toBe('+381641234567');
  });

  it('neispravno: slova, plus u sredini, prekratko, predugačko', () => {
    expect(uE164('RS', '', 'abc')).toBeNull();
    expect(uE164('RS', '', '064+123456')).toBeNull();
    expect(uE164('RS', '', '06412')).toBeNull();
    expect(uE164('RS', '', '+3816412345678901234')).toBeNull();
    expect(uE164('RS', '', '')).toBeNull();
  });

  it('"Druga zemlja" koristi ručni pozivni broj', () => {
    expect(uE164('XX', '44', '07700 900123')).toBe('+447700900123');
    expect(uE164('XX', '+1', '202 555 0100')).toBe('+12025550100');
    expect(uE164('XX', '', '07700 900123')).toBeNull();
    expect(greskaPozivnog('XX', '', '07700 900123')).toBe(PORUKE_TELEFONA.pozivni);
    expect(greskaPozivnog('XX', '', '+44 7700 900123')).toBeNull();
    expect(greskaPozivnog('RS', '', '064')).toBeNull();
  });

  it('poruke za polje broja', () => {
    expect(greskaTelefona('RS', '', ' ')).toBe(PORUKE_TELEFONA.broj);
    expect(greskaTelefona('RS', '', 'abc')).toBe(PORUKE_TELEFONA.neispravan);
    expect(greskaTelefona('RS', '', '064 1234567')).toBeNull();
  });

  it('pun broj sa liste se razdvaja na zemlju i ostatak', () => {
    expect(razdvojiMedjunarodni('+387 65 123 456')).toEqual({ kod: 'BA', broj: '65123456' });
    expect(razdvojiMedjunarodni('0036 30 123 4567')).toEqual({ kod: 'HU', broj: '301234567' });
    expect(razdvojiMedjunarodni('064 123 4567')).toBeNull();
    expect(razdvojiMedjunarodni('+44 7700 900123')).toBeNull();
    expect(prepoznajZemlju('38641234567')?.kod).toBe('SI');
  });

  it('prikaz i lista zemalja', () => {
    expect(prikazTelefona('+381641234567')).toBe('+381 64 1234567');
    expect(prikazTelefona('+447700900123')).toBe('+447700900123');
    expect(ZEMLJE.map(z => z.kod)).toEqual(['RS', 'BA', 'ME', 'HR', 'HU', 'MK', 'SI', 'XX']);
    expect(ZEMLJE[0].pozivni).toBe('381');
  });
});
