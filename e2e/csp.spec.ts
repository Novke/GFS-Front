import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Locator, Page, Response } from '@playwright/test';

import { CSP } from './csp';
import { expect, test } from './fixture';
import { test as javniTest } from './javna-mreza';
import { DUGI_KES_IZRAZ } from './javne-putanje';
import { lazniBroker } from './lazni-stomp';
import type { MockApi } from './mock-api';
import { IZVORI_TEKSTA, OPCIJE_SA_FORMULOM, pitanjeSaFormulom } from './mock-izvodjenje';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * CSP frontend kontejnera (`e2e/csp.ts`, MCP spec 6.5): `img-src 'self' data: blob:; connect-src 'self' ws: wss:`. Statički
 * server e2e-a ga šalje na svaki odgovor kao nginx (`docker/nginx.conf`), pa svaki e2e radi pod njim. Ovde: nginx ga ima u
 * obe lokacije, nastavničke stranice i telefon rade bez ijednog kršenja, a Markdown slika sa drugog porekla (npr. slajd koji
 * je upisao Klod kroz MCP ili stari podaci) se ne crta i ne pravi zahtev: `renderer.image` je izbacuje pre CSP-a
 * (`ui/markdown.ts`).
 */

/** Slika otpremljena u GFS (izmišljen UUID); mok `api/public/mediji/*` vraća providan piksel. */
const MEDIJ = 'api/public/mediji/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
/** Markdown sa slikom van GFS-a (ne sme da se učita) i slikom iz GFS-a (mora da se nacrta: provera nije prazna). */
const SA_SLIKAMA = `Pre slike ![spolja](https://primer.invalid/x.png) posle slike.\n\n![iz GFS-a](${MEDIJ})`;

/** Telo lokacije iz nginx.conf (od `{` posle zaglavlja do prvog `}`; lokacije nemaju ugnežđene blokove). */
function lokacija(conf: string, zaglavlje: string): string {
  const pocetak = conf.indexOf(zaglavlje);
  expect(pocetak, zaglavlje).toBeGreaterThanOrEqual(0);
  const telo = pocetak + zaglavlje.length;
  return conf.slice(telo, conf.indexOf('}', telo));
}

interface PracenjeCsp {
  /** Kršenja do sada: poruke konzole sa "Content Security Policy" i događaji `securitypolicyviolation` dokumenta. */
  krsenja(): Promise<string[]>;
  /**
   * URL-ovi svih zahteva stranice ka `primer.invalid`. Chromium javlja zahtev slike i kad ga CSP odbije (pa `<img>` sa
   * spoljnim ciljem uvek ostavi trag ovde); `fetch` koji CSP odbije ne stiže do događaja `request`.
   */
  spolja: string[];
  /** Neuspeli zahtevi ka `primer.invalid` kao `<URL> <razlog>` (Chromium: `csp` kad ih odbije CSP). */
  odbijeni: string[];
}

/** Prati kršenja CSP-a i zahteve ka `primer.invalid` od pre prvog učitavanja. */
async function pratiCsp(page: Page): Promise<PracenjeCsp> {
  const konzola: string[] = [];
  const spolja: string[] = [];
  const odbijeni: string[] = [];
  const primer = (url: string) => new URL(url).hostname.endsWith('primer.invalid');
  page.on('console', m => {
    if (m.text().includes('Content Security Policy')) konzola.push(m.text());
  });
  page.on('request', r => {
    if (primer(r.url())) spolja.push(r.url());
  });
  page.on('requestfailed', r => {
    if (primer(r.url())) odbijeni.push(`${r.url()} ${r.failure()?.errorText}`);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', e => w.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  return {
    spolja, odbijeni,
    krsenja: async () => [...konzola, ...await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)],
  };
}

/** `naturalWidth` slike iz GFS-a u bloku (mok vraća piksel 1 x 1; 0 dok se ne učita ili kad je odbijena). */
const sirinaSlike = (blok: Locator) => blok.locator(`img[src="${MEDIJ}"]`).evaluate(i => (i as HTMLImageElement).naturalWidth);

/** Dokument je stigao sa CSP-om (statički server kao nginx): bez toga provera "nema kršenja" ništa ne dokazuje. */
function imaCsp(odgovor: Response | null): void {
  expect(odgovor?.headers()['content-security-policy'], 'CSP zaglavlje dokumenta').toBe(CSP);
}

