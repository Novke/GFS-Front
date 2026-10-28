import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tekucaSkolska } from '../../../shared/util/indeks';
import type { StudentJa } from '../data-access/nalog.models';
import { NalogPage } from './nalog.page';

const STANJE = 'api/public/nalog/stanje';
const JA = 'api/public/nalog/ja';
const KOD = 'api/public/nalog/kod';
const PRIJAVA = 'api/public/nalog/prijava';
const POMOC = 'api/public/nalog/pomoc';
const CAS = 'api/public/nalog/cas';

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

/**
 * Javni nalog studenta (spec prijave 5.1): indeks -> kod na mejl -> prijavljen na ovom telefonu; posle prijave `nazad`
 * (samo bezbedna relativna putanja) ili ekran naloga. Stranica zove samo `api/public/nalog/*`.
 */
describe('NalogPage', () => {
  let fixture: ComponentFixture<NalogPage>;
  let http: HttpTestingController;
  let navigacija: ReturnType<typeof vi.spyOn>;
  let otvori: ReturnType<typeof vi.fn>;
  let potvrda: boolean;

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
    if (prijavljen) {
      http.expectOne(JA).flush(JA_ODGOVOR);
    }
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
    potvrda = true;
    otvori = vi.fn(() => ({ afterClosed: () => of(potvrda) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: otvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    // kartica "Na času si" (tiho, posle `GET ja`): testovi koji je ne gledaju odgovaraju "nisi na času"
    http.match(CAS).forEach(r => r.flush({ predavanje: null, cekiranU: null, izvodjenje: null }));
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

    it('prijavljen: GET stanje i GET ja, pa ekran naloga', async () => {
      await otvoriStranu(null, true);
      const tekst = el().textContent!;
      expect(tekst).toContain('GD12');
      expect(tekst).toContain('Ana Primerović');
      expect(tekst).toContain('a***@example.test');
      expect(tekst).toContain('Android · Chrome');
      expect(tekst).toContain('Windows · Firefox');
      expect(tekst).toContain('Ovaj uređaj');
      expect(dugme('Odjavi se')).toBeDefined();
      expect(dugme('Odjavi sve uređaje')).toBeDefined();
    });

    it('prijavljen i čekiran na času koji traje: kartica "Na času si" sa "Nastavi" na nalog/cas', async () => {
      await otvoriStranu(null, true);
      expect(el().querySelector('[data-na-casu-kartica]')).toBeNull();
      http.expectOne(CAS).flush({
        predavanje: { id: 17, predmet: 'Uvod u primenu računara', datum: '2026-10-28', rb: 3, tema: null, zavrseno: false },
        cekiranU: '2026-10-28T10:00:00',
      });
      await stabilno();
      const kartica = el().querySelector('[data-na-casu-kartica]');
      expect(kartica?.textContent).toContain('Na času si');
      expect(kartica?.textContent).toContain('Uvod u primenu računara · sreda 28.10.');
      expect(kartica?.querySelector('a')?.getAttribute('href')).toBe('/nalog/cas');
    });

    it('završen čas i greška: bez kartice', async () => {
      await otvoriStranu(null, true);
      http.expectOne(CAS).flush({ predavanje: { id: 17, predmet: 'X', datum: '2026-10-28', rb: 3, tema: null, zavrseno: true } });
      await stabilno();
      expect(el().querySelector('[data-na-casu-kartica]')).toBeNull();
    });

    it('prijavljen, ali GET ja 401 (sesija istekla u međuvremenu): ekran indeksa', async () => {
      fixture = TestBed.createComponent(NalogPage);
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

    it('dupli dodir bez nazad: dok GET ja ne stigne, "Prijavi se" je onemogućen i druga prijava ne ide', async () => {
      await otvoriStranu();
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      const ja = http.expectOne(JA);
      expect(dugme('Prijavi se')!.disabled).toBe(true);
      await prijaviKodom();
      http.expectNone(PRIJAVA);
      ja.flush(JA_ODGOVOR);
      await stabilno();
      expect(el().textContent).toContain('Ana Primerović');
    });

    it('bez nazad, GET ja 401 posle prijave: indeks, "Pošalji kod" ponovo radi', async () => {
      await otvoriStranu();
      await doKoda();
      await prijaviKodom();
      http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      http.expectOne(JA).flush(null, greska(401, 'Unauthorized'));
      await stabilno();
      expect(dugme('Pošalji kod')!.disabled).toBe(false);
    });

    it.each(['//evil.com', 'https://x', '/\\evil', 'javascript:alert(1)', '../x'])(
      'nazad=%s se ignoriše (Review Focus 4): ekran naloga, bez navigacije',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        http.expectOne(JA).flush(JA_ODGOVOR);
        await stabilno();
        expect(navigacija).not.toHaveBeenCalled();
        expect(el().textContent).toContain('Ana Primerović');
        expect(dugme('Nastavi')).toBeUndefined();
      },
    );

    it.each(['predavanja/3', 'studenti/1/pregled', 'prijava?nazad=uzivo', 'nalozi'])(
      'nazad=%s (nastavnička ruta) se ignoriše kao da ga nema: ekran naloga, bez navigacije',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        http.expectOne(JA).flush(JA_ODGOVOR);
        await stabilno();
        expect(navigacija).not.toHaveBeenCalled();
        expect(el().textContent).toContain('Ana Primerović');
        expect(dugme('Nastavi')).toBeUndefined();
      },
    );

    it('već prijavljen sa nazad na nastavničku rutu: bez "Nastavi"', async () => {
      await otvoriStranu('predavanja/3', true);
      expect(dugme('Nastavi')).toBeUndefined();
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
      'nazad=%s (ista stranica): posle prijave ekran naloga (GET ja), bez navigacije i bez "Nastavi"',
      async nazad => {
        await otvoriStranu(nazad);
        await doKoda();
        await prijaviKodom();
        http.expectOne(PRIJAVA).flush(null, { status: 204, statusText: 'No Content' });
        await stabilno();
        http.expectOne(JA).flush(JA_ODGOVOR);
        await stabilno();
        expect(navigacija).not.toHaveBeenCalled();
        expect(el().querySelector('h2')?.textContent).toBe('Prijavljen si');
        expect(dugme('Nastavi')).toBeUndefined();
      },
    );

    it('već prijavljen sa bezbednim nazad: "Nastavi" vodi tamo (bez automatskog skoka)', async () => {
      await otvoriStranu('uzivo/ABC123', true);
      expect(navigacija).not.toHaveBeenCalled();
      dugme('Nastavi')!.click();
      expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo/ABC123');
    });
  });

  describe('prijavljen', () => {
    it('"Odjavi se": POST odjava, pa ekran indeksa', async () => {
      await otvoriStranu(null, true);
      dugme('Odjavi se')!.click();
      http.expectOne('api/public/nalog/odjava').flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
    });

    it('"Odjavi sve uređaje": ConfirmDialog (destruktivno), pa POST odjava-svuda i ekran indeksa sa brojem', async () => {
      await otvoriStranu(null, true);
      dugme('Odjavi sve uređaje')!.click();
      expect(otvori).toHaveBeenCalledOnce();
      const cfg = (otvori.mock.calls[0] as unknown[])[1] as { data: { naslov: string; destruktivno: boolean } };
      expect(cfg.data.naslov).toBe('Odjaviti sve uređaje?');
      expect(cfg.data.destruktivno).toBe(true);
      http.expectOne('api/public/nalog/odjava-svuda').flush({ odjavljeno: 2 });
      await stabilno();
      expect(polje('broj-indeksa')).not.toBeNull();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Odjavljeno: 2 uređaja.');
    });

    it('posle "Odjavi se" polje indeksa je prazno (tuđ indeks ne ostaje na zajedničkom računaru)', async () => {
      await otvoriStranu(null, true);
      dugme('Odjavi se')!.click();
      http.expectOne('api/public/nalog/odjava').flush(null, { status: 204, statusText: 'No Content' });
      await stabilno();
      expect(polje('broj-indeksa').value).toBe('');
    });

    it('posle "Odjavi sve uređaje" polje indeksa je prazno', async () => {
      await otvoriStranu(null, true);
      dugme('Odjavi sve uređaje')!.click();
      http.expectOne('api/public/nalog/odjava-svuda').flush({ odjavljeno: 2 });
      await stabilno();
      expect(polje('broj-indeksa').value).toBe('');
    });

    it('drugi klik na "Odjavi sve uređaje" dok je potvrda otvorena ne otvara drugi dijalog', async () => {
      const zatvaranje = new Subject<boolean>();
      otvori.mockImplementation(() => ({ afterClosed: () => zatvaranje }));
      await otvoriStranu(null, true);
      dugme('Odjavi sve uređaje')!.click();
      dugme('Odjavi sve uređaje')!.click();
      expect(otvori).toHaveBeenCalledOnce();
      zatvaranje.next(false);
      zatvaranje.complete();
      dugme('Odjavi sve uređaje')!.click();
      expect(otvori).toHaveBeenCalledTimes(2);
    });

    it('"Odjavi sve uređaje" pa "Odustani": bez zahteva', async () => {
      potvrda = false;
      await otvoriStranu(null, true);
      dugme('Odjavi sve uređaje')!.click();
      http.expectNone('api/public/nalog/odjava-svuda');
      expect(el().textContent).toContain('Ana Primerović');
    });

    it('greška odjave: tekst u baneru, ostaje na nalogu', async () => {
      await otvoriStranu(null, true);
      dugme('Odjavi se')!.click();
      http.expectOne('api/public/nalog/odjava').error(new ProgressEvent('error'));
      await stabilno();
      expect(banner()).toBe('Nema veze sa serverom.');
      expect(el().textContent).toContain('Ana Primerović');
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
      http.expectOne(JA).flush(JA_ODGOVOR);
      await stabilno();
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
