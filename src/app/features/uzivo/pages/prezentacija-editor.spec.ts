import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { EditorStore, NijeSacuvano } from '../data-access/editor.store';
import { PrezentacijaDetails, SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { PrezentacijaEditorPage } from './prezentacija-editor.page';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';
import { brojKoraka } from '../data-access/platno-koraci';
import { platno } from '../data-access/platno-podaci.testing';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';

const POKRENI = 'api/prezentacije/1/izvodjenja';

function slajd(id: number, rb: number, naslov: string): SlajdDetails {
  return { id, rb, tip: 'INFO', naslov, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null, platno: null };
}

function info(naslov: string): SlajdCmd {
  return { tip: 'INFO', naslov, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null, platno: null };
}

const prezentacija: PrezentacijaDetails = {
  id: 1, naziv: 'Statika', opis: null, predmet: { id: 7, naziv: 'Mehanika' }, brojSlajdova: 1, brojPitanja: 0,
  izmenjeno: '2026-10-07T10:00:00', tema: 'NACRT', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: true,
  brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi: [slajd(11, 1, 'Uvod')],
};

describe('PrezentacijaEditorPage: Pokreni i Dupliraj čekaju čuvanje', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let strana: { pokreni(): void; duplirajPrezentaciju(): void; radi(): boolean };
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let dijalog: ReturnType<typeof vi.spyOn>;
  let poruka: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      // Bez animacija: MatFormField i MatExpansionPanel inače posle prvog crtanja (zoneless autoDetect) ostave tajmere od
      // 200-300 ms, koje `saLaznimSatom` (kao fakeAsync) prijavljuje kao zaostale.
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    dijalog = vi.spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(undefined) } as unknown as MatDialogRef<unknown>);
    poruka = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    strana = fixture.componentInstance as unknown as typeof strana;
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush(prezentacija);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('izmena pa odmah Pokreni: pokretanje ide tek posle odgovora na PUT', saLaznimSatom(async () => {
    store.izmeniSlajd(11, info('Izmenjen uvod'));
    strana.pokreni();
    const put = http.expectOne('api/slajdovi/11');
    await isprazniMikrozadatke();
    http.expectNone(POKRENI);
    put.flush(slajd(11, 1, 'Izmenjen uvod'));
    const req = http.expectOne(POKRENI);
    expect(req.request.body).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null });
    req.flush({ id: 77 });
    expect(navigate).toHaveBeenCalledWith(['izvodjenja', 77, 'konzola']);
    await pomeriSat(800);
  }));

  it('upravo napisano pitanje (nacrt) se računa: čeka POST, pa otvara dijalog umesto pokretanja bez čuvanja', saLaznimSatom(async () => {
    store.dodaj('PITANJE', 'TACNO_NETACNO');
    const nacrt = store.izabrani()!;
    store.izmeniSlajd(nacrt.id, {
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, platno: null,
      pitanje: {
        tip: 'TACNO_NETACNO', tekst: 'Zemlja je okrugla.', slikaId: null, vremeSekunde: null,
        opcije: [{ tekst: 'Tačno', tacna: true }, { tekst: 'Netačno', tacna: false }], brojTacno: null,
        brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: [],
        skalaMinOznaka: null, skalaMaxOznaka: null,
      },
    });
    strana.pokreni();
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    await isprazniMikrozadatke();
    http.expectNone(POKRENI);
    expect(dijalog).not.toHaveBeenCalled();
    post.flush({ ...nacrt, id: 20, pitanje: { ...nacrt.pitanje!, id: 5, tekst: 'Zemlja je okrugla.' } });
    http.expectNone(POKRENI);
    expect(dijalog).toHaveBeenCalledTimes(1);
    await pomeriSat(800);
  }));

  it('neuspelo čuvanje zaustavlja pokretanje i prikazuje razlog', saLaznimSatom(async () => {
    store.izmeniSlajd(11, info('Izmenjen uvod'));
    strana.pokreni();
    http.expectOne('api/slajdovi/11').flush({ reason: 'Slajd nije pronađen.' }, { status: 404, statusText: 'Not Found' });
    http.expectNone(POKRENI);
    expect(dijalog).not.toHaveBeenCalled();
    expect(poruka).toHaveBeenCalledWith('Pokretanje je zaustavljeno: Slajd nije pronađen.');
    expect(strana.radi()).toBe(false);
    await pomeriSat(800);
  }));

  it('neispravan slajd zaustavlja pokretanje bez ijednog zahteva', saLaznimSatom(async () => {
    store.izmeniSlajd(11, info(''));
    strana.pokreni();
    http.expectNone(() => true);
    expect(poruka).toHaveBeenCalledWith(
      'Pokretanje je zaustavljeno: Slajd 1 nije sačuvan: Info slajd mora imati naslov, tekst ili sliku.');
    await pomeriSat(800);
  }));

  it('Dupliraj prezentaciju čeka PUT, pa kopira', saLaznimSatom(async () => {
    store.izmeniSlajd(11, info('Poslednja izmena'));
    strana.duplirajPrezentaciju();
    const put = http.expectOne('api/slajdovi/11');
    http.expectNone('api/prezentacije/1/dupliraj');
    put.flush(slajd(11, 1, 'Poslednja izmena'));
    http.expectOne('api/prezentacije/1/dupliraj').flush({ ...prezentacija, id: 2, naziv: 'Statika (kopija)' });
    expect(navigate).toHaveBeenCalledWith(['/prezentacije/2']);
    await pomeriSat(800);
  }));

  it('napuštanje: pita (unsavedChangesGuard) samo dok postoji nepotpun slajd, tekst kaže koliko ih je', () => {
    const editor = fixture.componentInstance;
    expect(editor.imaNesacuvanihIzmena()).toBe(false);
    store.dodaj('INFO');
    expect(editor.imaNesacuvanihIzmena()).toBe(true);
    expect(editor.tekstNapustanja()).toContain('Nesačuvanih slajdova: 1');
  });
});

