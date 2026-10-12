import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PrezentacijeListaPage } from './prezentacije-lista.page';
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
