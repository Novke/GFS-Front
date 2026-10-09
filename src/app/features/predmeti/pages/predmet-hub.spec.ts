import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PREDMETI_RUTE } from '../predmeti.routes';
import { opcijeGrupaHuba } from './predmet-hub';
import { tipoviZaPodesavanja } from './predmet-podesavanja-tab';
import { poMesecima } from './predmet-pregled-tab';

@Component({ template: '404' })
class NijePronadjeno {}

const strana = <T>(content: T[]) => ({ content, page: { size: 100, number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });

const P = { id: 5, naziv: 'Statika' };
const G = { id: 1, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 2 };
const KOEF = {
  id: 1, predmetId: 5, koefPrisustvo: 1, koefZadatak: 2, koefZvezdica: 4, domaciFlat: 4, domaciVarijansa: 6,
  koristiMaxRezultat: true, prikaziZbirno: false, maxAktivnost: null, maxDomaci: null,
  koeficijentiTipova: [{ tipTestaId: 7, tipTestaNaziv: 'Kolokvijum 1', maxPoena: null }, { tipTestaId: 9, tipTestaNaziv: 'Stari', maxPoena: 10 }],
};

describe('hub predmeta: čiste funkcije', () => {
  it('birač grupe: izabrana grupa koje nema u nastavi godine se dodaje', () => {
    expect(opcijeGrupaHuba([G], 1, [])).toEqual([{ id: 1, naziv: 'GD-2025' }]);
    expect(opcijeGrupaHuba([G], 3, [{ id: 3, naziv: 'AR-2024' }]).map(g => g.naziv)).toEqual(['GD-2025', 'AR-2024']);
    expect(opcijeGrupaHuba([], 8, []).map(g => g.naziv)).toEqual(['Nepoznata grupa']);
  });

  it('vremenska linija po mesecima, bez datuma na kraju', () => {
    const s = (id: number, datum: string | null) => ({ tip: 'predavanje' as const, id, datum, naslov: '', grupa: null, url: [], ikona: 'event' as const });
    expect(poMesecima([s(1, '2025-10-07'), s(2, '2025-10-21'), s(3, '2025-11-04'), s(4, null)]).map(m => [m.naslov, m.stavke.length])).toEqual([
      ['oktobar 2025.', 2],
      ['novembar 2025.', 1],
      ['Bez datuma', 1],
    ]);
  });

  it('H5: aktivni sa servera, isključeni iz koeficijenata, izmene iz sesije preko svega', () => {
    const izmene = new Map([
      [7, { id: 7, naziv: 'Kolokvijum I', aktivan: false }],
      [12, { id: 12, naziv: 'Popravni', aktivan: true }],
    ]);
    expect(tipoviZaPodesavanja([{ id: 7, naziv: 'Kolokvijum 1', aktivan: true }], KOEF, izmene)).toEqual([
      { id: 7, naziv: 'Kolokvijum I', aktivan: false },
      { id: 9, naziv: 'Stari', aktivan: false },
      { id: 12, naziv: 'Popravni', aktivan: true },
    ]);
  });
});

describe('rute i hub predmeta', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  const el = () => harness.routeNativeElement as HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'predmeti', children: PREDMETI_RUTE }, { path: '**', component: NijePronadjeno }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.match(() => true).forEach(r => r.cancelled || r.flush([]));
  });

  /** Odgovori na zahteve huba: predmet, nastava godine, referentni podaci. */
  function odgovoriHubu(predmet = P): TestRequest[] {
    const zahtevi = http.match(() => true);
    for (const r of zahtevi) {
      const url = r.request.url;
      if (url === `api/predmeti/${predmet.id}`) {
        r.flush(predmet);
      } else if (url === 'api/predavanja/pretraga') {
        r.flush(strana([{ id: 11, rb: 1, datum: '2025-10-07', tema: 'Uvod', zavrseno: true, predmet: P, grupa: G, brojPrisutnih: 2, brojStarijihPrisutnih: 0, brojStudenata: 2 }]));
      } else if (url === 'api/domaci/pretraga') {
        r.flush(strana([]));
      } else if (url === 'api/test/pretraga') {
        r.flush(strana([]));
      } else if (url === 'api/predmeti') {
        r.flush([P]);
      } else if (url === 'api/grupe') {
        r.flush([G]);
      }
    }
    return zahtevi;
  }

  /** Bez `whenStable`: ono čeka i HTTP zahteve na koje test tek treba da odgovori. */
  async function stabilno(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      harness.fixture.detectChanges();
      await new Promise(r => setTimeout(r, 0));
    }
    harness.fixture.detectChanges();
  }

  it('/predmeti/:id ide na Pregled; nastava se učitava za tekuću godinu, sve grupe, po datumu', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5');
    expect(router.url).toBe('/predmeti/5/pregled');
    const zahtevi = odgovoriHubu();
    const predavanja = zahtevi.find(r => r.request.url === 'api/predavanja/pretraga')!;
    expect(predavanja.request.params.get('predmetId')).toBe('5');
    expect(predavanja.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(predavanja.request.params.get('grupaId')).toBeNull();
    expect(predavanja.request.params.get('size')).toBe('100');
    await stabilno();
    odgovoriHubu();
    await stabilno();
    expect(el().querySelector('h1')?.textContent).toContain('Statika');
    expect(el().querySelector('[data-stavka="predavanje-11"]')?.textContent).toContain('Predavanje 1 · Uvod');
    // tabovi nose godinu (eksplicitno) i grupu huba
    const tab = el().querySelector<HTMLAnchorElement>('[data-tab="ocene"]')!;
    expect(tab.getAttribute('href')).toBe(`/predmeti/5/ocene?godina=${tekucaSkolskaGodina()}`);
  });

  it('nepoznat tab i neispravan id su 404 bez preusmeravanja; neispravna godina pada na tekuću', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5/xyz');
    expect(router.url).toBe('/predmeti/5/xyz');
    expect(el().textContent).toContain('404');
    await harness.navigateByUrl('/predmeti/abc');
    expect(el().textContent).toContain('404');

    await harness.navigateByUrl('/predmeti/5/pregled?godina=lozinka&grupa=-3');
    const zahtevi = odgovoriHubu();
    expect(zahtevi.find(r => r.request.url === 'api/predavanja/pretraga')!.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(router.url).toBe('/predmeti/5/pregled?godina=lozinka&grupa=-3');
  });

  it('nepostojeći predmet: panel "Predmet ne postoji."', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/99/pregled');
    http.expectOne('api/predmeti/99').flush({ reason: 'Predmet ne postoji! ID = 99' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().textContent).toContain('Predmet ne postoji.');
  });

  it('Ocene bez grupe nude grupe sa nastavom; sa grupom traže predlog za tu grupu', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5/ocene');
    odgovoriHubu();
    await stabilno();
    expect(el().textContent).toContain('Izaberi grupu');
    expect(el().querySelector('[data-grupa="1"]')).not.toBeNull();

    await harness.navigateByUrl('/predmeti/5/ocene?grupa=1');
    await stabilno();
    const rez = http.expectOne('api/ocenjivanje/predmet/5/rezultati');
    expect(rez.request.body).toEqual({ grupaId: 1 });
    http.expectOne('api/ocenjivanje/predmet/5/koeficijenti').flush(KOEF);
    rez.flush([
      { studentInfo: { id: 3, ime: 'Ana', prezime: 'Anić', indeks: 'GD2', godina: 2025 }, rezultati: [], poeniDomaci: 10, poeniAktivnost: 20, poeniPredispitne: 30, ukupno: 62, predlogOcene: 7 },
      { studentInfo: { id: 4, ime: 'Bojan', prezime: 'Bek', indeks: 'GD3', godina: 2025 }, rezultati: [], poeniDomaci: 0, poeniAktivnost: 2, poeniPredispitne: 2, ukupno: 2, predlogOcene: null },
    ]);
    await stabilno();
    const redovi = [...el().querySelectorAll('app-ocene-tabela tbody tr')].map(r => r.getAttribute('data-student'));
    expect(redovi).toEqual(['3', '4']);
    expect(el().textContent).toContain('nije položio');
    expect(el().querySelector<HTMLAnchorElement>('[data-podesi]')!.getAttribute('href')).toBe('/predmeti/5/podesavanja');
  });

  it('Podešavanja: izlazak sa nesačuvanim koeficijentima traži potvrdu', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5/podesavanja');
    odgovoriHubu();
    await stabilno();
    http.expectOne('api/ocenjivanje/predmet/5/koeficijenti').flush(KOEF);
    http.expectOne('api/predmeti/5/tipovi').flush([{ id: 7, naziv: 'Kolokvijum 1', aktivan: true }]);
    await stabilno();
    // H5: aktivan tip i isključen iz koeficijenata; H6 bez funkcije
    expect(el().querySelectorAll('[data-tip]').length).toBe(2);
    expect(el().querySelector('[data-sema-bodovanja]')?.textContent).toContain('uskoro');

    const polje = el().querySelector<HTMLInputElement>('[data-polje="koefZadatak"]')!;
    polje.value = '3';
    polje.dispatchEvent(new Event('input'));
    await stabilno();

    const dialog = TestBed.inject(MatDialog);
    const otvori = vi.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => of(false) } as never);
    expect(await router.navigateByUrl('/predmeti/5/pregled')).toBe(false);
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/predmeti/5/podesavanja');
  });
});
