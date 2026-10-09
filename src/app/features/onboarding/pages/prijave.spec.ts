import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { putanjaSaId } from '../../../core/route-matchers';
import { OnboardingSesijaDetails, PrijavaInfo } from '../../../core/api/onboarding.api';
import { Prijave } from './prijave';

function prijava(id: number, izmene: Partial<PrijavaInfo> = {}): PrijavaInfo {
  return {
    id,
    ime: `Ime${id}`,
    prezime: `Prezime${id}`,
    indeks: `GD${id}`,
    godina: 2025,
    email: `s${id}@example.com`,
    brojTelefona: '064 111 222',
    datumRodjenja: null,
    opstina: null,
    status: 'NA_CEKANJU',
    podneto: '2025-10-14T10:00:00',
    obradjeno: null,
    studentId: null,
    napomena: null,
    ...izmene,
  };
}

function detalji(prijave: PrijavaInfo[], poruka: string | null = null): OnboardingSesijaDetails {
  return {
    sesija: {
      id: 9,
      token: 'a'.repeat(32),
      grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 },
      aktivna: true,
      otvorena: true,
      kreirano: '2025-10-14T09:00:00',
      istice: '2025-10-21T09:00:00',
      maxPrijava: 200,
      brojPrijava: prijave.length,
      brojNaCekanju: prijave.filter(p => p.status === 'NA_CEKANJU').length,
      napomena: null,
    },
    prijave,
    poruka,
  };
}

describe('Prijave', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ matcher: putanjaSaId('grupe/:id/onboarding/:sid'), component: Prijave }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(e => (e.innerHTML = ''));
    http.verify();
  });

  const el = () => harness.fixture.nativeElement as HTMLElement;
  // Zatvaranje dijaloga ima tajmer koji zoneless whenStable ne prati: zahtev se čeka dok ne stigne.
  const zahtev = (url: string) => vi.waitFor(() => http.expectOne(url));
  const redovi = () => [...el().querySelectorAll('tbody tr')];

  async function otvori(url: string, odgovor: OnboardingSesijaDetails) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/onboarding/9').flush(odgovor);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  it('"Odbij" otvara dijalog i šalje napomenu iz njega (umesto prompt-a)', { timeout: 15_000 }, async () => {
    await otvori('/grupe/4/onboarding/9', detalji([prijava(1), prijava(2)]));
    (redovi()[1].querySelector('[data-odbij]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();

    const polje = document.querySelector('app-odbij-dialog [data-napomena]') as HTMLTextAreaElement;
    expect(polje).not.toBeNull();
    polje.value = '  Nepotpuni podaci  ';
    polje.dispatchEvent(new Event('input'));
    (document.querySelector('app-odbij-dialog [data-odbij]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();

    const req = await zahtev('api/onboarding/9/prijave/2/odbij');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ napomena: 'Nepotpuni podaci' });
    req.flush(detalji([prijava(1), prijava(2, { status: 'ODBIJENA', napomena: 'Nepotpuni podaci' })]));
    harness.fixture.detectChanges();
    expect(redovi()[1].textContent).toContain('Odbijena');
    expect(redovi()[1].textContent).toContain('Nepotpuni podaci');
  });

  it('"Odustani" u dijalogu ne šalje ništa', { timeout: 15_000 }, async () => {
    await otvori('/grupe/4/onboarding/9', detalji([prijava(1)]));
    (redovi()[0].querySelector('[data-odbij]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    (document.querySelector('app-odbij-dialog [data-odustani]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    http.expectNone('api/onboarding/9/prijave/1/odbij');
  });

  it('"Prihvati sve na čekanju" traži potvrdu i prikazuje poruku servera', { timeout: 15_000 }, async () => {
    await otvori('/grupe/4/onboarding/9', detalji([prijava(1), prijava(2), prijava(3, { status: 'PRIHVACENA', studentId: 30 })]));
    const dugme = el().querySelector('[data-prihvati-sve]') as HTMLButtonElement;
    expect(dugme.textContent).toContain('Prihvati sve na čekanju (2)');
    dugme.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(document.querySelector('app-confirm-dialog')?.textContent).toContain('(2)');
    (document.querySelector('app-confirm-dialog [data-potvrdi]') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    (await zahtev('api/onboarding/9/prihvati-sve')).flush(detalji([prijava(1, { status: 'PRIHVACENA' }), prijava(2, { status: 'PRIHVACENA' }), prijava(3, { status: 'PRIHVACENA' })], 'Prihvaćeno: 2.'));
    harness.fixture.detectChanges();
    expect(el().querySelector('[data-poruka]')?.textContent).toContain('Prihvaćeno: 2');
  });

  it('filter po statusu iz URL-a; nepoznat status je "Sve", bez navigacije', { timeout: 15_000 }, async () => {
    await otvori('/grupe/4/onboarding/9?status=ODBIJENA', detalji([prijava(1), prijava(2, { status: 'ODBIJENA' })]));
    expect(redovi()).toHaveLength(1);

    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/grupe/4/onboarding/9?status=lozinka');
    harness.fixture.detectChanges();
    expect(redovi()).toHaveLength(2);
    expect(router.url).toBe('/grupe/4/onboarding/9?status=lozinka');
    expect(el().querySelector('[data-filter="SVE"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('sesija druge grupe se jednom preusmerava na svoju grupu', { timeout: 15_000 }, async () => {
    await otvori('/grupe/77/onboarding/9', detalji([prijava(1)]));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/grupe/4/onboarding/9');
    http.expectNone('api/onboarding/9');
  });
});
