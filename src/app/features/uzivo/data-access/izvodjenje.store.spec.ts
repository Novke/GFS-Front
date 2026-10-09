import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { IMessage } from '@stomp/stompjs';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { BehaviorSubject, Subject } from 'rxjs';
import { naPitanju, stanje } from './izvodjenje-podaci.testing';
import { IzvodjenjeStore } from './izvodjenje.store';
import { STOMP_FABRIKA } from './stomp';
import { NastavnickoStanje } from './uzivo.models';

/** Lažna STOMP veza: po jedan Subject za svako odredište, stanje veze ručno. */
class LazniStomp {
  readonly connectionState$ = new BehaviorSubject<RxStompState>(RxStompState.CONNECTING);
  readonly odredista = new Map<string, Subject<IMessage>>();
  readonly deactivate = vi.fn().mockResolvedValue(undefined);
  watch(odrediste: string) {
    const s = new Subject<IMessage>();
    this.odredista.set(odrediste, s);
    return s.asObservable();
  }
  posalji(odrediste: string, telo: unknown): void {
    this.odredista.get(odrediste)!.next({ body: JSON.stringify(telo) } as IMessage);
  }
}

describe('IzvodjenjeStore', () => {
  let store: InstanceType<typeof IzvodjenjeStore>;
  let http: HttpTestingController;
  let stomp: LazniStomp;
  let snack: { open: ReturnType<typeof vi.fn> };
  let putanje: string[];

  beforeEach(() => {
    stomp = new LazniStomp();
    putanje = [];
    snack = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        IzvodjenjeStore, provideHttpClient(), provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snack },
        { provide: STOMP_FABRIKA, useValue: (p: string) => { putanje.push(p); return stomp as unknown as RxStomp; } },
      ],
    });
    store = TestBed.inject(IzvodjenjeStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function init(s: NastavnickoStanje = stanje()): void {
    store.init(5);
    http.expectOne('api/izvodjenja/5/stanje').flush(s);
  }

  describe('prihvati', () => {
    it('starija verzija se odbacuje, jednaka (svežiji rezultati) i novija se prihvataju', () => {
      store.prihvati(stanje({ verzija: 4, brojOdgovora: 1 }));
      store.prihvati(stanje({ verzija: 3, brojOdgovora: 9 }));
      expect(store.stanje()!.verzija).toBe(4);
      expect(store.stanje()!.brojOdgovora).toBe(1);

      store.prihvati(stanje({ verzija: 4, brojOdgovora: 2 }));
      expect(store.stanje()!.brojOdgovora).toBe(2);

      store.prihvati(stanje({ verzija: 5, brojOdgovora: 0 }));
      expect(store.stanje()!.verzija).toBe(5);
    });

    it('usklađuje serverski sat sa prihvaćenim snimkom', () => {
      const server = Date.now() + 120_000;
      store.prihvati(stanje({ serverVremeMs: server }));
      expect(Math.abs(store.sat().sada() - server)).toBeLessThan(1000);
    });

    it('snimak drugog izvođenja se ne prihvata', () => {
      init(stanje({ verzija: 1 }));
      const tudje = stanje({ verzija: 7 });
      tudje.izvodjenje = { ...tudje.izvodjenje, id: 99 };
      store.prihvati(tudje);
      expect(store.stanje()!.verzija).toBe(1);
    });
  });

  describe('init i veza', () => {
    it('GET stanje, pretplate na nastavnički topic i početni snimak; topic menja stanje', () => {
      init(stanje({ verzija: 2 }));
      expect(putanje).toEqual(['api/ws']);
      expect([...stomp.odredista.keys()].sort()).toEqual(
        ['/app/izvodjenja/5/nastavnik-pocetno', '/topic/izvodjenja/5/nastavnik']);
      expect(store.stanje()!.verzija).toBe(2);

      stomp.posalji('/topic/izvodjenja/5/nastavnik', stanje({ verzija: 3, prikaz: 'SLAJD' }));
      expect(store.stanje()!.prikaz).toBe('SLAJD');
      stomp.posalji('/app/izvodjenja/5/nastavnik-pocetno', stanje({ verzija: 1 }));
      expect(store.stanje()!.verzija).toBe(3);
    });

    it('povezivanje -> povezan -> prekinut', () => {
      init();
      expect(store.veza()).toBe('povezivanje');
      stomp.connectionState$.next(RxStompState.OPEN);
      expect(store.veza()).toBe('povezan');
      stomp.connectionState$.next(RxStompState.CLOSED);
      expect(store.veza()).toBe('prekinut');
      stomp.connectionState$.next(RxStompState.CONNECTING);
      expect(store.veza()).toBe('prekinut');
    });

    it('neuspelo učitavanje postavlja grešku', () => {
      store.init(5);
      http.expectOne('api/izvodjenja/5/stanje').flush({ reason: 'Izvođenje nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
      expect(store.stanje()).toBeNull();
      expect(store.greska()).toBe('Izvođenje nije pronađeno.');
    });

    it('404 i 410 na GET stanje: STOMP se ne otvara (nema večnog ponovnog povezivanja)', () => {
      store.init(5);
      http.expectOne('api/izvodjenja/5/stanje').flush({ reason: 'Izvođenje nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
      expect(putanje).toEqual([]);

      store.init(6);
      http.expectOne('api/izvodjenja/6/stanje').flush({ reason: 'Izvođenje je završeno.' }, { status: 410, statusText: 'Gone' });
      expect(putanje).toEqual([]);
      expect(store.greska()).toBe('Izvođenje je završeno.');
    });

    it('druga greška (5xx, mreža): STOMP se otvara, stanje stiže kroz početni snimak', () => {
      store.init(5);
      http.expectOne('api/izvodjenja/5/stanje').flush(null, { status: 502, statusText: 'Bad Gateway' });
      expect(putanje).toEqual(['api/ws']);
      stomp.posalji('/app/izvodjenja/5/nastavnik-pocetno', stanje({ verzija: 4 }));
      expect(store.stanje()!.verzija).toBe(4);
    });

    it('destroy pre odgovora otkazuje GET stanje i ništa ne otvara', () => {
      store.init(5);
      const zahtev = http.expectOne('api/izvodjenja/5/stanje');
      store.destroy();
      expect(zahtev.cancelled).toBe(true);
      expect(putanje).toEqual([]);
    });

    it('novi init otkazuje GET stanje prethodnog', () => {
      store.init(5);
      const prvi = http.expectOne('api/izvodjenja/5/stanje');
      store.init(6);
      expect(prvi.cancelled).toBe(true);
      http.expectOne('api/izvodjenja/6/stanje').flush(stanje());
    });

    it('destroy deaktivira STOMP', () => {
      init();
      store.destroy();
      expect(stomp.deactivate).toHaveBeenCalled();
    });

    it('linkovi za studente i konzolu', () => {
      init();
      expect(store.joinLink()).toBe(new URL('uzivo/123456', document.baseURI).href);
      expect(store.konzolaLink()).toBe(new URL('izvodjenja/5/konzola', document.baseURI).href);
      expect(store.publikaLink()).toBe(new URL('izvodjenja/5/publika', document.baseURI).href);
    });
  });

  describe('komanda', () => {
    it('POST komande, odgovor ide kroz prihvati', () => {
      init();
      store.komanda('SLEDECI');
      expect(store.salje()).toBe(true);
      const req = http.expectOne('api/izvodjenja/5/komande');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ tip: 'SLEDECI', vrednost: null });
      req.flush(naPitanju('CEKA', { verzija: 2 }));
      expect(store.stanje()!.faza).toBe('CEKA');
      expect(store.salje()).toBe(false);
    });

    it('greška komande postavlja `greska` iz reason i prikazuje je 3 s', () => {
      init();
      store.komanda('TACAN');
      http.expectOne('api/izvodjenja/5/komande').flush(
        { reason: 'Prvo zatvori pitanje.' }, { status: 409, statusText: 'Conflict' });
      expect(store.greska()).toBe('Prvo zatvori pitanje.');
      expect(snack.open).toHaveBeenCalledWith('Prvo zatvori pitanje.', undefined, { duration: 3000 });
      expect(store.salje()).toBe(false);
    });

    it('dok `salje`, nova komanda ne blokira: svaka ide, redom', () => {
      init();
      store.komanda('SLEDECI');
      store.komanda('IDI_NA', 2);
      store.komanda('QR');
      expect(store.salje()).toBe(true);

      const prva = http.expectOne('api/izvodjenja/5/komande');
      expect(prva.request.body.tip).toBe('SLEDECI');
      prva.flush({ reason: 'Nešto' }, { status: 409, statusText: 'Conflict' });

      const druga = http.expectOne('api/izvodjenja/5/komande');
      expect(druga.request.body).toEqual({ tip: 'IDI_NA', vrednost: 2 });
      druga.flush(stanje({ verzija: 3 }));
      expect(store.salje()).toBe(true);

      const treca = http.expectOne('api/izvodjenja/5/komande');
      expect(treca.request.body.tip).toBe('QR');
      treca.flush(stanje({ verzija: 4, qrPrikazan: true }));
      expect(store.stanje()!.qrPrikazan).toBe(true);
      expect(store.salje()).toBe(false);
    });

    it('410: izvođenje je završeno, stanje se ponovo učitava', () => {
      init();
      store.komanda('SLEDECI');
      http.expectOne('api/izvodjenja/5/komande').flush({ reason: 'Izvođenje je završeno.' }, { status: 410, statusText: 'Gone' });
      const zavrseno = stanje({ verzija: 2 });
      zavrseno.izvodjenje = { ...zavrseno.izvodjenje, status: 'ZAVRSENO' };
      http.expectOne('api/izvodjenja/5/stanje').flush(zavrseno);
      expect(store.stanje()!.izvodjenje.status).toBe('ZAVRSENO');
    });

    it('preimenuj, izbaci i sakrij idu kroz isti red', () => {
      init();
      store.preimenuj(1, 'Ana M.');
      store.izbaci(2);
      store.sakrij(9, 'glupost', true);
      const p = http.expectOne('api/izvodjenja/5/ucesnici/1');
      expect(p.request.method).toBe('PUT');
      expect(p.request.body).toEqual({ ime: 'Ana M.' });
      p.flush(stanje({ verzija: 2 }));
      const i = http.expectOne('api/izvodjenja/5/ucesnici/2');
      expect(i.request.method).toBe('DELETE');
      i.flush(stanje({ verzija: 3 }));
      const s = http.expectOne('api/izvodjenja/5/runde/9/sakrij');
      expect(s.request.body).toEqual({ kljuc: 'glupost', sakriven: true });
      s.flush(stanje({ verzija: 4 }));
      expect(store.stanje()!.verzija).toBe(4);
    });
  });

  describe('ukupnoMs (pun krug tajmera)', () => {
    it('iz vremena pitanja, a bez ograničenja prvo viđeno preostalo vreme runde', () => {
      store.prihvati(naPitanju('OTVORENO', { verzija: 1, runda: { id: 9, redniBroj: 1, rokMs: 2_000_000, preostaloMs: null, tajmerRadi: true } }));
      expect(store.ukupnoMs()).toBe(20_000);

      const bezRoka = naPitanju('OTVORENO', { verzija: 2, serverVremeMs: 1_000_000,
        runda: { id: 10, redniBroj: 1, rokMs: null, preostaloMs: 30_000, tajmerRadi: false } });
      bezRoka.trenutniSlajd = { ...bezRoka.trenutniSlajd!, pitanje: { ...bezRoka.trenutniSlajd!.pitanje!, vremeSekunde: null } };
      store.prihvati(bezRoka);
      expect(store.ukupnoMs()).toBe(30_000);
      store.prihvati({ ...bezRoka, verzija: 3, runda: { ...bezRoka.runda!, preostaloMs: 12_000 } });
      expect(store.ukupnoMs()).toBe(30_000);
    });
  });
});
