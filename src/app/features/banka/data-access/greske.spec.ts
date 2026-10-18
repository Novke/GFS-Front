import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { PORUKA_MREZA, PORUKA_SISTEM } from '../../../core/api/api-error';
import { razlogBanke, TIHO, UPIS } from './greske';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('razlogBanke', () => {
  it('503: poruka servera (render servis), a bez nje podrazumevana', () => {
    expect(razlogBanke(http(503, { reason: 'Render servis nije dostupan.' }))).toBe('Render servis nije dostupan.');
    expect(razlogBanke(http(503, '<html>503</html>'))).toBe('Render servis nije dostupan.');
  });

  it('504 izmene: proveri banku pre ponovnog pokušaja (moguć duplikat); 504 čitanja: pokušaj ponovo', () => {
    expect(razlogBanke(http(504, { reason: 'Gateway Timeout' }), { upis: true }))
      .toBe('Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.');
    expect(razlogBanke(http(504, { reason: 'Gateway Timeout' }), UPIS))
      .toBe('Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.');
    expect(razlogBanke(http(504))).toBe('Zahtev je istekao, pokušaj ponovo.');
    expect(razlogBanke(http(504), { upis: false })).toBe('Zahtev je istekao, pokušaj ponovo.');
  });

  it('ostalo kao toApiError: 4xx razlog servera, 5xx opšta poruka, 0 mreža; ne-HTTP greška je sistemska', () => {
    expect(razlogBanke(http(409, { reason: 'Grupa ima podgrupe.' }))).toBe('Grupa ima podgrupe.');
    expect(razlogBanke(http(500, { reason: 'NullPointerException' }))).toBe(PORUKA_SISTEM);
    expect(razlogBanke(http(0))).toBe(PORUKA_MREZA);
    expect(razlogBanke(new Error('x'))).toBe(PORUKA_SISTEM);
  });

  it('TIHO je { tiho: true }', () => {
    expect(TIHO).toEqual({ tiho: true });
  });
});
