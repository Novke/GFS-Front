import type { Page, WebSocketRoute } from '@playwright/test';

/*
 * Lažni STOMP broker za e2e (bez servera): `page.routeWebSocket` presreće WebSocket stranice, potvrđuje CONNECT, beleži
 * pretplate i šalje MESSAGE okvire. Heartbeat je isključen (`heart-beat: 0,0`), pa veza ne pada sama; `prekini()` je
 * zatvara kao server ili mreža koja padne, a `utisaj()` je ostavlja tiho mrtvu (kao socket posle spavanja telefona).
 */

/** STOMP okvir (tekst, `\0` na kraju). */
export const okvir = (komanda: string, zaglavlja: Record<string, string>, telo = ''): string =>
  `${komanda}\n${Object.entries(zaglavlja).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${telo}\0`;

/** Prvi red i zaglavlja primljenog okvira. */
export function procitaj(poruka: string): { komanda: string; zaglavlja: Record<string, string> } {
  const [glava] = poruka.split('\n\n');
  const [komanda, ...redovi] = glava.split('\n');
  return { komanda, zaglavlja: Object.fromEntries(redovi.map(r => [r.slice(0, r.indexOf(':')), r.slice(r.indexOf(':') + 1)])) };
}

export interface LazniBroker {
  /** Sva odredišta pretplata, redom, kroz sve veze. */
  readonly pretplate: string[];
  /** Koliko je veza otvoreno do sada. */
  readonly veze: number;
  /** MESSAGE svim pretplatama tog odredišta na poslednjoj vezi. */
  posalji(odrediste: string, telo: unknown): void;
  /** Zatvara poslednju vezu (kao server ili mreža koja padne): stranica dobija `close`. */
  prekini(): void;
  /**
   * Poslednja veza postaje tiho mrtva (kao posle spavanja telefona): broker više ne odgovara ni ne šalje, a `close()` sa
   * strane stranice nikad ne dobije potvrdu (socket ostaje u stanju CLOSING, bez događaja `close`).
   */
  utisaj(): void;
}

interface Veza {
  ws: WebSocketRoute;
  /** Odredište po id-u pretplate. */
  pretplate: Map<string, string>;
  tiha: boolean;
}

/**
 * `page.routeWebSocket('**\/' + putanja)`; CONNECT -> CONNECTED; na SUBSCRIBE zove `naPretplatu(odrediste)` i, ako vrati
 * telo, šalje ga toj pretplati. `naVezu(url)` se zove za svaku novu vezu (npr. da javna mreža zapiše putanju).
 */
export async function lazniBroker(
  page: Page,
  putanja: 'api/ws' | 'api/public/ws',
  naPretplatu?: (odrediste: string) => unknown | undefined,
  naVezu?: (url: string) => void,
): Promise<LazniBroker> {
  const pretplate: string[] = [];
  const veze: Veza[] = [];
  let poruka = 0;

  const posaljiVezi = (v: Veza, id: string, odrediste: string, telo: unknown) => {
    if (v.tiha) return;
    v.ws.send(okvir('MESSAGE', {
      destination: odrediste, subscription: id, 'message-id': String(++poruka), 'content-type': 'application/json',
    }, JSON.stringify(telo)));
  };

  await page.routeWebSocket('**/' + putanja, ws => {
    const v: Veza = { ws, pretplate: new Map(), tiha: false };
    veze.push(v);
    naVezu?.(ws.url());
    ws.onMessage(m => {
      if (v.tiha) return;
      const tekst = typeof m === 'string' ? m : m.toString('utf8');
      if (tekst === '\n') return; // heartbeat
      const { komanda, zaglavlja } = procitaj(tekst.replace(/^\n+/, ''));
      if (komanda === 'CONNECT' || komanda === 'STOMP') {
        ws.send(okvir('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }));
      } else if (komanda === 'SUBSCRIBE') {
        const odrediste = zaglavlja['destination'];
        pretplate.push(odrediste);
        v.pretplate.set(zaglavlja['id'], odrediste);
        const telo = naPretplatu?.(odrediste);
        if (telo !== undefined) posaljiVezi(v, zaglavlja['id'], odrediste, telo);
      } else if (komanda === 'UNSUBSCRIBE') {
        v.pretplate.delete(zaglavlja['id']);
      } else if (komanda === 'DISCONNECT' && zaglavlja['receipt']) {
        ws.send(okvir('RECEIPT', { 'receipt-id': zaglavlja['receipt'] }));
      }
    });
  });

  return {
    pretplate,
    get veze() {
      return veze.length;
    },
    posalji(odrediste, telo) {
      const v = veze.at(-1);
      if (!v) throw new Error('Lažni broker: nema veze.');
      for (const [id, o] of v.pretplate) {
        if (o === odrediste) posaljiVezi(v, id, odrediste, telo);
      }
    },
    prekini() {
      const v = veze.at(-1);
      if (!v) throw new Error('Lažni broker: nema veze.');
      void v.ws.close();
    },
    utisaj() {
      const v = veze.at(-1);
      if (!v) throw new Error('Lažni broker: nema veze.');
      v.tiha = true;
      // bez potvrde zatvaranja: `close()` stranice ostaje bez odgovora (podrazumevano bi ga mok odmah potvrdio)
      v.ws.onClose(() => undefined);
    },
  };
}