test.describe('CSP frontend kontejnera', () => {
  test('docker/nginx.conf: isti CSP (always) u location /, u lokaciji heširanih fajlova i za service worker, nigde više', () => {
    const conf = readFileSync(join(__dirname, '..', 'docker', 'nginx.conf'), 'utf8');
    const red = `add_header Content-Security-Policy "${CSP}" always;`;
    // add_header se ne nasleđuje u lokaciju koja ima svoj (Cache-Control), pa ga obe lokacije sa sadržajem ponavljaju
    expect(lokacija(conf, 'location / {')).toContain(red);
    expect(lokacija(conf, `location ~ "${DUGI_KES_IZRAZ}" {`)).toContain(red);
    expect(lokacija(conf, 'location = /assets/pwa/sw.js {')).toContain(red);
    expect(conf.split('Content-Security-Policy').length - 1, 'broj CSP zaglavlja u nginx.conf').toBe(3);
  });

  test('pregledač primenjuje CSP sa statičkog servera: slika i veza ka drugom poreklu su odbijene', async ({ page }) => {
    const csp = await pratiCsp(page);
    imaCsp(await page.goto('banka?predmet=1'));
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);
    const veza = await page.evaluate(async () => {
      const slika = new Image();
      const ucitana = new Promise<boolean>(r => {
        slika.onload = () => r(true);
        slika.onerror = () => r(false);
      });
      slika.src = 'https://primer.invalid/proba.png';
      const odbijena = await fetch('https://primer.invalid/proba').then(() => false, () => true);
      return { slika: await ucitana, odbijena };
    });
    expect(veza).toEqual({ slika: false, odbijena: true });
    await expect.poll(() => csp.krsenja()).toEqual(expect.arrayContaining([
      'img-src https://primer.invalid/proba.png', 'connect-src https://primer.invalid/proba',
    ]));
    // slika: zahtev postoji, ali ga odbija CSP (ne DNS za .invalid), pa izostanak zahteva u testovima ispod znači da
    // stranica nije ni napravila <img>
    expect(csp.spolja).toEqual(['https://primer.invalid/proba.png']);
    expect(csp.odbijeni).toEqual(['https://primer.invalid/proba.png csp']);
  });
});

interface Stranica {
  ime: string;
  putanja: string;
  pripremi?: (page: Page, mock: MockApi) => Promise<void>;
  spremno: (page: Page) => Promise<void>;
}

const STRANICE: Stranica[] = [
  {
    ime: 'banka (stablo i kartice sa SVG renderom)',
    putanja: 'banka?predmet=1',
    // tri kartice: dve sa SVG-om rendera (`img`), treća sa greškom rendera (bez slike)
    spremno: async p => {
      await expect(p.locator('app-varijanta-kartica')).toHaveCount(3);
      await expect(p.locator('app-varijanta-kartica img')).toHaveCount(2);
      for (const img of await p.locator('app-varijanta-kartica img').all()) {
        await expect.poll(() => img.evaluate(i => (i as HTMLImageElement).naturalWidth), 'SVG rendera je učitan').toBeGreaterThan(0);
      }
    },
  },
  {
    ime: 'editor varijante banke (pregled SVG-a)',
    putanja: 'banka/varijante/12',
    spremno: p => expect(p.getByRole('img', { name: 'Pregled: Zadatak' })).toContainText('Zadatak 12'),
  },
  {
    ime: 'editor prezentacije (PLATNO slajd, lenji editor platna)',
    putanja: 'prezentacije/5',
    spremno: async p => {
      await p.getByRole('button', { name: /^2\s/ }).click();
      await expect(p.locator('[data-oznaka="gfs-editor-platna"]')).toBeVisible();
      await expect(p.locator('.uz-ep-platno [data-sloj="naslov"]')).toBeVisible();
    },
  },
  {
    ime: 'projektor (pitanje sa formulom, mathlive/ssr i KaTeX fontovi)',
    putanja: 'izvodjenja/7/publika',
    pripremi: async (page, mock) => {
      mock.izvodjenje.izmeniSlajd(2, { pitanje: pitanjeSaFormulom() });
      for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3) -> slajd 2 (3) -> slajd 3
      await nastavnickiBroker(page, mock);
    },
    spremno: async p => {
      await expect(p.locator('.uz-plocica-tekst .uz-formula--spremna .ML__latex')).toHaveCount(OPCIJE_SA_FORMULOM.length);
      await expect(p.locator('.uz-pitanje-tekst .uz-formula--izvor')).toHaveCount(IZVORI_TEKSTA.length);
    },
  },
];

