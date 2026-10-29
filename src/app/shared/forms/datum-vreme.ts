import { Injectable, Provider } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, MAT_NATIVE_DATE_FORMATS, MatDateFormats, NativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatTimepickerOption } from '@angular/material/timepicker';

import { isoDatum, lokalniDatum } from '../util/termin';

/*
 * Kalendar (`MatDatepicker`) i izbor vremena (`MatTimepicker`) na srpskom, umesto nativnih `type="date|time"` polja: Material
 * u `mat-form-field` sakriva ikonicu nativnog pickera (`::-webkit-calendar-picker-indicator { display: none }`), pa takvo
 * polje nema iskačući prozor, a u uskoj koloni klik fokusira deo za godinu i ukucane cifre ne daju datum.
 * Vrednost kontrole je `Date` (lokalna ponoć, odnosno današnji dan sa vremenom); u `YYYY-MM-DD` i `HH:mm` se pretvara na
 * granici forme (`isoIzDatuma`, `hhmmIzVremena`, `vremeIzHhmm`).
 */

const DAN_MESEC_GODINA = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})\s*\.?$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Native adapter koji čita srpski zapis (`29. 10. 2026.`, `29.10.2026`, `1/9/2026`: dan pa mesec) i ISO (`2026-10-01`, za
 * nalepljen tekst), a sve ostalo proglašava neispravnim umesto da pogađa (`Date.parse` bi `10/29/2026` čitao američki).
 * Nedelja počinje ponedeljkom i u Firefox-u (bez `Intl.Locale.getWeekInfo`).
 */
@Injectable()
export class SrpskiDatumAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value !== 'string') {
      return super.parse(value, parseFormat);
    }
    const tekst = value.trim();
    if (tekst === '') {
      return null;
    }
    if (ISO.test(tekst)) {
      return lokalniDatum(tekst) ?? this.invalid();
    }
    const m = DAN_MESEC_GODINA.exec(tekst);
    if (!m) {
      return this.invalid();
    }
    const [d, mes, g] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const datum = new Date(g, mes - 1, d);
    return datum.getFullYear() === g && datum.getMonth() === mes - 1 && datum.getDate() === d ? datum : this.invalid();
  }

  override getFirstDayOfWeek(): number {
    return 1;
  }
}

/** Prikaz `29. 10. 2026.` i `08:05` (24 h, vodeća nula). */
export const SRPSKI_FORMATI: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    timeInput: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    timeOptionLabel: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  },
};

/** Tekstovi kalendara za čitač ekrana i dugmad (Material ih podrazumevano daje na engleskom). */
@Injectable()
export class SrpskiDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Kalendar';
  override openCalendarLabel = 'Otvori kalendar';
  override closeCalendarLabel = 'Zatvori kalendar';
  override prevMonthLabel = 'Prethodni mesec';
  override nextMonthLabel = 'Sledeći mesec';
  override prevYearLabel = 'Prethodna godina';
  override nextYearLabel = 'Sledeća godina';
  override prevMultiYearLabel = 'Prethodne 24 godine';
  override nextMultiYearLabel = 'Sledeće 24 godine';
  override switchToMonthViewLabel = 'Izaberi datum';
  override switchToMultiYearViewLabel = 'Izaberi mesec i godinu';
  override startDateLabel = 'Početni datum';
  override endDateLabel = 'Krajnji datum';
  override comparisonDateLabel = 'Period za poređenje';
  override formatYearRangeLabel(start: string, end: string): string {
    return `od ${start} do ${end}`;
  }
}

/**
 * Provajderi za komponentu (ili rutu) sa kalendarom i izborom vremena. Lokalni, a ne u `app.config`, da adapter ne bi ulazio u
 * početni paket; locale se postavlja ovde, pa komponenta radi isto i u testu bez `app.config`.
 */
export function provideSrpskiDatum(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'sr-Latn' },
    { provide: DateAdapter, useClass: SrpskiDatumAdapter },
    { provide: MAT_DATE_FORMATS, useValue: SRPSKI_FORMATI },
    { provide: MatDatepickerIntl, useClass: SrpskiDatepickerIntl },
  ];
}

const ispravan = (d: Date | null | undefined): d is Date => d instanceof Date && !isNaN(d.getTime());

/** Datum iz kalendara kao `2026-01-05`; prazno ili neispravno (ukucan nepostojeći dan) -> prazno. */
export function isoIzDatuma(d: Date | null | undefined): string {
  return ispravan(d) ? isoDatum(d) : '';
}

/** Vreme iz pickera kao `08:05`; prazno ili neispravno -> prazno. */
export function hhmmIzVremena(d: Date | null | undefined): string {
  return ispravan(d) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
}

/** `08:15` -> današnji dan u 08:15 (za vrednost pickera); bilo šta drugo -> `null`. */
export function vremeIzHhmm(v: string | null | undefined): Date | null {
  const m = typeof v === 'string' ? HH_MM.exec(v) : null;
  if (!m) {
    return null;
  }
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/**
 * Ponuđena vremena od `odSata` do (bez) `doSata` na `korakMin` minuta. Lista samo skraćuje izbor; ukucano vreme van nje važi
 * (bez `matTimepickerMin/Max`, koji bi ga proglasili greškom).
 */
export function opcijeVremena(odSata: number, doSata: number, korakMin: number): MatTimepickerOption<Date>[] {
  const opcije: MatTimepickerOption<Date>[] = [];
  for (let min = odSata * 60; min < doSata * 60; min += korakMin) {
    const d = new Date();
    d.setHours(Math.floor(min / 60), min % 60, 0, 0);
    opcije.push({ value: d, label: hhmmIzVremena(d) });
  }
  return opcije;
}