describe('PrezentacijaEditorPage: PLATNO i tema', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  let store: InstanceType<typeof EditorStore>;
  const platnoSlajd: SlajdDetails = {
    id: 12, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija, slajdovi: [slajd(11, 1, 'Uvod'), platnoSlajd] });
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const dugme = (tekst: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes(tekst)) as HTMLButtonElement;

  it('PLATNO u listi ima ikonu layers i naziv Platno', () => {
    const ikone = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.uz-ed-stavka mat-icon.uz-ed-ikona')];
    expect(ikone.map(i => i.getAttribute('aria-label'))).toEqual(['Info slajd', 'Platno']);
    expect(ikone[1].getAttribute('data-mat-icon-name')).toBe('layers');
  });

  it('Korak napred povećava korak do brojKoraka pa je onemogućen; promena slajda vraća na 0', () => {
    const n = brojKoraka(platno());
    expect(n).toBeGreaterThan(1);
    store.izaberi(12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(`Korak 0 / ${n}`);
    expect(dugme('Korak nazad').disabled).toBe(true);
    for (let i = 1; i <= n; i++) {
      dugme('Korak napred').click();
      fixture.detectChanges();
      expect(el.textContent).toContain(`Korak ${i} / ${n}`);
    }
    expect(dugme('Korak napred').disabled).toBe(true);
    dugme('Korak nazad').click();
    fixture.detectChanges();
    expect(el.textContent).toContain(`Korak ${n - 1} / ${n}`);
    store.izaberi(11);
    fixture.detectChanges();
    store.izaberi(12);
    fixture.detectChanges();
    expect(el.textContent).toContain(`Korak 0 / ${n}`);
  });

  it('Korak napred pušta animacije grupe (Element.animate), Korak nazad ne', () => {
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise<void>(() => undefined) }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    try {
      store.izaberi(12);
      fixture.detectChanges();
      let ukupno = 0;
      for (let i = 1; i <= brojKoraka(platno()); i++) {
        dugme('Korak napred').click();
        fixture.detectChanges();
        TestBed.tick();
        ukupno = animate.mock.calls.length;
        if (ukupno > 0) break;
      }
      expect(ukupno).toBeGreaterThan(0);
      animate.mockClear();
      dugme('Korak nazad').click();
      fixture.detectChanges();
      TestBed.tick();
      expect(animate).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
  });

  it('izbor teme PAPIR šalje PUT sa tema: PAPIR', () => {
    const radio = (fixture.nativeElement as HTMLElement).querySelector('input[type=radio][value=PAPIR]') as HTMLInputElement;
    expect(radio).not.toBeNull();
    radio.click();
    const zahtev = http.expectOne('api/prezentacije/1');
    expect(zahtev.request.method).toBe('PUT');
    expect(zahtev.request.body.tema).toBe('PAPIR');
    zahtev.flush({ ...prezentacija, tema: 'PAPIR' });
  });
});

