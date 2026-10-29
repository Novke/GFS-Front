import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_FORMATS, MatDateFormats } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { beforeEach, describe, expect, it } from 'vitest';

import { hhmmIzVremena, isoIzDatuma, opcijeVremena, provideSrpskiDatum, vremeIzHhmm } from './datum-vreme';

describe('SrpskiDatumAdapter (provideSrpskiDatum)', () => {
  let a: DateAdapter<Date>;
  let formati: MatDateFormats;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideSrpskiDatum()] });
    a = TestBed.inject(DateAdapter<Date>);
    formati = TestBed.inject(MAT_DATE_FORMATS);
  });

  it.each([
    ['29.10.2026.', 2026, 10, 29],
    ['29. 10. 2026.', 2026, 10, 29],
    ['1.9.2026', 2026, 9, 1],
    ['01.09.2026', 2026, 9, 1],
    [' 3 . 2 . 2027 . ', 2027, 2, 3],
    ['3/2/2027', 2027, 2, 3],
    ['2026-10-01', 2026, 10, 1],
  ])('parse(%j) je lokalna ponoć %i-%i-%i (dan pa mesec)', (tekst, g, m, d) => {
    const datum = a.parse(tekst, formati.parse.dateInput)!;
    expect(a.isValid(datum)).toBe(true);
    expect([datum.getFullYear(), datum.getMonth() + 1, datum.getDate(), datum.getHours()]).toEqual([g, m, d, 0]);
  });

  it.each(['31.2.2026.', '32.1.2026', '0.1.2026', '1.13.2026', '10/29/2026', '29.10.26', 'sutra', '2026-02-30'])(
    'parse(%j) je neispravan datum (polje pokazuje grešku, ne pogađa)', tekst => {
      expect(a.isValid(a.parse(tekst, formati.parse.dateInput)!)).toBe(false);
    },
  );

  it('prazan tekst je bez vrednosti', () => {
    expect(a.parse('', formati.parse.dateInput)).toBeNull();
    expect(a.parse('   ', formati.parse.dateInput)).toBeNull();
  });

  it('prikaz je srpski (29. 10. 2026., 08:05) i čita se nazad', () => {
    const datum = new Date(2026, 9, 29);
    const tekst = a.format(datum, formati.display.dateInput);
    expect(tekst).toBe('29. 10. 2026.');
    expect(a.sameDate(a.parse(tekst, formati.parse.dateInput), datum)).toBe(true);
    expect(a.format(new Date(2026, 9, 29, 8, 5), formati.display.timeInput)).toBe('08:05');
  });

  it('nedelja u kalendaru počinje ponedeljkom', () => {
    expect(a.getFirstDayOfWeek()).toBe(1);
  });

  it('vreme se kuca kao 8:30, 8.30 ili 14:05; 25:00 je neispravno', () => {
    for (const [tekst, sat, min] of [['8:30', 8, 30], ['8.30', 8, 30], ['14:05', 14, 5]] as const) {
      const v = a.parseTime(tekst, formati.parse.timeInput)!;
      expect([a.getHours(v), a.getMinutes(v)]).toEqual([sat, min]);
    }
    expect(a.isValid(a.parseTime('25:00', formati.parse.timeInput)!)).toBe(false);
  });

  it('kalendar govori srpski (čitač ekrana, strelice za mesec)', () => {
    const intl = TestBed.inject(MatDatepickerIntl);
    expect(intl.openCalendarLabel).toBe('Otvori kalendar');
    expect(intl.nextMonthLabel).toBe('Sledeći mesec');
    expect(intl.switchToMultiYearViewLabel).toBe('Izaberi mesec i godinu');
  });
});

describe('pretvaranje vrednosti pickera', () => {
  it('isoIzDatuma: lokalni datum kao 2026-01-05; prazno i neispravno -> ""', () => {
    expect(isoIzDatuma(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoIzDatuma(null)).toBe('');
    expect(isoIzDatuma(new Date(NaN))).toBe('');
  });

  it('hhmmIzVremena i vremeIzHhmm idu tamo i nazad', () => {
    expect(hhmmIzVremena(new Date(2026, 0, 1, 8, 5))).toBe('08:05');
    expect(hhmmIzVremena(null)).toBe('');
    expect(hhmmIzVremena(new Date(NaN))).toBe('');
    const v = vremeIzHhmm('08:15')!;
    expect([v.getHours(), v.getMinutes()]).toEqual([8, 15]);
    expect(hhmmIzVremena(v)).toBe('08:15');
    expect(vremeIzHhmm('')).toBeNull();
    expect(vremeIzHhmm('25:00')).toBeNull();
    expect(vremeIzHhmm('8:15')).toBeNull();
  });

  it('opcijeVremena: od 07:00 do 21:45 na 15 minuta', () => {
    const o = opcijeVremena(7, 22, 15);
    expect(o).toHaveLength(60);
    expect(o[0].label).toBe('07:00');
    expect(o[1].label).toBe('07:15');
    expect(o.at(-1)!.label).toBe('21:45');
    expect(hhmmIzVremena(o[4].value)).toBe('08:00');
  });
});
