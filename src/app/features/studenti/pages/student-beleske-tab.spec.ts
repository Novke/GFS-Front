import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BeleskaInfo } from '../../../core/api/studenti.api';
import { IKONE } from '../../../core/layout/icons';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { STUDENTI_RUTE } from '../studenti.routes';
import { vremeBeleske } from './student-beleske-tab';

const beleska = (id: number, tekst: string, izmene: Partial<BeleskaInfo> = {}): BeleskaInfo => ({
  id, tekst, kreirano: '2025-10-14T14:05:00', izmenjeno: null, ...izmene,
});

describe('vremeBeleske', () => {
  it('kreirano, a kad je menjana i vreme izmene', () => {
    expect(vremeBeleske(beleska(1, 'a'))).toBe('14. 10. 2025. 14:05');
    expect(vremeBeleske(beleska(1, 'a', { izmenjeno: '2025-10-15T09:30:00' }))).toBe('14. 10. 2025. 14:05 · izmenjeno 15. 10. 2025. 09:30');
  });
});

describe('StudentBeleskeTab', () => {
  // rute učitavaju komponente lenjo: prvi uvoz u hladnom testu zna da potraje duže od podrazumevanih 5 s
  beforeAll(async () => {
    await Promise.all([
      import('./student-profil'),
      import('./student-pregled-tab'),
      import('./student-hronologija-tab'),
      import('./student-beleske-tab'),
    ]);
  }, 60_000);

  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let poruke: Poruka[];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'studenti', children: STUDENTI_RUTE }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const stani = async () => {
    await harness.fixture.whenStable();
    await new Promise(r => setTimeout(r));
    harness.detectChanges();
  };
  const upisi = (selektor: string, vrednost: string) => {
    const polje = el().querySelector<HTMLTextAreaElement>(selektor)!;
    polje.value = vrednost;
    polje.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const klik = async (selektor: string) => {
    el().querySelector<HTMLButtonElement>(selektor)!.click();
    await stani();
  };

  async function otvori(beleske: BeleskaInfo[] = [beleska(2, 'Druga beleška'), beleska(1, 'Prva beleška')]) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5/beleske');
    http.expectOne('api/studenti/5').flush({ id: 5, ime: 'Ana', prezime: 'Radić', indeks: 'GD12', grupa: null, aktivnosti: [], uradjeniDomaci: [], polaganja: [] });
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
    await stani();
    http.expectOne('api/studenti/5/beleske').flush(beleske);
    await stani();
  }

  it('prikazuje beleške redom sa servera (najnovije prve) i vreme', async () => {
    await otvori([beleska(2, 'Druga beleška', { izmenjeno: '2025-10-15T09:30:00' }), beleska(1, 'Prva beleška')]);
    const stavke = [...el().querySelectorAll('[data-beleska]')];
    expect(stavke.map(s => s.querySelector('.tekst')!.textContent)).toEqual(['Druga beleška', 'Prva beleška']);
    expect(stavke[0].querySelector('.vreme')!.textContent).toContain('izmenjeno 15. 10. 2025. 09:30');
  });

  it('prazna lista ima objašnjenje i formu za dodavanje', async () => {
    await otvori([]);
    expect(el().textContent).toContain('Još nema beleški');
    expect(el().querySelector('[data-nova]')).not.toBeNull();
  });

  it('dodavanje: POST sa tekstom bez razmaka, nova beleška je prva, polje se prazni, uspeh u snackbaru', async () => {
    await otvori();
    upisi('[data-nova]', '  Dogovor o konsultacijama  ');
    await klik('[data-dodaj]');
    const z = http.expectOne('api/studenti/5/beleske');
    expect(z.request.method).toBe('POST');
    expect(z.request.body).toEqual({ tekst: 'Dogovor o konsultacijama' });
    z.flush(beleska(3, 'Dogovor o konsultacijama', { kreirano: '2025-10-16T10:00:00' }), { status: 201, statusText: 'Created' });
    await stani();
    expect(el().querySelector('[data-beleska]')!.getAttribute('data-beleska')).toBe('3');
    expect(el().querySelectorAll('[data-beleska]').length).toBe(3);
    expect(el().querySelector<HTMLTextAreaElement>('[data-nova]')!.value).toBe('');
    expect(poruke.map(p => p.tekst)).toContain('Beleška je dodata.');
  });

  it('prazna (samo razmaci) beleška se ne šalje', async () => {
    await otvori();
    upisi('[data-nova]', '   ');
    await klik('[data-dodaj]');
    http.expectNone('api/studenti/5/beleske');
    expect(el().textContent).toContain('Beleška je obavezno.');
  });

  it('greška servera ostavlja tekst u polju (poruku prikazuje interceptor)', async () => {
    await otvori();
    upisi('[data-nova]', 'Tekst');
    await klik('[data-dodaj]');
    http.expectOne('api/studenti/5/beleske').flush({ reason: 'Greška' }, { status: 400, statusText: 'Bad Request' });
    await stani();
    expect(el().querySelector<HTMLTextAreaElement>('[data-nova]')!.value).toBe('Tekst');
    expect(el().querySelectorAll('[data-beleska]').length).toBe(2);
  });

  it('izmena na mestu: PUT beleske/{id}, red se zamenjuje, Odustani vraća prikaz', async () => {
    await otvori();
    await klik('[data-beleska="2"] [data-izmeni]');
    expect(el().querySelector<HTMLTextAreaElement>('[data-izmena]')!.value).toBe('Druga beleška');
    await klik('[data-odustani]');
    expect(el().querySelector('[data-izmena]')).toBeNull();

    await klik('[data-beleska="2"] [data-izmeni]');
    upisi('[data-izmena]', 'Izmenjena');
    await klik('[data-sacuvaj]');
    const z = http.expectOne('api/beleske/2');
    expect(z.request.method).toBe('PUT');
    expect(z.request.body).toEqual({ tekst: 'Izmenjena' });
    z.flush(beleska(2, 'Izmenjena', { izmenjeno: '2025-10-16T10:00:00' }));
    await stani();
    expect(el().querySelector('[data-izmena]')).toBeNull();
    expect(el().querySelector('[data-beleska="2"] .tekst')!.textContent).toBe('Izmenjena');
    expect(el().querySelector('[data-beleska="2"] .vreme')!.textContent).toContain('izmenjeno');
  });

  it('brisanje traži potvrdu; Odustani ne šalje ništa, potvrda šalje DELETE i uklanja belešku', async () => {
    await otvori();
    await klik('[data-beleska="1"] [data-obrisi]');
    await vi.waitFor(() => expect(overlay().querySelector('[data-odustani]')).not.toBeNull());
    overlay().querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await stani();
    http.expectNone('api/beleske/1');
    expect(el().querySelectorAll('[data-beleska]').length).toBe(2);

    await klik('[data-beleska="1"] [data-obrisi]');
    await vi.waitFor(() => expect(overlay().querySelector('[data-potvrdi]')).not.toBeNull());
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    const z = await vi.waitFor(() => http.expectOne('api/beleske/1'));
    expect(z.request.method).toBe('DELETE');
    z.flush(null, { status: 204, statusText: 'No Content' });
    await stani();
    expect(el().querySelectorAll('[data-beleska]').length).toBe(1);
    expect(poruke.map(p => p.tekst)).toContain('Beleška je obrisana.');
  });

  it('greška učitavanja: panel sa "Pokušaj ponovo"', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5/beleske');
    http.expectOne('api/studenti/5').flush({ id: 5, ime: 'Ana', prezime: 'Radić', indeks: 'GD12', grupa: null, aktivnosti: [], uradjeniDomaci: [], polaganja: [] });
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
    await stani();
    http.expectOne('api/studenti/5/beleske').flush({ reason: 'Nema veze' }, { status: 400, statusText: 'Bad Request' });
    await stani();
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Nema veze');
    await klik('[data-ponovo]');
    http.expectOne('api/studenti/5/beleske').flush([beleska(1, 'Prva')]);
    await stani();
    expect(el().querySelectorAll('[data-beleska]').length).toBe(1);
  });
});
