import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorHandlerUtil } from './error-handler.util';

// Privremeno do F2: ponasanje starog alert-a ostaje isto dok ga ne zameni novi prikaz gresaka.
describe('ErrorHandlerUtil', () => {
  let alertSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('za 400 sa reason poziva alert sa porukom', () => {
    ErrorHandlerUtil.handleHttpError(new HttpErrorResponse({ status: 400, error: { reason: 'X' } }));
    expect(alertSpy).toHaveBeenCalledWith('Greska: X');
  });

  it('za 4xx bez reason koristi opštu poruku', () => {
    ErrorHandlerUtil.handleHttpError(new HttpErrorResponse({ status: 404, error: {} }));
    expect(alertSpy).toHaveBeenCalledWith('Greska: Sistemska greska');
  });

  it('za 5xx ne poziva alert nego loguje', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ErrorHandlerUtil.handleHttpError(new HttpErrorResponse({ status: 500 }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
