import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudentJa } from '../data-access/nalog.models';
import { MoodlePage } from './moodle.page';

const STANJE = 'api/public/nalog/stanje';
const JA = 'api/public/nalog/ja';
const KOD = 'api/public/nalog/kod';
const PRIJAVA = 'api/public/nalog/prijava';
const POVEZI = 'api/public/lti/povezi';

const JA_ODGOVOR: StudentJa = {
  indeks: 'GD12',
  ime: 'Ana',
  prezime: 'Primerović',
  maskaMejla: 'a***@example.test',
  moodlePovezan: false,
  uredjaji: [],
};

const PORUKA_409 = 'Ovaj Moodle nalog je već povezan sa drugim studentom. Javi se nastavniku.';
const PORUKA_410 = 'Povezivanje je isteklo. Otvori GFS ponovo iz Moodle-a.';

const greska = (status: number, statusText: string) => ({ status, statusText });
const bezSadrzaja = { status: 204, statusText: 'No Content' };

/**
 * Javna ruta `/nalog/moodle` (spec prijave 8.3): Moodle je preusmerio studenta bez veze (uparivanje: indeks -> kod ->
 * `POST api/public/lti/povezi`), nastavnika (`?uloga=nastavnik`) ili grešku (`?greska=<kod>`). Zove samo
 * `api/public/nalog/*` i `api/public/lti/povezi`.
 */
