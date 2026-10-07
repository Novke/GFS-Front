import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../state/notification.store';
import { LOCAL_ERRORS } from './api-error';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let kontrola: HttpTestingController;
  let greska: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    greska = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationStore, useValue: { greska } },
      ],
    });
    http = TestBed.inject(HttpClient);
    kontrola = TestBed.inject(HttpTestingController);
  });

  it('šalje reason iz 4xx u NotificationStore i prosleđuje grešku dalje', () => {
    const onError = vi.fn();
    http.get('api/studenti').subscribe({ error: onError });
    kontrola.expectOne('api/studenti').flush({ reason: 'Nema tog studenta.' }, { status: 404, statusText: 'Not Found' });

    expect(greska).toHaveBeenCalledExactlyOnceWith('Nema tog studenta.');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].status).toBe(404);
  });

  it('mrežna greška i 5xx daju svoje poruke', () => {
    http.get('api/a').subscribe({ error: () => undefined });
    kontrola.expectOne('api/a').error(new ProgressEvent('error'));
    http.get('api/b').subscribe({ error: () => undefined });
    kontrola.expectOne('api/b').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(greska.mock.calls).toEqual([['Nema veze sa serverom.'], ['Sistemska greška. Pokušaj ponovo.']]);
  });

  it('ne obaveštava kad je LOCAL_ERRORS true, ali grešku prosleđuje', () => {
    const onError = vi.fn();
    http.post('api/public/upis/abc', {}, { context: new HttpContext().set(LOCAL_ERRORS, true) }).subscribe({ error: onError });
    kontrola.expectOne('api/public/upis/abc').flush({ reason: 'Sesija je zatvorena.' }, { status: 410, statusText: 'Gone' });

    expect(greska).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('ne obaveštava za assets/ (ikone, env.json)', () => {
    http.get('assets/icons/x.svg').subscribe({ error: () => undefined });
    kontrola.expectOne('assets/icons/x.svg').flush('', { status: 404, statusText: 'Not Found' });
    http.get('assets/env.json').subscribe({ error: () => undefined });
    kontrola.expectOne('assets/env.json').error(new ProgressEvent('error'));

    expect(greska).not.toHaveBeenCalled();
  });

  it('assets/ kao deo druge putanje ne utiče na obaveštavanje', () => {
    http.get('api/predmeti/assets/1').subscribe({ error: () => undefined });
    kontrola.expectOne('api/predmeti/assets/1').flush({ reason: 'x' }, { status: 400, statusText: 'Bad Request' });

    expect(greska).toHaveBeenCalledOnce();
  });
});
