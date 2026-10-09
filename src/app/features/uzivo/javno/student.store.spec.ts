import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { IMessage } from '@stomp/stompjs';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { BehaviorSubject, Subject } from 'rxjs';
import { STOMP_FABRIKA } from '../data-access/stomp';
import { JavnoPitanje, JavnoStanje, LicnoStanje, UcesnikInfo } from '../data-access/uzivo.models';
import { GRESKA_TRAJANJE_MS, KRAJ_ZADRZI_MS, POTVRDA_MS, StudentStore, ekranStudenta, tacanOdgovor } from './student.store';

/** Lažna STOMP veza: po jedan Subject za svako odredište, stanje veze ručno, `publish` beleži poruke. */
class LazniStomp {
  readonly connectionState$ = new BehaviorSubject<RxStompState>(RxStompState.CONNECTING);
  readonly odredista = new Map<string, Subject<IMessage>>();
  readonly deactivate = jasmine.createSpy('deactivate').and.resolveTo();
  readonly publish = jasmine.createSpy('publish');
  watch(odrediste: string) {
    const s = new Subject<IMessage>();
    this.odredista.set(odrediste, s);
    return s.asObservable();
  }
  posalji(odrediste: string, telo: unknown): void {
    this.odredista.get(odrediste)!.next({ body: JSON.stringify(telo) } as IMessage);
  }
}

const UCESNIK: UcesnikInfo = { ucesnikId: 3, ime: 'Ana', izvodjenjeId: 5 };

function javno(izmene: Partial<JavnoStanje> = {}): JavnoStanje {
  return {
    izvodjenjeId: 5, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika 1', kod: '123456',
    prikaz: 'PRIJAVA', slajdTip: null, ekran: 'NORMALAN', takmicenje: true, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: false, brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null,
    ...izmene,
  };
}

function pitanje(izmene: Partial<JavnoPitanje> = {}): JavnoPitanje {
  return {
    tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 7, brojOpcija: 2, opcije: [{ id: 11, tekst: null }, { id: 12, tekst: null }],
    tekst: null, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null, preostaloMs: null,
    tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
    ...izmene,
  };
}

const naPitanju = (verzija: number, p: Partial<JavnoPitanje> = {}) =>
  javno({ verzija, prikaz: 'SLAJD', slajdTip: 'PITANJE', pitanje: pitanje(p) });

function licno(izmene: Partial<LicnoStanje> = {}): LicnoStanje {
  return { verzija: 1, ucesnikId: 3, ime: 'Ana', poeni: 0, mesto: 1, brojUcesnika: 1, izbacen: false, odgovor: null, ...izmene };
}

