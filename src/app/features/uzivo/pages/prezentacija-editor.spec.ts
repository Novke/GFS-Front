import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorHandler } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { MockInstance } from 'vitest';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';
import { EditorStore, NijeSacuvano } from '../data-access/editor.store';
import { Prelaz, PrezentacijaDetails, SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { PrezentacijaEditorPage } from './prezentacija-editor.page';
import { UvozPdfOtvarac } from './uvoz-pdf-otvarac';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';
import { platno } from '../data-access/platno-podaci.testing';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';
import { noviOblik } from '../data-access/platno-novo';
import { PlatnoEditorComponent } from '../editor-platna/platno-editor.component';
import { PlatnoEditorStore } from '../editor-platna/platno-editor.store';
import { TekstUredjivacComponent } from '../editor-platna/tekst/tekst-uredjivac.component';
import type { TekstSloj } from '../data-access/platno.models';
import { DIMENZIJE_SLIKE } from '../ui/dimenzije-slike';
import { OPISI_GUBITAKA } from '../data-access/pretvori-u-platno';
import { SlajdFormaComponent } from './slajd-forma.component';
import { PregledPrelazaPodaci, PrelazPregledDialog } from './prelaz-pregled.dialog';

const POKRENI = 'api/prezentacije/1/izvodjenja';
/** Stavka otvorenog menija (CDK overlay je u body). */
const stavkaMenija = (tekst: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item')].find(b => b.textContent?.trim() === tekst)!;

function slajd(id: number, rb: number, naslov: string): SlajdDetails {
  return { id, rb, tip: 'INFO', naslov, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null, platno: null, prelaz: null };
}

function info(naslov: string): SlajdCmd {
  return { tip: 'INFO', naslov, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null, platno: null, prelaz: null };
}

const prezentacija: PrezentacijaDetails = {
  id: 1, naziv: 'Statika', opis: null, predmet: { id: 7, naziv: 'Mehanika' }, brojSlajdova: 1, brojPitanja: 0,
  izmenjeno: '2026-10-07T10:00:00', tema: 'NACRT', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: true,
  brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi: [slajd(11, 1, 'Uvod')],
};

// Polja prelaza u formi slajda su `@defer (on immediate)` (F16). Prvi dinamički uvoz chunk-a traje van lažnog sata, pa bi
// njegovo iscrtavanje usred testa sa `saLaznimSatom` zakazalo tajmere scheduler-a posle provere; učitan unapred, svaki
// sledeći uvoz se razreši u mikrozadacima. Isto važi za dijalog pregleda prelaza (F17, `import()` na klik).
beforeAll(async () => {
  await import('./prelaz-polja.component');
  await import('./prelaz-pregled.dialog');
});

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
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, platno: null, prelaz: null,
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

  it('završni talas: dok radi (Pokreni čeka PUT), klik na onemogućena dugmad (Dupliraj, Obriši, Pokreni, PowerPoint, PDF) ne radi ništa', saLaznimSatom(async () => {
    store.izmeniSlajd(11, info('Izmenjen uvod'));
    strana.pokreni();
    const put = http.expectOne('api/slajdovi/11');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const dugmad = [...el.querySelectorAll<HTMLButtonElement>('.uz-ed-akcije button, .uz-ed-dodaj button[aria-label^="Uvezi iz "]')];
    expect(dugmad.map((b) => [b.textContent!.trim(), b.getAttribute('aria-disabled')])).toEqual([
      ['Dupliraj prezentaciju', 'true'], ['Obriši', 'true'], ['Pokreni', 'true'], ['PowerPoint', 'true'], ['PDF', 'true'],
    ]);
    dugmad.forEach((b) => b.click());
    await isprazniMikrozadatke();
    expect(dijalog).not.toHaveBeenCalled();
    put.flush(slajd(11, 1, 'Izmenjen uvod'));
    http.expectOne(POKRENI).flush({ id: 77 });
    http.expectNone('api/prezentacije/1/dupliraj');
    expect(navigate).toHaveBeenCalledTimes(1);
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
    platno: platno(), prelaz: null,
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

  it('PLATNO u listi ima ikonu layers i naziv Platno', () => {
    const ikone = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.uz-ed-stavka mat-icon.uz-ed-ikona')];
    expect(ikone.map(i => i.getAttribute('aria-label'))).toEqual(['Info slajd', 'Platno']);
    expect(ikone[1].getAttribute('data-mat-icon-name')).toBe('layers');
  });

  it('F18: PLATNO slajd nema bočni pregled (koraci su u "Pregled" editora), INFO ga ima', () => {
    const el = fixture.nativeElement as HTMLElement;
    store.izaberi(12);
    fixture.detectChanges();
    expect(el.querySelector('.uz-ed-pregled')).toBeNull();
    expect(el.textContent).not.toContain('Korak napred');
    store.izaberi(11);
    fixture.detectChanges();
    expect(el.querySelector('.uz-ed-pregled app-slajd-prikaz')).not.toBeNull();
    expect(el.querySelector('.uz-ed-pregled')!.textContent).toContain('Ovako slajd izgleda na projektoru.');
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

  it('F16: beleške PLATNO slajda i naslov INFO slajda iz forme: PUT nosi postojeći prelaz (puna zamena ga ne briše)', saLaznimSatom(async () => {
    const P: Prelaz = { efekat: 'GURANJE', smer: 'DOLE', trajanjeMs: 600 };
    const F: Prelaz = { efekat: 'FADE', smer: null, trajanjeMs: 400 };
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({
      ...prezentacija, slajdovi: [{ ...slajd(11, 1, 'Uvod'), prelaz: F }, { ...platnoSlajd, prelaz: P }],
    });
    store.izaberi(12);
    fixture.detectChanges();
    await isprazniMikrozadatke();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const beleske = el.querySelector('textarea[formcontrolname=beleske]') as HTMLTextAreaElement;
    beleske.value = 'Nove beleške';
    beleske.dispatchEvent(new Event('input'));
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/12');
    expect(put.request.body).toMatchObject({ beleske: 'Nove beleške', prelaz: P });
    put.flush({ ...platnoSlajd, beleske: 'Nove beleške', prelaz: P });
    store.izaberi(11);
    fixture.detectChanges();
    const naslov = el.querySelector('input[formcontrolname=naslov]') as HTMLInputElement;
    naslov.value = 'Uvod 2';
    naslov.dispatchEvent(new Event('input'));
    await pomeriSat(800);
    const put11 = http.expectOne('api/slajdovi/11');
    expect(put11.request.body).toMatchObject({ naslov: 'Uvod 2', prelaz: F });
    put11.flush({ ...slajd(11, 1, 'Uvod 2'), prelaz: F });
    await pomeriSat(800);
  }));

  it('F17: "Pregledaj prelaz" otvara pregled sa prethodnim i izabranim slajdom (prelaz iz forme, pre čuvanja) i temom', saLaznimSatom(async () => {
    const P: Prelaz = { efekat: 'GURANJE', smer: 'DOLE', trajanjeMs: 600 };
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({
      ...prezentacija, tema: 'PONOC', slajdovi: [slajd(11, 1, 'Uvod'), { ...platnoSlajd, prelaz: P }],
    });
    store.izaberi(12);
    fixture.detectChanges();
    await isprazniMikrozadatke();
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({} as MatDialogRef<unknown>);
    const el = fixture.nativeElement as HTMLElement;
    const trajanje = el.querySelector('.uz-ed-prelaz input[type=number]') as HTMLInputElement;
    trajanje.value = '1.2';
    trajanje.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const dugme = [...el.querySelectorAll<HTMLButtonElement>('.uz-ed-prelaz button')].find(b => b.textContent?.trim() === 'Pregledaj prelaz')!;
    dugme.click();
    await isprazniMikrozadatke();
    expect(open).toHaveBeenCalledTimes(1);
    const [komponenta, konfig] = open.mock.calls[0] as [unknown, { data: PregledPrelazaPodaci; autoFocus: unknown }];
    expect(komponenta).toBe(PrelazPregledDialog);
    expect(konfig.autoFocus).toBe(false);
    expect(konfig.data.pre?.id).toBe(11);
    expect(konfig.data.slajd.id).toBe(12);
    expect(konfig.data.slajd.prelaz).toEqual({ ...P, trajanjeMs: 1200 });
    expect(konfig.data.tema).toBe('PONOC');
    await pomeriSat(800);
    http.expectOne('api/slajdovi/12').flush({ ...platnoSlajd, prelaz: { ...P, trajanjeMs: 1200 } });
    await pomeriSat(800);
  }));

  it('meni "Platno" > "Prazno" dodaje prazan PLATNO slajd, bira ga i šalje POST', saLaznimSatom(async () => {
    const dodaj = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.uz-ed-dodaj button')]
      .find(b => b.textContent?.trim() === 'Platno') as HTMLButtonElement;
    expect(dodaj).toBeTruthy();
    expect(dodaj.getAttribute('aria-haspopup')).toBe('menu');
    dodaj.click();
    fixture.detectChanges();
    stavkaMenija('Prazno').click();
    const nacrt = store.izabrani()!;
    expect(nacrt.tip).toBe('PLATNO');
    expect(nacrt.platno!.slojevi).toEqual([]);
    expect(nacrt.id).toBeLessThan(0);
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.tip).toBe('PLATNO');
    post.flush({ ...platnoSlajd, id: 30, rb: 3, platno: nacrt.platno });
    expect(store.izabraniId()).toBe(30);
    await pomeriSat(800);
  }));

  it('meni "Platno" > "Naslov i tekst": PLATNO sa slojevima s1 (naslov) i s2 (telo)', saLaznimSatom(async () => {
    const dodaj = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.uz-ed-dodaj button')]
      .find(b => b.textContent?.trim() === 'Platno') as HTMLButtonElement;
    dodaj.click();
    fixture.detectChanges();
    stavkaMenija('Naslov i tekst').click();
    const nacrt = store.izabrani()!;
    expect(nacrt.tip).toBe('PLATNO');
    expect(nacrt.platno!.slojevi.map(s => [s.id, s.tip])).toEqual([['s1', 'TEKST'], ['s2', 'TEKST']]);
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    expect(post.request.body.platno.slojevi.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']);
    post.flush({ ...platnoSlajd, id: 31, rb: 3, platno: nacrt.platno });
    await pomeriSat(800);
  }));

  it('beforeunload prvo zove pražnjenje editora platna, pa traži potvrdu dok je nešto otvoreno', () => {
    const isprazni = vi.fn();
    let otvoreno = true;
    const odjavi = store.registrujPraznjenje(isprazni, () => otvoreno);
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
    odjavi();
  });

  it('ispod izbora teme stoji napomena: tema ne prebojava postojeće slojeve platna (odluka 23)', () => {
    const grupa = (fixture.nativeElement as HTMLElement).querySelector('mat-radio-group[aria-labelledby="uz-ed-tema"]')!;
    const id = grupa.getAttribute('aria-describedby')!;
    const napomena = (fixture.nativeElement as HTMLElement).querySelector(`[id="${id}"]`)!;
    expect(napomena.textContent!.trim()).toBe('Tema menja izgled Info i Pitanje slajdova i podrazumevane boje i fontove novih '
      + 'slojeva platna; postojeći slojevi zadržavaju svoje boje i fontove.');
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
    platno: platno(), prelaz: null,
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
    await fixture.whenStable();
    stavkaMenija('Prazno').click();
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

describe('PrezentacijaEditorPage: tekst na platnu (F12, Review Focus 1)', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  let store: InstanceType<typeof EditorStore>;
  /** PLATNO slajd 14 sa samo TEKST slojem fiksture ("Prvi", "Drugi"; 10, 10, 200 x 100) i animacijom njegovog pasusa 0. */
  const samoTekst = (): SlajdDetails => {
    const p = platno();
    return {
      id: 14, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
      platno: { ...p, slojevi: p.slojevi.filter(x => x.tip === 'TEKST'), animacije: p.animacije.filter(a => a.slojId === 'tekst') },
      prelaz: null,
    };
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const uredjivac = () => fixture.debugElement.query(By.directive(TekstUredjivacComponent))?.componentInstance as
    TekstUredjivacComponent | undefined;
  const tekstPuta = (r: { request: { body: SlajdCmd } }) =>
    (r.request.body.platno!.slojevi[0] as TekstSloj).pasusi.map(p => p.delovi.map(d => d.tekst).join(''));

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
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija, brojSlajdova: 2, slajdovi: [slajd(11, 1, 'Uvod'), samoTekst()] });
    await fixture.whenStable();
    store.izaberi(14);
    await fixture.whenStable();
    // dvoklik na TEKST sloj (jsdom: širina 0, pa 1 px = 1 jedinica)
    el().querySelector('app-platno-overlay')!.dispatchEvent(new MouseEvent('dblclick', { clientX: 50, clientY: 50, bubbles: true }));
    await fixture.whenStable();
    const v = uredjivac()!.pogled()!;
    v.dispatch(v.state.tr.insertText('Zdravo ', 1));
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('kucanje pa store.sacuvajSve() bez Esc: PUT /slajdovi/14 nosi "Zdravo"; sesija ostaje otvorena', async () => {
    expect(el().querySelector('.uz-ep-uredjivanje [contenteditable]')).not.toBeNull();
    let gotovo = false;
    store.sacuvajSve().subscribe(() => (gotovo = true));
    const put = http.expectOne('api/slajdovi/14');
    expect(put.request.method).toBe('PUT');
    expect(tekstPuta(put)).toEqual(['Zdravo Prvi', 'Drugi']);
    // animacija pasusa 0 je i dalje na pasusu 0 (ključ p0)
    expect((put.request.body as SlajdCmd).platno!.animacije.map(a => a.pasus)).toEqual([0]);
    put.flush({ ...samoTekst(), platno: put.request.body.platno });
    await fixture.whenStable();
    expect(gotovo).toBe(true);
    expect(el().querySelector('.uz-ep-uredjivanje [contenteditable]')).not.toBeNull();
  });

  it('imaNesacuvano() je true dok je sesija otvorena (i posle čuvanja teksta)', async () => {
    expect(store.imaNesacuvano()).toBe(true);
    store.sacuvajSve().subscribe();
    const put = http.expectOne('api/slajdovi/14');
    put.flush({ ...samoTekst(), platno: put.request.body.platno });
    await fixture.whenStable();
    expect(store.imaNesacuvano()).toBe(true);
  });

  it('"Pokreni": PUT sa tekstom stiže pre pokretanja (izvođenje kreće tek posle odgovora)', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pokreni = [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith('Pokreni'))!;
    expect(pokreni).toBeTruthy();
    pokreni.click();
    const put = http.expectOne('api/slajdovi/14');
    expect(tekstPuta(put)).toEqual(['Zdravo Prvi', 'Drugi']);
    http.expectNone(POKRENI);
    put.flush({ ...samoTekst(), platno: put.request.body.platno });
    await fixture.whenStable();
    http.expectOne(POKRENI).flush({ id: 77 });
    expect(navigate).toHaveBeenCalledWith(['izvodjenja', 77, 'konzola']);
  });

  it('beforeunload tokom otvorene sesije: tekst ide u PUT i kartica traži potvrdu (defaultPrevented)', async () => {
    const dogadjaj = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dogadjaj);
    expect(dogadjaj.defaultPrevented).toBe(true);
    const put = http.expectOne('api/slajdovi/14');
    expect(tekstPuta(put)).toEqual(['Zdravo Prvi', 'Drugi']);
    put.flush({ ...samoTekst(), platno: put.request.body.platno });
    await fixture.whenStable();
  });

  it('promena slajda usred kucanja: tekst ide odmah u PUT starog slajda (izaberi prvo prazni editor)', async () => {
    store.izaberi(11);
    const put = http.expectOne('api/slajdovi/14');
    expect(tekstPuta(put)).toEqual(['Zdravo Prvi', 'Drugi']);
    put.flush({ ...samoTekst(), platno: put.request.body.platno });
    await fixture.whenStable();
    expect(uredjivac()).toBeUndefined();
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

describe('PrezentacijaEditorPage: uvoz iz PDF-a', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;
  let otvori: ReturnType<typeof vi.fn>;
  let otvoriPptx: ReturnType<typeof vi.fn>;
  let poruka: ReturnType<typeof vi.spyOn>;
  const posleUvoza: PrezentacijaDetails = {
    ...prezentacija, tema: 'TAMNA', brojSlajdova: 3,
    slajdovi: [slajd(11, 1, 'Uvod'), slajd(12, 2, 'Drugi'), { ...slajd(30, 3, ''), tip: 'PLATNO', naslov: null, platno: platno() }],
  };

  beforeEach(() => {
    otvori = vi.fn().mockResolvedValue(of(posleUvoza));
    otvoriPptx = vi.fn();
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: UvozPdfOtvarac, useValue: { otvori } },
        { provide: UvozPptxOtvarac, useValue: { otvori: otvoriPptx } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    poruka = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({
      ...prezentacija, tema: 'TAMNA', brojSlajdova: 2, slajdovi: [slajd(11, 1, 'Uvod'), slajd(12, 2, 'Drugi')],
    });
    store.izaberi(12);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const dugmeUvoza = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Uvezi iz PDF-a') as HTMLButtonElement;

  it('dugme "PDF" (ime Uvezi iz PDF-a) pored "PowerPoint" čuva sve, otvara uvoz sa izabranim slajdom i temom, primenjuje rezultat', async () => {
    const dugme = dugmeUvoza();
    expect(dugme).toBeDefined();
    expect(dugme.textContent?.trim()).toBe('PDF');
    expect(dugme.title).toBe('Uvezi iz PDF-a');
    expect(dugme.querySelector('mat-icon')?.getAttribute('svgicon')).toBe('picture_as_pdf');
    expect(dugme.closest('.uz-ed-dodaj')).not.toBeNull();
    expect(dugme.previousElementSibling?.getAttribute('aria-label')).toBe('Uvezi iz PowerPointa');
    const sacuvajSve = vi.spyOn(store, 'sacuvajSve');
    const primeniUvoz = vi.spyOn(store, 'primeniUvoz');
    dugme.click();
    await isprazniMikrozadatke();
    expect(sacuvajSve).toHaveBeenCalledTimes(1);
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(sacuvajSve.mock.invocationCallOrder[0]).toBeLessThan(otvori.mock.invocationCallOrder[0]);
    expect(otvori.mock.calls[0][1]).toEqual({ prezentacijaId: 1, brojSlajdova: 2, izabraniId: 12, izabraniRb: 2, tema: 'TAMNA' });
    expect(primeniUvoz).toHaveBeenCalledWith(posleUvoza);
    expect(store.izabraniId()).toBe(30);
    expect(otvoriPptx).not.toHaveBeenCalled();
    expect((fixture.componentInstance as unknown as { radi(): boolean }).radi()).toBe(false);
  });

  it('sacuvajSve baci NijeSacuvano -> poruka, dijalog PDF-a se ne otvara', async () => {
    vi.spyOn(store, 'sacuvajSve').mockReturnValue(throwError(() => new NijeSacuvano('Slajd 2 nije potpun.')));
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(otvori).not.toHaveBeenCalled();
    expect(poruka).toHaveBeenCalledWith('Uvoz nije pokrenut: Slajd 2 nije potpun.');
    expect((fixture.componentInstance as unknown as { radi(): boolean }).radi()).toBe(false);
  });

  it('lenji chunk dijaloga se ne učita -> poruka, bez sirove greške', async () => {
    otvori.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(poruka).toHaveBeenCalledTimes(1);
    expect(poruka.mock.calls[0][0]).toMatch(/^Uvoz nije pokrenut: /);
    expect(poruka.mock.calls[0][0]).not.toContain('TypeError');
    expect(TestBed.inject(ErrorHandler).handleError).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it('ishod "osvezi" ponovo učitava prezentaciju; zatvaranje bez uvoza ne primenjuje ništa', async () => {
    otvori.mockResolvedValue(of('osvezi'));
    dugmeUvoza().click();
    await fixture.whenStable();
    http.expectOne('api/prezentacije/1').flush(posleUvoza);
    expect(store.slajdovi().map(s => s.id)).toEqual([11, 12, 30]);

    otvori.mockResolvedValue(of(undefined));
    const primeniUvoz = vi.spyOn(store, 'primeniUvoz');
    dugmeUvoza().click();
    await isprazniMikrozadatke();
    expect(otvori).toHaveBeenCalledTimes(2);
    expect(primeniUvoz).not.toHaveBeenCalled();
  });

  it('dok je dijalog PDF-a otvoren, "PDF" i "PowerPoint" su aria-disabled i klik ne otvara ništa', async () => {
    const zatvaranje = new Subject<PrezentacijaDetails | undefined>();
    otvori.mockResolvedValue(zatvaranje);
    dugmeUvoza().click();
    await fixture.whenStable();
    fixture.detectChanges();
    const dugme = dugmeUvoza();
    expect(dugme.getAttribute('aria-disabled')).toBe('true');
    dugme.click();
    const pptx = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'Uvezi iz PowerPointa') as HTMLButtonElement;
    expect(pptx.getAttribute('aria-disabled')).toBe('true');
    pptx.click();
    await fixture.whenStable();
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(otvoriPptx).not.toHaveBeenCalled();
    zatvaranje.next(undefined);
    zatvaranje.complete();
  });

  it('dok uvoz PDF-a šalje, napuštanje editora traži potvrdu sa tekstom o uvozu iz PDF-a', () => {
    const editor = fixture.componentInstance;
    const sesija = { kljuc: 'uvoz-pdf-1', uToku: 1, mirovanje: new Subject<void>(), nesacuvano: () => 1 };
    TestBed.inject(RegistarCuvanja).prijavi(sesija);
    expect(editor.imaNesacuvanihIzmena()).toBe(true);
    expect(editor.tekstNapustanja()).toContain('Uvoz iz PDF-a još traje');
    expect(editor.tekstNapustanja()).not.toContain('PowerPoint');
    TestBed.inject(RegistarCuvanja).odjavi(sesija);
    expect(editor.imaNesacuvanihIzmena()).toBe(false);
  });
});

describe('PrezentacijaEditorPage: sličice slajdova u listi', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  const platnoSlajd = (id: number, rb: number): SlajdDetails => ({
    id, rb, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(), prelaz: null,
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
    // dve sličice i polja prelaza u formi izabranog slajda (F16, lenji chunk)
    expect(blokovi.length).toBe(3);
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

describe('PrezentacijaEditorPage: Pretvori u platno (F10)', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let http: HttpTestingController;
  let store: InstanceType<typeof EditorStore>;
  let strana: {
    pretvoriUPlatno(s: SlajdDetails): Promise<void>;
    ucitajPretvaranje: () => Promise<unknown>;
  };
  let dimenzije: ReturnType<typeof vi.fn>;
  let dijalog: ReturnType<typeof vi.spyOn>;
  let odgovorDijaloga: boolean;
  let uspeh: ReturnType<typeof vi.spyOn>;
  let izmeni: MockInstance<(id: number, cmd: SlajdCmd) => void>;
  const el = () => fixture.nativeElement as HTMLElement;
  const infoSlajd = (izmena: Partial<SlajdDetails> = {}): SlajdDetails => ({
    ...slajd(11, 1, 'Uvod'), sadrzaj: '- prvo\n- drugo', beleske: 'Moje beleške', postepeno: true, ...izmena,
  });
  const tekstSloja = (cmd: SlajdCmd, id: string) =>
    (cmd.platno!.slojevi.find(x => x.id === id) as TekstSloj | undefined)?.pasusi.map(p => p.delovi.map(d => d.tekst).join(''));
  /** Pozivi `izmeniSlajd` sa PLATNO komandom (pretvaranje), redom. */
  const uPlatno = () => izmeni.mock.calls.filter(c => c[1].tip === 'PLATNO');
  const dugmePretvori = () =>
    [...el().querySelectorAll<HTMLButtonElement>('app-slajd-forma button')].find(b => b.textContent?.trim() === 'Pretvori u platno');

  async function ucitaj(s: SlajdDetails): Promise<void> {
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija, slajdovi: [s] });
    await fixture.whenStable();
  }

  /** Šalje sve (Ctrl+S) i odgovara na sve PUT-ove slajda 11 telom zahteva (kao server). */
  function sacuvajSve(): void {
    store.sacuvajOdmah();
    for (const r of http.match('api/slajdovi/11')) {
      const b = r.request.body as SlajdCmd;
      r.flush({ ...slajd(11, 1, ''), ...b, slika: null });
    }
  }

  beforeEach(() => {
    dimenzije = vi.fn(async () => ({ sirina: 1600, visina: 900 }));
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: DIMENZIJE_SLIKE, useValue: dimenzije },
      ],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    });
    http = TestBed.inject(HttpTestingController);
    odgovorDijaloga = true;
    dijalog = vi.spyOn(TestBed.inject(MatDialog), 'open')
      .mockImplementation(() => ({ afterClosed: () => of(odgovorDijaloga) }) as unknown as MatDialogRef<unknown>);
    uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    strana = fixture.componentInstance as unknown as typeof strana;
    store = fixture.debugElement.injector.get(EditorStore);
    izmeni = vi.spyOn(store, 'izmeniSlajd');
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('INFO bez gubitaka: klik na dugme, bez dijaloga, jedna PLATNO izmena (naslov s1, lista s2 sa 2 KLIK), beleške ostaju, "Poništi"', async () => {
    await ucitaj(infoSlajd());
    dugmePretvori()!.click();
    await vi.waitFor(() => expect(uPlatno().length).toBe(1));
    expect(dijalog).not.toHaveBeenCalled();
    const [id, cmd] = uPlatno()[0] as [number, SlajdCmd];
    expect(id).toBe(11);
    expect(cmd).toMatchObject({
      tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, postepeno: false, pitanje: null, beleske: 'Moje beleške',
    });
    expect(tekstSloja(cmd, 's1')).toEqual(['Uvod']);
    expect(tekstSloja(cmd, 's2')).toEqual(['prvo', 'drugo']);
    expect(cmd.platno!.animacije.map(a => [a.slojId, a.pasus, a.okidac])).toEqual([['s2', 0, 'KLIK'], ['s2', 1, 'KLIK']]);
    expect(store.izabrani()!.tip).toBe('PLATNO');
    expect(uspeh).toHaveBeenCalledTimes(1);
    expect(uspeh.mock.calls[0][0]).toBe('Slajd je pretvoren u platno.');
    expect(uspeh.mock.calls[0][1]).toMatchObject({ label: 'Poništi pretvaranje' });
    sacuvajSve();
  });

  it('"Poništi": prvo pražnjenje editora platna, pa INFO komanda iz trenutka pre pretvaranja (naslov, sadržaj, beleške, postepeno)', async () => {
    await ucitaj(infoSlajd());
    await strana.pretvoriUPlatno(store.izabrani()!);
    const isprazni = vi.spyOn(store, 'isprazni');
    izmeni.mockClear();
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    expect(isprazni).toHaveBeenCalledTimes(1);
    expect(izmeni).toHaveBeenCalledTimes(1);
    expect(isprazni.mock.invocationCallOrder[0]).toBeLessThan(izmeni.mock.invocationCallOrder[0]);
    expect(izmeni.mock.calls[0]).toEqual([11, {
      tip: 'INFO', naslov: 'Uvod', sadrzaj: '- prvo\n- drugo', slikaId: null, beleske: 'Moje beleške', postepeno: true,
      pitanje: null, platno: null, prelaz: null,
    }, null]);
    expect(store.izabrani()!.tip).toBe('INFO');
    sacuvajSve();
  });

  it('INFO sa vezom: ConfirmDialog sa tekstom gubitka veza; "Odustani" -> slajd ostaje INFO, bez poruke', async () => {
    await ucitaj(infoSlajd({ sadrzaj: 'Vidi [vezu](https://primer.rs).' }));
    odgovorDijaloga = false;
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(dijalog).toHaveBeenCalledTimes(1);
    const cfg = (dijalog.mock.calls[0][1] as { data: { naslov: string; tekst: string[]; potvrdi: string } }).data;
    expect(cfg.naslov).toBe('Pretvoriti slajd u platno?');
    expect(cfg.potvrdi).toBe('Pretvori');
    expect(cfg.tekst).toContain(OPISI_GUBITAKA.VEZE);
    expect(cfg.tekst.at(-1)).toBe('Posle pretvaranja možeš da poništiš.');
    expect(izmeni).not.toHaveBeenCalled();
    expect(uspeh).not.toHaveBeenCalled();
    expect(store.izabrani()!.tip).toBe('INFO');
  });

  it('INFO sa vezom: "Pretvori" u dijalogu -> PLATNO (tekst veze ostaje, adresa ne)', async () => {
    await ucitaj(infoSlajd({ sadrzaj: 'Vidi [vezu](https://primer.rs).' }));
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(uPlatno().length).toBe(1);
    expect(tekstSloja(uPlatno()[0][1] as SlajdCmd, 's2')).toEqual(['Vidi vezu.']);
    expect(uspeh).toHaveBeenCalledTimes(1);
    sacuvajSve();
  });

  it('slika slajda: veličina iz DIMENZIJE_SLIKE (medijUrl), SLIKA sloj s3 sa istim medijem', async () => {
    await ucitaj(infoSlajd({ slika: { id: 'm1', naziv: 'Most.png', mime: 'image/png', velicina: 10 } }));
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(dimenzije).toHaveBeenCalledWith('api/public/mediji/m1');
    const s3 = uPlatno()[0][1].platno!.slojevi.find((x: { id: string }) => x.id === 's3') as { tip: string; medijId: string };
    expect(s3).toMatchObject({ tip: 'SLIKA', medijId: 'm1' });
    sacuvajSve();
  });

  it('posle pretvaranja: editor platna umesto INFO forme, nova instanca forme (track kljuc:tip)', async () => {
    await ucitaj(infoSlajd());
    const prva = fixture.debugElement.query(By.directive(SlajdFormaComponent)).componentInstance;
    expect(el().querySelector('app-platno-editor')).toBeNull();
    await strana.pretvoriUPlatno(store.izabrani()!);
    await fixture.whenStable();
    expect(el().querySelector('app-platno-editor')).not.toBeNull();
    expect(fixture.debugElement.query(By.directive(SlajdFormaComponent)).componentInstance).not.toBe(prva);
    expect(dugmePretvori()).toBeUndefined();
    expect(el().querySelector('app-slajd-forma input')).toBeNull();
    sacuvajSve();
  });

  it('dvostruki klik: drugi poziv ne pretvara ponovo (slajd više nije INFO), jedna poruka', async () => {
    await ucitaj(infoSlajd());
    const s = store.izabrani()!;
    await Promise.all([strana.pretvoriUPlatno(s), strana.pretvoriUPlatno(s)]);
    expect(uPlatno().length).toBe(1);
    expect(uspeh).toHaveBeenCalledTimes(1);
    sacuvajSve();
  });

  it('I1: dvostruki klik uz gubitke (veza) otvara tačno jedan dijalog; posle "Odustani" novi klik ga otvara ponovo', async () => {
    await ucitaj(infoSlajd({ sadrzaj: 'Vidi [vezu](https://primer.rs).' }));
    odgovorDijaloga = false;
    const s = store.izabrani()!;
    await Promise.all([strana.pretvoriUPlatno(s), strana.pretvoriUPlatno(s)]);
    expect(dijalog).toHaveBeenCalledTimes(1);
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(dijalog).toHaveBeenCalledTimes(2);
    expect(izmeni).not.toHaveBeenCalled();
  });

  it('"Poništi pretvaranje" čuva beleške otkucane posle pretvaranja i vraća sliku sa pravim nazivom (ne "Slika")', async () => {
    const most = { id: 'm1', naziv: 'Most.png', mime: 'image/png', velicina: 10 };
    await ucitaj(infoSlajd({ slika: most }));
    await strana.pretvoriUPlatno(store.izabrani()!);
    store.izmeniSlajd(11, { ...uPlatno()[0][1], beleske: 'Posle pretvaranja' });
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    const s = store.izabrani()!;
    expect(s.tip).toBe('INFO');
    expect(s.beleske).toBe('Posle pretvaranja');
    expect(s.slika).toEqual(most);
    expect(izmeni.mock.calls.at(-1)![1]).toMatchObject({ tip: 'INFO', slikaId: 'm1', beleske: 'Posle pretvaranja' });
    sacuvajSve();
  });

  it('F16: prelaz INFO slajda ide u PLATNO komandu; "Poništi pretvaranje" vraća prelaz kakav je sada', async () => {
    const p: Prelaz = { efekat: 'GURANJE', smer: 'LEVO', trajanjeMs: 700 };
    await ucitaj(infoSlajd({ prelaz: p }));
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(uPlatno()[0][1].prelaz).toEqual(p);
    expect(store.izabrani()!.prelaz).toEqual(p);
    // izmena prelaza u formi platna posle pretvaranja: Poništi je ne vraća na stari
    const novi: Prelaz = { efekat: 'FADE', smer: null, trajanjeMs: 300 };
    store.izmeniSlajd(11, { ...uPlatno()[0][1], prelaz: novi });
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    expect(izmeni.mock.calls.at(-1)![1]).toMatchObject({ tip: 'INFO', naslov: 'Uvod', prelaz: novi });
    expect(store.izabrani()!.prelaz).toEqual(novi);
    store.sacuvajOdmah();
    const put = http.expectOne('api/slajdovi/11');
    expect(put.request.body).toMatchObject({ tip: 'INFO', prelaz: novi });
    put.flush({ ...slajd(11, 1, 'Uvod'), ...put.request.body, slika: null });
  });

  it('F16: "Poništi pretvaranje" bez izmene prelaza vraća prelaz INFO slajda; prelaz obrisan posle pretvaranja ostaje obrisan', async () => {
    const p: Prelaz = { efekat: 'BRISANJE', smer: 'DOLE', trajanjeMs: 1000 };
    await ucitaj(infoSlajd({ prelaz: p }));
    await strana.pretvoriUPlatno(store.izabrani()!);
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    expect(izmeni.mock.calls.at(-1)![1]).toMatchObject({ tip: 'INFO', prelaz: p });
    await strana.pretvoriUPlatno(store.izabrani()!);
    store.izmeniSlajd(11, { ...uPlatno().at(-1)![1], prelaz: null });
    (uspeh.mock.calls[1][1] as { run: () => void }).run();
    expect(izmeni.mock.calls.at(-1)![1]).toMatchObject({ tip: 'INFO', prelaz: null });
    sacuvajSve();
  });

  it('izuzetak u pretvaranju: poruka, ErrorHandler, slajd ostaje INFO, a sledeći klik radi', async () => {
    await ucitaj(infoSlajd());
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError').mockImplementation(() => undefined);
    const pravi = strana.ucitajPretvaranje;
    strana.ucitajPretvaranje = async () => ({ infoUPlatno: () => { throw new RangeError('stek'); } });
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(handleError).toHaveBeenCalledTimes(1);
    expect(greska).toHaveBeenCalledWith('Pretvaranje nije uspelo. Osveži stranicu i pokušaj ponovo.');
    expect(store.izabrani()!.tip).toBe('INFO');
    strana.ucitajPretvaranje = pravi;
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(uPlatno().length).toBe(1);
    sacuvajSve();
  });

  it('izmena dok se modul učitava: pretvara se poslednje stanje forme, i to vraća "Poništi"', async () => {
    await ucitaj(infoSlajd());
    const obecanje = strana.pretvoriUPlatno(store.izabrani()!);
    store.izmeniSlajd(11, { ...info('Kasnije'), beleske: 'Moje beleške' });
    await obecanje;
    expect(tekstSloja(uPlatno()[0][1] as SlajdCmd, 's1')).toEqual(['Kasnije']);
    izmeni.mockClear();
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    expect((izmeni.mock.calls[0][1] as SlajdCmd).naslov).toBe('Kasnije');
    sacuvajSve();
  });

  it('dokument koji server ne bi primio (401 stavka -> 401 animacija): bez dijaloga i izmene, poruka sa razlogom, slajd ostaje INFO', async () => {
    await ucitaj(infoSlajd({ sadrzaj: Array.from({ length: 401 }, (_, i) => `- s${i}`).join('\n') }));
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(dijalog).not.toHaveBeenCalled();
    expect(izmeni).not.toHaveBeenCalled();
    expect(uspeh).not.toHaveBeenCalled();
    expect(greska).toHaveBeenCalledWith('Slajd ne može da se pretvori u platno: Slajd može imati najviše 400 animacija.');
    expect(store.izabrani()!.tip).toBe('INFO');
  });

  it('modul pretvaranja se ne učita: poruka greške, slajd ostaje INFO', async () => {
    await ucitaj(infoSlajd());
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError').mockImplementation(() => undefined);
    strana.ucitajPretvaranje = () => Promise.reject(new Error('chunk'));
    await strana.pretvoriUPlatno(store.izabrani()!);
    expect(greska).toHaveBeenCalledWith('Pretvaranje nije uspelo. Osveži stranicu i pokušaj ponovo.');
    expect(handleError).toHaveBeenCalledTimes(1);
    expect(izmeni).not.toHaveBeenCalled();
  });

  it('"Poništi" posle napuštanja editora ne dira uništen store i kaže zašto', async () => {
    await ucitaj(infoSlajd());
    await strana.pretvoriUPlatno(store.izabrani()!);
    sacuvajSve();
    const info = vi.spyOn(TestBed.inject(NotificationStore), 'info');
    fixture.destroy();
    izmeni.mockClear();
    (uspeh.mock.calls[0][1] as { run: () => void }).run();
    expect(izmeni).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('Editor je zatvoren, pa pretvaranje više ne može da se poništi.');
  });
});
