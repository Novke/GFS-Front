import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { isoDatum } from '../../../shared/util/termin';
import { StudentskiTermin } from '../data-access/casovi.models';
import { NaredniCasovi } from './naredni-casovi.component';

const URL = 'api/public/nalog/casovi';
const danas = isoDatum(new Date());

function termin(p: Partial<StudentskiTermin> = {}): StudentskiTermin {
  return {
    stavkaId: 7, datum: danas, pocetak: '10:00:00', kraj: '13:00:00', predmet: 'Geodezija 1', grupa: 'GD-2026',
    svojaGrupa: true, otkazan: false, napomena: null, najavljeno: false, razlog: null, ...p,
  };
}

/** Samostalna kartica „Naredni časovi“: sama učitava, najava jednim dodirom, razlog, povlačenje, otkazan čas, greške. */
describe('NaredniCasovi', () => {
  let fixture: ComponentFixture<NaredniCasovi>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (sel: string) => el().querySelector<HTMLButtonElement>(sel)!;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvori(termini: StudentskiTermin[]): Promise<void> {
    fixture = TestBed.createComponent(NaredniCasovi);
    fixture.detectChanges();
    http.expectOne(URL).flush({ termini });
    await stabilno();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('bez časova u rasporedu ne prikazuje ništa', async () => {
    await otvori([]);
    expect(el().querySelector('[data-naredni-casovi]')).toBeNull();
  });

  it('prikazuje termin (danas, dan, datum, vreme, predmet) i grupu samo za tuđu grupu', async () => {
    await otvori([termin(), termin({ stavkaId: 8, svojaGrupa: false, grupa: 'GD-2025' })]);
    const redovi = el().querySelectorAll('[data-termin]');
    expect(redovi.length).toBe(2);
    expect(redovi[0].textContent).toContain('danas, ');
    expect(redovi[0].textContent).toContain('10:00–13:00');
    expect(redovi[0].textContent).toContain('Geodezija 1');
    expect(redovi[0].textContent).not.toContain('grupa');
    expect(redovi[1].textContent).toContain('grupa GD-2025');
  });

  it('„Neću doći“ šalje najavu bez razloga, pa „Dodaj razlog“ i „Ipak dolazim“', async () => {
    await otvori([termin()]);
    dugme('[data-necu-doci]').click();
    const req = http.expectOne(`${URL}/najavi`);
    expect(req.request.body).toEqual({ stavkaId: 7, datum: danas, razlog: null });
    req.flush(termin({ najavljeno: true }));
    await stabilno();
    expect(el().querySelector('[data-najavljeno]')?.textContent).toContain('Javljeno da nećeš doći.');
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Javljeno je da nećeš doći.');

    dugme('[data-dodaj-razlog]').click();
    fixture.detectChanges();
    const polje = el().querySelector<HTMLTextAreaElement>('[data-razlog]')!;
    expect(polje.maxLength).toBe(200);
    polje.value = '  kod lekara ';
    polje.dispatchEvent(new Event('input'));
    dugme('[data-sacuvaj-razlog]').click();
    const req2 = http.expectOne(`${URL}/najavi`);
    expect(req2.request.body).toEqual({ stavkaId: 7, datum: danas, razlog: 'kod lekara' });
    req2.flush(termin({ najavljeno: true, razlog: 'kod lekara' }));
    await stabilno();
    expect(el().textContent).toContain('Razlog: kod lekara');
    expect(dugme('[data-dodaj-razlog]').textContent).toContain('Izmeni razlog');

    dugme('[data-ipak-dolazim]').click();
    const req3 = http.expectOne(`${URL}/povuci`);
    expect(req3.request.body).toEqual({ stavkaId: 7, datum: danas });
    req3.flush(termin());
    await stabilno();
    expect(el().querySelector('[data-necu-doci]')).not.toBeNull();
  });

  it('otkazan čas: „Nema časa“ sa napomenom, bez dugmadi', async () => {
    await otvori([termin({ otkazan: true, napomena: 'Sednica veća.' })]);
    expect(el().querySelector('[data-nema-casa]')?.textContent).toContain('Nema časa. Sednica veća.');
    expect(el().querySelector('[data-necu-doci]')).toBeNull();
  });

  it('409 (čas je u međuvremenu otkazan): poruka servera uz termin i tiho novo učitavanje', async () => {
    await otvori([termin()]);
    dugme('[data-necu-doci]').click();
    http.expectOne(`${URL}/najavi`).flush({ reason: 'Ovaj čas je otkazan.' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(URL).flush({ termini: [termin({ otkazan: true })] });
    await stabilno();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Ovaj čas je otkazan.');
    expect(el().querySelector('[data-nema-casa]')).not.toBeNull();
  });

  it('greška učitavanja: poruka i „Pokušaj ponovo“', async () => {
    fixture = TestBed.createComponent(NaredniCasovi);
    fixture.detectChanges();
    http.expectOne(URL).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    await stabilno();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Potrebna je prijava.');
    [...el().querySelectorAll('button')].find(b => b.textContent?.includes('Pokušaj ponovo'))!.click();
    http.expectOne(URL).flush({ termini: [] });
    await stabilno();
    expect(el().querySelector('[data-naredni-casovi]')).toBeNull();
  });
});