describe('StudentStore', () => {
  let store: InstanceType<typeof StudentStore>;
  let http: HttpTestingController;
  let stompovi: LazniStomp[];
  let putanje: string[];
  const stomp = () => stompovi[stompovi.length - 1];

  beforeEach(() => {
    stompovi = [];
    putanje = [];
    TestBed.configureTestingModule({
      providers: [
        StudentStore, provideHttpClient(), provideHttpClientTesting(),
        {
          provide: STOMP_FABRIKA,
          useValue: (p: string) => {
            putanje.push(p);
            const s = new LazniStomp();
            stompovi.push(s);
            return s as unknown as RxStomp;
          },
        },
      ],
    });
    store = TestBed.inject(StudentStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const nijePronadjeno = (reason: string) => [{ reason }, { status: 404, statusText: 'Not Found' }] as const;

  /** `otvori` sa važećim kolačićem: info, ja, pa STOMP. */
  function udji(): void {
    store.otvori('123456');
    http.expectOne('api/public/uzivo/123456').flush({ naziv: 'Statika 1' });
    http.expectOne('api/public/uzivo/123456/ja').flush(UCESNIK);
  }

  function pocetno(j: JavnoStanje, l: LicnoStanje): void {
    stomp().posalji('/app/izvodjenja/5/pocetno', { javno: j, licno: l });
  }

  describe('ulaz', () => {
    it('otvori: info, pa ja -> uživo, STOMP na api/public/ws sa četiri pretplate', () => {
      udji();
      expect(store.faza()).toBe('uzivo');
      expect(store.info()).toEqual({ naziv: 'Statika 1' });
      expect(store.ucesnik()).toEqual(UCESNIK);
      expect(putanje).toEqual(['api/public/ws']);
      expect([...stomp().odredista.keys()].sort()).toEqual([
        '/app/izvodjenja/5/pocetno', '/topic/izvodjenja/5/javno', '/user/queue/greske', '/user/queue/licno',
      ]);
    });

    it('otvori bez prijave (ja 404) -> unos imena, bez STOMP-a', () => {
      store.otvori('123456');
      http.expectOne('api/public/uzivo/123456').flush({ naziv: 'Statika 1' });
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));
      expect(store.faza()).toBe('ime');
      expect(putanje).toEqual([]);
    });

    it('nepoznat ili završen kod -> greška sa porukom servera', () => {
      store.otvori('123456');
      http.expectOne('api/public/uzivo/123456')
        .flush(...nijePronadjeno('Izvođenje sa ovim kodom ne postoji ili je završeno.'));
      expect(store.faza()).toBe('greska');
      expect(store.greska()).toBe('Izvođenje sa ovim kodom ne postoji ili je završeno.');
    });

    it('kod koji nije 6 cifara ne ide na server', () => {
      store.otvori('12ab');
      expect(store.faza()).toBe('greska');
    });

    it('prijavi: POST imena (sređenog), pa uživo; 409 ostaje na imenu sa porukom', () => {
      store.otvori('123456');
      http.expectOne('api/public/uzivo/123456').flush({ naziv: 'Statika 1' });
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));

      store.prijavi('  Ana   Marić ');
      const zahtev = http.expectOne('api/public/uzivo/123456/prijava');
      expect(zahtev.request.body).toEqual({ ime: 'Ana Marić' });
      zahtev.flush({ reason: 'Izvođenje je popunjeno.' }, { status: 409, statusText: 'Conflict' });
      expect(store.faza()).toBe('ime');
      expect(store.greska()).toBe('Izvođenje je popunjeno.');

      store.prijavi('Ana');
      http.expectOne('api/public/uzivo/123456/prijava').flush(UCESNIK);
      expect(store.faza()).toBe('uzivo');
      expect(store.greska()).toBeNull();
      expect(putanje).toEqual(['api/public/ws']);
    });

    it('prazno ili predugo ime se ne šalje', () => {
      store.otvori('123456');
      http.expectOne('api/public/uzivo/123456').flush({ naziv: 'Statika 1' });
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));
      store.prijavi('   ');
      store.prijavi('x'.repeat(41));
      expect(store.greska()).toBe('Ime mora imati od 1 do 40 znakova.');
    });
  });

  describe('stanje', () => {
    it('starija verzija javnog stanja se ignoriše, jednaka i novija se prihvataju', () => {
      udji();
      store.prihvatiJavno(javno({ verzija: 4, brojUcesnika: 2 }));
      store.prihvatiJavno(javno({ verzija: 3, brojUcesnika: 9 }));
      expect(store.javno()!.brojUcesnika).toBe(2);
      store.prihvatiJavno(javno({ verzija: 4, brojUcesnika: 3 }));
      expect(store.javno()!.brojUcesnika).toBe(3);
      stomp().posalji('/topic/izvodjenja/5/javno', javno({ verzija: 5, prikaz: 'SLAJD', slajdTip: 'INFO' }));
      expect(store.ekran()).toBe('tabla');
    });

    it('starije lično stanje se ignoriše', () => {
      udji();
      store.prihvatiLicno(licno({ verzija: 4, poeni: 850 }));
      store.prihvatiLicno(licno({ verzija: 2, poeni: 0 }));
      expect(store.licno()!.poeni).toBe(850);
    });

    it('izbacen=true -> faza izbacen i veza se zatvara; "Uđi ponovo" vodi na ime', () => {
      udji();
      stomp().posalji('/user/queue/licno', licno({ verzija: 2, izbacen: true }));
      expect(store.faza()).toBe('izbacen');
      expect(stomp().deactivate).toHaveBeenCalled();
      store.ponovoUdji();
      expect(store.faza()).toBe('ime');
      expect(store.ucesnik()).toBeNull();
    });

    it('status ZAVRSENO -> faza kraj; lično stanje koje stigne posle javnog još ažurira konačno mesto, pa se veza zatvara', fakeAsync(() => {
      udji();
      store.prihvatiLicno(licno({ mesto: 4, poeni: 900 }));
      stomp().posalji('/topic/izvodjenja/5/javno', javno({ verzija: 9, status: 'ZAVRSENO', prikaz: 'KRAJ' }));
      expect(store.faza()).toBe('kraj');
      expect(store.ekran()).toBe('kraj');
      expect(stomp().deactivate).not.toHaveBeenCalled();
      // server šalje javno pa lično: konačno mesto stiže posle prelaza na kraj
      stomp().posalji('/user/queue/licno', licno({ verzija: 2, mesto: 2, poeni: 1700 }));
      expect(store.licno()!.mesto).toBe(2);
      expect(store.licno()!.poeni).toBe(1700);
      tick(KRAJ_ZADRZI_MS);
      expect(stomp().deactivate).toHaveBeenCalled();
    }));

    it('pocetno posle kraja: lično se obrađuje pre javnog, konačno mesto ostaje', fakeAsync(() => {
      udji();
      pocetno(javno({ verzija: 9, status: 'ZAVRSENO', prikaz: 'KRAJ' }), licno({ verzija: 4, mesto: 3, poeni: 1200 }));
      expect(store.faza()).toBe('kraj');
      expect(store.licno()!.mesto).toBe(3);
      expect(store.licno()!.poeni).toBe(1200);
      tick(KRAJ_ZADRZI_MS);
    }));

    it('u kraju se lično stanje drugog učesnika i starija verzija ne prihvataju', fakeAsync(() => {
      udji();
      store.prihvatiLicno(licno({ verzija: 3, mesto: 4 }));
      store.prihvatiJavno(javno({ verzija: 9, status: 'ZAVRSENO', prikaz: 'KRAJ' }));
      store.prihvatiLicno(licno({ verzija: 2, mesto: 1 }));
      store.prihvatiLicno(licno({ verzija: 5, ucesnikId: 99, mesto: 1 }));
      expect(store.licno()!.mesto).toBe(4);
      tick(KRAJ_ZADRZI_MS);
    }));

    it('kraj i izbacivanje brišu zaostalu poruku greške (ne visi na ekranu kraja)', () => {
      udji();
      store.prihvatiJavno(naPitanju(2));
      stomp().posalji('/user/queue/greske', { poruka: 'Vreme je isteklo.' });
      expect(store.greska()).toBe('Vreme je isteklo.');
      stomp().posalji('/topic/izvodjenja/5/javno', javno({ verzija: 9, status: 'ZAVRSENO', prikaz: 'KRAJ' }));
      expect(store.faza()).toBe('kraj');
      expect(store.greska()).toBeNull();

      udji();
      store.prihvatiJavno(naPitanju(2));
      stomp().posalji('/user/queue/greske', { poruka: 'Vreme je isteklo.' });
      stomp().posalji('/user/queue/licno', licno({ verzija: 2, izbacen: true }));
      expect(store.faza()).toBe('izbacen');
      expect(store.greska()).toBeNull();
    });
  });

  describe('odgovor i ponovno povezivanje', () => {
    it('odgovori: poslato odmah i jedna poruka na /app/izvodjenja/5/odgovor; drugi pokušaj se ne šalje', () => {
      udji();
      store.prihvatiJavno(naPitanju(2));
      expect(store.ekran()).toBe('unos');
      store.odgovori({ rundaId: 7, opcije: [11] });
      store.odgovori({ rundaId: 7, opcije: [12] });
      expect(store.poslato()).toBe(7);
      expect(store.unosZakljucan()).toBeTrue();
      expect(store.ekran()).toBe('primljen');
      expect(stomp().publish).toHaveBeenCalledTimes(1);
      expect(stomp().publish).toHaveBeenCalledWith({
        destination: '/app/izvodjenja/5/odgovor', body: JSON.stringify({ rundaId: 7, opcije: [11] }),
      });
    });

    it('odgovor za rundu koja nije trenutna se ne šalje', () => {
      udji();
      store.prihvatiJavno(naPitanju(2));
      store.odgovori({ rundaId: 6, opcije: [11] });
      expect(stomp().publish).not.toHaveBeenCalled();
    });

    it('posle ponovnog povezivanja pocetno sa primljenim odgovorom zaključava unos ("Odgovor primljen")', () => {
      udji();
      stomp().connectionState$.next(RxStompState.OPEN);
      pocetno(naPitanju(2), licno({ verzija: 2 }));
      expect(store.ekran()).toBe('unos');

      // telefon zaspi: veza pada, pa se vraća; u međuvremenu je odgovor (sa drugog taba) stigao na server
      stomp().connectionState$.next(RxStompState.CLOSED);
      expect(store.veza()).toBe('prekinut');
      stomp().connectionState$.next(RxStompState.CONNECTING);
      stomp().connectionState$.next(RxStompState.OPEN);
      pocetno(naPitanju(3), licno({ verzija: 3, odgovor: { rundaId: 7, primljen: true, tacno: null, poeni: null } }));

      expect(store.veza()).toBe('povezan');
      expect(store.unosZakljucan()).toBeTrue();
      expect(store.ekran()).toBe('primljen');
    });

    it('nova runda (drugi rundaId) otključava unos', () => {
      udji();
      pocetno(naPitanju(2), licno({ verzija: 2, odgovor: { rundaId: 7, primljen: true, tacno: null, poeni: null } }));
      expect(store.unosZakljucan()).toBeTrue();
      stomp().posalji('/topic/izvodjenja/5/javno', naPitanju(3, { rundaId: 8 }));
      expect(store.unosZakljucan()).toBeFalse();
      expect(store.ekran()).toBe('unos');
    });

    it('"Pitanje je zatvoreno." zaključava unos; poruka nestaje posle 4 s', fakeAsync(() => {
      udji();
      store.prihvatiJavno(naPitanju(2));
      store.odgovori({ rundaId: 7, opcije: [11] });
      stomp().posalji('/user/queue/greske', { poruka: 'Pitanje je zatvoreno.' });
      expect(store.greska()).toBe('Pitanje je zatvoreno.');
      expect(store.poslato()).toBeNull();
      expect(store.unosZakljucan()).toBeTrue();
      expect(store.ekran()).toBe('isteklo');
      tick(GRESKA_TRAJANJE_MS);
      expect(store.greska()).toBeNull();
      expect(store.unosZakljucan()).toBeTrue();
      store.destroy();
    }));

    it('greška provere ("Unesi broj.") otključava da student ispravi', fakeAsync(() => {
      udji();
      store.prihvatiJavno(naPitanju(2, { tip: 'BROJ', opcije: null, brojOpcija: null }));
      store.odgovori({ rundaId: 7, broj: '3' });
      stomp().posalji('/user/queue/greske', { poruka: 'Unesi broj.' });
      expect(store.unosZakljucan()).toBeFalse();
      expect(store.greska()).toBe('Unesi broj.');
      store.destroy();
    }));

    it('"Već si odgovorio." ostaje zaključano', fakeAsync(() => {
      udji();
      store.prihvatiJavno(naPitanju(2));
      store.odgovori({ rundaId: 7, opcije: [11] });
      stomp().posalji('/user/queue/greske', { poruka: 'Već si odgovorio.' });
      expect(store.unosZakljucan()).toBeTrue();
      expect(store.ekran()).toBe('primljen');
      store.destroy();
    }));

    it('bez potvrde servera dok je veza otvorena, unos se posle roka otključava', fakeAsync(() => {
      udji();
      stomp().connectionState$.next(RxStompState.OPEN);
      store.prihvatiJavno(naPitanju(2));
      store.odgovori({ rundaId: 7, opcije: [11] });
      tick(POTVRDA_MS - 1);
      expect(store.unosZakljucan()).toBeTrue();
      tick(1);
      expect(store.unosZakljucan()).toBeFalse();
      expect(store.greska()).toBe('Odgovor nije stigao. Pošalji ponovo.');
      store.destroy();
    }));

    it('potvrda kroz lično stanje gasi rok za otključavanje', fakeAsync(() => {
      udji();
      stomp().connectionState$.next(RxStompState.OPEN);
      store.prihvatiJavno(naPitanju(2));
      store.odgovori({ rundaId: 7, opcije: [11] });
      stomp().posalji('/user/queue/licno', licno({ verzija: 2, odgovor: { rundaId: 7, primljen: true, tacno: null, poeni: null } }));
      tick(POTVRDA_MS * 2);
      expect(store.unosZakljucan()).toBeTrue();
      expect(store.greska()).toBeNull();
      store.destroy();
    }));

    it('"Nisi prijavljen na ovo izvođenje." vraća na unos imena', () => {
      udji();
      stomp().posalji('/user/queue/greske', { poruka: 'Nisi prijavljen na ovo izvođenje.' });
      expect(store.faza()).toBe('ime');
      expect(stomp().deactivate).toHaveBeenCalled();
    });

    it('odbijeno rukovanje (zatvoreno pre otvaranja) i ja 404 -> ponovo unos imena', () => {
      udji();
      stomp().connectionState$.next(RxStompState.CLOSED);
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));
      http.expectOne('api/public/uzivo/123456').flush({ naziv: 'Statika 1' });
      expect(stompovi[0].deactivate).toHaveBeenCalled();
      expect(store.faza()).toBe('ime');
      expect(store.info()).toEqual({ naziv: 'Statika 1' });
    });

    it('telefon prespava kraj (odbijeno rukovanje, ja 404, info 404) -> kraj sa poslednjim mestom, ne greška', () => {
      udji();
      store.prihvatiJavno(javno({ verzija: 3, prikaz: 'SLAJD', slajdTip: 'INFO' }));
      store.prihvatiLicno(licno({ verzija: 3, mesto: 5, poeni: 2100 }));
      stomp().connectionState$.next(RxStompState.CLOSED);
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));
      http.expectOne('api/public/uzivo/123456').flush(...nijePronadjeno('Izvođenje sa ovim kodom ne postoji ili je završeno.'));
      expect(store.faza()).toBe('kraj');
      expect(store.ekran()).toBe('kraj');
      expect(store.licno()!.mesto).toBe(5);
      expect(store.greska()).toBeNull();
      expect(stompovi[0].deactivate).toHaveBeenCalled();
    });

    it('ja 404 i info 404 bez ličnog stanja -> greška sa porukom servera', () => {
      udji();
      stomp().connectionState$.next(RxStompState.CLOSED);
      http.expectOne('api/public/uzivo/123456/ja').flush(...nijePronadjeno('Nisi prijavljen.'));
      http.expectOne('api/public/uzivo/123456').flush(...nijePronadjeno('Izvođenje sa ovim kodom ne postoji ili je završeno.'));
      expect(store.faza()).toBe('greska');
      expect(store.greska()).toBe('Izvođenje sa ovim kodom ne postoji ili je završeno.');
    });

    it('nacrt odgovora ostaje za istu rundu i posle otključavanja (rok potvrde); otvori ga briše', fakeAsync(() => {
      udji();
      stomp().connectionState$.next(RxStompState.OPEN);
      store.prihvatiJavno(naPitanju(2, { tip: 'VISE_TACNIH' }));
      store.sacuvajNacrt({ rundaId: 7, izabrane: [11, 12], broj: '', tekst: '' });
      store.odgovori({ rundaId: 7, opcije: [11, 12] });
      tick(POTVRDA_MS);
      expect(store.ekran()).toBe('unos');
      expect(store.nacrt()).toEqual({ rundaId: 7, izabrane: [11, 12], broj: '', tekst: '' });
      store.otvori('123456');
      expect(store.nacrt()).toBeNull();
      http.expectOne('api/public/uzivo/123456');
      store.destroy();
    }));

    it('prekid posle otvorene veze nije odbijeno rukovanje: nema provere, samo traka', () => {
      udji();
      stomp().connectionState$.next(RxStompState.OPEN);
      stomp().connectionState$.next(RxStompState.CLOSED);
      http.expectNone('api/public/uzivo/123456/ja');
      expect(store.veza()).toBe('prekinut');
      expect(store.faza()).toBe('uzivo');
    });
  });
});

