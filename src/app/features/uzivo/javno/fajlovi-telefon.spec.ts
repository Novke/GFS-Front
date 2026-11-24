import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FajlKratko } from '../../../shared/util/fajlovi';
import { ServerskiSat } from '../data-access/sat';
import type { JavnoStanje } from '../data-access/uzivo.models';
import { StudentStore } from './student.store';
import { UzivoStudentPage } from './uzivo-student.page';

const FAJL: FajlKratko = { id: 7, naziv: 'Zadaci.docx', vrsta: 'DOCX', velicina: 20480 };

function stanje(fajlovi?: FajlKratko[]): JavnoStanje {
  return {
    izvodjenjeId: 7, verzija: 4, serverVremeMs: 0, status: 'AKTIVNO', naziv: 'Vežbe', kod: '123456',
    prikaz: 'SLAJD', slajdTip: 'INFO', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false,
    brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, ...(fajlovi ? { fajlovi } : {}),
  } as JavnoStanje;
}

/** Lenji blok fajlova na telefonu uživo (spec fajlova 6): postoji samo kad stanje nosi fajlove; 401 vodi na prijavu. */
describe('UzivoStudentPage: fajlovi uz slajd', () => {
  let fixture: ComponentFixture<UzivoStudentPage>;
  let http: HttpTestingController;
  const javno = signal<JavnoStanje | null>(null);
  const el = () => fixture.nativeElement as HTMLElement;

  async function napravi(j: JavnoStanje): Promise<void> {
    javno.set(j);
    fixture = TestBed.createComponent(UzivoStudentPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    const lazni = {
      faza: signal('uzivo'), ekran: signal('tabla'), javno, licno: signal(null), pitanje: signal(null), sat: signal(new ServerskiSat()),
      ukupnoMs: signal(null), nacrt: signal(null), ishod: signal(null), tacan: signal(null), greska: signal(null), ucesnik: signal(null),
      info: signal(null), kod: signal('123456'), veza: signal('povezan'), salje: signal(false), runda: signal(null),
      zadatak: signal(null), nacrtZadatka: signal(null), otvori: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [UzivoStudentPage],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ kod: '123456' })) } },
      ],
    });
    TestBed.overrideComponent(UzivoStudentPage, { set: { providers: [{ provide: StudentStore, useValue: lazni }] } });
    await TestBed.compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('bez fajlova u stanju nema bloka (ni polja ni praznog polja)', async () => {
    await napravi(stanje());
    expect(el().querySelector('app-fajlovi-telefon')).toBeNull();
    fixture.destroy();
    await napravi(stanje([]));
    expect(el().querySelector('app-fajlovi-telefon')).toBeNull();
  });

  it('sa fajlovima: lenji blok, samo „Pošalji mi na mejl” (bez Preuzmi); poruka sa maskom', async () => {
    await napravi(stanje([FAJL]));
    const blok = el().querySelector('app-fajlovi-telefon')!;
    expect(blok.textContent).toContain('Zadaci.docx');
    expect(blok.querySelector('[data-preuzmi]')).toBeNull();
    blok.querySelector<HTMLButtonElement>('[data-mejl]')!.click();
    const r = http.expectOne('api/public/nalog/fajlovi/7/mejl');
    expect(r.request.method).toBe('POST');
    r.flush({ poslatoNa: 'n•••@gmail.com' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(blok.querySelector('[data-poruka]')?.textContent).toBe('Poslato na n•••@gmail.com.');
  });

  it('401: dugme postaje link „Prijavi se da ti pošaljemo fajl” na nalog?nazad=uzivo/<kod>', async () => {
    await napravi(stanje([FAJL]));
    el().querySelector<HTMLButtonElement>('[data-mejl]')!.click();
    http.expectOne('api/public/nalog/fajlovi/7/mejl').flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(el().querySelector('[data-mejl]')).toBeNull();
    const a = el().querySelector('[data-prijava]')!;
    expect(a.textContent).toContain('Prijavi se da ti pošaljemo fajl');
    expect(a.getAttribute('href')).toBe('/nalog?nazad=uzivo%2F123456');
  });
});
