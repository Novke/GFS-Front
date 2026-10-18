import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { PORUKA_MREZA, PORUKA_SISTEM } from '../../../core/api/api-error';
import { razlogBanke, TIHO } from './greske';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('razlogBanke', () => {
  it('503: poruka servera (render servis), a bez nje podrazumevana', () => {
    expect(razlogBanke(http(503, { reason: 'Render servis nije dostupan.' }))).toBe('Render servis nije dostupan.');
    expect(razlogBanke(http(503, '<html>503</html>'))).toBe('Render servis nije dostupan.');
  });

  it('504: zahtev je istekao, a ponovni pokušaj bi mogao da napravi duplikat', () => {
    expect(razlogBanke(http(504, { reason: 'Gateway Timeout' })))
      .toBe('Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.');
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
