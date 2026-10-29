import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Zvono } from '../data-access/obavestenja.models';
import { ZvonoNaloga } from './zvono-naloga.component';

const ZVONO = 'api/public/nalog/obavestenja';

@Component({ template: '' })
class Prazno {}

const SA_STAVKAMA: Zvono = {
  novo: true,
  stavke: [
    { id: 9, vrsta: 'OTKAZAN_CAS', naslov: 'Sutra nema časa', tekst: 'Osnove računarstva, 10:15–11:45', putanja: 'nalog/cas', kreirano: '2026-11-04T18:00:00' },
    { id: 8, vrsta: 'OCENE', naslov: 'Objavljeni su predlozi ocena', tekst: 'Osnove računarstva', putanja: 'nalog/predmet/3', kreirano: '2026-11-03T12:00:00' },
  ],
};

/** Zvono studenta (spec „Aplikacija i obaveštenja“ 6.8). */
describe('ZvonoNaloga', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', component: Prazno }])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function napravi() {
    const f = TestBed.createComponent(ZvonoNaloga);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('pre učitavanja (ili bez prijave) zvona nema; 401 ga ne prikazuje', async () => {
    const { f, el } = napravi();
    expect(el.querySelector('[data-zvono]')).toBeNull();
    http.expectOne(ZVONO).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    await f.whenStable();
    expect(el.querySelector('[data-zvono]')).toBeNull();
  });

  it('tačka dok ne otvori; otvaranje gasi tačku, šalje otvoreno i prikazuje stavke najnovije prve', async () => {
    const { f, el } = napravi();
    http.expectOne(ZVONO).flush(SA_STAVKAMA);
    await f.whenStable();
    const dugme = el.querySelector<HTMLButtonElement>('[data-zvono]')!;
    expect(dugme.getAttribute('aria-label')).toBe('Obaveštenja, ima novih');
    expect(el.querySelector('[data-tacka]')).not.toBeNull();

    dugme.click();
    await f.whenStable();
    const otvoreno = http.expectOne(`${ZVONO}/otvoreno`);
    expect(otvoreno.request.method).toBe('POST');
    otvoreno.flush(null);
    http.expectOne(ZVONO).flush({ ...SA_STAVKAMA, novo: false });
    await f.whenStable();
    expect(el.querySelector('[data-tacka]')).toBeNull();
    expect(dugme.getAttribute('aria-expanded')).toBe('true');
    const stavke = [...el.querySelectorAll('[data-zvono-spisak] .stavka-naslov')].map(x => x.textContent?.trim());
    expect(stavke).toEqual(['Sutra nema časa', 'Objavljeni su predlozi ocena']);
  });

  it('bez novog: otvaranje ne šalje otvoreno; klik na stavku vodi na njenu putanju i zatvara', async () => {
    const { f, el } = napravi();
    http.expectOne(ZVONO).flush({ ...SA_STAVKAMA, novo: false });
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('[data-zvono]')!.click();
    await f.whenStable();
    http.expectNone(`${ZVONO}/otvoreno`);
    http.expectOne(ZVONO).flush({ ...SA_STAVKAMA, novo: false });
    await f.whenStable();
    const router = TestBed.inject(Router);
    const idi = vi.spyOn(router, 'navigateByUrl');
    el.querySelector<HTMLButtonElement>('[data-vrsta="OCENE"]')!.click();
    await f.whenStable();
    expect(idi).toHaveBeenCalledWith('/nalog/predmet/3');
    expect(el.querySelector('[data-zvono-spisak]')).toBeNull();
  });

  it('prazno zvono kaže šta tu stiže; Escape zatvara', async () => {
    const { f, el } = napravi();
    http.expectOne(ZVONO).flush({ novo: false, stavke: [] });
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('[data-zvono]')!.click();
    await f.whenStable();
    http.expectOne(ZVONO).flush({ novo: false, stavke: [] });
    await f.whenStable();
    expect(el.querySelector('[data-zvono-spisak]')?.textContent).toContain('Još nema obaveštenja');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await f.whenStable();
    expect(el.querySelector('[data-zvono-spisak]')).toBeNull();
  });
});
