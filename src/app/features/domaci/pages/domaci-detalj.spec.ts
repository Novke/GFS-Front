import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { DEBOUNCE_REDA_MS } from '../data-access/domaci.store';
import { brojStudenata, DomaciDetails } from '../../../core/api/domaci.models';
import { DomaciDetalj } from './domaci-detalj';

function detalji(izmene: Partial<DomaciDetails> = {}): DomaciDetails {
  return {
    id: 5,
    predmet: { id: 1, naziv: 'Uvod u primenu računara' },
    naslov: 'Domaći 3',
    text: 'Petlje',
    datum: '2025-10-15',
    pregledan: false,
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025 },
    predavanje: { id: 12, rb: 7, tema: 'Petlje', datum: '2025-10-14' },
    studenti: [
      { studentId: 1, domaciId: 5, ime: 'Ana', prezime: 'Radić', indeks: 'GD2', godina: 2025, tip: 'ZADATAK', predavanjaNapomene: null,
        uradjenDomaciId: null, bodovi: null, uradjenDomaciNapomene: null, prepisivanje: null, oslobodjen: null },
      { studentId: 2, domaciId: 5, ime: 'Marko', prezime: 'Ilić', indeks: 'GD10', godina: 2025, tip: null, predavanjaNapomene: null,
        uradjenDomaciId: 50, bodovi: 6, uradjenDomaciNapomene: 'u redu', prepisivanje: false, oslobodjen: false },
    ],
    ...izmene,
  };
}

describe('brojStudenata', () => {
  it('srpska množina', () => {
    expect(brojStudenata(1)).toBe('1 student');
    expect(brojStudenata(3)).toBe('3 studenta');
    expect(brojStudenata(12)).toBe('12 studenata');
    expect(brojStudenata(21)).toBe('21 student');
  });
});

describe('DomaciDetalj', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'domaci/:id', component: DomaciDetalj }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const polje = (id: number, ime: string) => el().querySelector<HTMLInputElement>(`tr[data-student="${id}"] input[data-polje="${ime}"]`)!;
  const evidentiraj = () => http.match(r => r.url === 'api/domaci/evidentiraj');

  async function otvori(d: DomaciDetails = detalji()) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/domaci/5');
    http.expectOne('api/domaci/5').flush(d);
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  const tece = async (ms = DEBOUNCE_REDA_MS) => {
    vi.advanceTimersByTime(ms);
    harness.detectChanges();
  };

  it('prikazuje zaglavlje i tabelu; predavanje je link', async () => {
    await otvori();
    expect(el().querySelector('h1')!.textContent).toBe('Domaći 3');
    expect(el().querySelector('a[data-predavanje]')!.getAttribute('href')).toBe('/predavanja/12');
    expect(el().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(polje(2, 'bodovi').value).toBe('6');
    expect(el().querySelector('[data-oslobodi]')).not.toBeNull();
  });

  it('autosave: više brzih izmena istog reda šalje jedan zahtev', async () => {
    await otvori();
    vi.useFakeTimers();
    const bodovi = polje(1, 'bodovi');
    for (const v of ['3', '4', '8']) {
      bodovi.value = v;
      bodovi.dispatchEvent(new Event('input'));
      await tece(200);
    }
    expect(evidentiraj()).toHaveLength(0);
    await tece();
    const zahtevi = evidentiraj();
    expect(zahtevi).toHaveLength(1);
    expect(zahtevi[0].request.body).toEqual({ studentId: 1, domaciId: 5, bodovi: 8, napomene: '', prepisivanje: false });
    zahtevi[0].flush(detalji({
      studenti: [{ ...detalji().studenti[0], bodovi: 8, uradjenDomaciId: 60, uradjenDomaciNapomene: '', prepisivanje: false }, detalji().studenti[1]],
    }));
    harness.detectChanges();
    expect(el().querySelector('tr[data-student="1"] .c-status')!.textContent).toContain('Sačuvano');
  });

  it('greška čuvanja ostavlja vrednost u polju i prikazuje "Nije sačuvano"', async () => {
    await otvori();
    vi.useFakeTimers();
    const bodovi = polje(1, 'bodovi');
    bodovi.value = '7';
    bodovi.dispatchEvent(new Event('input'));
    await tece();
    evidentiraj()[0].flush({ reason: 'Max 10 bodova je dozvoljeno' }, { status: 400, statusText: 'Bad Request' });
    harness.detectChanges();
    expect(polje(1, 'bodovi').value).toBe('7');
    const status = el().querySelector('tr[data-student="1"] .c-status')!;
    expect(status.textContent).toContain('Nije sačuvano');
    expect(status.querySelector('button.ponovo')).not.toBeNull();
    expect(el().querySelector<HTMLButtonElement>('[data-zavrsi]')!.disabled).toBe(false);
  });

  it('"Završi pregled" je onemogućeno dok red čeka čuvanje', async () => {
    await otvori();
    vi.useFakeTimers();
    polje(1, 'bodovi').value = '5';
    polje(1, 'bodovi').dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('[data-zavrsi]')!.disabled).toBe(true);
    await tece();
    evidentiraj()[0].flush(detalji());
  });

  it('prelazak /domaci/5 -> /domaci/6 (ista komponenta) šalje izmenu koja čeka debounce domaćem 5, pa učitava 6', async () => {
    await otvori();
    vi.useFakeTimers();
    polje(1, 'bodovi').value = '7';
    polje(1, 'bodovi').dispatchEvent(new Event('input'));
    await harness.navigateByUrl('/domaci/6');
    harness.detectChanges();
    const [z] = evidentiraj();
    expect(z.request.body).toMatchObject({ studentId: 1, domaciId: 5, bodovi: 7 });
    http.expectNone('api/domaci/6');
    z.flush(detalji({ studenti: [{ ...detalji().studenti[0], bodovi: 7, uradjenDomaciId: 61 }, detalji().studenti[1]] }));
    vi.useRealTimers();
    http.expectOne('api/domaci/6').flush(detalji({ id: 6, naslov: 'Domaći 6' }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('h1')!.textContent).toBe('Domaći 6');
    expect(polje(1, 'bodovi').value).toBe('');
  });

  it('domaći bez predavanja i grupe prikazuje — i objašnjenje, bez dugmeta "Oslobodi aktivne"', async () => {
    await otvori(detalji({ predavanje: null, grupa: null, studenti: [], naslov: null }));
    expect(el().querySelector('h1')!.textContent).toBe('Domaći bez naslova');
    expect(el().querySelector('[data-bez-predavanja]')!.textContent).toContain('—');
    expect(el().querySelector('a[data-predavanje]')).toBeNull();
    expect(el().querySelector('[data-oslobodi]')).toBeNull();
    expect(el().textContent).toContain('Bez grupe');
    expect(el().textContent).toContain('Domaći nema grupu');
  });

  it('pregledan domaći je samo za čitanje', async () => {
    await otvori(detalji({ pregledan: true }));
    expect(el().querySelector('[data-samo-citanje]')).not.toBeNull();
    expect(el().querySelectorAll('tbody input')).toHaveLength(0);
    expect(el().querySelector('[data-zavrsi]')).toBeNull();
    expect(el().textContent).toContain('Pregledan');
  });

  it('greška učitavanja: panel sa "Pokušaj ponovo"', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/domaci/5');
    http.expectOne('api/domaci/5').flush({ reason: 'Domaci ne postoji! ID = 5' }, { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().textContent).toContain('Domaći nije učitan');
    expect(el().textContent).toContain('Domaci ne postoji! ID = 5');
  });
});
