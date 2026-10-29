import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentJa } from '../data-access/nalog.models';
import { PocetnaPage } from './pocetna.page';

const JA = 'api/public/nalog/ja';
const CASOVI = 'api/public/nalog/casovi';
const WA = 'https://chat.whatsapp.com/AbCdEf1234567890';

function ja(izmene: Partial<StudentJa> = {}): StudentJa {
  return {
    indeks: 'GD5', ime: 'Ana', prezime: 'Anić', maskaMejla: 'a***@x.rs', uredjaji: [], moodlePovezan: false, godina: 2026,
    grupa: 'GD-2026', generacija: 2026, waLink: null, ...izmene,
  };
}

/** Tab Početna: pozdrav, WhatsApp grupa (samo kanonski link), "Naredni časovi" i mesto za instalaciju; 401 vodi na prijavu. */
describe('PocetnaPage', () => {
  let fixture: ComponentFixture<PocetnaPage>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const tekst = () => el().textContent?.replace(/\s+/g, ' ').trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(CASOVI).filter(r => !r.cancelled).forEach(r => r.flush({ termini: [] }));
    fixture?.destroy();
    http.verify();
  });

  async function otvori(odgovor: StudentJa): Promise<void> {
    fixture = TestBed.createComponent(PocetnaPage);
    fixture.detectChanges();
    http.expectOne(JA).flush(odgovor);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('pozdrav po imenu, grupa i generacija; bez linka grupe nema WhatsApp dugmeta', async () => {
    await otvori(ja());
    expect(el().querySelector('h1')?.textContent).toContain('Studentski portal');
    expect(el().querySelector('h2')?.textContent).toContain('Zdravo, Ana!');
    expect(tekst()).toContain('Dobro došli na studentski portal');
    expect(tekst()).toContain('Grupa GD-2026 · generacija 2026');
    expect(el().querySelector('[data-wa-grupa]')).toBeNull();
    expect(el().querySelector('[data-instalacija-mesto]')).not.toBeNull();
  });

  it('WhatsApp grupa: link grupe u novoj kartici, bez opener-a', async () => {
    await otvori(ja({ waLink: WA }));
    const a = el().querySelector<HTMLAnchorElement>('a[data-wa-grupa]')!;
    expect(a.getAttribute('href')).toBe(WA);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.textContent).toContain('WhatsApp grupa');
    expect(a.textContent).toContain('grupe GD-2026');
  });

  it.each(['javascript:alert(1)', 'https://evil.example/AbCdEf1234567890', 'http://chat.whatsapp.com/AbCdEf1234567890'])(
    'link koji nije kanonski (%s) se ne prikazuje', async link => {
      await otvori(ja({ waLink: link }));
      expect(el().querySelector('[data-wa-grupa]')).toBeNull();
    });

  it('stari backend (bez grupe, generacije i linka): samo pozdrav', async () => {
    await otvori({ indeks: 'GD5', ime: 'Ana', prezime: 'Anić', maskaMejla: null, uredjaji: [], moodlePovezan: false });
    expect(tekst()).toContain('Zdravo, Ana!');
    expect(tekst()).not.toContain('Grupa');
    expect(el().querySelector('[data-wa-grupa]')).toBeNull();
  });

  it('"Naredni časovi" su ovde (sami čitaju raspored)', async () => {
    await otvori(ja());
    http.expectOne(CASOVI).flush({ termini: [{
      stavkaId: 7, datum: '2026-11-04', pocetak: '10:00:00', kraj: '13:00:00', predmet: 'Geodezija 1', grupa: 'GD-2026',
      svojaGrupa: true, otkazan: false, napomena: null, najavljeno: false, razlog: null,
    }] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-naredni-casovi]')).not.toBeNull();
    expect(tekst()).toContain('Geodezija 1');
  });

  it('401: prijava sa povratkom', async () => {
    const navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(PocetnaPage);
    fixture.detectChanges();
    http.expectOne(JA).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'x' });
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog');
  });

  it('greška servera: poruka i "Pokušaj ponovo" učitava ponovo', async () => {
    fixture = TestBed.createComponent(PocetnaPage);
    fixture.detectChanges();
    http.expectOne(JA).flush({ reason: 'Sistemska greška.' }, { status: 500, statusText: 'x' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('button')!.click();
    http.expectOne(JA).flush(ja());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tekst()).toContain('Zdravo, Ana!');
  });
});
