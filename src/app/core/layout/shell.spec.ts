import { MediaMatcher } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject, provideAppInitializer, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By, DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';
import { MatSidenav } from '@angular/material/sidenav';
import { provideRouter, ROUTES, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { ReferenceStore } from '../state/reference.store';
import { DashboardCountsStore } from '../state/dashboard-counts.store';
import { IKONE } from './icons';
import { Shell } from './shell';

/** MediaMatcher koji `min-width`/`max-width` upite računa za zadatu širinu prozora. */
function mediaZaSirinu(sirina: number): Pick<MediaMatcher, 'matchMedia'> {
  return {
    matchMedia: (upit: string) => {
      const min = /min-width:\s*(\d+)px/.exec(upit);
      const max = /max-width:\s*([\d.]+)px/.exec(upit);
      const matches = (!min || sirina >= Number(min[1])) && (!max || sirina <= Number(max[1]));
      return {
        matches,
        media: upit,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      } as MediaQueryList;
    },
  };
}

describe('Shell', () => {
  let brojaciNapravljeni: number;
  let ucitajReferentne: ReturnType<typeof vi.fn>;

  function podesi(sirina: number) {
    brojaciNapravljeni = 0;
    ucitajReferentne = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()), // kao app.config (data -> input, npr. NotFound.javna)
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MediaMatcher, useValue: mediaZaSirinu(sirina) },
        {
          provide: DashboardCountsStore,
          useFactory: () => {
            brojaciNapravljeni++;
            return { testovi: signal(2), domaci: signal(1), prijave: signal(4) };
          },
        },
        provideAppInitializer(() => {
          // Ikone bez HTTP-a (inače bi se pojavile kao zahtevi u proveri javne rute).
          const registry = inject(MatIconRegistry);
          const sanitizer = inject(DomSanitizer);
          for (const ime of IKONE) {
            registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
          }
        }),
        {
          provide: ReferenceStore,
          useValue: { ucitaj: ucitajReferentne, predmeti: signal([{ id: 1, naziv: 'Nacrtna geometrija' }]) },
        },
      ],
    });
  }

  describe('režim bočne navigacije', () => {
    it('na 1280 px je side (uvek otvorena), bez hamburgera', async () => {
      podesi(1280);
      const f = TestBed.createComponent(Shell);
      f.detectChanges();
      await f.whenStable();
      const nav = f.debugElement.query(By.directive(MatSidenav)).componentInstance as MatSidenav;
      expect(nav.mode).toBe('side');
      expect(nav.opened).toBe(true);
      expect(f.nativeElement.querySelector('[data-meni]')).toBeNull();
    });

    it('na 1280 px Esc ne zatvara navigaciju (u side režimu nema hamburgera kojim bi se vratila)', async () => {
      podesi(1280);
      const f = TestBed.createComponent(Shell);
      f.detectChanges();
      await f.whenStable();
      const nav = f.debugElement.query(By.directive(MatSidenav));
      nav.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      f.detectChanges();
      await f.whenStable();
      expect((nav.componentInstance as MatSidenav).opened).toBe(true);
    });

    it('na 800 px Esc zatvara otvoren drawer', async () => {
      podesi(800);
      const f = TestBed.createComponent(Shell);
      f.detectChanges();
      await f.whenStable();
      f.nativeElement.querySelector('[data-meni]').click();
      f.detectChanges();
      await f.whenStable();
      const nav = f.debugElement.query(By.directive(MatSidenav));
      expect((nav.componentInstance as MatSidenav).opened).toBe(true);
      nav.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      f.detectChanges();
      await f.whenStable();
      expect((nav.componentInstance as MatSidenav).opened).toBe(false);
    });

    it('na 800 px je over (zatvorena), hamburger je otvara', async () => {
      podesi(800);
      const f = TestBed.createComponent(Shell);
      f.detectChanges();
      await f.whenStable();
      const nav = f.debugElement.query(By.directive(MatSidenav)).componentInstance as MatSidenav;
      expect(nav.mode).toBe('over');
      expect(nav.opened).toBe(false);
      f.nativeElement.querySelector('[data-meni]').click();
      f.detectChanges();
      await f.whenStable();
      expect(nav.opened).toBe(true);
    });
  });

  it('nastavnička ruta: ljuska sa navigacijom, brojačima i predmetima', async () => {
    podesi(1280);
    const harness = await RouterTestingHarness.create('/grupe');
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-side-nav')).not.toBeNull();
    expect(brojaciNapravljeni).toBe(1);
    expect(ucitajReferentne).toHaveBeenCalled();
    expect(el.textContent).toContain('Nacrtna geometrija');
    expect(el.querySelector('a[href="/grupe"]')?.textContent).toContain('4');
    expect(el.querySelector('a[href="/testovi"]')?.textContent).toContain('2');
    expect(el.querySelector('a[href="/domaci"]')?.textContent).toContain('1');
    expect(el.querySelector('.skip-link')?.textContent).toContain('Preskoči na sadržaj');
  });

  it('javna ruta /upis/x: bez ljuske, bez brojača, bez referentnih podataka; samo env.json i api/public/upis', async () => {
    podesi(1280);
    const harness = await RouterTestingHarness.create('/upis/x');
    await harness.fixture.whenStable();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-side-nav')).toBeNull();
    expect(el.querySelector('app-shell')).toBeNull();
    expect(brojaciNapravljeni).toBe(0);
    expect(ucitajReferentne).not.toHaveBeenCalled();

    const zahtevi = TestBed.inject(HttpTestingController).match(() => true).map(r => r.request.url);
    expect(zahtevi.length).toBeGreaterThan(0);
    for (const url of zahtevi) {
      expect(url === 'assets/env.json' || url.startsWith('api/public/upis/')).toBe(true);
    }
  });

  it('404 u ljusci nudi povratak na početnu, a javni 404 pod /upis ne', async () => {
    podesi(1280);
    const harness = await RouterTestingHarness.create('/nepostoji');
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-not-found')?.textContent).toContain('Stranica nije pronađena');
    expect(el.querySelector('app-not-found .na-pocetnu')).not.toBeNull();
    await harness.navigateByUrl('/upis/a/b');
    expect(el.querySelector('app-not-found')).not.toBeNull();
    expect(el.querySelector('app-not-found .na-pocetnu')).toBeNull();
  });

  it('stari ekran (bez signala) u outletu ljuske se osvežava posle asinhrone promene', async () => {
    podesi(1280);
    TestBed.overrideProvider(ROUTES, { useValue: [{ path: '', component: Shell, children: [{ path: '', component: StariEkran }] }], multi: true });
    const harness = await RouterTestingHarness.create('/');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.fixture.nativeElement.textContent).toContain('učitano');
    });
  });
});

// Kao stari ekrani: podrazumevana detekcija promena, polje se menja u callback-u bez markForCheck.
@Component({
  selector: 'app-stari-ekran',
  template: '{{ tekst }}',
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Eager,
})
class StariEkran {
  tekst = 'čeka';
  constructor() {
    setTimeout(() => (this.tekst = 'učitano'), 80);
  }
}
