import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { KoeficijentiInfo, RezultatiStudentaInfo } from '../data-access/ocene.models';
import { OcenePregled } from './ocene-pregled';
import { OceneTabela } from './ocene-tabela';

const KOEF: KoeficijentiInfo = {
  id: 1, predmetId: 5, koefPrisustvo: 1, koefZadatak: 2, koefZvezdica: 4, domaciFlat: 4, domaciVarijansa: 6,
  koristiMaxRezultat: true, prikaziZbirno: false, maxAktivnost: null, maxDomaci: null,
  koeficijentiTipova: [{ tipTestaId: 7, tipTestaNaziv: 'Kolokvijum 1', maxPoena: null }],
};

function rez(id: number, prezime: string, ukupno: number | null, predlogOcene: number | null, k1: number | null = 10): RezultatiStudentaInfo {
  return {
    studentInfo: { id, ime: 'Ana', prezime, indeks: `GD${id}`, godina: 2025 },
    rezultati: k1 === null ? [] : [{ tipTesta: { id: 7, naziv: 'Kolokvijum 1' }, ostvarenoPoena: k1 }],
    poeniDomaci: 4.25,
    poeniAktivnost: 2,
    poeniPredispitne: 6.25,
    ukupno,
    predlogOcene,
  };
}

function ikone(): void {
  const registry = TestBed.inject(MatIconRegistry);
  const sanitizer = TestBed.inject(DomSanitizer);
  for (const ime of IKONE) {
    registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
  }
}

describe('OceneTabela', () => {
  let f: ComponentFixture<OceneTabela>;
  const el = () => f.nativeElement as HTMLElement;
  const redovi = () => [...el().querySelectorAll('tbody tr')].map(r => r.getAttribute('data-student'));
  const zaglavlja = () => [...el().querySelectorAll('thead th')].map(t => t.textContent?.replace(/[↑↓]/g, '').trim());

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    ikone();
    f = TestBed.createComponent(OceneTabela);
    f.componentRef.setInput('predmetId', 5);
    f.componentRef.setInput('koeficijenti', KOEF);
    f.componentRef.setInput('rezultati', [rez(1, 'Zec', 55, 6), rez(2, 'Anić', 92.5, 10), rez(3, 'Bek', null, null, null)]);
    f.detectChanges();
  });

  it('kolone razdvojeno, po tipu testa; redovi po ukupnom (najveći prvi), klik na Ukupno menja smer', () => {
    expect(zaglavlja()).toEqual(['#', 'Student', 'Indeks', 'Domaći', 'Aktivnost', 'Kolokvijum 1', 'Ukupno', 'Ocena']);
    expect(redovi()).toEqual(['2', '1', '3']);
    el().querySelector<HTMLButtonElement>('[data-sort="ukupno"]')!.click();
    f.detectChanges();
    expect(redovi()).toEqual(['3', '1', '2']);
    expect(el().querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('ocena kao oznaka; bez predloga "nije položio" sa ikonom; nedostajući poeni su "—"', () => {
    const ocene = [...el().querySelectorAll('[data-ocena]')].map(o => o.textContent?.trim());
    expect(ocene).toEqual(['10', '6', 'nije položio']);
    expect(el().querySelector('[data-student="3"] [data-ocena] mat-icon')).not.toBeNull();
    const celije = [...el().querySelectorAll('[data-student="3"] td')].map(t => t.textContent?.trim());
    expect(celije).toContain('—');
    expect(el().querySelector('[data-student="2"] a')?.getAttribute('href')).toBe('/studenti/2/predmeti/5');
    expect(el().querySelector('[data-student="2"]')?.textContent).toContain('4.3'); // jedna decimala (LOCALE_ID testa je en-US)
  });

  it('zbirno: jedna kolona "Predispitne"', () => {
    f.componentRef.setInput('koeficijenti', { ...KOEF, prikaziZbirno: true });
    f.detectChanges();
    expect(zaglavlja()).toContain('Predispitne');
    expect(zaglavlja()).not.toContain('Domaći');
  });
});

describe('OcenePregled', () => {
  let f: ComponentFixture<OcenePregled>;
  let http: HttpTestingController;
  const el = () => f.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // @defer (on viewport) treba IntersectionObserver, kog test okruženje nema: blok se prikazuje ručno
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    ikone();
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(OcenePregled);
    f.componentRef.setInput('predmetId', 5);
    f.componentRef.setInput('grupaId', 2);
    f.detectChanges();
  });

  afterEach(() => http.verify());

  async function korak(): Promise<void> {
    f.detectChanges();
    await new Promise(r => setTimeout(r, 0));
    f.detectChanges();
  }

  it('prvo koeficijenti, pa predlog; histogram 5-10 broji "nije položio" kao 5', async () => {
    await korak();
    const koef = http.expectOne('api/ocenjivanje/predmet/5/koeficijenti');
    http.expectNone('api/ocenjivanje/predmet/5/rezultati');
    koef.flush(KOEF);
    await korak();
    http.expectOne('api/ocenjivanje/predmet/5/rezultati').flush([rez(1, 'Zec', 55, 6), rez(2, 'Anić', 20, null), rez(3, 'Bek', 10, null)]);
    await korak();
    expect(el().querySelector('[data-opis-koeficijenata]')?.textContent).toContain('3 studenta');
    const [blok] = await f.getDeferBlocks();
    await blok.render(DeferBlockState.Complete);
    const opis = el().querySelector('app-histogram svg')?.getAttribute('aria-label') ?? '';
    expect(opis).toContain('5: 2');
    expect(opis).toContain('6: 1');
  });

  it('greška: panel sa porukom servera i "Pokušaj ponovo" učitava iznova', async () => {
    await korak();
    http.expectOne('api/ocenjivanje/predmet/5/koeficijenti').flush({ reason: 'Predmet ne postoji! ID = 5' }, { status: 404, statusText: 'Not Found' });
    await korak();
    expect(el().textContent).toContain('Predlog ocena nije učitan.');
    expect(el().textContent).toContain('Predmet ne postoji! ID = 5');
    el().querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    await korak();
    http.expectOne('api/ocenjivanje/predmet/5/koeficijenti').flush(KOEF);
    await korak();
    http.expectOne('api/ocenjivanje/predmet/5/rezultati').flush([]);
    await korak();
    expect(el().textContent).toContain('Grupa nema studenata');
  });
});