describe('ekranStudenta i tacanOdgovor', () => {
  const osnova = {
    faza: 'uzivo' as const, javno: null as JavnoStanje | null, licno: null as LicnoStanje | null,
    poslato: null as number | null, zakljucano: null as number | null,
  };

  it('tok: povezivanje, čekamo, tabla, pitanje stiže', () => {
    expect(ekranStudenta(osnova)).toBe('povezivanje');
    expect(ekranStudenta({ ...osnova, javno: javno() })).toBe('cekamo');
    expect(ekranStudenta({ ...osnova, javno: javno({ prikaz: 'SLAJD', slajdTip: 'INFO' }) })).toBe('tabla');
    const ceka = javno({ prikaz: 'SLAJD', slajdTip: 'PITANJE', pitanje: { tip: 'JEDAN_TACAN', faza: 'CEKA' } as JavnoPitanje });
    expect(ekranStudenta({ ...osnova, javno: ceka })).toBe('stize');
    expect(ekranStudenta({ ...osnova, javno: javno({ prikaz: 'KRAJ' }) })).toBe('kraj');
  });

  it('zatvoreno: bez odgovora "isteklo", sa odgovorom "primljen", posle C "tacan"', () => {
    const z = naPitanju(2, { faza: 'ZATVORENO' });
    expect(ekranStudenta({ ...osnova, javno: z })).toBe('isteklo');
    const odg = licno({ odgovor: { rundaId: 7, primljen: true, tacno: null, poeni: null } });
    expect(ekranStudenta({ ...osnova, javno: z, licno: odg })).toBe('primljen');
    const t = naPitanju(3, { faza: 'ZATVORENO', tacneOpcije: [12] });
    expect(ekranStudenta({ ...osnova, javno: t, licno: odg })).toBe('tacan');
  });

  it('tacanOdgovor: opcije sa indeksom oblika, broj sa jedinicom, prihvatljivi tekstovi', () => {
    const p = pitanje({ faza: 'ZATVORENO', tacneOpcije: [12], opcije: [{ id: 11, tekst: 'Pariz' }, { id: 12, tekst: 'Rim' }] });
    expect(tacanOdgovor(p)).toEqual({ opcije: [{ indeks: 1, tekst: 'Rim' }], tekst: null });
    expect(tacanOdgovor(pitanje({ tip: 'BROJ', tacanBroj: 3.5, jedinica: 'm' }))!.tekst).toBe('3,5 m');
    expect(tacanOdgovor(pitanje({ tip: 'KRATAK_TEKST', prihvatljiviOdgovori: ['Sava', 'reka Sava'] }))!.tekst)
      .toBe('Sava, reka Sava');
    expect(tacanOdgovor(pitanje())).toBeNull();
  });
});
