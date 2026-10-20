import { expect, test as osnova } from './fixture';
import { JAVNA_PUTANJA } from './javne-putanje';
import { NIZ_MATHLIVE, nizoviEditora, zabranjeniJavno } from './nizovi-editora';
import { nizoviPdf, nizoviUvoza } from './nizovi-uvoza';

export { expect } from './fixture';

export interface JavnaMreza {
  /** Svi zahtevi stranice ka `/api/` (`METOD /api/...`), i oni koje odbije zaključavanje. */
  api: string[];
  /** Putanje svih zahteva stranice (i statičkih fajlova), redom. */
  zahtevi: string[];
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
   * `saEditorom`: svi `NIZOVI_EDITORA` (i `ML__latex`); `saZabranjenim`: `NIZOVI_ZABRANJENI_JAVNO` (bez `ML__latex`);
   * `saFormulom`: putanje JS-a sa `ML__latex` (`mathlive/ssr`); `saPdf`: JS sa nizovima uvoza PDF-a (`nizoviPdf`: dijalog,
   * pdf.js, radnik), koji javna ruta nikad ne učitava.
   */
  skripte(): Promise<{
    putanje: string[]; saUvozom: string[]; saEditorom: string[]; saZabranjenim: string[]; saFormulom: string[]; saPdf: string[];
  }>;
}

interface Opcije {
  /** Dozvoljeni `/api/` pozivi ove javne stranice (`METOD /api/...`); sve ostalo obara test. */
  dozvoljeniApi: RegExp;
  /**
   * Putanje na kojima je 401 odgovor **aplikacije**, ne zaključavanje (nalog studenta: pogrešan kod na
   * `/api/public/nalog/prijava`, istekao kolačić na `/api/public/nalog/ja`). Važi samo za javnu putanju (`JAVNA_PUTANJA`):
   * 401 sa zaključane putanje (basic-auth, dijalog za lozinku) obara test i kad odgovara ovom izrazu. Podrazumevano ništa.
   */
  dozvoljeni401: RegExp;
  /**
   * Stranica sme da crta formule (5a: uživo sa formulom u tekstu pitanja ili opcije). Tada teardown umesto svih nizova
   * editora proverava `zabranjeniJavno` (`ML__latex` sme samo bez `NIZ_MATHLIVE_CEO`) i pušta `assets/mathlive/`.
   * Podrazumevano `false`: upis i uživo bez formule ostaju strogi (nijedan JS sa `ML__latex`, nijedan zahtev na
   * `assets/mathlive/`).
   */
  formule: boolean;
}

/**
 * `test` za javne rute (student na telefonu, bez basic-auth-a). Kao na stejdžingu i prodi: **svaki** zahtev ka
 * aplikaciji (i statički fajl, npr. lenji chunk) čija putanja ne odgovara `JAVNA_PUTANJA` (`e2e/javne-putanje.ts`, kopija
 * serverskog izraza) dobija 401, pa bi student dobio dijalog za lozinku ili stranicu koja se ne pokrene. Provera je u
 * teardown-u, posle celog testa, da uhvati i zakasneli poziv.
 */
export const test = osnova.extend<{ javnaMreza: JavnaMreza } & Opcije>({
  dozvoljeniApi: [/^$/, { option: true }],
  dozvoljeni401: [/^$/, { option: true }],
  formule: [false, { option: true }],
  javnaMreza: [
    async ({ page, mock, baseURL, dozvoljeniApi, dozvoljeni401, formule }, use) => {
      void mock; // mok mora biti instaliran pre ove rute: `route.fallback()` ide na njega
      const origin = new URL(baseURL!).origin;
      interface Procitano { putanja: string; nizovi: string[]; editor: string[]; zabranjeni: string[]; pdf: string[] }
      const citanja: Promise<Procitano>[] = [];
      const mreza: JavnaMreza = {
        api: [], zahtevi: [], odgovori401: [], ws: [],
        skripte: async () => {
          // čeka i čitanja koja počnu dok se raniji odgovori čitaju (broj se ustali)
          let procitane: Procitano[];
          do {
            procitane = await Promise.all([...citanja]);
          } while (procitane.length < citanja.length);
          return {
            putanje: procitane.map(x => x.putanja),
            saUvozom: procitane.filter(x => x.nizovi.length).map(x => `${x.putanja}: ${x.nizovi.join(', ')}`),
            saEditorom: procitane.filter(x => x.editor.length).map(x => `${x.putanja}: ${x.editor.join(', ')}`),
            saZabranjenim: procitane.filter(x => x.zabranjeni.length).map(x => `${x.putanja}: ${x.zabranjeni.join(', ')}`),
            saFormulom: procitane.filter(x => x.editor.includes(NIZ_MATHLIVE)).map(x => x.putanja),
            saPdf: procitane.filter(x => x.pdf.length).map(x => `${x.putanja}: ${x.pdf.join(', ')}`),
          };
        },
      };
      page.on('request', r => {
        const putanja = new URL(r.url()).pathname;
        mreza.zahtevi.push(putanja);
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
          const necitano = ['telo nije pročitano'];
          citanja.push(r.text().then(
            t => ({ putanja, nizovi: nizoviUvoza(t), editor: nizoviEditora(t), zabranjeni: zabranjeniJavno(t), pdf: nizoviPdf(t) }),
            () => ({ putanja, nizovi: necitano, editor: necitano, zabranjeni: necitano, pdf: necitano }),
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
      expect(
        mreza.odgovori401.filter(p => !(JAVNA_PUTANJA.test(p) && dozvoljeni401.test(p))),
        'odgovori 401 (zaključana putanja)',
      ).toEqual([]);
      expect(mreza.ws.filter(p => !JAVNA_PUTANJA.test(p)), 'WebSocket van javnih putanja').toEqual([]);
      const skripte = await mreza.skripte();
      expect(skripte.saUvozom, 'JS sa fflate-om ili kodom uvoza PPTX-a na javnoj ruti').toEqual([]);
      // 5d: telefon nikad ne dobija uvoz PDF-a (dijalog, pdf.js, radnik) ni podatke pdf.js-a (fontovi, cmaps, wasm)
      expect(skripte.saPdf, 'JS uvoza PDF-a ili pdf.js na javnoj ruti').toEqual([]);
      expect(mreza.zahtevi.filter(p => p.includes('/assets/pdfjs/')), 'pdf.js assets na javnoj ruti').toEqual([]);
      if (formule) {
        // formula u tekstu (5a): samo `mathlive/ssr` (lenji chunk), nikad ceo mathlive, editor platna ni ProseMirror
        expect(skripte.saZabranjenim, 'JS sa kodom editora ili celim mathlive-om na javnoj ruti').toEqual([]);
      } else {
        expect(skripte.saEditorom, 'JS sa kodom editora platna ili MathLive-om na javnoj ruti').toEqual([]);
        // strana bez formule ne učitava ni stil ni KaTeX fontove MathLive-a
        expect(mreza.zahtevi.filter(p => p.includes('/assets/mathlive/')), 'MathLive assets na javnoj ruti').toEqual([]);
      }
    },
    { auto: true },
  ],
});
