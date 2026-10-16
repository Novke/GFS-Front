import { expect, test as osnova } from './fixture';
import { JAVNA_PUTANJA } from './javne-putanje';
import { nizoviEditora } from './nizovi-editora';
import { nizoviUvoza } from './nizovi-uvoza';

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
  /**
   * Čeka da se pročitaju sva tela JS odgovora stranice i vraća njihove putanje (sa nizovima uvoza PPTX-a ili editora
   * platna koje telo sadrži, npr. `/chunk-X.js: invalid zip data`). Javna ruta ne sme da učita fflate, kod uvoza ni kod
   * editora platna (i njegove biblioteke); teardown proverava isto, a spec ga zove da potvrdi da provera nije prazna.
   */
  skripte(): Promise<{ putanje: string[]; saUvozom: string[]; saEditorom: string[] }>;
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
      const citanja: Promise<{ putanja: string; nizovi: string[]; editor: string[] }>[] = [];
      const mreza: JavnaMreza = {
        api: [], odgovori401: [], ws: [],
        skripte: async () => {
          // čeka i čitanja koja počnu dok se raniji odgovori čitaju (broj se ustali)
          let procitane: { putanja: string; nizovi: string[]; editor: string[] }[];
          do {
            procitane = await Promise.all([...citanja]);
          } while (procitane.length < citanja.length);
          return {
            putanje: procitane.map(x => x.putanja),
            saUvozom: procitane.filter(x => x.nizovi.length).map(x => `${x.putanja}: ${x.nizovi.join(', ')}`),
            saEditorom: procitane.filter(x => x.editor.length).map(x => `${x.putanja}: ${x.editor.join(', ')}`),
          };
        },
      };
      page.on('request', r => {
        const putanja = new URL(r.url()).pathname;
        if (putanja.includes('/api/')) {
          mreza.api.push(`${r.method()} ${putanja}`);
        }
      });
      page.on('response', r => {
        const putanja = new URL(r.url()).pathname;
        if (r.status() === 401) {
          mreza.odgovori401.push(putanja);
        }
        if (putanja.endsWith('.js')) {
          // telo se čita odmah (posle zatvaranja stranice ga nema); nepročitano telo obara proveru (fail-closed)
          citanja.push(r.text().then(
            t => ({ putanja, nizovi: nizoviUvoza(t), editor: nizoviEditora(t) }),
            () => ({ putanja, nizovi: ['telo nije pročitano'], editor: ['telo nije pročitano'] }),
          ));
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
      const skripte = await mreza.skripte();
      expect(skripte.saUvozom, 'JS sa fflate-om ili kodom uvoza PPTX-a na javnoj ruti').toEqual([]);
      expect(skripte.saEditorom, 'JS sa kodom editora platna na javnoj ruti').toEqual([]);
    },
    { auto: true },
  ],
});
