import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { danIDatum, dodajDane, isoDatum } from '../../../shared/util/termin';
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

/** Samostalni „Naredni časovi“: sama učitava, sledeći čas, kalendar, najava jednim dodirom, razlog, povlačenje, otkazan čas, greške. */
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

  it('izabran je prvi dan: naslov (dan, datum, danas), vreme, predmet i grupa samo za tuđu grupu', async () => {
    await otvori([termin(), termin({ stavkaId: 8, svojaGrupa: false, grupa: 'GD-2025' })]);
    const redovi = el().querySelectorAll('[data-termin]');
    expect(redovi.length).toBe(2);
    expect(el().querySelector('[data-dan-naslov]')?.textContent?.toLowerCase()).toBe(`${danIDatum(danas)} · danas`);
    expect(redovi[0].textContent).toContain('10:00–13:00');
    expect(redovi[0].textContent).toContain('Geodezija 1');
    expect(redovi[0].textContent).not.toContain('grupa');
    expect(redovi[1].textContent).toContain('grupa GD-2025');
  });

  it('sledeći čas preskače otkazan i javljen čas, a izabran ostaje prvi dan da se otkazivanje vidi odmah', async () => {
    const [d1, d2, d3] = [1, 2, 3].map(n => dodajDane(danas, n));
    await otvori([
      termin({ stavkaId: 3, datum: d3, predmet: 'Nacrtna geometrija' }),
      termin({ datum: d1, otkazan: true, napomena: 'Sednica veća.' }),
      termin({ stavkaId: 2, datum: d2, najavljeno: true }),
    ]);
    const sledeci = el().querySelector('[data-sledeci-cas]')?.textContent;
    expect(sledeci).toContain('Nacrtna geometrija');
    expect(sledeci).toContain('Sledeći čas · za 3 dana');
    expect(el().querySelector('[data-nema-casa]')?.textContent).toContain('Sednica veća.');
  });

  it('bez časa na koji student ide nema kartice „Sledeći čas“', async () => {
    await otvori([termin({ otkazan: true })]);
    expect(el().querySelector('[data-sledeci-cas]')).toBeNull();
  });

  it('dodir na dan otvara njegove termine; dani bez časa nisu dugmad', async () => {
    const sledece = dodajDane(danas, 7);
    await otvori([termin(), termin({ stavkaId: 8, datum: sledece, predmet: 'Nacrtna geometrija' })]);
    expect(el().querySelector(`[data-dan="${dodajDane(danas, 1)}"]`)).toBeNull();
    expect(dugme(`[data-dan="${danas}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(dugme(`[data-dan="${danas}"]`).getAttribute('aria-current')).toBe('date');

    // sedam dana unapred može biti u sledećem mesecu, van prikazane mreže
    const dan = () => el().querySelector<HTMLButtonElement>(`[data-dan="${sledece}"]`);
    (dan() ?? dugme('[data-sledeci-mesec]')).click();
    await stabilno();
    expect(el().querySelector('[data-dan-detalj]')?.textContent).toContain('Nacrtna geometrija');
    expect(el().querySelector('[data-dan-detalj]')?.textContent).not.toContain('Geodezija 1');
    expect(dan()!.getAttribute('aria-label')).toContain('Nacrtna geometrija 10:00–13:00');
  });

  it('dan pokazuje stanje: otkazan i „ne dolaziš“ u ćeliji, opisu za čitač ekrana i legendi', async () => {
    const sutra = dodajDane(danas, 1);
    await otvori([termin({ otkazan: true }), termin({ stavkaId: 8, datum: sutra, najavljeno: true })]);
    const danasnji = dugme(`[data-dan="${danas}"]`);
    expect(danasnji.classList).toContain('otkazan');
    expect(danasnji.getAttribute('aria-label')).toContain('otkazan');
    expect(el().querySelector('.legenda')?.textContent).toContain('Otkazan');
    expect(el().querySelector('.legenda')?.textContent).toContain('Ne dolaziš');
  });

  it('strelice vode kroz mesece sa terminima i biraju prvi dan tog meseca; jedan mesec nema strelice', async () => {
    const [g, m] = danas.split('-').map(Number);
    const mesec = (n: number) => isoDatum(new Date(g, m - 1 + n, 15));
    await otvori([termin({ datum: mesec(1) }), termin({ stavkaId: 8, datum: mesec(3), predmet: 'Nacrtna geometrija' })]);
    expect(dugme('[data-prethodni-mesec]').disabled).toBe(true);
    dugme('[data-sledeci-mesec]').click();
    await stabilno();
    expect(el().querySelector('[data-dan-detalj]')?.textContent).toContain('Nacrtna geometrija');
    expect(dugme('[data-sledeci-mesec]').disabled).toBe(true);
    expect(dugme('[data-prethodni-mesec]').disabled).toBe(false);
    fixture.destroy();

    await otvori([termin({ datum: mesec(1) })]);
    expect(el().querySelector('[data-sledeci-mesec]')).toBeNull();
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
