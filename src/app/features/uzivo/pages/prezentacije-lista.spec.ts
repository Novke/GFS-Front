import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PrezentacijaInfo } from '../data-access/uzivo.models';
import { PrezentacijeListaPage, sortirajListu, upitIzUrla } from './prezentacije-lista.page';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';

describe('PrezentacijeListaPage: nova iz PowerPointa', () => {
  let http: HttpTestingController;
  let otvori: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  function postavi(ishodNove: unknown, ishodUvoza: unknown) {
    otvori = vi.fn(() => Promise.resolve(of(ishodUvoza)));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map<string, string>()) } },
        { provide: UvozPptxOtvarac, useValue: { otvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(ishodNove) } as never);
    const f = TestBed.createComponent(PrezentacijeListaPage);
    f.detectChanges();
    http.expectOne('api/predmeti').flush([{ id: 7, naziv: 'Statika' }]);
    http.expectOne(r => r.url === 'api/prezentacije').flush([]);
    f.detectChanges();
    return f;
  }

  const klik = async (f: ReturnType<typeof postavi>) => {
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('header button')!.click();
    await f.whenStable();
  };
  const fajl = new File(['x'], 'a.pptx');
  const nova = { prezentacija: { id: 9 }, fajl };

  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it('ishod sa fajlom zove otvori sa nova: true, rezultat vodi u editor', async () => {
    const f = postavi(nova, { id: 9 });
    await klik(f);
    expect(otvori).toHaveBeenCalledWith(expect.anything(), {
      prezentacijaId: 9, brojSlajdova: 0, izabraniId: null, izabraniRb: null, fajl, nova: true,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0][0]).toContain('9');
  });

  for (const ishod of [undefined, 'osvezi'] as const) {
    it(`ishod uvoza ${ishod} ostaje na listi i ponovo je učitava`, async () => {
      const f = postavi(nova, ishod);
      await klik(f);
      expect(navigate).not.toHaveBeenCalled();
      http.expectOne(r => r.url === 'api/prezentacije').flush([]);
    });
  }

  it('prazna prezentacija ide direktno u editor, bez dijaloga uvoza', async () => {
    const f = postavi({ prezentacija: { id: 5 }, fajl: null }, undefined);
    await klik(f);
    expect(otvori).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

const info = (id: number, naziv: string, vezba: number | null, izmena: Partial<PrezentacijaInfo> = {}): PrezentacijaInfo => ({
  id, naziv, opis: null, predmet: { id: 7, naziv: 'Statika' }, brojSlajdova: 3, brojPitanja: 0, izmenjeno: '2026-10-10T10:00:00',
  tema: 'NACRT', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: true, brojIzvodjenja: 0, aktivnoIzvodjenjeId: null,
  vezba, vrsta: 'GRADIVO', brojZadataka: 0, kreirano: '2026-10-01T10:00:00', poslednjePustanje: null, ...izmena,
});

describe('PrezentacijeListaPage: redosled, grupe i filteri', () => {
  it('upit iz URL-a: neispravne vrednosti su "bez filtera", sort je podrazumevano po vežbama', () => {
    expect(upitIzUrla(convertToParamMap({ predmet: '7', vrsta: 'ZADACI', sort: 'naziv', q: 'v' })))
      .toEqual({ predmet: 7, vrsta: 'ZADACI', sort: 'naziv', q: 'v' });
    expect(upitIzUrla(convertToParamMap({ predmet: 'x', vrsta: 'NE', sort: 'drugo' })))
      .toEqual({ predmet: null, vrsta: null, sort: 'vezbe', q: '' });
  });

  it('sortiranja: kreirano i poslednje puštanje opadajuće, nikad puštane na kraju', () => {
    const l = [
      info(1, 'B', 2, { kreirano: '2026-10-03T10:00:00', poslednjePustanje: '2026-10-20T10:00:00' }),
      info(2, 'a', 1, { kreirano: '2026-10-05T10:00:00' }),
      info(3, 'C', null, { kreirano: '2026-10-04T10:00:00', poslednjePustanje: '2026-10-22T10:00:00' }),
    ];
    expect(sortirajListu(l, 'vezbe', false).map(p => p.id)).toEqual([2, 1, 3]);
    expect(sortirajListu(l, 'naziv', false).map(p => p.id)).toEqual([2, 1, 3]);
    expect(sortirajListu(l, 'kreirano', false).map(p => p.id)).toEqual([2, 3, 1]);
    expect(sortirajListu(l, 'pustanje', false).map(p => p.id)).toEqual([3, 1, 2]);
  });

  function prikazi(upit: Record<string, string>, lista: PrezentacijaInfo[]) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(upit)) } },
        { provide: UvozPptxOtvarac, useValue: { otvori: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PrezentacijeListaPage);
    f.detectChanges();
    http.expectOne('api/predmeti').flush([{ id: 7, naziv: 'Statika' }]);
    http.expectOne(r => r.url === 'api/prezentacije').flush(lista);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  const lista = [
    info(1, 'Vežbe 2', 2), info(2, 'Vežbe 1 – zadaci', 1, { vrsta: 'ZADACI', brojZadataka: 2, brojPitanja: 2 }),
    info(3, 'Vežbe 1', 1), info(4, 'Bez broja', null),
  ];
  const redovi = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-prezentacija]')).map(x => Number(x.getAttribute('data-prezentacija')));

  it('podrazumevano grupisano po vežbama (u vežbi gradivo pre zadataka), bez broja na kraju', () => {
    const el = prikazi({ predmet: '7' }, lista);
    expect(redovi(el)).toEqual([3, 2, 1, 4]);
    expect(Array.from(el.querySelectorAll('[data-grupa-vezbe]')).map(h => h.textContent?.trim()))
      .toEqual(['Vežbe 1', 'Vežbe 2', 'Bez broja vežbe']);
    expect(el.querySelector('[data-prezentacija="1"]')?.textContent).toContain('nikad');
  });

  it('svi predmeti: naslov grupe nosi predmet', () => {
    const el = prikazi({}, lista);
    expect(el.querySelector('[data-grupa-vezbe]')?.textContent).toContain('Statika · Vežbe 1');
  });

  it('vrsta i pretraga iz URL-a filtriraju; drugo sortiranje nema grupe', () => {
    expect(redovi(prikazi({ predmet: '7', vrsta: 'ZADACI' }, lista))).toEqual([2]);
    TestBed.resetTestingModule();
    expect(redovi(prikazi({ predmet: '7', q: 'vezbe 1' }, lista))).toEqual([3, 2]);
    TestBed.resetTestingModule();
    const el = prikazi({ predmet: '7', sort: 'naziv' }, lista);
    expect(el.querySelector('[data-grupa-vezbe]')).toBeNull();
    expect(redovi(el)).toEqual([4, 3, 2, 1]);
  });

  it('ništa ne odgovara filteru: poruka, ne prazno stanje predmeta', () => {
    const el = prikazi({ predmet: '7', q: 'nema' }, lista);
    expect(el.querySelector('[data-bez-rezultata]')).not.toBeNull();
    expect(el.querySelector('.uz-ed-prazno-stanje')).toBeNull();
  });
});