test.describe('CSP: nastavničke stranice bez kršenja', () => {
  for (const s of STRANICE) {
    test(`${s.ime}: nijedna poruka "Content Security Policy"`, async ({ page, mock }) => {
      const csp = await pratiCsp(page);
      await s.pripremi?.(page, mock);
      imaCsp(await page.goto(s.putanja));
      await s.spremno(page);
      await page.waitForLoadState('networkidle');
      expect(await csp.krsenja()).toEqual([]);
      expect(csp.spolja).toEqual([]);
    });
  }
});

test.describe('Markdown slika van GFS-a: projektor', () => {
  test('INFO slajd: spoljna slika se ne crta i ne traži (ni CSP je ne vidi), slika iz GFS-a se crta', async ({ page, mock }) => {
    const csp = await pratiCsp(page);
    mock.izvodjenje.izmeniSlajd(0, { sadrzaj: SA_SLIKAMA, postepeno: false });
    mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (INFO)
    await nastavnickiBroker(page, mock);
    imaCsp(await page.goto('izvodjenja/7/publika'));

    const md = page.locator('app-publika-scena .uz-slajd-md');
    await expect(md).toContainText('Pre slike posle slike.');
    await expect.poll(() => sirinaSlike(md), 'slika iz GFS-a je učitana').toBe(1);
    await expect(md.locator('img')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    // CSP bi sliku odbio i bez filtera, ali uz zahtev (odbijen, `csp`) i poruku: tišina znači da `renderer.image` nije ni
    // napravio <img>
    expect(csp.spolja, 'zahtevi ka primer.invalid').toEqual([]);
    expect(await csp.krsenja()).toEqual([]);
  });
});

/** Kod aktivnog izvođenja iz `fixtures/uzivo.json` (izmišljen). */
const KOD = '123456';
const IZVODJENJE = 7;

/** Početni snimak telefona (prijavljena Mina, režim PITANJE: tekst pitanja stiže na telefon) sa slikama u tekstu. */
const pitanjeNaTelefonu = () => ({
  javno: {
    izvodjenjeId: IZVODJENJE, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
    kod: KOD, prikaz: 'SLAJD', slajdTip: 'PITANJE', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'PITANJE',
    detaljiDozvoljeni: false, brojUcesnika: 1, rezultat: null, rangLista: null,
    pitanje: {
      tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 31, brojOpcija: 2, opcije: [{ id: 1, tekst: 'Da' }, { id: 2, tekst: 'Ne' }],
      tekst: SA_SLIKAMA, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null,
      preostaloMs: null, tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
    },
  },
  licno: { verzija: 1, ucesnikId: 10_000, ime: 'Mina', poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
});

javniTest.describe('Markdown slika van GFS-a: telefon studenta', () => {
  javniTest.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    // kolačić prijave već važi (`GET ja`); slika iz GFS-a je jedini drugi `/api/` zahtev
    dozvoljeniApi: new RegExp(`^(GET /api/public/uzivo/\\d{6}(/ja)?|GET /${MEDIJ})$`),
  });

  javniTest('PITANJE: spoljna slika se ne crta i ne traži, slika iz GFS-a se crta; bez kršenja CSP-a', async ({ page, mock, javnaMreza }) => {
    const csp = await pratiCsp(page);
    mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: IZVODJENJE });
    await lazniBroker(
      page, 'api/public/ws',
      o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? pitanjeNaTelefonu() : undefined),
      url => javnaMreza.ws.push(new URL(url).pathname),
    );
    imaCsp(await page.goto(`uzivo/${KOD}`));

    const md = page.locator('app-tekst-formule.uz-st-md');
    await expect(md).toContainText('Pre slike posle slike.');
    await expect.poll(() => sirinaSlike(md), 'slika iz GFS-a je učitana').toBe(1);
    await expect(md.locator('img')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    expect(csp.spolja, 'zahtevi ka primer.invalid').toEqual([]);
    expect(await csp.krsenja()).toEqual([]);
    expect(javnaMreza.api).toContain(`GET /${MEDIJ}`);
  });
});
