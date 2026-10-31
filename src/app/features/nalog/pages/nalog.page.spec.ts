import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tekucaSkolska } from '../../../shared/util/indeks';
import type { StudentJa } from '../data-access/nalog.models';
import { NALOG_POCETNA, NalogPage } from './nalog.page';

const STANJE = 'api/public/nalog/stanje';
const JA = 'api/public/nalog/ja';
const KOD = 'api/public/nalog/kod';
const PRIJAVA = 'api/public/nalog/prijava';
const POMOC = 'api/public/nalog/pomoc';

const JA_ODGOVOR: StudentJa = {
  indeks: 'GD12',
  ime: 'Ana',
  prezime: 'Primerović',
  maskaMejla: 'a***@example.test',
  moodlePovezan: false,
  uredjaji: [
    { id: 1, opis: 'Android · Chrome', nacin: 'KOD', prviUlaz: '2026-10-01T10:00:00', poslednjiUlaz: '2026-10-19T08:30:00', trenutni: true },
    { id: 2, opis: 'Windows · Firefox', nacin: 'LTI', prviUlaz: '2026-09-20T12:00:00', poslednjiUlaz: '2026-10-02T09:15:00', trenutni: false },
  ],
};

/** Predlog godine bez `?godina=`: početna godina tekuće školske godine. */
const G = tekucaSkolska();

const greska = (status: number, statusText: string) => ({ status, statusText });

/** Tab Početna sa zamenom `/nalog` u istoriji: kuda ide prijavljen student bez (bezbednog) `nazad` (spec studentskog dela 12.1). */
const NA_CAS = [NALOG_POCETNA, { replaceUrl: true }] as const;

/**
 * Prijava studenta (spec prijave 5.1): indeks -> kod na mejl -> prijavljen na ovom telefonu; posle prijave `nazad` (samo
 * bezbedna relativna putanja) ili tab Početna. Stranica zove samo `api/public/nalog/*`; nalog i odjava su na tabu Ja (`ja.page.spec`).
 */
