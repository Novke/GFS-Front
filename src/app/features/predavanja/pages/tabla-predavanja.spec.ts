import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PredavanjeDetails } from '../../../core/api/predavanja.models';
import { ElementCrteza } from '../../uzivo/crtanje/crtanje.models';
import { LazniKanal, prisluskuj } from '../../uzivo/crtanje/kanal.testing';
import { PovrsinaCrtanjaComponent } from '../../uzivo/crtanje/povrsina-crtanja.component';
import { TablaPredavanja } from './tabla-predavanja';

const predavanje: PredavanjeDetails = {
  id: 5, rb: 12, datum: '2026-11-24', tema: null, posecenost: 0, grupa: null,
  predmet: { id: 1, naziv: 'Uvod u računarstvo' }, aktivnosti: [], zavrseno: false,
};
const linija: ElementCrteza = { tip: 'LINIJA', boja: '#C62828', debljina: 6, tacke: [10, 10, 200, 100] };

describe('TablaPredavanja', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    LazniKanal.otvoreni = [];
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const taster = (key: string, mod: KeyboardEventInit = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod }));

  /** Tabla predavanja `id`; odgovara na učitavanje predavanja i table (osim kad `tabla` nije data). */
  async function otvori(id = '5', tabla: { elementi: ElementCrteza[]; verzija: number } | null = { elementi: [], verzija: 0 }) {
    const f = TestBed.createComponent(TablaPredavanja);
    f.componentRef.setInput('id', id);
    f.detectChanges();
    await f.whenStable();
    if (id === '5') {
      http.expectOne('api/predavanja/5').flush(predavanje);
      if (tabla) http.expectOne(r => r.url === 'api/predavanja/5/tabla' && r.method === 'GET').flush(tabla);
    }
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('zaglavlje „Tabla · predmet, predavanje datum”; odmah bela strana sa alatima i aktivnom površinom', async () => {
    const f = await otvori('5', { elementi: [linija], verzija: 2 });
    expect(el(f).querySelector('[data-naslov-table]')?.textContent?.trim()).toBe('Tabla · Uvod u računarstvo, predavanje 24. 11. 2026.');
    expect(el(f).querySelector('app-alati-crtanja')).not.toBeNull();
    expect(el(f).querySelector('app-povrsina-crtanja')?.classList).not.toContain('crt-povrsina--neaktivna');
    expect(el(f).querySelectorAll('[data-tabla] svg[viewBox="0 0 960 540"] path')).toHaveLength(1);
    expect(el(f).textContent).not.toContain('Učitavanje table');
  });

  it('dok tabla nije učitana površina ne crta', async () => {
    const f = await otvori('5', null);
    expect(el(f).textContent).toContain('Učitavanje table…');
    expect(el(f).querySelector('app-povrsina-crtanja')?.classList).toContain('crt-povrsina--neaktivna');
    http.expectOne(r => r.url === 'api/predavanja/5/tabla').flush({ elementi: [], verzija: 0 });
  });

  it('gotov potez: PUT cele table i strana na kanalu `gfs-tabla-5`; Ctrl+Z vraća praznu', async () => {
    const kanal = prisluskuj('gfs-tabla-5');
    const f = await otvori();
    f.debugElement.query(By.directive(PovrsinaCrtanjaComponent)).componentInstance.gotov.emit(linija);
    f.detectChanges();
    const put = http.expectOne(r => r.url === 'api/predavanja/5/tabla' && r.method === 'PUT');
    expect(put.request.body).toEqual({ elementi: [linija] });
    put.flush({ verzija: 1 });
    expect(kanal).toContainEqual(expect.objectContaining({ tip: 'strana', kljuc: 'BELA:-', elementi: [linija] }));

    taster('z', { ctrlKey: true });
    const drugi = http.expectOne(r => r.url === 'api/predavanja/5/tabla' && r.method === 'PUT');
    expect(drugi.request.body).toEqual({ elementi: [] });
    drugi.flush({ verzija: 2 });
  });

  it('1-7 bira alat, F ceo ekran, P otvara publiku u prozoru `gfs-tabla`', async () => {
    const f = await otvori();
    taster('3');
    f.detectChanges();
    expect(el(f).querySelector('app-alati-crtanja [aria-pressed="true"]')?.getAttribute('aria-label')).toBe('Isprekidana linija');

    const ceo = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = ceo;
    taster('f');
    expect(ceo).toHaveBeenCalled();

    const prozor = { location: { href: 'about:blank' }, focus: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(prozor as unknown as Window);
    taster('p');
    expect(open).toHaveBeenCalledWith('', 'gfs-tabla', 'popup');
    expect(prozor.location.href).toMatch(/\/predavanja\/5\/tabla\/publika$/);
  });

  it('bez predavanja zaglavlje ostaje „Tabla”, a crta se i dalje', async () => {
    const f = TestBed.createComponent(TablaPredavanja);
    f.componentRef.setInput('id', '5');
    f.detectChanges();
    await f.whenStable();
    http.expectOne('api/predavanja/5').flush({ reason: 'Nema.' }, { status: 500, statusText: 'Greška' });
    http.expectOne(r => r.url === 'api/predavanja/5/tabla').flush({ elementi: [], verzija: 0 });
    f.detectChanges();
    expect(el(f).querySelector('[data-naslov-table]')?.textContent?.trim()).toBe('Tabla');
    expect(el(f).querySelector('app-raspored-crtanja')).not.toBeNull();
  });

  it('id koji nije broj: poruka, bez zahteva', async () => {
    const f = await otvori('abc');
    expect(el(f).textContent).toContain('Predavanje ne postoji.');
    expect(el(f).querySelector('app-raspored-crtanja')).toBeNull();
  });
});
