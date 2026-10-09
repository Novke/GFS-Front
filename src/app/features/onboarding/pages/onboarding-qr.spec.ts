import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { putanjaSaId } from '../../../core/route-matchers';
import { upisLink } from '../../../core/api/onboarding.api';
import { OnboardingQr, sirinaQr } from './onboarding-qr';

const TOKEN = 'Ab3_-xYz'.repeat(4);

describe('upisLink', () => {
  it('je new URL("upis/" + token, document.baseURI).href', () => {
    expect(upisLink(TOKEN)).toBe(new URL('upis/' + TOKEN, document.baseURI).href);
  });

  it('radi pod base href "/" i "/gfs/"', () => {
    expect(upisLink(TOKEN, 'https://gfs.dev.trif.rs/')).toBe(`https://gfs.dev.trif.rs/upis/${TOKEN}`);
    expect(upisLink(TOKEN, 'http://novica-dev/gfs/')).toBe(`http://novica-dev/gfs/upis/${TOKEN}`);
    expect(upisLink(TOKEN, 'http://novica-dev/gfs/grupe/4/onboarding/9/qr')).toBe(`http://novica-dev/gfs/grupe/4/onboarding/9/upis/${TOKEN}`);
  });
});

describe('sirinaQr', () => {
  it('najmanje 320 px, najviše 640 px', () => {
    expect(sirinaQr(360)).toBe(320);
    expect(sirinaQr(600)).toBe(552);
    expect(sirinaQr(1920)).toBe(640);
  });
});

describe('OnboardingQr', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ matcher: putanjaSaId('grupe/:id/onboarding/:sid/qr'), component: OnboardingQr }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prikazuje naziv grupe, link u <code> (document.baseURI) i rok; zatvorena sesija ima upozorenje', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grupe/4/onboarding/9/qr');
    http.expectOne('api/onboarding/9').flush({
      sesija: {
        id: 9,
        token: TOKEN,
        grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 },
        aktivna: false,
        otvorena: false,
        kreirano: '2025-10-14T09:00:00',
        istice: '2025-10-21T09:05:00',
        maxPrijava: 200,
        brojPrijava: 0,
        brojNaCekanju: 0,
        napomena: null,
      },
      prijave: [],
      poruka: null,
    });
    harness.fixture.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('GD-2025');
    expect(el.querySelector('code')?.textContent?.trim()).toBe(new URL('upis/' + TOKEN, document.baseURI).href);
    expect(el.querySelector('[data-kopiraj]')?.textContent).toContain('Kopiraj');
    expect(el.textContent).toContain('21. 10. 2025. 09:05');
    expect(el.querySelector('[data-zatvorena]')).not.toBeNull();
  });

  it('nepostojeća sesija: poruka, bez QR-a', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grupe/4/onboarding/9/qr');
    http.expectOne('api/onboarding/9').flush({ reason: 'x' }, { status: 404, statusText: 'Not Found' });
    harness.fixture.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sesija ne postoji.');
    expect(el.querySelector('code')).toBeNull();
  });
});
