import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { toApiError } from './api-error';

describe('toApiError', () => {
  it('status 0 je greška mreže', () => {
    const e = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });
    expect(toApiError(e)).toEqual({ status: 0, reason: 'Nema veze sa serverom.' });
  });

  it('4xx sa error.reason vraća taj tekst', () => {
    const e = new HttpErrorResponse({ status: 400, error: { reason: 'Indeks već postoji.', time: 'x' } });
    expect(toApiError(e)).toEqual({ status: 400, reason: 'Indeks već postoji.' });
  });

  it('4xx bez reason vraća opšti tekst sa statusom', () => {
    const e = new HttpErrorResponse({ status: 404, error: null });
    expect(toApiError(e)).toEqual({ status: 404, reason: 'Zahtev nije uspeo (404).' });
  });

  it('4xx sa praznim ili neispravnim reason koristi opšti tekst', () => {
    expect(toApiError(new HttpErrorResponse({ status: 409, error: { reason: '  ' } })).reason).toBe('Zahtev nije uspeo (409).');
    expect(toApiError(new HttpErrorResponse({ status: 400, error: { reason: 5 } })).reason).toBe('Zahtev nije uspeo (400).');
    expect(toApiError(new HttpErrorResponse({ status: 400, error: '<html>nginx</html>' })).reason).toBe('Zahtev nije uspeo (400).');
  });

  it('5xx je uvek sistemska greška, bez curenja detalja sa servera', () => {
    const e = new HttpErrorResponse({ status: 500, error: { reason: 'NullPointerException at ...' } });
    expect(toApiError(e)).toEqual({ status: 500, reason: 'Sistemska greška. Pokušaj ponovo.' });
    expect(toApiError(new HttpErrorResponse({ status: 502 })).reason).toBe('Sistemska greška. Pokušaj ponovo.');
  });
});