describe('PrezentacijaEditorPage: uvoz iz PowerPointa', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;
  let otvori: ReturnType<typeof vi.fn>;
  let poruka: ReturnType<typeof vi.spyOn>;
  const posleUvoza: PrezentacijaDetails = {
    ...prezentacija, brojSlajdova: 3,
    slajdovi: [slajd(11, 1, 'Uvod'), slajd(12, 2, 'Drugi'), { ...slajd(30, 3, ''), tip: 'PLATNO', naslov: null, platno: platno() }],
  };

  beforeEach(() => {
    otvori = vi.fn().mockResolvedValue(of(posleUvoza));
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: UvozPptxOtvarac, useValue: { otvori } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    poruka = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija, brojSlajdova: 2, slajdovi: [slajd(11, 1, 'Uvod'), slajd(12, 2, 'Drugi')] });
    store.izaberi(12);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const dugmeUvoza = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Uvezi iz PowerPointa') as HTMLButtonElement;

  it('dugme "PowerPoint" (ime Uvezi iz PowerPointa) čuva sve, otvara uvoz sa izabranim slajdom i primenjuje rezultat', async () => {
    const dugme = dugmeUvoza();
    expect(dugme).toBeDefined();
    expect(dugme.textContent?.trim()).toBe('PowerPoint');
    expect(dugme.closest('.uz-ed-dodaj')).not.toBeNull();
    const sacuvajSve = vi.spyOn(store, 'sacuvajSve');
    const primeniUvoz = vi.spyOn(store, 'primeniUvoz');
    dugme.click();
    await isprazniMikrozadatke();
    expect(sacuvajSve).toHaveBeenCalledTimes(1);
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(otvori.mock.calls[0][1]).toEqual({ prezentacijaId: 1, brojSlajdova: 2, izabraniId: 12, izabraniRb: 2 });
    expect(primeniUvoz).toHaveBeenCalledWith(posleUvoza);
    expect(store.izabraniId()).toBe(30);
    expect((fixture.componentInstance as unknown as { radi(): boolean }).radi()).toBe(false);
  });

  it('uvoz čeka PUT nesačuvane izmene pre otvaranja dijaloga', saLaznimSatom(async () => {
    store.izmeniSlajd(12, info('Izmenjen'));
    dugmeUvoza().click();
    const put = http.expectOne('api/slajdovi/12');
    await isprazniMikrozadatke();
    expect(otvori).not.toHaveBeenCalled();
    put.flush(slajd(12, 2, 'Izmenjen'));
    await isprazniMikrozadatke();
    expect(otvori).toHaveBeenCalledTimes(1);
    await pomeriSat(800);
  }));

  it('sacuvajSve ne uspe -> poruka "Uvoz nije pokrenut: …" i dijalog se ne otvara', async () => {
    vi.spyOn(store, 'sacuvajSve').mockReturnValue(throwError(() => new NijeSacuvano('Slajd 2 nije potpun.')));
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(poruka).toHaveBeenCalledWith('Uvoz nije pokrenut: Slajd 2 nije potpun.');
    expect(otvori).not.toHaveBeenCalled();
    expect((fixture.componentInstance as unknown as { radi(): boolean }).radi()).toBe(false);
  });

  it('dijalog zatvoren bez uvoza -> ništa se ne primenjuje', async () => {
    otvori.mockResolvedValue(of(undefined));
    const primeniUvoz = vi.spyOn(store, 'primeniUvoz');
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(primeniUvoz).not.toHaveBeenCalled();
    expect(store.izabraniId()).toBe(12);
  });

  it('lenji chunk uvoza se ne učita -> poruka, bez sirove greške', async () => {
    otvori.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(poruka).toHaveBeenCalledTimes(1);
    expect(poruka.mock.calls[0][0]).toMatch(/^Uvoz nije pokrenut: /);
    expect(poruka.mock.calls[0][0]).not.toContain('TypeError');
    expect(TestBed.inject(ErrorHandler).handleError).toHaveBeenCalledWith(expect.any(TypeError));
    expect((fixture.componentInstance as unknown as { radi(): boolean }).radi()).toBe(false);
  });
});
