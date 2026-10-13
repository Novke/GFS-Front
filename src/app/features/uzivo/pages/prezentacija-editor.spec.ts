import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';
import { EditorStore, NijeSacuvano } from '../data-access/editor.store';
import { PrezentacijaDetails, SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { PrezentacijaEditorPage } from './prezentacija-editor.page';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';
import { brojKoraka } from '../data-access/platno-koraci';
import { platno } from '../data-access/platno-podaci.testing';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';
import { noviOblik } from '../data-access/platno-novo';
import { PlatnoEditorComponent } from '../editor-platna/platno-editor.component';
import { PlatnoEditorStore } from '../editor-platna/platno-editor.store';

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
    expect(editor.tekstNapustanja()).toContain('Ako napustiš editor, novi slajd se ne pravi.');
    expect(editor.tekstNapustanja()).not.toContain('odbacuj');
  });

  it('napuštanje: ispravan nacrt čiji POST traje (i izmena stigla za to vreme) se ne broji, jer ga store šalje i posle napuštanja; nepotpuna izmena sačuvanog slajda se broji', saLaznimSatom(async () => {
    const editor = fixture.componentInstance;
    store.dodaj('INFO');
    const nacrt = store.izabraniId()!;
    store.izmeniSlajd(nacrt, info('Nov'));
    store.sacuvajOdmah();
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    store.izmeniSlajd(nacrt, info('Nov 2'));
    expect(editor.imaNesacuvanihIzmena()).toBe(false);
    store.izmeniSlajd(11, info(''));
    expect(editor.imaNesacuvanihIzmena()).toBe(true);
    expect(editor.tekstNapustanja()).toContain('Nesačuvanih slajdova: 1');
    expect(editor.tekstNapustanja()).toContain('Ako napustiš editor, slajd ostaje u poslednjoj sačuvanoj verziji.');
    expect(editor.tekstNapustanja()).not.toContain('ne pravi');
    post.flush(slajd(30, 2, 'Nov'));
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/30');
    expect(put.request.body.naslov).toBe('Nov 2');
    put.flush(slajd(30, 2, 'Nov 2'));
    await pomeriSat(800);
  }));
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

  it('beleške posle izmene platna: PUT nosi platno iz store-a (ne ono iz vremena pravljenja forme) i nove beleške', saLaznimSatom(async () => {
    store.izaberi(12);
    fixture.detectChanges();
    const P1 = { ...platno(), pozadina: { boja: '#EEEEEE', medijId: null } };
    store.izmeniPlatno(12, P1);
    const beleske = (fixture.nativeElement as HTMLElement).querySelector('textarea[formcontrolname=beleske]') as HTMLTextAreaElement;
    expect(beleske).not.toBeNull();
    beleske.value = 'Nove beleške';
    beleske.dispatchEvent(new Event('input'));
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/12');
    expect(put.request.body.beleske).toBe('Nove beleške');
    expect(put.request.body.platno).toBe(P1);
    put.flush({ ...platnoSlajd, beleske: 'Nove beleške', platno: P1 });
    await pomeriSat(800);
  }));

  it('dugme "Platno" dodaje PLATNO slajd, bira ga i šalje POST', saLaznimSatom(async () => {
    const dodaj = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.uz-ed-dodaj button')]
      .find(b => b.textContent?.trim() === 'Platno') as HTMLButtonElement;
    expect(dodaj).toBeTruthy();
    dodaj.click();
    const nacrt = store.izabrani()!;
    expect(nacrt.tip).toBe('PLATNO');
    expect(nacrt.id).toBeLessThan(0);
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.tip).toBe('PLATNO');
    post.flush({ ...platnoSlajd, id: 30, rb: 3, platno: nacrt.platno });
    expect(store.izabraniId()).toBe(30);
    await pomeriSat(800);
  }));

  it('beforeunload prvo zove pražnjenje editora platna, pa traži potvrdu dok je nešto otvoreno', () => {
    const isprazni = vi.fn();
    let otvoreno = true;
    store.registrujPraznjenje(isprazni, () => otvoreno);
    const dogadjaj = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dogadjaj);
    expect(isprazni).toHaveBeenCalled();
    expect(dogadjaj.defaultPrevented).toBe(true);
    otvoreno = false;
    isprazni.mockClear();
    const drugi = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(drugi);
    expect(isprazni).toHaveBeenCalledTimes(1);
    expect(drugi.defaultPrevented).toBe(false);
    store.registrujPraznjenje(null);
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

describe('PrezentacijaEditorPage: lenji editor platna', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  let store: InstanceType<typeof EditorStore>;
  const platnoSlajd = (id: number, rb: number): SlajdDetails => ({
    id, rb, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(),
  });
  const el = () => fixture.nativeElement as HTMLElement;
  const editor = () => fixture.debugElement.query(By.directive(PlatnoEditorComponent));
  const okvir = () => el().querySelector<HTMLElement>('.uz-ep-platno')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1')
      .flush({ ...prezentacija, brojSlajdova: 3, slajdovi: [slajd(11, 1, 'Uvod'), platnoSlajd(12, 2), platnoSlajd(13, 3)] });
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('PLATNO slajd ima editor platna i raspored strane za platno; INFO nema', async () => {
    expect(editor()).toBeNull();
    store.izaberi(12);
    await fixture.whenStable();
    expect(el().querySelector('app-platno-editor')).not.toBeNull();
    expect(el().querySelector('.uz-ed-telo')!.classList).toContain('uz-ed-telo--platno');
    expect(el().textContent).not.toContain('se za sada ne uređuju ovde');
    store.izaberi(11);
    await fixture.whenStable();
    expect(el().querySelector('app-platno-editor')).toBeNull();
    expect(el().querySelector('.uz-ed-telo')!.classList).not.toContain('uz-ed-telo--platno');
  });

  it('izmena u editoru (Delete) ide u store.izmeniPlatno sa id-jem slajda', async () => {
    store.izaberi(12);
    await fixture.whenStable();
    const izmeni = vi.spyOn(store, 'izmeniPlatno');
    editor().injector.get(PlatnoEditorStore).izaberi(['oblik']);
    okvir().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    expect(izmeni).toHaveBeenCalledTimes(1);
    expect(izmeni.mock.calls[0][0]).toBe(12);
    expect(izmeni.mock.calls[0][1].slojevi.map(s => s.id)).not.toContain('oblik');
    expect(store.izabrani()!.platno!.slojevi.map(s => s.id)).not.toContain('oblik');
    store.sacuvajOdmah();
    const put = http.expectOne('api/slajdovi/12');
    expect(put.request.body.platno.slojevi.map((s: { id: string }) => s.id)).not.toContain('oblik');
    put.flush({ ...platnoSlajd(12, 2), platno: put.request.body.platno });
  });

  it('promena izabranog slajda pravi novu instancu editora (prazna istorija), a pražnjenje je registrovala nova', async () => {
    store.izaberi(12);
    await fixture.whenStable();
    const prvi = editor().componentInstance;
    const prviStore = editor().injector.get(PlatnoEditorStore);
    prviStore.izaberi(['oblik']);
    prviStore.obrisiIzabrane();
    expect(prviStore.mozeNazad()).toBe(true);
    store.izaberi(13);
    http.expectOne('api/slajdovi/12').flush({ ...platnoSlajd(12, 2), platno: prviStore.platno() });
    await fixture.whenStable();
    expect(editor().componentInstance).not.toBe(prvi);
    const drugiStore = editor().injector.get(PlatnoEditorStore);
    expect(drugiStore.mozeNazad()).toBe(false);
    expect(drugiStore.platno().slojevi.map(s => s.id)).toContain('oblik');
    const isprazni = vi.spyOn(drugiStore, 'isprazni');
    store.isprazni();
    expect(isprazni).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 3 (nacrt): + Platno, izmena, odgovor na POST -> ista instanca, mozeNazad true, sledeća izmena je PUT pravog id-ja', async () => {
    const dodaj = [...el().querySelectorAll<HTMLButtonElement>('.uz-ed-dodaj button')].find(b => b.textContent?.trim() === 'Platno')!;
    dodaj.click();
    const nacrt = store.izabrani()!;
    expect(nacrt.id).toBeLessThan(0);
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    await fixture.whenStable();
    const komponenta = editor().componentInstance;
    const ps = editor().injector.get(PlatnoEditorStore);
    expect(ps.ubaci(id => noviOblik(id, 'NACRT', 'PRAVOUGAONIK'))).not.toBeNull();
    expect(ps.mozeNazad()).toBe(true);

    post.flush({ ...platnoSlajd(30, 4), platno: nacrt.platno });
    await fixture.whenStable();
    expect(store.izabraniId()).toBe(30);
    expect(editor().componentInstance).toBe(komponenta);
    expect(ps.mozeNazad()).toBe(true);

    ps.pomeriIzabrane(5, 0);
    store.sacuvajOdmah();
    const putevi = http.match('api/slajdovi/30');
    expect(putevi.length).toBeGreaterThan(0);
    expect(putevi.every(r => r.request.method === 'PUT')).toBe(true);
    expect(putevi.at(-1)!.request.body.platno).toBe(ps.platno());
    for (const r of putevi) r.flush({ ...platnoSlajd(30, 4), platno: r.request.body.platno });
    http.expectNone(r => r.url.startsWith('api/slajdovi/-'));
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
  it('posle uvoza fokus je na prvom uvezenom slajdu u listi (ne na body)', async () => {
    dugmeUvoza().click();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    const aktivan = document.activeElement as HTMLElement;
    expect(aktivan).not.toBe(document.body);
    expect(aktivan.classList.contains('uz-ed-stavka-dugme')).toBe(true);
    expect(aktivan.getAttribute('aria-current')).toBe('true');
    expect(aktivan.textContent).toContain('3');
  });

  it('dok je dijalog otvoren dugme ostaje fokusabilno (aria-disabled), a drugi klik ne otvara ponovo', async () => {
    const zatvaranje = new Subject<PrezentacijaDetails | undefined>();
    otvori.mockResolvedValue(zatvaranje);
    dugmeUvoza().click();
    await fixture.whenStable();
    fixture.detectChanges();
    const dugme = dugmeUvoza();
    expect(dugme.disabled).toBe(false);
    expect(dugme.getAttribute('aria-disabled')).toBe('true');
    dugme.click();
    await fixture.whenStable();
    expect(otvori).toHaveBeenCalledTimes(1);
    zatvaranje.next(undefined);
    zatvaranje.complete();
  });

  it('ishod "osvezi" (nepoznat ishod slanja) ponovo učitava prezentaciju', async () => {
    otvori.mockResolvedValue(of('osvezi'));
    dugmeUvoza().click();
    await fixture.whenStable();
    http.expectOne('api/prezentacije/1').flush(posleUvoza);
    expect(store.slajdovi().map(s => s.id)).toEqual([11, 12, 30]);
  });

  it('ishod "osvezi": editor se ne ruši dok se prezentacija čita ponovo, fokus ostaje na dugmetu "PowerPoint"', async () => {
    otvori.mockResolvedValue(of('osvezi'));
    const dugme = dugmeUvoza();
    dugme.focus();
    dugme.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dugmeUvoza()).toBe(dugme);                 // ista komponenta, nije ponovo napravljena
    expect(document.activeElement).toBe(dugme);
    http.expectOne('api/prezentacije/1').flush(posleUvoza);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.slajdovi().map(s => s.id)).toEqual([11, 12, 30]);
    expect(store.izabraniId()).toBe(12);              // izabran slajd ostaje kad ga nova lista ima
    expect(document.activeElement).toBe(dugme);
  });

  it('ishod "osvezi" pa neuspelo čitanje -> poruka greške kao pri prvom učitavanju', async () => {
    otvori.mockResolvedValue(of('osvezi'));
    dugmeUvoza().click();
    await fixture.whenStable();
    http.expectOne('api/prezentacije/1').flush({ reason: 'Nema veze.' }, { status: 500, statusText: 'Greška' });
    fixture.detectChanges();
    expect(store.prezentacija()).toBeNull();
    expect(store.greska()).not.toBeNull();
  });

  it('dok uvoz šalje, napuštanje editora traži potvrdu sa tekstom o uvozu', () => {
    const editor = fixture.componentInstance;
    expect(editor.imaNesacuvanihIzmena()).toBe(false);
    const sesija = { kljuc: 'uvoz-1', uToku: 1, mirovanje: new Subject<void>(), nesacuvano: () => 1 };
    TestBed.inject(RegistarCuvanja).prijavi(sesija);
    expect(editor.imaNesacuvanihIzmena()).toBe(true);
    expect(editor.tekstNapustanja()).toContain('Uvoz iz PowerPointa');
    // dijalog uvoza ima closeOnNavigation: false: ostaje otvoren i posle napuštanja editora, pa se izveštaj vidi
    expect(editor.tekstNapustanja()).toContain('Prozor uvoza ostaje otvoren dok se uvoz ne završi.');
    expect(editor.tekstNapustanja()).not.toContain('nećeš videti');
    TestBed.inject(RegistarCuvanja).odjavi(sesija);
    expect(editor.imaNesacuvanihIzmena()).toBe(false);
  });

  it('uništen editor se odjavljuje: kasniji ishod dijaloga ne dira store', async () => {
    const zatvaranje = new Subject<PrezentacijaDetails | undefined>();
    otvori.mockResolvedValue(zatvaranje);
    const primeniUvoz = vi.spyOn(store, 'primeniUvoz');
    dugmeUvoza().click();
    await fixture.whenStable();
    fixture.destroy();
    expect(zatvaranje.observed).toBe(false);
    zatvaranje.next(posleUvoza);
    expect(primeniUvoz).not.toHaveBeenCalled();
  });
});

