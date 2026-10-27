import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../core/api/api-error';
import { JavniUpis } from './pages/javni-upis';
import { JavniUpisInfo } from './upis.api';
import { greskaPolja, imeBezViskaRazmaka, lokalniDatum } from './upis.pravila';

const TOKEN = 'abcDEF123_-xyz';
const URL_UPISA = `api/public/upis/${TOKEN}`;
const GRANICE = { danas: '2026-10-09' };

function info(izmene: Partial<JavniUpisInfo> = {}): JavniUpisInfo {
  return { grupaNaziv: 'GD-2025', godinaUpisa: 2025, otvorena: true, istice: '2026-12-01T10:00:00', ...izmene };
}

describe('JavniUpis (upis/:token)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<JavniUpis>;

  const html = () => fixture.nativeElement as HTMLElement;
  const tekst = () => html().textContent?.replace(/\s+/g, ' ') ?? '';
  // Polja sa istim imenom kontrole u različitim grupama (broj indeksa, broj telefona) se traže po atributu `name`.
  const polje = (ime: string) =>
    html().querySelector<HTMLInputElement>(`input[formControlName="${ime}"], input[name="${ime}"]`)!;
  const zemlja = () => html().querySelector<HTMLSelectElement>('select[name="zemlja-telefona"]')!;
  const dugme = (naziv: string) =>
    [...html().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(naziv))!;

  async function otvori(odgovor: JavniUpisInfo | null = info(), token = TOKEN): Promise<void> {
    fixture = TestBed.createComponent(JavniUpis);
    fixture.componentRef.setInput('token', token);
    fixture.detectChanges();
    if (odgovor) {
      http.expectOne(`api/public/upis/${token}`).flush(odgovor);
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function unesi(ime: string, vrednost: string): Promise<void> {
    const el = polje(ime);
    el.value = vrednost;
    el.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function popuni(): Promise<void> {
    await unesi('ime', '  Ana   Marija ');
    await unesi('prezime', 'Radić');
    await unesi('broj-indeksa', '012');
    await unesi('email', 'ana@example.com');
    await unesi('broj-telefona', '064 123 456');
  }

  async function posalji(): Promise<void> {
    dugme('Pošalji').click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function odgovoriGreskom(zahtev: TestRequest, status: number, telo: string | object | null = null): void {
    zahtev.flush(telo, { status, statusText: 'x' });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify(); // nijedan neočekivan zahtev (posebno ne zaključan /api/*)
    vi.restoreAllMocks();
  });

  it('učitavanje zove samo GET api/public/upis/<token>, prikazuje naslov i predpopunjava godinu', async () => {
    await otvori();
    expect(html().querySelector('h1')?.textContent).toBe('Prijava za grupu GD-2025');
    expect(tekst()).toContain('Godina upisa: 2025');
    expect(polje('godina-upisa').value).toBe('2025');
    expect(zemlja().value).toBe('RS');
    for (const ime of ['ime', 'prezime', 'broj-indeksa', 'godina-upisa', 'email', 'broj-telefona', 'datumRodjenja', 'opstina']) {
      expect(polje(ime), ime).toBeTruthy();
    }
    expect(dugme('Pošalji')).toBeTruthy();
  });

  it('labele i atributi polja (smoke test ih koristi)', async () => {
    await otvori();
    const labele = [...html().querySelectorAll('mat-label')].map(l => l.textContent?.trim());
    expect(labele).toEqual([
      'Ime', 'Prezime', 'Broj indeksa', 'Godina upisa', 'Email', 'Zemlja', 'Broj telefona', 'Datum rođenja (opciono)',
      'Opština (opciono)',
    ]);
    expect([...html().querySelectorAll('legend')].map(l => l.textContent?.trim())).toEqual(['Indeks', 'Telefon']);
    expect(polje('ime').getAttribute('autocomplete')).toBe('given-name');
    expect(polje('email').getAttribute('inputmode')).toBe('email');
    expect(polje('broj-telefona').getAttribute('inputmode')).toBe('tel');
    expect(polje('broj-indeksa').getAttribute('inputmode')).toBe('numeric');
    expect(polje('godina-upisa').getAttribute('inputmode')).toBe('numeric');
    expect([...zemlja().options].map(o => o.value)).toEqual(['RS', 'BA', 'ME', 'HR', 'HU', 'MK', 'SI', 'XX']);
    expect(zemlja().options[0].textContent).toContain('+381 Srbija');
    expect(polje('datumRodjenja').getAttribute('autocomplete')).toBe('bday');
  });

  it('slanje zove samo POST api/public/upis/<token>, sa normalizovanim podacima, i prikazuje "Prijava primljena"', async () => {
    await otvori();
    await popuni();
    await posalji();

    const zahtev = http.expectOne(URL_UPISA);
    expect(zahtev.request.method).toBe('POST');
    expect(zahtev.request.context.get(LOCAL_ERRORS)).toBe(true); // nastavnički snackbar se ne sme pojaviti
    expect(zahtev.request.body).toEqual({
      ime: 'Ana Marija',
      prezime: 'Radić',
      indeks: 'GD12',
      godina: 2025,
      email: 'ana@example.com',
      brojTelefona: '+38164123456',
      datumRodjenja: null,
      opstina: null,
    });
    zahtev.flush({ id: 7 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tekst()).toContain('Prijava primljena');
    expect(tekst()).toContain('GD12/2025');
    expect(tekst()).toContain('+381 64 123456');
    expect(html().querySelector('form')).toBeNull();
  });

  it('godina je predložena, ali je student menja; neispravna godina je greška ispod polja', async () => {
    await otvori();
    await popuni();
    await unesi('godina-upisa', '1999');
    await posalji();
    http.expectNone(URL_UPISA);
    expect([...html().querySelectorAll('mat-error')].map(e => e.textContent?.trim())).toContainEqual(
      expect.stringContaining('Unesi godinu 2000'),
    );

    await unesi('godina-upisa', '2024');
    await posalji();
    const zahtev = http.expectOne(URL_UPISA);
    expect(zahtev.request.body).toMatchObject({ indeks: 'GD12', godina: 2024 });
    zahtev.flush({ id: 7 });
  });

  it('pun međunarodni broj bira zemlju sam; "Druga zemlja" traži pozivni broj', async () => {
    await otvori();
    await popuni();
    await unesi('broj-telefona', '00387 65 123-456');
    polje('broj-telefona').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(zemlja().value).toBe('BA');
    expect(polje('broj-telefona').value).toBe('65123456');
    expect(tekst()).toContain('Biće sačuvan kao +387 65 123456');

    zemlja().value = 'XX';
    zemlja().dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    await posalji();
    http.expectNone(URL_UPISA);
    expect([...html().querySelectorAll('mat-error')].map(e => e.textContent?.trim())).toContain(
      'Unesi pozivni broj zemlje (1-3 cifre).',
    );

    await unesi('pozivni-broj', '+44');
    await unesi('broj-telefona', '07700 900123');
    await posalji();
    const zahtev = http.expectOne(URL_UPISA);
    expect(zahtev.request.body.brojTelefona).toBe('+447700900123');
    zahtev.flush({ id: 7 });
  });

  it('posle prijave nudi WhatsApp grupu samo za kanonski link iz odgovora', async () => {
    const waDugme = () => html().querySelector<HTMLAnchorElement>('a[data-wa-link]');
    for (const [waLink, ocekivano] of [
      ['https://chat.whatsapp.com/AbCdEfGhIj1234567890Kl', 'https://chat.whatsapp.com/AbCdEfGhIj1234567890Kl'],
      [null, null],
      [undefined, null],
      ['javascript:alert(1)', null],
      ['https://evil.example/chat.whatsapp.com/AbCdEfGhIj1234567890Kl', null],
    ] as const) {
      await otvori();
      await popuni();
      await posalji();
      http.expectOne(URL_UPISA).flush(waLink === undefined ? { id: 7 } : { id: 7, waLink });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(tekst()).toContain('Prijava primljena');
      expect(waDugme()?.getAttribute('href') ?? null).toBe(ocekivano);
      if (ocekivano) {
        expect(waDugme()?.getAttribute('rel')).toContain('noopener');
        expect(waDugme()?.textContent).toContain('Pridruži se WhatsApp grupi');
      }
      fixture.destroy();
    }
  });

  it('dvoklik na "Pošalji" šalje samo jedan zahtev', async () => {
    await otvori();
    await popuni();
    dugme('Pošalji').click();
    dugme('Pošalji').click();
    await fixture.whenStable();

    http.expectOne(URL_UPISA).flush({ id: 7 });
  });

  it('neispravna forma ne šalje ništa i prikazuje poruke ispod polja', async () => {
    await otvori();
    await unesi('email', 'nije-email');
    await posalji();

    http.expectNone(URL_UPISA);
    const poruke = [...html().querySelectorAll('mat-error')].map(e => e.textContent?.trim());
    expect(poruke).toContain('Unesi ime.');
    expect(poruke).toContain('Unesi ispravan email.');
    expect(poruke).toContain('Unesi broj indeksa.');
    expect(poruke).toContain('Unesi broj telefona.');
    expect(html().querySelector('app-form-error-banner [role="alert"]')).toBeNull();
  });

  it('400 sa `reason` se prikazuje u formi (traka sa role=alert), ne u snackbaru, i forma ostaje', async () => {
    await otvori();
    await popuni();
    await posalji();
    const zahtev = http.expectOne(URL_UPISA);
    expect(zahtev.request.context.get(LOCAL_ERRORS)).toBe(true);
    odgovoriGreskom(zahtev, 400, { reason: 'Prijava sa ovim indeksom već čeka odobrenje.', time: 'x' });
    await fixture.whenStable();
    fixture.detectChanges();

    const traka = html().querySelector('form [role="alert"]');
    expect(traka?.textContent).toContain('već čeka odobrenje');
    expect(polje('ime').value).toBe('  Ana   Marija ');
    expect(dugme('Pošalji').disabled).toBe(false);
  });

  it('400 bez `reason` prikazuje opštu poruku', async () => {
    await otvori();
    await popuni();
    await posalji();
    odgovoriGreskom(http.expectOne(URL_UPISA), 400, '<html>nije json</html>');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(html().querySelector('form [role="alert"]')?.textContent).toContain('Proveri unete podatke');
  });

  it('410 prikazuje "Prijava je zatvorena" bez forme', async () => {
    await otvori();
    await popuni();
    await posalji();
    odgovoriGreskom(http.expectOne(URL_UPISA), 410, { reason: 'Prijava je zatvorena.' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tekst()).toContain('Prijava je zatvorena');
    expect(html().querySelector('form')).toBeNull();
  });

  it('sesija koja je već zatvorena odmah prikazuje "Prijava je zatvorena"', async () => {
    await otvori(info({ otvorena: false }));
    expect(tekst()).toContain('Prijava je zatvorena');
    expect(html().querySelector('form')).toBeNull();
  });

  it('nepoznat token (404) prikazuje poruku da link nije ispravan', async () => {
    await otvori(null);
    odgovoriGreskom(http.expectOne(URL_UPISA), 404, { reason: 'x' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tekst()).toContain('Link za prijavu nije ispravan');
  });

  it('token sa neispravnim znacima ne ide u zahtev', async () => {
    await otvori(null, 'a%2F..%2F..');
    http.expectNone(() => true);
    expect(tekst()).toContain('Link za prijavu nije ispravan');
  });

  it('greška servera pri slanju: "Pokušaj ponovo" šalje iste podatke ponovo', async () => {
    await otvori();
    await popuni();
    await posalji();
    const prvi = http.expectOne(URL_UPISA);
    const telo = prvi.request.body;
    odgovoriGreskom(prvi, 500, { reason: 'detalji servera' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tekst()).toContain('Greška na serveru, pokušaj ponovo.');
    expect(tekst()).not.toContain('detalji servera');

    dugme('Pokušaj ponovo').click();
    await fixture.whenStable();
    const drugi = http.expectOne(URL_UPISA);
    expect(drugi.request.method).toBe('POST');
    expect(drugi.request.body).toEqual(telo);
    drugi.flush({ id: 9 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tekst()).toContain('Prijava primljena');
  });

  it('greška servera pri učitavanju: "Pokušaj ponovo" ponavlja GET', async () => {
    await otvori(null);
    http.expectOne(URL_UPISA).error(new ProgressEvent('error'), { status: 0 } as Partial<HttpErrorResponse>);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tekst()).toContain('Greška na serveru');

    dugme('Pokušaj ponovo').click();
    http.expectOne(URL_UPISA).flush(info());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html().querySelector('form')).not.toBeNull();
  });
});

describe('pravila javne forme', () => {
  it('normalizuje ime', () => {
    expect(imeBezViskaRazmaka('  Ana   Marija ')).toBe('Ana Marija');
  });

  it('opciona polja: prazno je u redu, datum ne sme u budućnost', () => {
    expect(greskaPolja('datumRodjenja', '', GRANICE)).toBeNull();
    expect(greskaPolja('datumRodjenja', '2002-04-05', GRANICE)).toBeNull();
    expect(greskaPolja('datumRodjenja', '2030-01-01', GRANICE)).not.toBeNull();
    expect(greskaPolja('datumRodjenja', '1900-01-01', GRANICE)).not.toBeNull();
    expect(greskaPolja('opstina', 'x'.repeat(101), GRANICE)).not.toBeNull();
  });

  it('email', () => {
    expect(greskaPolja('email', 'a@b.rs', GRANICE)).toBeNull();
    expect(greskaPolja('email', 'a@b', GRANICE)).not.toBeNull();
  });

  it('lokalni datum je yyyy-MM-dd', () => {
    expect(lokalniDatum(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
