import { InjectionToken } from '@angular/core';
import { RxStomp } from '@stomp/rx-stomp';

export type WsPutanja = 'api/ws' | 'api/public/ws';

export function wsUrl(putanja: WsPutanja, base: string = document.baseURI): string {
  const u = new URL(putanja, base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.href;
}

/** Prvo povezivanje odmah; svako sledeće posle nasumičnih 1-3 s (40 telefona iza istog NAT-a ne udara nginx limit odjednom). */
export function napraviStomp(putanja: WsPutanja): RxStomp {
  const stomp = new RxStomp();
  let prvi = true;
  stomp.configure({
    brokerURL: wsUrl(putanja),
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    reconnectDelay: 200,
    beforeConnect: async () => {
      if (!prvi) await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
      prvi = false;
    },
  });
  stomp.activate();
  return stomp;
}

export type StompFabrika = (putanja: WsPutanja) => RxStomp;

/** Fabrika STOMP veze; store-ovi je dobijaju kroz DI, pa testovi podmeću lažnu vezu. */
export const STOMP_FABRIKA = new InjectionToken<StompFabrika>('STOMP_FABRIKA', {
  providedIn: 'root',
  factory: () => napraviStomp,
});
