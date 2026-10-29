import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { izBase64Url, PushApi, PushUredjaj } from './push-uredjaj';
import { zaboraviRegistracijuZaTest } from './service-worker';

// 65 bajtova (nekompresovan P-256 ključ), base64url bez dopune
const KLJUC = 'BA' + 'A'.repeat(85);
const DRUGI_KLJUC = 'BB' + 'B'.repeat(85);

interface Okruzenje {
  dozvola: NotificationPermission;
  pretplata: { options: { applicationServerKey: ArrayBuffer }; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null;
  subscribe: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
}

function pretplata(kljuc = KLJUC) {
  return {
    options: { applicationServerKey: izBase64Url(kljuc).buffer },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

const sacuvano = new Map<string, PropertyDescriptor | undefined>();
function postavi(obj: object, kljuc: string, vrednost: unknown): void {
  if (!sacuvano.has(`${obj === window ? 'w' : 'n'}:${kljuc}`)) {
    sacuvano.set(`${obj === window ? 'w' : 'n'}:${kljuc}`, Object.getOwnPropertyDescriptor(obj, kljuc));
  }
  Object.defineProperty(obj, kljuc, { value: vrednost, configurable: true, writable: true });
}

function okruzenje(o: Partial<Okruzenje> = {}): Okruzenje {
  const env: Okruzenje = {
    dozvola: 'default',
    pretplata: null,
    subscribe: vi.fn(async () => pretplata()),
    requestPermission: vi.fn(async () => {
      env.dozvola = 'granted';
      return 'granted' as NotificationPermission;
    }),
    ...o,
  };
  const reg = {
    active: {},
    pushManager: { getSubscription: vi.fn(async () => env.pretplata), subscribe: env.subscribe },
  };
  postavi(window, 'isSecureContext', true);
  postavi(window, 'PushManager', class {});
  postavi(window, 'Notification', {
    get permission() {
      return env.dozvola;
    },
    requestPermission: env.requestPermission,
  });
  postavi(navigator, 'serviceWorker', {
    register: vi.fn(async () => reg),
    ready: Promise.resolve(reg),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return env;
}

function api(pretplacen: boolean, proba: () => ReturnType<PushApi['proba']> = () => of(undefined)) {
  return {
    stanje: vi.fn(() => of({ javniKljuc: KLJUC, pretplacen })),
    pretplati: vi.fn(() => of(undefined)),
    odjavi: vi.fn(() => of(undefined)),
    proba: vi.fn(proba),
  } satisfies PushApi;
}

const poruka = (e: unknown) => ((e as { status?: number }).status === 409 ? 'Ovaj uređaj nema uključena obaveštenja.' : 'greška');

describe('PushUredjaj', () => {
  beforeEach(() => zaboraviRegistracijuZaTest());

  afterEach(() => {
    for (const [k, d] of sacuvano) {
      const [gde, ime] = k.split(':');
      const obj = gde === 'w' ? window : navigator;
      if (d) {
        Object.defineProperty(obj, ime, d);
      } else {
        delete (obj as unknown as Record<string, unknown>)[ime];
      }
    }
    sacuvano.clear();
  });

  it('iPhone u browseru (bez PushManager-a): samo iz aplikacije sa početnog ekrana; bez zahteva', async () => {
    postavi(navigator, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1');
    const a = api(false);
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    expect(u.stanje()).toBe('samo-iz-aplikacije');
    expect(a.stanje).not.toHaveBeenCalled();
  });

  it('dozvoljeno, browser ima pretplatu a server ne (nova sesija): tiho PUT, uključeno', async () => {
    okruzenje({ dozvola: 'granted', pretplata: pretplata() });
    const a = api(false);
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    expect(a.pretplati).toHaveBeenCalledWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'P256', auth: 'AUTH' });
    expect(u.stanje()).toBe('ukljuceno');
  });

  it('server ima pretplatu a browser ne: tiho DELETE, isključeno; pretplata na stari ključ se odjavljuje', async () => {
    const env = okruzenje({ dozvola: 'granted', pretplata: pretplata(DRUGI_KLJUC) });
    const stara = env.pretplata!;
    const a = api(true);
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    expect(stara.unsubscribe).toHaveBeenCalled();
    expect(a.odjavi).toHaveBeenCalled();
    expect(a.pretplati).not.toHaveBeenCalled();
    expect(u.stanje()).toBe('iskljuceno');
  });

  it('uključi: dozvola pa pretplata sa VAPID ključem servera, pa PUT', async () => {
    const env = okruzenje();
    const a = api(false);
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    expect(u.stanje()).toBe('iskljuceno');
    await u.ukljuci();
    expect(env.requestPermission).toHaveBeenCalled();
    expect(env.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: izBase64Url(KLJUC) });
    expect(a.pretplati).toHaveBeenCalledTimes(1);
    expect(u.stanje()).toBe('ukljuceno');
  });

  it('uključi: odbijena dozvola je „blokirano“, bez pretplate', async () => {
    const env = okruzenje({
      requestPermission: vi.fn(async () => {
        env.dozvola = 'denied';
        return 'denied' as NotificationPermission;
      }),
    });
    const a = api(false);
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    await u.ukljuci();
    expect(env.subscribe).not.toHaveBeenCalled();
    expect(u.stanje()).toBe('blokirano');
  });

  it('probno: 409 znači da server nema pretplatu ovog uređaja', async () => {
    okruzenje({ dozvola: 'granted', pretplata: pretplata() });
    const a = api(true, () => throwError(() => ({ status: 409 })));
    const u = new PushUredjaj(a, document, poruka);
    await u.ucitaj();
    expect(u.stanje()).toBe('ukljuceno');
    await u.proba();
    expect(u.stanje()).toBe('iskljuceno');
    expect(u.poruka()).toBe('Ovaj uređaj nema uključena obaveštenja.');
  });

  it('izBase64Url čita url-safe azbuku bez dopune', () => {
    expect([...izBase64Url('-_8')]).toEqual([0xfb, 0xff]);
    expect(izBase64Url(KLJUC)).toHaveLength(65);
  });
});
