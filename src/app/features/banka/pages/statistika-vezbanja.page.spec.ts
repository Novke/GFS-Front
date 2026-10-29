import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceApi } from '../../../core/api/reference.api';
import { BANKA_RUTE } from '../banka.routes';
import { BankaApi } from '../data-access/banka.api';
import { StatistikaTipa } from '../data-access/banka.models';
import { parseDan, procenat } from './statistika-vezbanja.page';

@Component({ template: 'druga' })
class Druga {}

const REDOVI: StatistikaTipa[] = [
  { tipId: 4, naziv: '8 → 2', putanja: ['Konverzije brojeva'], studenata: 12, pokusaja: 40, provereno: 30, prvaTacno: 21, resenjeBezTacne: 3 },
  { tipId: 9, naziv: 'Sabiranje', putanja: [], studenata: 1, pokusaja: 1, provereno: 0, prvaTacno: 0, resenjeBezTacne: 1 },
];

describe('parseDan i procenat', () => {
  it('samo postojeći ISO dan', () => {
    expect(parseDan('2026-10-01')).toBe('2026-10-01');
    expect(parseDan('2026-02-30')).toBeNull();
    expect(parseDan('1.10.2026')).toBeNull();
    expect(parseDan(undefined)).toBeNull();
  });

  it('ceo procenat, crta za nulu', () => {
    expect(procenat(21, 30)).toBe('70 %');
    expect(procenat(0, 0)).toBe('—');
  });
});

describe('StatistikaVezbanjaPage', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const api = { statistikaVezbanja: vi.fn() };
  const referenca = {
    predmeti: vi.fn(() => of([{ id: 3, naziv: 'Uvod u računarstvo' }, { id: 1, naziv: 'Analiza' }])),
    grupe: vi.fn(() => of([{ id: 2, naziv: 'G1', godinaUpisa: 2025, brojStudenata: 20 }, { id: 5, naziv: 'G2', godinaUpisa: 2024, brojStudenata: 18 }])),
    tipoviTesta: vi.fn(() => of([])),
  };
  const el = () => harness.routeNativeElement as HTMLElement;

  async function stabilno(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await harness.fixture.whenStable();
      await new Promise(r => setTimeout(r));
    }
  }
  async function otvori(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await stabilno();
    return el();
  }

  beforeEach(async () => {
    api.statistikaVezbanja.mockReset();
    api.statistikaVezbanja.mockImplementation(() => of(REDOVI));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'banka', children: BANKA_RUTE }, { path: '**', component: Druga }], withComponentInputBinding()),
        { provide: BankaApi, useValue: api },
        { provide: ReferenceApi, useValue: referenca },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  it('bez ?predmet bira prvi predmet po nazivu (replaceUrl) i čita statistiku', async () => {
    await otvori('/banka/vezbanje');
    expect(router.url).toBe('/banka/vezbanje?predmet=1');
    expect(api.statistikaVezbanja).toHaveBeenCalledWith(1, { predmet: 1, grupa: null, od: null, do: null }, { tiho: true });
  });

  it('filteri iz URL-a idu u zahtev; neispravni se ne šalju', async () => {
    await otvori('/banka/vezbanje?predmet=3&grupa=2&od=2026-10-01&do=2026-13-01');
    expect(api.statistikaVezbanja).toHaveBeenLastCalledWith(3, { predmet: 3, grupa: 2, od: '2026-10-01', do: null }, { tiho: true });
  });

  it('tabela: putanja i naziv tipa sa vezom na banku, brojevi i procenat tačnih iz prve; samo zbirno', async () => {
    const e = await otvori('/banka/vezbanje?predmet=3');
    const redovi = [...e.querySelectorAll<HTMLElement>('tbody tr')];
    expect(redovi.map(r => r.dataset['tip'])).toEqual(['4', '9']);
    const celije = [...redovi[0].querySelectorAll('td')].map(t => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(celije).toEqual(['12', '40', '30', '21 (70 %)', '3']);
    expect(redovi[0].querySelector('th')!.textContent).toContain('Konverzije brojeva');
    expect(redovi[0].querySelector('a')!.getAttribute('href')).toBe('/banka/grupe/4');
    expect(redovi[1].querySelectorAll('td')[3].textContent).toContain('—');
    expect(e.querySelector('caption')!.textContent).toContain('Samo zbirno');
  });

  it('prazno: poruka da još niko nije vežbao', async () => {
    api.statistikaVezbanja.mockImplementation(() => of([]));
    const e = await otvori('/banka/vezbanje?predmet=3');
    expect(e.querySelector('[data-prazno]')).not.toBeNull();
    expect(e.querySelector('table')).toBeNull();
  });

  it('greška: panel sa porukom servera; "Pokušaj ponovo" čita iznova', async () => {
    api.statistikaVezbanja.mockImplementationOnce(() =>
      throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Predmet ne postoji.' } })));
    const e = await otvori('/banka/vezbanje?predmet=3');
    expect(e.textContent).toContain('Statistika nije učitana.');
    expect(e.textContent).toContain('Predmet ne postoji.');
    e.querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    await stabilno();
    expect(el().querySelector('table')).not.toBeNull();
  });
});
