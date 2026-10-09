import { expect, test as osnova } from './fixture';
import { JAVNA_PUTANJA } from './javne-putanje';

export { expect } from './fixture';

export interface JavnaMreza {
  /** Svi zahtevi stranice ka `/api/` (`METOD /api/...`), i oni koje odbije zaključavanje. */
  api: string[];
  /** URL-ovi odgovora 401. */
  odgovori401: string[];
  /**
   * Putanje WebSocket veza koje je stranica otvorila. Veze preko `page.routeWebSocket` (lažni broker) ne izazivaju
   * događaj `websocket`, pa ih spec upisuje sam u svom rukovaocu.
   */
  ws: string[];
}

interface Opcije {
  /** Dozvoljeni `/api/` pozivi ove javne stranice (`METOD /api/...`); sve ostalo obara test. */
  dozvoljeniApi: RegExp;
}

/**
 * `test` za javne rute (student na telefonu, bez basic-auth-a). Kao na stejdžingu i prodi: **svaki** zahtev ka
 * aplikaciji (i statički fajl, npr. lenji chunk) čija putanja ne odgovara `JAVNA_PUTANJA` (`e2e/javne-putanje.ts`, kopija
 * serverskog izraza) dobija 401, pa bi student dobio dijalog za lozinku ili stranicu koja se ne pokrene. Provera je u
 * teardown-u, posle celog testa, da uhvati i zakasneli poziv.
 */
export const test = osnova.extend<{ javnaMreza: JavnaMreza } & Opcije>({
  dozvoljeniApi: [/^$/, { option: true }],
  javnaMreza: [
    async ({ page, mock, baseURL, dozvoljeniApi }, use) => {
      void mock; // mok mora biti instaliran pre ove rute: `route.fallback()` ide na njega
      const origin = new URL(baseURL!).origin;
      const mreza: JavnaMreza = { api: [], odgovori401: [], ws: [] };
      page.on('request', r => {
        const putanja = new URL(r.url()).pathname;
        if (putanja.includes('/api/')) {
          mreza.api.push(`${r.method()} ${putanja}`);
        }
      });
      page.on('response', r => {
        if (r.status() === 401) {
          mreza.odgovori401.push(new URL(r.url()).pathname);
        }
      });
      page.on('websocket', ws => mreza.ws.push(new URL(ws.url()).pathname));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin !== origin || JAVNA_PUTANJA.test(url.pathname)
          ? route.fallback()
          : route.fulfill({ status: 401, contentType: 'application/json', body: '{"reason":"Potrebna je prijava."}' });
      });
      await use(mreza);
      expect(mreza.api.filter(z => !dozvoljeniApi.test(z)), 'pozivi van dozvoljenih javnih putanja').toEqual([]);
      expect(mreza.odgovori401, 'odgovori 401 (zaključana putanja)').toEqual([]);
      expect(mreza.ws.filter(p => !JAVNA_PUTANJA.test(p)), 'WebSocket van javnih putanja').toEqual([]);
    },
    { auto: true },
  ],
});
