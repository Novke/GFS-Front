import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tekucaSkolska } from '../../../shared/util/indeks';
import type { StudentJa } from '../data-access/nalog.models';
import { MoodlePage } from './moodle.page';

/** Predlog godine upisa na /nalog/moodle: početna godina tekuće školske godine. */
const G = tekucaSkolska();

const STANJE = 'api/public/nalog/stanje';
const JA = 'api/public/nalog/ja';
const KOD = 'api/public/nalog/kod';
const PRIJAVA = 'api/public/nalog/prijava';
const POVEZI = 'api/public/lti/povezi';
const POVEZIVANJE = 'api/public/lti/povezivanje';
const ODJAVA = 'api/public/nalog/odjava';

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

  /** Prvi zahtev toka uparivanja: ime Moodle naloga iz ulaska (`null` = Moodle ga nije podelio). */
  async function imeMoodla(ime: string | null = 'Pera Test'): Promise<void> {
    http.expectOne(POVEZIVANJE).flush({ ime });
    await stabilno();
  }

  async function otvoriTok(prijavljen = false, nazad?: string, ime: string | null = 'Pera Test'): Promise<void> {
    await otvori(nazad === undefined ? {} : { nazad });
    await imeMoodla(ime);
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

  /** Indeks -> kod -> 204 prijave -> `GET ja` -> korak "potvrda" (nikad automatsko povezivanje, R19). */
  async function prijaviKodomDoPotvrde(): Promise<void> {
    upisi('broj-indeksa', '12');
    dugme('Pošalji kod')!.click();
    http.expectOne(KOD).flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'a***@example.test' });
    await stabilno();
    expect(naslov()).toBe('Unesi kod');
    upisi('kod', '123456');
    dugme('Prijavi se')!.click();
    const prijava = http.expectOne(PRIJAVA);
    expect(prijava.request.body).toEqual({ indeks: 'GD12', godina: G, kod: '123456' });
    prijava.flush(null, bezSadrzaja);
    await stabilno();
    http.expectNone(POVEZI);
    http.expectOne(JA).flush(JA_ODGOVOR);
    await stabilno();
    http.expectNone(POVEZI);
    expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
    expect(dugme('Poveži')).toBeDefined();
  }

  /** Posle koda i potvrde: klik na "Poveži"; vraća zahtev `povezi` (još bez odgovora). */
  async function prijaviKodom() {
    await prijaviKodomDoPotvrde();
    dugme('Poveži')!.click();
    fixture.detectChanges();
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
          'Otvori GFS ovde i prijavi se kodom sa mejla, ili otvori Moodle u drugom pregledaču.',
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
      expect(el().querySelector('h1')?.textContent?.trim()).toBe('GFS i Moodle');
      expect(polje('broj-indeksa')).toBeNull();
      http.expectNone(() => true);
    });

    it('druga vrednost (uloga=student) je običan tok uparivanja', async () => {
      await otvori({ uloga: 'student' });
      await imeMoodla();
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
    });
  });

  describe('uparivanje (bez parametara)', () => {
    it('nije prijavljen: naslov i objašnjenje, pa indeks -> kod -> povezi -> "Moodle nalog je povezan"', async () => {
      await otvoriTok();
      expect(el().querySelector('h1')?.textContent?.trim()).toBe('Nalog studenta');
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(el().textContent).toContain('prijavi se jednom kodom sa mejla');
      expect(polje('broj-indeksa')).not.toBeNull();
      http.expectNone(POVEZI);

      const povezi = await prijaviKodom();
      povezi.flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
      expect(el().textContent).toContain('Sledeći put iz Moodle-a ulaziš jednim klikom, bez koda.');
      expect(link('Otvori nalog')?.getAttribute('href')).toBe('/nalog/ja');
      expect(dugme('Nastavi')).toBeUndefined();
      expect(navigacija).not.toHaveBeenCalled();
    });

    it('posle koda sa imenom iz Moodle-a: potvrda sa oba imena, nema POST povezi; Poveži -> povezan', async () => {
      await otvoriTok();
      await prijaviKodomDoPotvrde();
      expect(el().textContent).toContain('GFS nalog: Ana Primerović (GD12)');
      expect(el().textContent).toContain('Moodle nalog: Pera Test');
      expect(el().textContent).not.toContain('Moodle nije poslao ime naloga.');
      http.expectNone(POVEZI);
      dugme('Poveži')!.click();
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('posle koda bez imena: potvrda sa tekstom "Moodle nije poslao ime naloga…", nema POST povezi; Poveži -> povezan', async () => {
      await otvoriTok(false, undefined, null);
      await prijaviKodomDoPotvrde();
      expect(el().textContent).toContain(
        'Moodle nije poslao ime naloga. Poveži samo ako je Moodle na ovom računaru otvoren pod tvojim nalogom.',
      );
      expect(el().textContent).not.toContain('Moodle nalog:');
      http.expectNone(POVEZI);
      dugme('Poveži')!.click();
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('"Poveži" upućuje (aria-describedby) na upozorenje i na prikaz naloga; nalozi su grupa sa nazivom', async () => {
      await otvoriTok(true);
      const opis = dugme('Poveži')!.getAttribute('aria-describedby')!.split(' ');
      expect(opis.length).toBe(2);
      for (const id of opis) {
        expect(el().querySelector(`#${id}`)).not.toBeNull();
      }
      expect(el().querySelector(`#${opis[0]}`)?.textContent).toContain('Ako ovo nisi ti');
      const nalozi = el().querySelector(`#${opis[1]}`)!;
      expect(nalozi.getAttribute('role')).toBe('group');
      expect(nalozi.getAttribute('aria-label')).toBe('Nalozi koji se povezuju');
    });

    it('bez imena iz Moodle-a: "Poveži" upućuje i na tekst o imenu koje nije stiglo', async () => {
      await otvoriTok(true, undefined, null);
      const opis = dugme('Poveži')!.getAttribute('aria-describedby')!.split(' ');
      const tekstovi = opis.map(id => el().querySelector(`#${id}`)?.textContent ?? '');
      expect(tekstovi.some(t => t.includes('Moodle nije poslao ime naloga.'))).toBe(true);
    });

    /** Indeks -> kod -> 204 prijave; `GET ja` ostaje bez odgovora (vraća ga). */
    async function prijavaBezJa() {
      upisi('broj-indeksa', '12');
      dugme('Pošalji kod')!.click();
      http.expectOne(KOD).flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'a***@example.test' });
      await stabilno();
      upisi('kod', '123456');
      dugme('Prijavi se')!.click();
      http.expectOne(PRIJAVA).flush(null, bezSadrzaja);
      await stabilno();
      return http.expectOne(JA);
    }

    it('dupli dodir: posle 204 prijave, dok GET ja ne stigne, "Prijavi se" je onemogućen i druga prijava ne ide', async () => {
      await otvoriTok();
      const ja = await prijavaBezJa();
      expect(naslov()).toBe('Unesi kod');
      expect(dugme('Prijavi se')!.disabled).toBe(true);
      upisi('kod', '123456');
      dugme('Prijavi se')!.click();
      fixture.detectChanges();
      http.expectNone(PRIJAVA);
      ja.flush(JA_ODGOVOR);
      await stabilno();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(dugme('Poveži')!.disabled).toBe(false);
      http.expectNone(POVEZI);
    });

    it('posle 204 prijave GET ja 401: indeks, "Pošalji kod" ponovo radi', async () => {
      await otvoriTok();
      const ja = await prijavaBezJa();
      ja.flush(null, greska(401, 'Unauthorized'));
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
      expect(dugme('Pošalji kod')!.disabled).toBe(false);
    });

    it('posle 204 prijave GET ja bez mreže: poruka i "Pokušaj ponovo", slanje nije zaglavljeno', async () => {
      await otvoriTok();
      const ja = await prijavaBezJa();
      ja.error(new ProgressEvent('error'));
      await stabilno();
      const ponovo = dugme('Pokušaj ponovo')!;
      expect(ponovo.disabled).toBe(false);
      ponovo.click();
      await imeMoodla();
      http.expectOne(STANJE).flush({ prijavljen: true });
      http.expectOne(JA).flush(JA_ODGOVOR);
      await stabilno();
      expect(dugme('Poveži')!.disabled).toBe(false);
    });

    it('pogrešan kod: tekst servera, ostaje na kodu, bez povezi', async () => {
      await otvoriTok();
      upisi('broj-indeksa', '12');
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
      expect(polje('broj-indeksa')).not.toBeNull();
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
      expect(el().textContent).toContain('GFS nalog: Ana Primerović (GD12)');
      expect(el().textContent).toContain('Moodle nalog: Pera Test');
      expect(el().textContent).toContain('Ako ovo nisi ti, izaberi „Drugi indeks“.');
      http.expectNone(POVEZI);
      dugme('Poveži')!.click();
      fixture.detectChanges();
      expect(dugme('Poveži')!.disabled).toBe(true);
      http.expectOne(POVEZI).flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('već prijavljen, "Drugi indeks": odjava uređaja, prazno polje indeksa, posle prijave povezi', async () => {
      await otvoriTok(true);
      expect(dugme('Drugi indeks')).toBeDefined();
      dugme('Drugi indeks')!.click();
      const odjava = http.expectOne(ODJAVA);
      expect(odjava.request.method).toBe('POST');
      odjava.flush(null, bezSadrzaja);
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
      expect(polje('broj-indeksa')!.value).toBe('');
      const povezi = await prijaviKodom();
      povezi.flush(null, bezSadrzaja);
      await stabilno();
      expect(naslov()).toBe('Moodle nalog je povezan');
    });

    it('"Drugi indeks": greška odjave se ignoriše, polje je prazno', async () => {
      await otvoriTok(true);
      dugme('Drugi indeks')!.click();
      http.expectOne(ODJAVA).error(new ProgressEvent('error'));
      await stabilno();
      expect(polje('broj-indeksa')!.value).toBe('');
      expect(banner()).toBeNull();
    });

    it('Moodle nije podelio ime: potvrda bez reda "Moodle nalog"', async () => {
      await otvoriTok(true, undefined, null);
      expect(el().textContent).toContain('GFS nalog: Ana Primerović (GD12)');
      expect(el().textContent).not.toContain('Moodle nalog:');
      expect(el().textContent).toContain('Moodle nije poslao ime naloga.');
    });

    it.each([
      ['mreža (status 0)', () => new ProgressEvent('error'), 0],
      ['404 (backend tačku još nema)', () => ({ reason: 'x' }), 404],
      ['500', () => ({ reason: 'x' }), 500],
    ] as const)('GET povezivanje, %s: uparivanje ide dalje na GET stanje, bez imena', async (_naziv, telo, status) => {
      await otvori();
      const zahtev = http.expectOne(POVEZIVANJE);
      if (status === 0) {
        zahtev.error(telo() as ProgressEvent);
      } else {
        zahtev.flush(telo(), greska(status, 'Greška'));
      }
      await stabilno();
      http.expectOne(STANJE).flush({ prijavljen: true });
      http.expectOne(JA).flush(JA_ODGOVOR);
      await stabilno();
      expect(naslov()).toBe('Poveži Moodle nalog sa GFS-om');
      expect(el().textContent).toContain('GFS nalog: Ana Primerović (GD12)');
      expect(el().textContent).not.toContain('Moodle nalog:');
      expect(dugme('Poveži')).toBeDefined();
    });

    it('GET povezivanje 410: tekst servera, bez uparivanja i bez daljih zahteva', async () => {
      await otvori();
      http.expectOne(POVEZIVANJE).flush({ reason: PORUKA_410 }, greska(410, 'Gone'));
      await stabilno();
      expect(naslov()).toBe('Povezivanje nije uspelo');
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(PORUKA_410);
      expect(link('Otvori GFS')?.getAttribute('href')).toBe('/nalog');
      expect(dugme('Poveži')).toBeUndefined();
      http.expectNone(() => true);
    });

    it('GET povezivanje 410 bez tela: isti tekst kao server', async () => {
      await otvori();
      http.expectOne(POVEZIVANJE).flush(null, greska(410, 'Gone'));
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe(PORUKA_410);
    });

    it('stanje kaže prijavljen, ali GET ja 401: korak indeksa', async () => {
      await otvori();
      await imeMoodla();
      http.expectOne(STANJE).flush({ prijavljen: true });
      http.expectOne(JA).flush({ reason: 'Potrebna je prijava.' }, greska(401, 'Unauthorized'));
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
    });

    it('mreža ne radi pri učitavanju: poruka i "Pokušaj ponovo"', async () => {
      await otvori();
      await imeMoodla();
      http.expectOne(STANJE).error(new ProgressEvent('error'));
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Nema veze sa serverom.');
      dugme('Pokušaj ponovo')!.click();
      await imeMoodla();
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
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
