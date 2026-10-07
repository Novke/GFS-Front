import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EditorStore } from '../data-access/editor.store';
import { PrezentacijaDetails, SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { PrezentacijaEditorPage } from './prezentacija-editor.page';

const POKRENI = 'api/prezentacije/1/izvodjenja';

function slajd(id: number, rb: number, naslov: string): SlajdDetails {
  return { id, rb, tip: 'INFO', naslov, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null };
}

function info(naslov: string): SlajdCmd {
  return { tip: 'INFO', naslov, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null };
}

const prezentacija: PrezentacijaDetails = {
  id: 1, naziv: 'Statika', opis: null, predmet: { id: 7, naziv: 'Mehanika' }, brojSlajdova: 1, brojPitanja: 0,
  izmenjeno: '2026-10-07T10:00:00', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: true,
  brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi: [slajd(11, 1, 'Uvod')],
};

describe('PrezentacijaEditorPage: Pokreni i Dupliraj čekaju čuvanje', () => {
  let fixture: ComponentFixture<PrezentacijaEditorPage>;
  let strana: { pokreni(): void; duplirajPrezentaciju(): void; radi(): boolean };
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  let dijalog: jasmine.Spy;
  let poruka: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PrezentacijaEditorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    dijalog = spyOn(TestBed.inject(MatDialog), 'open')
      .and.returnValue({ afterClosed: () => of(undefined) } as unknown as MatDialogRef<unknown>);
    poruka = spyOn(TestBed.inject(MatSnackBar), 'open');
    fixture = TestBed.createComponent(PrezentacijaEditorPage);
    strana = fixture.componentInstance as unknown as typeof strana;
    store = fixture.debugElement.injector.get(EditorStore);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush(prezentacija);
  });

  afterEach(() => http.verify());

  it('izmena pa odmah Pokreni: pokretanje ide tek posle odgovora na PUT', fakeAsync(() => {
    store.izmeniSlajd(11, info('Izmenjen uvod'));
    strana.pokreni();
    const put = http.expectOne('api/slajdovi/11');
    flushMicrotasks();
    http.expectNone(POKRENI);
    put.flush(slajd(11, 1, 'Izmenjen uvod'));
    const req = http.expectOne(POKRENI);
    expect(req.request.body).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null });
    req.flush({ id: 77 });
    expect(navigate).toHaveBeenCalledWith(['izvodjenja', 77, 'konzola']);
    tick(800);
  }));

  it('upravo napisano pitanje (nacrt) se računa: čeka POST, pa otvara dijalog umesto pokretanja bez čuvanja', fakeAsync(() => {
    store.dodaj('PITANJE', 'TACNO_NETACNO');
    const nacrt = store.izabrani()!;
    store.izmeniSlajd(nacrt.id, {
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false,
      pitanje: {
        tip: 'TACNO_NETACNO', tekst: 'Zemlja je okrugla.', slikaId: null, vremeSekunde: null,
        opcije: [{ tekst: 'Tačno', tacna: true }, { tekst: 'Netačno', tacna: false }], brojTacno: null,
        brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: [],
        skalaMinOznaka: null, skalaMaxOznaka: null,
      },
    });
    strana.pokreni();
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    flushMicrotasks();
    http.expectNone(POKRENI);
    expect(dijalog).not.toHaveBeenCalled();
    post.flush({ ...nacrt, id: 20, pitanje: { ...nacrt.pitanje!, id: 5, tekst: 'Zemlja je okrugla.' } });
    http.expectNone(POKRENI);
    expect(dijalog).toHaveBeenCalledTimes(1);
    tick(800);
  }));

  it('neuspelo čuvanje zaustavlja pokretanje i prikazuje razlog', fakeAsync(() => {
    store.izmeniSlajd(11, info('Izmenjen uvod'));
    strana.pokreni();
    http.expectOne('api/slajdovi/11').flush({ reason: 'Slajd nije pronađen.' }, { status: 404, statusText: 'Not Found' });
    http.expectNone(POKRENI);
    expect(dijalog).not.toHaveBeenCalled();
    expect(poruka).toHaveBeenCalledWith('Pokretanje je zaustavljeno: Slajd nije pronađen.', 'U redu', jasmine.any(Object));
    expect(strana.radi()).toBeFalse();
    tick(800);
  }));

  it('neispravan slajd zaustavlja pokretanje bez ijednog zahteva', fakeAsync(() => {
    store.izmeniSlajd(11, info(''));
    strana.pokreni();
    http.expectNone(() => true);
    expect(poruka).toHaveBeenCalledWith(
      'Pokretanje je zaustavljeno: Slajd 1 nije sačuvan: Info slajd mora imati naslov, tekst ili sliku.', 'U redu', jasmine.any(Object));
    tick(800);
  }));

  it('Dupliraj prezentaciju čeka PUT, pa kopira', fakeAsync(() => {
    store.izmeniSlajd(11, info('Poslednja izmena'));
    strana.duplirajPrezentaciju();
    const put = http.expectOne('api/slajdovi/11');
    http.expectNone('api/prezentacije/1/dupliraj');
    put.flush(slajd(11, 1, 'Poslednja izmena'));
    http.expectOne('api/prezentacije/1/dupliraj').flush({ ...prezentacija, id: 2, naziv: 'Statika (kopija)' });
    expect(navigate).toHaveBeenCalledWith(['/prezentacije/2']);
    tick(800);
  }));
});