describe('MoodlePage', () => {
  let fixture: ComponentFixture<MoodlePage>;
  let http: HttpTestingController;
  let navigacija: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const naslov = () => el().querySelector('h2')?.textContent?.trim();
  const dugme = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith(tekst));
  const link = (tekst: string) => [...el().querySelectorAll<HTMLAnchorElement>('a')].find(a => a.textContent?.trim() === tekst);
  const polje = (ime: string) => el().querySelector<HTMLInputElement>(`input[name="${ime}"]`);
  const banner = () => el().querySelector('app-form-error-banner [role="alert"]')?.textContent?.trim() ?? null;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Stranica sa query parametrima (`withComponentInputBinding`); bez `uloga` i `greska` prvo pita `GET stanje`. */
  async function otvori(ulazi: { uloga?: string; greska?: string; nazad?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(MoodlePage);
    for (const [k, v] of Object.entries(ulazi)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
    await stabilno();
  }

  async function otvoriTok(prijavljen = false, nazad?: string): Promise<void> {
    await otvori(nazad === undefined ? {} : { nazad });
    http.expectOne(STANJE).flush({ prijavljen });
    if (prijavljen) {
      http.expectOne(JA).flush(JA_ODGOVOR);
    }
    await stabilno();
  }

  function upisi(ime: string, vrednost: string): void {
    polje(ime)!.value = vrednost;
    polje(ime)!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Indeks -> kod -> 204 prijave; vraća zahtev `povezi` (još bez odgovora). */
  async function prijaviKodom() {
    upisi('indeks', 'gd12');
    dugme('Pošalji kod')!.click();
    http.expectOne(KOD).flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'a***@example.test' });
    await stabilno();
    expect(naslov()).toBe('Unesi kod');
    upisi('kod', '123456');
    dugme('Prijavi se')!.click();
    const prijava = http.expectOne(PRIJAVA);
    expect(prijava.request.body).toEqual({ indeks: 'GD12', kod: '123456' });
    prijava.flush(null, bezSadrzaja);
    await stabilno();
    const povezi = http.expectOne(POVEZI);
    expect(povezi.request.method).toBe('POST');
    return povezi;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  describe('?greska=<kod> (preusmerenje posle neuspelog ulaska iz Moodle-a)', () => {
    it.each([
      ['nepoznata-registracija', 'Ovaj Moodle predmet nije registrovan u GFS-u ili mu je registracija isključena. Javi se nastavniku.'],
      ['istekla-sesija', 'Ulazak iz Moodle-a je istekao ili je već iskorišćen. Otvori GFS ponovo iz Moodle-a.'],
      [
        'bez-kolacica',
        'Pregledač nije vratio kolačić potreban za ulazak iz Moodle-a (to rade neki pregledači sa strogom zaštitom privatnosti). ' +
          'Otvori GFS ovde i prijavi se kodom sa mejla.',
      ],
      [
        'neispravan-token',
        'GFS nije mogao da proveri prijavu koju je poslao Moodle. Otvori GFS ponovo iz Moodle-a; ako se ponovi, javi se nastavniku.',
      ],
      ['nepodrzana-poruka', 'GFS ne podržava ovu vrstu veze iz Moodle-a. Javi se nastavniku.'],
    ])('%s: poruka po kodu i link "Otvori GFS" na nalog, bez ijednog zahteva', async (kod, poruka) => {
      await otvori({ greska: kod });
      expect(naslov()).toBe('Prijava iz Moodle-a nije uspela');
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(poruka);
      expect(link('Otvori GFS')?.getAttribute('href')).toBe('/nalog');
      http.expectNone(() => true);
    });

    it('nepoznat kod: opšta poruka, kod iz URL-a se ne prikazuje', async () => {
      await otvori({ greska: '<b>nesto</b>' });
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Ulazak iz Moodle-a nije uspeo. Otvori GFS ponovo iz Moodle-a.',
      );
      expect(el().textContent).not.toContain('nesto');
      expect(link('Otvori GFS')).toBeDefined();
    });

    it.each(['constructor', '__proto__', 'toString'])('greska=%s (ime iz prototipa objekta): opšta poruka', async kod => {
      await otvori({ greska: kod });
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Ulazak iz Moodle-a nije uspeo. Otvori GFS ponovo iz Moodle-a.',
      );
    });

    it('greska ima prednost pred uloga=nastavnik', async () => {
      await otvori({ greska: 'istekla-sesija', uloga: 'nastavnik' });
      expect(naslov()).toBe('Prijava iz Moodle-a nije uspela');
      expect(el().textContent).not.toContain('Alat je ispravno registrovan.');
    });
  });

  describe('?uloga=nastavnik', () => {
    it('"Alat je ispravno registrovan.", bez zahteva i bez prijave', async () => {
      await otvori({ uloga: 'nastavnik' });
      expect(el().querySelector('[role="status"]')?.textContent?.trim()).toBe('Alat je ispravno registrovan.');
      expect(el().textContent).toContain('Podešavanja → Moodle');
      expect(polje('indeks')).toBeNull();
      http.expectNone(() => true);
    });

    it('druga vrednost (uloga=student) je običan tok uparivanja', async () => {
      await otvori({ uloga: 'student' });
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
    });
  });

  describe('uparivanje (bez parametara)', () => {
    it('nije prijavljen: naslov i objašnjenje, pa indeks -> kod -> povezi -> "Moodle nalog je povezan"', async () => {
      await otvoriTok();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(el().textContent).toContain('prijavi se jednom kodom sa mejla');
      expect(polje('indeks')).not.toBeNull();
      http.expectNone(POVEZI);

      const povezi = await prijaviKodom();
      povezi.flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
      expect(el().textContent).toContain('Sledeći put iz Moodle-a ulaziš jednim klikom, bez koda.');
      expect(link('Otvori nalog')?.getAttribute('href')).toBe('/nalog');
      expect(dugme('Nastavi')).toBeUndefined();
      expect(navigacija).not.toHaveBeenCalled();
    });

    it('pogrešan kod: tekst servera, ostaje na kodu, bez povezi', async () => {
      await otvoriTok();
      upisi('indeks', 'GD12');
      dugme('Pošalji kod')!.click();
      http.expectOne(KOD).flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'a***@example.test' });
      await stabilno();
      upisi('kod', '111111');
      dugme('Prijavi se')!.click();
      http.expectOne(PRIJAVA).flush({ reason: 'Kod nije ispravan ili je istekao.' }, greska(401, 'Unauthorized'));
      await stabilno();
      expect(banner()).toBe('Kod nije ispravan ili je istekao.');
      expect(polje('kod')).not.toBeNull();
      http.expectNone(POVEZI);
    });

    it('povezi 409: tekst servera doslovno i "Otvori GFS"', async () => {
      await otvoriTok();
      const povezi = await prijaviKodom();
      povezi.flush({ reason: PORUKA_409 }, greska(409, 'Conflict'));
      await stabilno();
      expect(naslov()).toBe('Povezivanje nije uspelo');
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(PORUKA_409);
      expect(link('Otvori GFS')?.getAttribute('href')).toBe('/nalog');
    });

    it('povezi 410 (veza iz Moodle-a istekla ili iskorišćena): tekst servera doslovno', async () => {
      await otvoriTok();
      const povezi = await prijaviKodom();
      povezi.flush({ reason: PORUKA_410 }, greska(410, 'Gone'));
      await stabilno();
      expect(naslov()).toBe('Povezivanje nije uspelo');
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(PORUKA_410);
    });

    it('povezi 410 bez tela: isti tekst kao server', async () => {
      await otvoriTok();
      const povezi = await prijaviKodom();
      povezi.flush(null, greska(410, 'Gone'));
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(PORUKA_410);
    });

    it('povezi 401 (sesije studenta nema): nazad na indeks sa porukom', async () => {
      await otvoriTok();
      const povezi = await prijaviKodom();
      povezi.flush({ reason: 'Potrebna je prijava.' }, greska(401, 'Unauthorized'));
      await stabilno();
      expect(polje('indeks')).not.toBeNull();
      expect(banner()).toBe('Prijava na ovom uređaju je istekla. Prijavi se ponovo kodom sa mejla.');
    });

    it('povezi bez mreže: prijavljen ostaje, ekran "Poveži" sa greškom; "Poveži" ponovo uspeva', async () => {
      await otvoriTok();
      const povezi = await prijaviKodom();
      povezi.error(new ProgressEvent('error'));
      await stabilno();
      http.expectOne(JA).flush(JA_ODGOVOR);
      await stabilno();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(banner()).toBe('Nema veze sa serverom.');
      dugme('Poveži')!.click();
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('već prijavljen: ime i indeks, bez automatskog povezivanja; "Poveži" -> povezan', async () => {
      await otvoriTok(true);
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(el().textContent).toContain('Na ovom uređaju si prijavljen kao Ana Primerović (GD12).');
      http.expectNone(POVEZI);
      dugme('Poveži')!.click();
      fixture.detectChanges();
      expect(dugme('Poveži')!.disabled).toBe(true);
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('već prijavljen, "Drugi indeks": korak indeksa, posle prijave povezi', async () => {
      await otvoriTok(true);
      dugme('Drugi indeks')!.click();
      await stabilno();
      expect(polje('indeks')).not.toBeNull();
      const povezi = await prijaviKodom();
      povezi.flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('stanje kaže prijavljen, ali GET ja 401: korak indeksa', async () => {
      await otvori();
      http.expectOne(STANJE).flush({ prijavljen: true });
      http.expectOne(JA).flush({ reason: 'Potrebna je prijava.' }, greska(401, 'Unauthorized'));
      await stabilno();
      expect(polje('indeks')).not.toBeNull();
    });

    it('mreža ne radi pri učitavanju: poruka i "Pokušaj ponovo"', async () => {
      await otvori();
      http.expectOne(STANJE).error(new ProgressEvent('error'));
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Nema veze sa serverom.');
      dugme('Pokušaj ponovo')!.click();
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
      expect(polje('indeks')).not.toBeNull();
    });
  });

  describe('nazad posle povezivanja', () => {
    it('javna ruta (uzivo/ABC123): "Nastavi" vodi tamo, bez automatskog skoka', async () => {
      await otvoriTok(true, 'uzivo/ABC123');
      dugme('Poveži')!.click();
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(navigacija).not.toHaveBeenCalled();
      dugme('Nastavi')!.click();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo/ABC123');
    });

    it.each(['predavanja/3', '//evil.example.test', 'nalog/moodle', 'nalog/moodle?greska=x'])(
      'nazad=%s (nastavnička, spoljna ili ista stranica): bez "Nastavi"',
      async nazad => {
        await otvoriTok(true, nazad);
        dugme('Poveži')!.click();
        http.expectOne(POVEZI).flush(null, bezSadrzaja);
        await stabilno();
        expect(dugme('Nastavi')).toBeUndefined();
        expect(link('Otvori nalog')).toBeDefined();
      },
    );
  });
});
