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
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
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
  const poslednjaMrvica = () => TestBed.inject(BreadcrumbService).mrvice().at(-1)?.label;

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
    TestBed.inject(BreadcrumbService); // sluša navigacije od početka, kao u aplikaciji (ljuska)
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  /** Odgovara na poznate zahteve huba (predmet, nastava godine, liste tabova, referentni podaci); vraća odgovorene. */
  function odgovoriHubu(predmet = P): TestRequest[] {
    const odgovoreni: TestRequest[] = [];
    // `match` skida zahtev sa spiska otvorenih, pa se uzimaju samo poznati (ostale proverava test, pa `verify`)
    const poznati = [`api/predmeti/${predmet.id}`, 'api/predavanja/pretraga', 'api/domaci/pretraga', 'api/test/pretraga', 'api/predmeti', 'api/grupe'];
    for (const r of http.match(z => poznati.includes(z.url))) {
      const url = r.request.url;
      if (url === `api/predmeti/${predmet.id}`) {
        r.flush(predmet);
      } else if (url === 'api/predavanja/pretraga') {
        r.flush(strana([{ id: 11, rb: 1, datum: '2025-10-07', tema: 'Uvod', zavrseno: true, predmet: P, grupa: G, brojPrisutnih: 2, brojStarijihPrisutnih: 0, brojStudenata: 2 }]));
      } else if (url === 'api/domaci/pretraga' || url === 'api/test/pretraga') {
        r.flush(strana([]));
      } else if (url === 'api/predmeti') {
        r.flush([P]);
      } else if (url === 'api/grupe') {
        r.flush([G]);
      }
      odgovoreni.push(r);
    }
    return odgovoreni;
  }

  /** Bez `whenStable`: ono čeka i HTTP zahteve na koje test tek treba da odgovori. */
  async function stabilno(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      harness.fixture.detectChanges();
      await new Promise(r => setTimeout(r, 0));
    }
    harness.fixture.detectChanges();
  }

  /** Odgovara na zahteve huba dok novi stižu; ostali (ocene, tipovi) ostaju testu. */
  async function smiri(predmet = P): Promise<TestRequest[]> {
    const svi: TestRequest[] = [];
    for (let i = 0; i < 6; i++) {
      await stabilno();
      const odgovoreni = odgovoriHubu(predmet);
      if (odgovoreni.length === 0) {
        break;
      }
      svi.push(...odgovoreni);
    }
    return svi;
  }

  const aktivanTab = () => el().querySelector('.tabovi a[aria-current="page"]')?.getAttribute('data-tab') ?? null;

  it('/predmeti/:id ide na Pregled; nastava za tekuću godinu, sve grupe; aktivan tab i mrvice i bez query parametara', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5');
    expect(router.url).toBe('/predmeti/5/pregled');
    const zahtevi = await smiri();
    const predavanja = zahtevi.find(r => r.request.url === 'api/predavanja/pretraga')!;
    expect(predavanja.request.params.get('predmetId')).toBe('5');
    expect(predavanja.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(predavanja.request.params.get('grupaId')).toBeNull();
    expect(predavanja.request.params.get('size')).toBe('100');
    expect(el().querySelector('h1')?.textContent).toContain('Statika');
    expect(el().querySelector('[data-stavka="predavanje-11"]')?.textContent).toContain('Predavanje 1 · Uvod');
    // URL bez `godina`, a link je nosi: tab je ipak aktivan (poređenje samo po putanji)
    expect(aktivanTab()).toBe('pregled');
    expect(el().querySelector<HTMLAnchorElement>('[data-tab="ocene"]')!.getAttribute('href')).toBe(`/predmeti/5/ocene?godina=${tekucaSkolskaGodina()}`);
    expect(poslednjaMrvica()).toBe('Statika');

    // prelazak na drugi tab (hub se ne pravi ponovo): mrvica i dalje nosi naziv, aktivan je novi tab i sa parametrima liste
    await harness.navigateByUrl('/predmeti/5/predavanja?godina=2024&strana=2');
    await smiri();
    expect(aktivanTab()).toBe('predavanja');
    expect(poslednjaMrvica()).toBe('Statika');
  });

  it('nepoznat tab i neispravan id su 404 bez preusmeravanja; neispravna godina pada na tekuću', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5/xyz');
    expect(router.url).toBe('/predmeti/5/xyz');
    expect(el().textContent).toContain('404');
    await harness.navigateByUrl('/predmeti/abc');
    expect(el().textContent).toContain('404');

    await harness.navigateByUrl('/predmeti/5/pregled?godina=lozinka&grupa=-3');
    const zahtevi = await smiri();
    expect(zahtevi.find(r => r.request.url === 'api/predavanja/pretraga')!.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(router.url).toBe('/predmeti/5/pregled?godina=lozinka&grupa=-3');
    expect(aktivanTab()).toBe('pregled');
  });

  it('nepostojeći predmet: panel "Predmet ne postoji."', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/99/pregled');
    http.expectOne('api/predmeti/99').flush({ reason: 'Predmet ne postoji! ID = 99' }, { status: 404, statusText: 'Not Found' });
    await smiri({ id: 99, naziv: '' });
    expect(el().textContent).toContain('Predmet ne postoji.');
  });

  it('Ocene: bez grupe nudi grupe; sa grupom prvo koeficijenti, pa predlog (nikad paralelno)', { timeout: 15_000 }, async () => {
    await harness.navigateByUrl('/predmeti/5/ocene');
    await smiri();
    expect(el().textContent).toContain('Izaberi grupu');
    expect(el().querySelector('[data-grupa="1"]')).not.toBeNull();

    await harness.navigateByUrl('/predmeti/5/ocene?grupa=1');
    await smiri();
    const koef = http.expectOne('api/ocenjivanje/predmet/5/koeficijenti');
    http.expectNone('api/ocenjivanje/predmet/5/rezultati');
    koef.flush(KOEF);
    await stabilno();
    const rez = http.expectOne('api/ocenjivanje/predmet/5/rezultati');
    expect(rez.request.body).toEqual({ grupaId: 1 });
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

  /** Otvara Podešavanja i odgovara na koeficijente i sve tipove (`?svi=true`): aktivan 7 i isključen 9. */
  async function otvoriPodesavanja(): Promise<void> {
    await harness.navigateByUrl('/predmeti/5/podesavanja');
    await smiri();
    http.expectOne('api/ocenjivanje/predmet/5/koeficijenti').flush(KOEF);
    const tipovi = http.expectOne(r => r.url === 'api/predmeti/5/tipovi');
    expect(tipovi.request.params.get('svi')).toBe('true');
    tipovi.flush([
      { id: 7, naziv: 'Kolokvijum 1', aktivan: true },
      { id: 9, naziv: 'Stari', aktivan: false },
      { id: 11, naziv: 'Bez koeficijenata', aktivan: false },
    ]);
    await stabilno();
  }

  const red = (id: number) => el().querySelector<HTMLElement>(`[data-tip="${id}"]`)!;
  const nazivTipa = (id: number) => red(id).querySelector<HTMLInputElement>('[data-naziv-tipa]')!;
  const tipPut = () => http.match(r => r.method === 'PUT' && r.url.startsWith('api/test/tip/'));

  it('Podešavanja: isključeni tipovi se vide (svi=true); izlazak sa nesačuvanim koeficijentima traži potvrdu', { timeout: 15_000 }, async () => {
    await otvoriPodesavanja();
    expect(el().querySelectorAll('[data-tip]').length).toBe(3);
    expect(red(11).textContent).toContain('Isključen');
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

  it('H5: isključen tip se ponovo uključuje; dok zahtev traje nema drugog; naziv ide sa trenutnim stanjem', { timeout: 15_000 }, async () => {
    await otvoriPodesavanja();

    // uključi tip 11 (bez potvrde); dok PUT traje, polje naziva je onemogućeno i blur ne šalje ništa
    red(11).querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    await stabilno();
    const [ukljuci] = tipPut();
    expect(ukljuci.request.url).toBe('api/test/tip/11');
    expect(ukljuci.request.body).toEqual({ naziv: 'Bez koeficijenata', aktivan: true });
    expect(nazivTipa(11).disabled).toBe(true);
    nazivTipa(11).value = 'Popravni';
    nazivTipa(11).dispatchEvent(new Event('blur'));
    expect(tipPut()).toHaveLength(0);
    ukljuci.flush({ id: 11, naziv: 'Bez koeficijenata', aktivan: true });
    await stabilno();
    expect(red(11).textContent).toContain('Aktivan');

    // preimenovanje posle uključenja šalje aktivan: true (trenutno stanje), Enter pa blur je jedan zahtev
    nazivTipa(11).value = 'Popravni';
    nazivTipa(11).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    nazivTipa(11).dispatchEvent(new Event('blur'));
    await stabilno();
    const preimenuj = tipPut();
    expect(preimenuj).toHaveLength(1);
    expect(preimenuj[0].request.body).toEqual({ naziv: 'Popravni', aktivan: true });
    preimenuj[0].flush({ id: 11, naziv: 'Popravni', aktivan: true });
    await stabilno();
    expect(nazivTipa(11).value).toBe('Popravni');
    // tipovi u keš-u ReferenceStore-a se osvežavaju samo ako ih je neko već tražio (ovde niko)
  });
});
