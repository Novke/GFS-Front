import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { KOD, normalizujIndeks, porukaGreske, samoCifreKoda } from './nalog.pravila';

describe('nalog.pravila', () => {
  it('normalizujIndeks: bez razmaka, velika slova', () => {
    expect(normalizujIndeks(' gd 12 ')).toBe('GD12');
    expect(normalizujIndeks('ar\t3/2025')).toBe('AR3/2025');
  });

  it('samoCifreKoda: nalepljen kod sa razmacima, crticom ili tekstom oko njega', () => {
    expect(samoCifreKoda(' 123 456 ')).toBe('123456');
    expect(samoCifreKoda('123-456')).toBe('123456');
    expect(samoCifreKoda('Kod: 654321.')).toBe('654321');
    expect(samoCifreKoda('12345678')).toBe('123456');
    expect(KOD.test('123456')).toBe(true);
    expect(KOD.test('12345')).toBe(false);
  });

  it('porukaGreske: 401/429/503 doslovno, mreža i ostale 5xx opšte', () => {
    const e = (status: number, error: unknown) => new HttpErrorResponse({ status, error });
    expect(porukaGreske(e(401, { reason: 'Kod nije ispravan ili je istekao.' }))).toBe('Kod nije ispravan ili je istekao.');
    expect(porukaGreske(e(429, { reason: 'Previše pokušaja. Pokušaj ponovo kasnije.' }))).toBe('Previše pokušaja. Pokušaj ponovo kasnije.');
    expect(porukaGreske(e(503, { reason: 'Slanje koda trenutno nije moguće. Javi se nastavniku.' })))
      .toBe('Slanje koda trenutno nije moguće. Javi se nastavniku.');
    expect(porukaGreske(e(503, 'x'))).toBe('Sistemska greška. Pokušaj ponovo.');
    expect(porukaGreske(e(500, { reason: 'detalj servera' }))).toBe('Sistemska greška. Pokušaj ponovo.');
    expect(porukaGreske(e(0, null))).toBe('Nema veze sa serverom.');
    expect(porukaGreske(new Error('x'))).toBe('Sistemska greška. Pokušaj ponovo.');
  });
});
