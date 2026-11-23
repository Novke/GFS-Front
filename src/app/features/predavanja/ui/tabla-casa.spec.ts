import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TablaCasa } from './tabla-casa';

describe('TablaCasa', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function otvori(elementi: unknown[] | 'greska') {
    const f = TestBed.createComponent(TablaCasa);
    f.componentRef.setInput('predavanjeId', 5);
    f.detectChanges();
    await f.whenStable();
    const zahtev = http.expectOne('api/predavanja/5/tabla');
    if (elementi === 'greska') zahtev.flush({ reason: 'Nema.' }, { status: 404, statusText: 'Not Found' });
    else zahtev.flush({ elementi, verzija: elementi.length ? 2 : 0 });
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('prazna tabla ili greška: odeljka nema', async () => {
    expect((await otvori([])).querySelector('[data-tabla-casa]')).toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    expect((await otvori('greska')).querySelector('[data-tabla-casa]')).toBeNull();
  });

  it('sačuvana tabla: „Tabla sa ovog časa” sa sličicom, klik otvara tablu u novoj kartici', async () => {
    const el = await otvori([{ tip: 'LINIJA', boja: '#C62828', debljina: 6, tacke: [10, 10, 200, 100] }]);
    expect(el.querySelector('[data-tabla-casa] h2')?.textContent).toBe('Tabla sa ovog časa');
    const a = el.querySelector('[data-tabla-casa] a')!;
    expect(a.getAttribute('href')).toBe('/predavanja/5/tabla');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.querySelectorAll('app-slicica-crteza path')).toHaveLength(1);
  });

  it('kartica ponovo vidljiva: tabla se čita ponovo', async () => {
    await otvori([]);
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne('api/predavanja/5/tabla').flush({ elementi: [], verzija: 0 });
  });
});