describe('NalogPage', () => {
  let fixture: ComponentFixture<NalogPage>;
  let http: HttpTestingController;
  let navigacija: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith(tekst));
  const polje = (ime: string) => el().querySelector<HTMLInputElement>(`input[name="${ime}"]`)!;
  const banner = () => el().querySelector('app-form-error-banner [role="alert"]')?.textContent?.trim() ?? null;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvoriStranu(nazad: string | null = null, prijavljen = false): Promise<void> {
    fixture = TestBed.createComponent(NalogPage);
    fixture.componentRef.setInput('nazad', nazad);
    fixture.detectChanges();
    http.expectOne(STANJE).flush({ prijavljen });
    // `GET ja` samo kad je student već prijavljen i ima bezbedan `nazad` (ime uz "Nastavi")
    http.match(JA).forEach(r => r.flush(JA_ODGOVOR));
    await stabilno();
  }

  function upisi(ime: string, vrednost: string): void {
    polje(ime).value = vrednost;
    polje(ime).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function doKoda(indeks = '12'): Promise<void> {
    upisi('broj-indeksa', indeks);
    dugme('Pošalji kod')!.click();
    http.expectOne(KOD).flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'n***@example.test' });
    await stabilno();
  }

  async function prijaviKodom(kod = '123456'): Promise<void> {
    upisi('kod', kod);
    dugme('Prijavi se')!.click();
    fixture.detectChanges();
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

  describe('prvo učitavanje', () => {
    it('nije prijavljen: GET stanje, pa ekran indeksa (bez GET ja)', async () => {
      await otvoriStranu();
      expect(polje('broj-indeksa')).not.toBeNull();
      expect(dugme('Pošalji kod')).toBeDefined();
      http.expectNone(JA);
    });

    it('prijavljen bez nazad: GET stanje, pa tab Početna umesto /nalog u istoriji (bez GET ja)', async () => {
      await otvoriStranu(null, true);
      expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
      http.expectNone(JA);
    });

    it('prijavljen, ali navigacija na tab Početna ne uspe (lenji chunk bez mreže): poruka i "Pokušaj ponovo"', async () => {
      navigacija.mockResolvedValue(false);
      await otvoriStranu(null, true);
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Stranica nije učitana.');
      expect(dugme('Pokušaj ponovo')).toBeDefined();
      http.expectNone(JA);
    });

    it('poruka posle odjave (tab Ja šalje `info` kroz stanje istorije) stoji iznad indeksa', async () => {
      vi.spyOn(TestBed.inject(Location), 'getState').mockReturnValue({ info: 'Odjavljen si sa ovog uređaja.' });
      await otvoriStranu();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Odjavljen si sa ovog uređaja.');
      expect(polje('broj-indeksa').value).toBe('');
    });

    it('prijavljen sa nazad, ali GET ja 401 (sesija istekla u međuvremenu): ekran indeksa', async () => {
      fixture = TestBed.createComponent(NalogPage);
      fixture.componentRef.setInput('nazad', 'uzivo/ABC123');
      fixture.detectChanges();
      http.expectOne(STANJE).flush({ prijavljen: true });
      http.expectOne(JA).flush({ reason: 'Potrebna je prijava.' }, greska(401, 'Unauthorized'));
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
    });

    it('mreža ne radi: poruka i "Pokušaj ponovo" ponovo pita stanje', async () => {
      fixture = TestBed.createComponent(NalogPage);
      fixture.detectChanges();
      http.expectOne(STANJE).error(new ProgressEvent('error'));
      await stabilno();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Nema veze sa serverom.');
      dugme('Pokušaj ponovo')!.click();
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
    });
  });

  describe('indeks', () => {
    it('prazno: poruka ispod polja, bez zahteva', async () => {
      await otvoriStranu();
      dugme('Pošalji kod')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('Unesi broj indeksa.');
      http.expectNone(KOD);
    });

    it('"Pošalji kod": normalizovan indeks, pa ekran koda sa maskom i tekstom servera', async () => {
      await otvoriStranu();
      upisi('broj-indeksa', ' 012 ');
      dugme('Pošalji kod')!.click();
      const req = http.expectOne(KOD);
      expect(req.request.body).toEqual({ indeks: 'GD12', godina: G });
      req.flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: 'n***@example.test' });
      await stabilno();
      expect(el().textContent).toContain('Ako nalog postoji, kod je poslat.');
      expect(el().textContent).toContain('n***@example.test');
      expect(polje('kod')).not.toBeNull();
      expect(polje('kod').getAttribute('inputmode')).toBe('numeric');
      expect(polje('kod').getAttribute('autocomplete')).toBe('one-time-code');
    });

    it.each([
      [429, 'Too Many Requests', 'Previše pokušaja. Pokušaj ponovo kasnije.'],
      [503, 'Service Unavailable', 'Slanje koda trenutno nije moguće. Javi se nastavniku.'],
    ])('POST kod %i: tekst servera doslovno, ostaje na indeksu', async (status, statusText, reason) => {
      await otvoriStranu();
      upisi('broj-indeksa', '12');
      dugme('Pošalji kod')!.click();
      http.expectOne(KOD).flush({ reason }, greska(status, statusText));
      await stabilno();
      expect(banner()).toBe(reason);
      expect(polje('broj-indeksa')).not.toBeNull();
    });

    it('5xx bez poruke i mreža: opšti tekst', async () => {
      await otvoriStranu();
      upisi('broj-indeksa', '12');
      dugme('Pošalji kod')!.click();
      http.expectOne(KOD).flush('x', greska(500, 'Server Error'));
      await stabilno();
      expect(banner()).toBe('Sistemska greška. Pokušaj ponovo.');
      dugme('Pošalji kod')!.click();
      http.expectOne(KOD).error(new ProgressEvent('error'));
      await stabilno();
      expect(banner()).toBe('Nema veze sa serverom.');
    });
  });

  describe('kod', () => {
    it.each([
      [401, 'Unauthorized', 'Kod nije ispravan ili je istekao.'],
      [429, 'Too Many Requests', 'Previše pokušaja. Pokušaj ponovo kasnije.'],
    ])('POST prijava %i: tekst servera doslovno, ostaje na kodu', async (status, statusText, reason) => {
      await otvoriStranu();
      await doKoda();
      await prijaviKodom();
      const req = http.expectOne(PRIJAVA);
      expect(req.request.body).toEqual({ indeks: 'GD12', godina: G, kod: '123456' });
      req.flush({ reason }, greska(status, statusText));
      await stabilno();
      expect(banner()).toBe(reason);
      expect(polje('kod')).not.toBeNull();
      expect(navigacija).not.toHaveBeenCalled();
    });

    it('"Ne stiže mi kod": POST pomoc sa indeksom, pa "Javili smo nastavniku."', async () => {
      await otvoriStranu();
      await doKoda();
      dugme('Ne stiže mi kod')!.click();
      const req = http.expectOne(POMOC);
      expect(req.request.body).toEqual({ indeks: 'GD12', godina: G });
      req.flush({ poruka: 'Javili smo nastavniku.' });
      await stabilno();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Javili smo nastavniku.');
    });

    it('"Ne stiže mi kod" 429: tekst servera', async () => {
      await otvoriStranu();
      await doKoda();
      dugme('Ne stiže mi kod')!.click();
      http.expectOne(POMOC).flush({ reason: 'Previše pokušaja. Pokušaj ponovo kasnije.' }, greska(429, 'Too Many Requests'));
      await stabilno();
      expect(banner()).toBe('Previše pokušaja. Pokušaj ponovo kasnije.');
    });

    it('"Drugi indeks" vraća na indeks sa istim indeksom', async () => {
      await otvoriStranu();
      await doKoda();
      dugme('Drugi indeks')!.click();
      await stabilno();
      expect(polje('broj-indeksa').value).toBe('12');
      expect(polje('godina-upisa').value).toBe(String(G));
    });
  });

  describe('posle prijave', () => {
    it('nazad=uzivo/ABC123: navigateByUrl(uzivo/ABC123), bez ekrana naloga', async () => {
      await otvoriStranu('uzivo/ABC123');
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo/ABC123');
      http.expectNone(JA);
    });

    it('nazad=uzivo/123456 (bodovan run, slajd Zadatak): navigateByUrl(uzivo/123456)', async () => {
      await otvoriStranu('uzivo/123456');
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo/123456');
    });

    it('dupli dodir: dok navigacija na nazad traje, "Prijavi se" je onemogućen i druga prijava ne ide', async () => {
      let zavrsi!: (ok: boolean) => void;
      navigacija.mockReturnValue(new Promise<boolean>(r => (zavrsi = r)));
      await otvoriStranu('uzivo/123456');
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(dugme('Prijavi se')!.disabled).toBe(true);
      await prijaviKodom();
      http.expectNone(PRIJAVA);
      // navigacija nije uspela (npr. lenji chunk): dugme ponovo radi
      zavrsi(false);
      await stabilno();
      expect(dugme('Prijavi se')!.disabled).toBe(false);
    });

    it('bez nazad: posle prijave tab Početna (zamena u istoriji), bez GET ja', async () => {
      await otvoriStranu();
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
      http.expectNone(JA);
    });

    it('dupli dodir bez nazad: dok navigacija na tab Početna traje, "Prijavi se" je onemogućen i druga prijava ne ide', async () => {
      let zavrsi!: (ok: boolean) => void;
      navigacija.mockReturnValue(new Promise<boolean>(r => (zavrsi = r)));
      await otvoriStranu();
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(dugme('Prijavi se')!.disabled).toBe(true);
      await prijaviKodom();
      http.expectNone(PRIJAVA);
      zavrsi(false);
      await stabilno();
      expect(dugme('Prijavi se')!.disabled).toBe(false);
    });

    it.each(['//evil.com', 'https://x', '/\\evil', 'javascript:alert(1)', '../x'])(
      'nazad=%s se ignoriše (Review Focus 4): posle prijave tab Početna',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
        http.expectNone(JA);
      },
    );

    it.each(['predavanja/3', 'studenti/1/pregled', 'prijava?nazad=uzivo', 'nalozi'])(
      'nazad=%s (nastavnička ruta) se ignoriše kao da ga nema: posle prijave tab Početna',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
        http.expectNone(JA);
      },
    );

    it('već prijavljen sa nazad na nastavničku rutu: tab Početna, bez "Nastavi"', async () => {
      await otvoriStranu('predavanja/3', true);
      expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
      http.expectNone(JA);
    });

    it.each(['upis/tok_en', 'nalog/moodle'])('nazad=%s (javna ruta) posle prijave: navigateByUrl', async nazad => {
      await otvoriStranu(nazad);
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith(nazad);
    });

    it.each(['nalog', 'nalog/', 'nalog?x=1'])(
      'nazad=%s (ista stranica): posle prijave tab Početna',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
        http.expectNone(JA);
      },
    );

    it('već prijavljen sa bezbednim nazad: ime (GET ja) i "Nastavi" vodi tamo (bez automatskog skoka)', async () => {
      await otvoriStranu('uzivo/ABC123', true);
      expect(navigacija).not.toHaveBeenCalled();
      expect(el().querySelector('h2')?.textContent).toBe('Prijavljen si');
      expect(el().querySelector('[data-prijavljen]')?.textContent).toContain('Ana Primerović');
      expect(el().querySelector('a[href="/nalog/pocetna"]')?.textContent).toContain('Moj nalog');
      dugme('Nastavi')!.click();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo/ABC123');
    });
  });

  describe('godina upisa i kod od nastavnika', () => {
    async function otvoriSaGodinom(godina: string): Promise<void> {
      fixture = TestBed.createComponent(NalogPage);
      fixture.componentRef.setInput('godina', godina);
      fixture.detectChanges();
      http.expectOne(STANJE).flush({ prijavljen: false });
      await stabilno();
    }

    it('?godina= iz Uživo predlaže godinu; student je menja i ona ide u zahtev', async () => {
      await otvoriSaGodinom('2025');
      expect(polje('godina-upisa').value).toBe('2025');
      expect(el().textContent).toContain('Godina grupe sa časa');
      upisi('broj-indeksa', '7');
      upisi('godina-upisa', '2024');
      dugme('Pošalji kod')!.click();
      const req = http.expectOne(KOD);
      expect(req.request.body).toEqual({ indeks: 'GD7', godina: 2024 });
      req.flush({ poruka: 'Ako nalog postoji, kod je poslat.', maska: null });
      await stabilno();
    });

    it('neispravna ?godina= se ignoriše: predlog je tekuća školska godina', async () => {
      for (const g of ['20x5', '1999', '12345', '3000']) {
        await otvoriSaGodinom(g);
        expect(polje('godina-upisa').value, g).toBe(String(G));
        fixture.destroy();
      }
    });

    it('"Imam kod od nastavnika": korak koda bez slanja mejla, prijava sa indeksom i godinom', async () => {
      await otvoriStranu();
      upisi('broj-indeksa', '12');
      dugme('Imam kod od nastavnika')!.click();
      await stabilno();
      http.expectNone(KOD);
      expect(el().textContent).toContain('Kod od nastavnika');
      expect(el().textContent).not.toContain('Ne stiže mi kod');
      upisi('kod', '654321');
      dugme('Prijavi se')!.click();
      const req = http.expectOne(PRIJAVA);
      expect(req.request.body).toEqual({ indeks: 'GD12', godina: G, kod: '654321' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith(...NA_CAS);
    });

    it('"Imam kod od nastavnika" bez broja indeksa: poruka ispod polja, ostaje na indeksu', async () => {
      await otvoriStranu();
      dugme('Imam kod od nastavnika')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('Unesi broj indeksa.');
      expect(polje('kod')).toBeNull();
    });
  });
});
