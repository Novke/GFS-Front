import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AnketeStudentaStore } from './ankete-studenta.store';
import { anketaStudentu as a } from './ankete-studenta.testing';

describe('AnketeStudentaStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AnketeStudentaStore>;
  /** Lažni service worker (jsdom ga nema): `poruka()` javlja push kao `assets/pwa/sw.js`. */
  const sw = new EventTarget();
  const poruka = (tip = 'gfs-obavestenje') => sw.dispatchEvent(new MessageEvent('message', { data: { tip } }));
  const sacuvano: [object, string, PropertyDescriptor | undefined][] = [];
  const postavi = (obj: object, kljuc: string, vrednost: unknown) => {
    sacuvano.push([obj, kljuc, Object.getOwnPropertyDescriptor(obj, kljuc)]);
    Object.defineProperty(obj, kljuc, { value: vrednost, configurable: true, writable: true });
  };

  beforeEach(() => {
    postavi(window, 'isSecureContext', true);
    postavi(navigator, 'serviceWorker', sw);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AnketeStudentaStore);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    for (const [obj, kljuc, d] of sacuvano.reverse()) {
      if (d) {
        Object.defineProperty(obj, kljuc, d);
      } else {
        delete (obj as Record<string, unknown>)[kljuc];
      }
    }
    sacuvano.length = 0;
  });

  it('list: otvorena bez glasa iskače; "Kasnije" je sklanja do nove ankete, kartica (skup) ostaje', () => {
    store.primi([a(1, { mojGlas: [0] }), a(2)]);
    expect(store.list()?.id).toBe(2);
    store.skloni();
    expect(store.list()).toBeNull();
    expect(store.ankete().map(x => x.id)).toEqual([1, 2]);
    // ista anketa u sledećem odgovoru ne iskače ponovo, nova da
    store.primi([a(3), a(1, { mojGlas: [0] }), a(2)]);
    expect(store.list()?.id).toBe(3);
  });

  it('undefined (stari backend bez polja) ne menja ništa; null briše', () => {
    store.primi([a(1)]);
    store.primi(undefined);
    expect(store.ankete().length).toBe(1);
    store.primi(null);
    expect(store.ankete()).toEqual([]);
    expect(store.list()).toBeNull();
  });

  it('"Glasaj" sa kartice otvara list i za sklonjenu anketu; list ostaje posle glasa', () => {
    store.primi([a(1)]);
    store.skloni();
    store.otvori(1);
    expect(store.list()?.id).toBe(1);
    store.glasaj(store.list()!, [2]);
    const req = http.expectOne('api/public/nalog/ankete/1/glas');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opcije: [2] });
    expect(store.salje()).toBe(1);
    req.flush(a(1, { mojGlas: [2] }));
    expect(store.salje()).toBeNull();
    expect(store.list()?.mojGlas).toEqual([2]);
  });

  it('promena glasa šalje novi izbor; isti izbor se ne šalje; dupli dodir dok šalje ne šalje dvaput', () => {
    store.primi([a(1, { mojGlas: [0] })]);
    const x = store.ankete()[0];
    store.glasaj(x, [0]);
    http.expectNone('api/public/nalog/ankete/1/glas');
    store.glasaj(x, [1]);
    store.glasaj(x, [2]);
    http.expectOne('api/public/nalog/ankete/1/glas').flush(a(1, { mojGlas: [1] }));
    expect(store.ankete()[0].mojGlas).toEqual([1]);
  });

  it('više odgovora: kućice polaze od poslatog glasa, izbor se briše posle slanja', () => {
    store.primi([a(1, { viseOdgovora: true, mojGlas: [0] })]);
    const x = store.ankete()[0];
    store.izaberi(x, 2);
    expect(store.izbor()[1]).toEqual([0, 2]);
    store.glasaj(x, [0, 2]);
    http.expectOne('api/public/nalog/ankete/1/glas').flush(a(1, { viseOdgovora: true, mojGlas: [0, 2] }));
    expect(store.izbor()[1]).toBeUndefined();
  });

  it('409 (zatvorena): poruka servera i odmah novo stanje', () => {
    store.primi([a(1)]);
    store.glasaj(store.ankete()[0], [0]);
    http.expectOne('api/public/nalog/ankete/1/glas').flush({ reason: 'Anketa je zatvorena.' }, { status: 409, statusText: 'Conflict' });
    expect(store.greska()).toBe('Anketa je zatvorena.');
    http.expectOne('api/public/nalog/ankete').flush([a(1, { otvorena: false })]);
    expect(store.ankete()[0].otvorena).toBe(false);
  });

  it('prekid mreže: poruka da glas nije poslat, bez novog upita', () => {
    store.primi([a(1)]);
    store.glasaj(store.ankete()[0], [0]);
    http.expectOne('api/public/nalog/ankete/1/glas').error(new ProgressEvent('error'), { status: 0 });
    expect(store.greska()).toBe('Glas nije poslat. Proveri internet i pokušaj ponovo.');
    expect(store.salje()).toBeNull();
  });

  it('push iz service worker-a: odmah GET ankete (jedan u letu); druga poruka SW-a ne pita', () => {
    poruka();
    poruka();
    http.expectOne('api/public/nalog/ankete').flush([a(5)]);
    expect(store.list()?.id).toBe(5);
    poruka('nesto-drugo');
    http.expectNone('api/public/nalog/ankete');
  });

  it('greška osvežavanja ostavlja poslednji skup', () => {
    store.primi([a(1)]);
    store.osvezi();
    http.expectOne('api/public/nalog/ankete').flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.ankete().map(x => x.id)).toEqual([1]);
  });
});
