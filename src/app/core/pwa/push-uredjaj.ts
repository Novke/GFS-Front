import { signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { uredjajIz } from './instalacija.pravila';
import { spremnaRegistracija } from './service-worker';

/** `GET .../push` (ugovor u planu „Aplikacija i obaveštenja“): VAPID javni ključ (base64url) i ima li ovaj uređaj pretplatu. */
export interface StanjePushServera {
  readonly javniKljuc: string;
  readonly pretplacen: boolean;
}

/** `PUT .../push`: pretplata browsera (`PushSubscription.toJSON()`). */
export interface PushPretplataCmd {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Studentski (`api/public/nalog/push`) i nastavnički (`api/push`) API imaju isti oblik. */
export interface PushApi {
  stanje(): Observable<StanjePushServera>;
  pretplati(cmd: PushPretplataCmd): Observable<void>;
  odjavi(): Observable<void>;
  proba(): Observable<void>;
}

/**
 * `ucitavanje`; `nepodrzano` (browser bez push-a); `samo-iz-aplikacije` (iPhone u browseru: push radi samo iz aplikacije sa
 * početnog ekrana); `blokirano` (korisnik je odbio dozvolu, vraća se samo u podešavanjima browsera); `iskljuceno`;
 * `ukljuceno`; `greska` (server nije odgovorio, vidi `poruka`).
 */
export type StanjePusha = 'ucitavanje' | 'nepodrzano' | 'samo-iz-aplikacije' | 'blokirano' | 'iskljuceno' | 'ukljuceno' | 'greska';

export function imaPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window
    && 'Notification' in window;
}

function standalone(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** base64url (bez dopune) u bajtove, za `applicationServerKey`. */
export function izBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bajtovi = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bajtovi[i] = bin.charCodeAt(i);
  }
  return bajtovi;
}

function istiKljuc(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) {
    return false;
  }
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

export function uKomandu(p: PushSubscription): PushPretplataCmd | null {
  const j = p.toJSON();
  const p256dh = j.keys?.['p256dh'];
  const auth = j.keys?.['auth'];
  return j.endpoint && p256dh && auth ? { endpoint: j.endpoint, p256dh, auth } : null;
}

/**
 * Push na ovom uređaju (spec „Aplikacija i obaveštenja“ 5.2 i 6.5), zajedničko za karticu studenta i stranicu nastavnika.
 * Obična klasa sa signalima; komponenta je pravi sa svojim API-jem. Dozvola se traži **samo na dodir** („Uključi“), i to
 * pre ijednog `await`-a, jer Safari inače odbija zahtev bez korisnikovog dodira.
 *
 * Usklađivanje pri učitavanju: browser ima pretplatu a server ne (nova sesija na istom uređaju) → tiho `PUT`; server
 * ima a browser ne (obrisani podaci browsera) → tiho `DELETE`; pretplata na stari VAPID ključ se odjavljuje.
 */
export class PushUredjaj {
  readonly stanje = signal<StanjePusha>('ucitavanje');
  readonly radi = signal(false);
  readonly poruka = signal<string | null>(null);
  private javniKljuc: string | null = null;

  constructor(
    private readonly api: PushApi,
    private readonly dokument: Document,
    private readonly porukaGreske: (e: unknown) => string,
  ) {}

  async ucitaj(): Promise<void> {
    this.poruka.set(null);
    if (!imaPush()) {
      const iphone = uredjajIz(navigator.userAgent, navigator.maxTouchPoints ?? 0) === 'iphone';
      this.stanje.set(iphone && !standalone() ? 'samo-iz-aplikacije' : 'nepodrzano');
      return;
    }
    this.stanje.set('ucitavanje');
    try {
      const server = await firstValueFrom(this.api.stanje());
      this.javniKljuc = server.javniKljuc;
      if (Notification.permission === 'denied') {
        this.stanje.set('blokirano');
        return;
      }
      const reg = Notification.permission === 'granted' ? await spremnaRegistracija(this.dokument) : null;
      let pretplata = reg ? await reg.pushManager.getSubscription() : null;
      if (pretplata && !istiKljuc(pretplata.options.applicationServerKey, izBase64Url(server.javniKljuc))) {
        await pretplata.unsubscribe().catch(() => false);
        pretplata = null;
      }
      const cmd = pretplata ? uKomandu(pretplata) : null;
      if (cmd && !server.pretplacen) {
        await firstValueFrom(this.api.pretplati(cmd));
      } else if (!cmd && server.pretplacen) {
        await firstValueFrom(this.api.odjavi()).catch(() => undefined);
      }
      this.stanje.set(cmd ? 'ukljuceno' : 'iskljuceno');
    } catch (e) {
      this.stanje.set('greska');
      this.poruka.set(this.porukaGreske(e));
    }
  }

  /** Na dodir: dozvola, pretplata u browseru, pa `PUT`. */
  async ukljuci(): Promise<void> {
    if (this.radi() || !imaPush()) {
      return;
    }
    this.radi.set(true);
    this.poruka.set(null);
    // prvo, pre ijednog await-a: Safari traži da zahtev za dozvolu bude deo dodira
    const dozvola = Notification.requestPermission();
    try {
      if ((await dozvola) !== 'granted') {
        this.stanje.set(Notification.permission === 'denied' ? 'blokirano' : 'iskljuceno');
        return;
      }
      const kljuc = this.javniKljuc ?? (await firstValueFrom(this.api.stanje())).javniKljuc;
      this.javniKljuc = kljuc;
      const reg = await spremnaRegistracija(this.dokument);
      if (!reg) {
        this.stanje.set('nepodrzano');
        return;
      }
      const postojeca = await reg.pushManager.getSubscription();
      if (postojeca && !istiKljuc(postojeca.options.applicationServerKey, izBase64Url(kljuc))) {
        await postojeca.unsubscribe().catch(() => false);
      }
      const pretplata = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: izBase64Url(kljuc) });
      const cmd = uKomandu(pretplata);
      if (!cmd) {
        this.stanje.set('nepodrzano');
        return;
      }
      await firstValueFrom(this.api.pretplati(cmd));
      this.stanje.set('ukljuceno');
    } catch (e) {
      this.poruka.set(e instanceof DOMException ? 'Browser nije dozvolio obaveštenja. Pokušaj ponovo.' : this.porukaGreske(e));
    } finally {
      this.radi.set(false);
    }
  }

  async iskljuci(): Promise<void> {
    if (this.radi()) {
      return;
    }
    this.radi.set(true);
    this.poruka.set(null);
    try {
      const reg = await spremnaRegistracija(this.dokument);
      const pretplata = reg ? await reg.pushManager.getSubscription() : null;
      await pretplata?.unsubscribe().catch(() => false);
      await firstValueFrom(this.api.odjavi());
      this.stanje.set('iskljuceno');
    } catch (e) {
      this.poruka.set(this.porukaGreske(e));
    } finally {
      this.radi.set(false);
    }
  }

  /** Probno obaveštenje; 409 znači da server nema pretplatu ovog uređaja. */
  async proba(): Promise<void> {
    if (this.radi()) {
      return;
    }
    this.radi.set(true);
    this.poruka.set(null);
    try {
      await firstValueFrom(this.api.proba());
      this.poruka.set('Poslato. Obaveštenje stiže za nekoliko sekundi.');
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        this.stanje.set('iskljuceno');
      }
      this.poruka.set(this.porukaGreske(e));
    } finally {
      this.radi.set(false);
    }
  }
}