describe('PrezentacijaEditorPage: sličice slajdova u listi', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  const platnoSlajd = (id: number, rb: number): SlajdDetails => ({
    id, rb, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(),
  });
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
      // jsdom nema IntersectionObserver: `@defer (on viewport)` se iscrtava ručno.
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    fixture.debugElement.injector.get(EditorStore).ucitaj(1);
    http.expectOne('api/prezentacije/1')
      .flush({ ...prezentacija, brojSlajdova: 2, slajdovi: [{ ...slajd(11, 1, 'Uvod'), sadrzaj: 'Materijal: https://example.com' }, platnoSlajd(12, 2)] });
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('sličica PLATNO slajda prikazuje sve slojeve (i one sa ULAZ animacijom), a sakrivena je od čitača', async () => {
    const blokovi = await fixture.getDeferBlocks();
    expect(blokovi.length).toBe(2);
    for (const b of blokovi) await b.render(DeferBlockState.Complete);
    await fixture.whenStable();
    const slicice = [...el().querySelectorAll<HTMLElement>('.uz-ed-slicica')];
    expect(slicice.length).toBe(2);
    for (const s of slicice) expect(s.getAttribute('aria-hidden')).toBe('true');
    const slojevi = [...slicice[1].querySelectorAll<HTMLElement>('.uz-pl-sloj')];
    expect(slojevi.length).toBeGreaterThan(0);
    for (const sl of slojevi) expect(sl.style.visibility).toBe('');
    expect(slicice[1].querySelectorAll('.uz-pl-sloj[style*="hidden"]').length).toBe(0);
  });

  it('ime dugmeta stavke i dalje počinje rednim brojem; sličica nema fokusabilnih elemenata', async () => {
    const blokovi = await fixture.getDeferBlocks();
    for (const b of blokovi) await b.render(DeferBlockState.Complete);
    await fixture.whenStable();
    const dugme = el().querySelectorAll<HTMLElement>('.uz-ed-stavka-dugme')[1];
    // Ime iz sadržaja bez `aria-hidden` potomaka: delovi redom (jsdom nema raspored, pa nema razmaka između flex stavki).
    const ime = dugme.cloneNode(true) as HTMLElement;
    ime.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
    expect([...ime.querySelectorAll('.uz-ed-rb, .uz-ed-oznaka')].map(n => n.textContent!.trim())).toEqual(['2', 'Prvi']);
    expect(ime.textContent!.trim()).toBe('2Prvi');
    expect(dugme.querySelectorAll('.uz-ed-slicica button, .uz-ed-slicica a, .uz-ed-slicica [tabindex]').length).toBe(0);
  });

  it('sličica INFO slajda sa linkom je inert: link u njoj ne dobija fokus (Tab ga preskače)', async () => {
    const blokovi = await fixture.getDeferBlocks();
    for (const b of blokovi) await b.render(DeferBlockState.Complete);
    await fixture.whenStable();
    const slicica = el().querySelector<HTMLElement>('.uz-ed-slicica')!;
    const link = slicica.querySelector('a[href]');
    expect(link).not.toBeNull();
    expect(slicica.hasAttribute('inert')).toBe(true);
    expect(link!.closest('[inert]')).toBe(slicica);
  });
});
