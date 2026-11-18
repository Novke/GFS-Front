import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { OznakaPonasanja } from '../data-access/oznake-ponasanja.api';
import { StudentPonasanjeComponent } from './student-ponasanje.component';

const oznaka = (id: number, izmene: Partial<OznakaPonasanja> = {}): OznakaPonasanja => ({
  id, vrsta: 'SAKRIVEN_ODGOVOR', tekst: 'ružna reč', kreirano: '2026-11-18T10:15:00', predmet: { id: 1, naziv: 'Statika' },
  predavanjeId: 3, izvodjenjeId: 7, prezentacija: 'Vežbe 4', ...izmene,
});

describe('StudentPonasanjeComponent', () => {
  let http: HttpTestingController;
  let f: ComponentFixture<StudentPonasanjeComponent>;
  const el = () => f.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(StudentPonasanjeComponent);
    f.componentRef.setInput('studentId', 5);
    await f.whenStable();
  });
  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach(e => (e.innerHTML = ''));
  });

  it('bez oznaka nema sekcije', async () => {
    http.expectOne('api/studenti/5/oznake-ponasanja').flush([]);
    await f.whenStable();
    expect(el().querySelector('[data-ponasanje]')).toBeNull();
  });

  it('lista: vrsta, predmet i prezentacija, sakriveni tekst', async () => {
    http.expectOne('api/studenti/5/oznake-ponasanja').flush([oznaka(2), oznaka(1, { vrsta: 'IZBACEN_PREDAVANJE', tekst: null, predmet: null })]);
    await f.whenStable();
    const redovi = Array.from(el().querySelectorAll('li')).map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(el().querySelector('h2')!.textContent).toBe('Ponašanje na času');
    expect(redovi[0]).toContain('Sakriven odgovor');
    expect(redovi[0]).toContain('Statika · Vežbe 4');
    expect(redovi[0]).toContain('ružna reč');
    expect(redovi[1]).toContain('Izbačen do kraja predavanja');
    expect(redovi[1]).toContain('Vežbe 4');
  });

  it('brisanje uz potvrdu (tekst o zabrani), pa red nestaje; Odustani ne briše', async () => {
    http.expectOne('api/studenti/5/oznake-ponasanja').flush([oznaka(1, { vrsta: 'IZBACEN_PREDAVANJE', tekst: null })]);
    await f.whenStable();
    el().querySelector<HTMLButtonElement>('[data-obrisi]')!.click();
    await f.whenStable();
    expect(document.querySelector('app-confirm-dialog')!.textContent).toContain('skida i zabranu ulaska');
    document.querySelector<HTMLButtonElement>('app-confirm-dialog [data-odustani]')!.click();
    await f.whenStable();
    http.expectNone('api/oznake-ponasanja/1');
    el().querySelector<HTMLButtonElement>('[data-obrisi]')!.click();
    await f.whenStable();
    document.querySelector<HTMLButtonElement>('app-confirm-dialog [data-potvrdi]')!.click();
    await f.whenStable();
    const d = http.expectOne('api/oznake-ponasanja/1');
    expect(d.request.method).toBe('DELETE');
    d.flush(null, { status: 204, statusText: 'No Content' });
    await f.whenStable();
    expect(el().querySelector('[data-ponasanje]')).toBeNull();
  });

  it('greška učitavanja: poruka i "Pokušaj ponovo"', async () => {
    http.expectOne('api/studenti/5/oznake-ponasanja').flush({ reason: 'Nema veze.' }, { status: 400, statusText: 'Bad Request' });
    await f.whenStable();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Nema veze.');
    el().querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    http.expectOne('api/studenti/5/oznake-ponasanja').flush([]);
    await f.whenStable();
    expect(el().querySelector('[data-ponasanje]')).toBeNull();
  });
});
