import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PredavanjeDetails } from '../data-access/predavanja.models';
import { OSVEZAVANJE_MS, PredavanjeProjektor } from './predavanje-projektor';

const akt = (id: number, ime: string) => ({ id: 100 + id, student: { id, ime, prezime: 'Petrović', indeks: `GD${id}` }, tip: 'PRISUSTVO' as const, napomene: null });

const predavanje = (aktivnosti: PredavanjeDetails['aktivnosti']): PredavanjeDetails => ({
  id: 5,
  rb: 12,
  datum: '2025-10-14',
  tema: 'Petlje i uslovi',
  posecenost: aktivnosti.length,
  grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025 },
  predmet: { naziv: 'Uvod u primenu računara' },
  aktivnosti,
  zavrseno: false,
});

describe('PredavanjeProjektor', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('tema, "Predavanje N · Predmet · Grupa" i broj prisutnih bez imena; osvežava se na 10 s', async () => {
    const f = TestBed.createComponent(PredavanjeProjektor);
    f.componentRef.setInput('id', '5');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('api/predavanja/5').flush(predavanje([akt(1, 'Ana'), akt(2, 'Marko')]));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Petlje i uslovi');
    expect(el.textContent).toContain('Predavanje 12 · Uvod u primenu računara · GD-2025');
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('2');
    expect(el.textContent).not.toContain('Ana');
    expect(el.textContent).not.toContain('GD1');

    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_MS);
    http.expectOne('api/predavanja/5').flush(predavanje([akt(1, 'Ana'), akt(2, 'Marko'), akt(3, 'Iva')]));
    f.detectChanges();
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('3');

    // neuspelo osvežavanje ostavlja poslednji broj
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_MS);
    http.expectOne('api/predavanja/5').flush(null, { status: 0, statusText: 'Mreža' });
    f.detectChanges();
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('3');
    f.destroy();
  });
});
