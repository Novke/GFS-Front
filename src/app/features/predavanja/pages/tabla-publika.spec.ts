import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementCrteza } from '../../uzivo/crtanje/crtanje.models';
import { LazniKanal } from '../../uzivo/crtanje/kanal.testing';
import { PROVERA_TABLE_MS, TablaPublika } from './tabla-publika';

const linija: ElementCrteza = { tip: 'LINIJA', boja: '#C62828', debljina: 6, tacke: [10, 10, 200, 100] };
const krug: ElementCrteza = { tip: 'KRUG', boja: '#2456A6', debljina: 6, tacke: [300, 200, 400, 300] };

describe('TablaPublika', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    LazniKanal.otvoreni = [];
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { parent: { paramMap: of(convertToParamMap({ id: '5' })) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const putanje = (f: { nativeElement: unknown }) =>
    (f.nativeElement as HTMLElement).querySelectorAll('svg[viewBox="0 0 960 540"] path').length;
  const tabla = (posle: string) => http.expectOne(r => r.url === 'api/predavanja/5/tabla' && r.params.get('posle') === posle);

  async function otvori() {
    const f = TestBed.createComponent(TablaPublika);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    return f;
  }

  it('bez pulsa: server odmah (`posle=0`), pa na 3 s sa poznatom verzijom; 204 ne menja crtež', async () => {
    const f = await otvori();
    tabla('0').flush({ elementi: [linija], verzija: 3 });
    f.detectChanges();
    expect(putanje(f)).toBe(1);

    await vi.advanceTimersByTimeAsync(PROVERA_TABLE_MS);
    tabla('3').flush(null, { status: 204, statusText: 'No Content' });
    f.detectChanges();
    expect(putanje(f)).toBe(1);

    await vi.advanceTimersByTimeAsync(PROVERA_TABLE_MS);
    tabla('3').flush({ elementi: [linija, krug], verzija: 4 });
    f.detectChanges();
    expect(putanje(f)).toBe(2);
  });

  it('dok stiže puls table iz istog pregledača: crtež iz kanala, server se ne pita', async () => {
    const f = await otvori();
    tabla('0').flush(null, { status: 204, statusText: 'No Content' });
    const tablaKanal = new LazniKanal('gfs-tabla-5');
    tablaKanal.postMessage({ tip: 'puls' });
    tablaKanal.postMessage({ tip: 'strana', kljuc: 'BELA:-', elementi: [krug], verzija: 1 });
    f.detectChanges();
    expect(putanje(f)).toBe(1);

    await vi.advanceTimersByTimeAsync(PROVERA_TABLE_MS);
    tablaKanal.postMessage({ tip: 'puls' });
    http.expectNone(r => r.url === 'api/predavanja/5/tabla');
    tablaKanal.close();
  });

  it('povratak iz sna (stranica ponovo vidljiva) pita server odmah', async () => {
    await otvori();
    tabla('0').flush({ elementi: [], verzija: 0 });
    document.dispatchEvent(new Event('visibilitychange'));
    tabla('0').flush(null, { status: 204, statusText: 'No Content' });
  });
});
