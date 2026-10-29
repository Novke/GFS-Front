import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PodesavanjaObavestenja } from './podesavanja-obavestenja.component';

const PODESAVANJA = 'api/public/nalog/podesavanja';
const SVE = {
  mejlOtkazanCas: true, pushPodsetnik: true, pushOtkazanCas: true, pushOcene: true, pushPosleCasa: true, zvonoOcene: true,
  zvonoPosleCasa: true,
};

/** Kartica „Obaveštenja“ na tabu Ja (spec „Aplikacija i obaveštenja“ 6.5 i 6.8). jsdom nema push, pa je uređaj „nepodržan“. */
describe('PodesavanjaObavestenja', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function napravi(podesavanja: object) {
    const f = TestBed.createComponent(PodesavanjaObavestenja);
    f.detectChanges();
    http.expectOne(PODESAVANJA).flush(podesavanja);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('prekidači po vrsti: telefon i zvono; otkazan čas je u zvonu uvek, podsetnik nikad; promena šalje ceo objekat', async () => {
    const { f, el } = await napravi(SVE);
    const vrste = [...el.querySelectorAll('.vrsta')];
    expect(vrste.map(v => v.querySelector('.naziv')?.textContent?.trim())).toEqual([
      'Podsetnik dan pre časa', 'Čas otkazan / ipak se održava', 'Ocene objavljene', 'Posle časa: prezentacija i vežbanje',
    ]);
    expect(vrste[0].textContent).not.toContain('Zvono');
    expect(vrste[1].textContent).toContain('Zvono: uvek');
    expect(el.querySelector('[data-push]')?.getAttribute('data-stanje')).toBe('nepodrzano');

    el.querySelector<HTMLInputElement>('[data-prekidac="zvonoOcene"]')!.click();
    await f.whenStable();
    const put = http.expectOne(r => r.url === PODESAVANJA && r.method === 'PUT');
    expect(put.request.body).toEqual({ ...SVE, zvonoOcene: false });
    put.flush({ ...SVE, zvonoOcene: false });
    await f.whenStable();
    expect(el.querySelector('[data-sacuvano]')).not.toBeNull();
  });

  it('greška vraća prethodno stanje i prikazuje poruku servera', async () => {
    const { f, el } = await napravi(SVE);
    el.querySelector<HTMLInputElement>('[data-prekidac="pushPodsetnik"]')!.click();
    await f.whenStable();
    http.expectOne(r => r.method === 'PUT').flush({ reason: 'Neispravan zahtev.' }, { status: 400, statusText: 'Bad Request' });
    await f.whenStable();
    expect(el.querySelector<HTMLInputElement>('[data-prekidac="pushPodsetnik"]')!.checked).toBe(true);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Neispravan zahtev.');
  });

  it('stariji backend (samo mejl): bez prekidača po vrsti, PUT nosi samo mejl', async () => {
    const { f, el } = await napravi({ mejlOtkazanCas: true });
    expect(el.querySelector('.vrste')).toBeNull();
    el.querySelector<HTMLInputElement>('[data-mejl-otkazan]')!.click();
    await f.whenStable();
    const put = http.expectOne(r => r.method === 'PUT');
    expect(put.request.body).toEqual({ mejlOtkazanCas: false });
    put.flush({ mejlOtkazanCas: false });
  });
});
