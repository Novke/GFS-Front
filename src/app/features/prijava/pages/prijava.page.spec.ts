import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SesijaStore } from '../../../core/auth/sesija.store';
import { PrijavaPage } from './prijava.page';

describe('PrijavaPage (/prijava)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PrijavaPage>;
  let idi: ReturnType<typeof vi.fn>;

  const html = () => fixture.nativeElement as HTMLElement;
  const tekst = () => html().textContent?.replace(/\s+/g, ' ') ?? '';
  const polje = (ime: string) => html().querySelector<HTMLInputElement>(`input[formControlName="${ime}"]`)!;
  const baner = () => html().querySelector('app-form-error-banner [role="alert"]')?.textContent?.trim() ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    idi = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => http.verify());

  async function otvori(nazad?: string): Promise<void> {
    fixture = TestBed.createComponent(PrijavaPage);
    if (nazad !== undefined) {
      fixture.componentRef.setInput('nazad', nazad);
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function unesi(ime: string, vrednost: string): Promise<void> {
    const el = polje(ime);
    el.value = vrednost;
    el.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function prijaviSe(korisnik = 'nastavnik', lozinka = 'lozinka'): Promise<void> {
    await unesi('korisnik', korisnik);
    await unesi('lozinka', lozinka);
    html().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Posle odgovora: obećanja store-a i stranice (prijavi -> navigateByUrl ili baner) se izvrše, pa nov prikaz. */
  async function smiri(): Promise<void> {
    await new Promise(r => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function odgovori(telo: object | string | null, status: number, statusText = 'x'): Promise<void> {
    http.expectOne('api/auth/prijava').flush(telo, { status, statusText });
    await smiri();
  }

  it('ne zove nijedan API dok se ne pošalje forma', async () => {
    await otvori('studenti');
    http.expectNone(() => true);
  });

  it('polja imaju autocomplete za menadžer lozinki, lozinka je type=password, dugme "Prijavi se"', async () => {
    await otvori();
    expect(polje('korisnik').getAttribute('autocomplete')).toBe('username');
    expect(polje('lozinka').getAttribute('autocomplete')).toBe('current-password');
    expect(polje('lozinka').type).toBe('password');
    expect(html().querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Prijavi se');
    expect(html().querySelector('h1')?.textContent).toContain('Prijava');
  });

  it('prazna polja: bez zahteva, poruke uz polja', async () => {
    await otvori();
    html().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone('api/auth/prijava');
    expect(tekst()).toContain('Unesi korisničko ime.');
    expect(tekst()).toContain('Unesi lozinku.');
  });

  it('uspeh vodi na nazad', async () => {
    await otvori('studenti?q=ana');
    await prijaviSe();
    const req = http.expectOne('api/auth/prijava');
    expect(req.request.body).toEqual({ korisnik: 'nastavnik', lozinka: 'lozinka' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await smiri();
    expect(idi).toHaveBeenCalledExactlyOnceWith('studenti?q=ana');
    expect(TestBed.inject(SesijaStore).status()).toBe('prijavljen');
  });

  it.each(['//evil.com', 'https://x', 'javascript:alert(1)', '../x'])('nazad=%s se ignoriše: uspeh vodi na početnu', async nazad => {
    await otvori(nazad);
    await prijaviSe();
    await odgovori(null, 204);
    expect(idi).toHaveBeenCalledExactlyOnceWith('');
  });

  it('bez nazad: uspeh vodi na početnu', async () => {
    await otvori();
    await prijaviSe();
    await odgovori(null, 204);
    expect(idi).toHaveBeenCalledExactlyOnceWith('');
  });

  it('401 prikazuje tekst iz backenda u baneru forme i briše lozinku', async () => {
    await otvori('studenti');
    await prijaviSe('nastavnik', 'pogresno');
    await odgovori({ reason: 'Pogrešno korisničko ime ili lozinka.' }, 401);
    expect(baner()).toBe('Pogrešno korisničko ime ili lozinka.');
    expect(polje('lozinka').value).toBe('');
    expect(polje('korisnik').value).toBe('nastavnik');
    expect(tekst()).not.toContain('Unesi lozinku.'); // baner već kaže šta je pogrešno
    expect(idi).not.toHaveBeenCalled();
  });

  it('429 i 503 prikazuju tekst iz backenda', async () => {
    await otvori();
    await prijaviSe();
    await odgovori({ reason: 'Previše pokušaja. Pokušaj ponovo za 15 minuta.' }, 429);
    expect(baner()).toBe('Previše pokušaja. Pokušaj ponovo za 15 minuta.');

    await prijaviSe();
    await odgovori({ reason: 'Prijava nastavnika nije podešena.' }, 503);
    expect(baner()).toBe('Prijava nastavnika nije podešena.');
  });

  it('bez veze sa serverom i 5xx bez razloga: opšte poruke', async () => {
    await otvori();
    await prijaviSe();
    http.expectOne('api/auth/prijava').error(new ProgressEvent('error'));
    await smiri();
    expect(baner()).toBe('Nema veze sa serverom.');

    await prijaviSe();
    await odgovori('<html>Bad Gateway</html>', 502);
    expect(baner()).toBe('Sistemska greška. Pokušaj ponovo.');
  });

  it('dok zahtev traje dugme je onemogućeno (nema dvostrukog slanja)', async () => {
    await otvori();
    await prijaviSe();
    const dugme = html().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(dugme.disabled).toBe(true);
    dugme.click();
    await fixture.whenStable();
    http.expectOne('api/auth/prijava').flush(null, { status: 204, statusText: 'No Content' });
    await smiri();
    expect(idi).toHaveBeenCalledOnce();
  });
});
