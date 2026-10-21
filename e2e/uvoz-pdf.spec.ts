import type { ConsoleMessage, Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import { napraviPdf, zakljucanPdf } from './fixtures/pdf-fabrika';
import type { MockApi } from './mock-api';
import { NIZ_PDFJS, NIZ_PDFJS_RADNIK, NIZ_UVOZA_PDF, nizoviPdf } from './nizovi-uvoza';

/** Prezentacija iz `fixtures/prezentacije.json` (izmišljeno, tema NACRT): slajdovi 51 (INFO), 52 i 53 (PLATNO). */
const PREZENTACIJA = 5;

interface SlojUvoza { id: string; tip: string; naziv: string; x: number; y: number; sirina: number; visina: number; zakljucan: boolean; medijId: string }
interface SlajdUvoza { tip: string; beleske: string | null; prelaz?: unknown; platno: { slojevi: SlojUvoza[]; animacije: unknown[] } }
interface TeloUvoza { posle: number | null; slajdovi: SlajdUvoza[] }

/** Mreža i konzola stranice: svi zahtevi, nizovi uvoza PDF-a u telima JS odgovora, upozorenja i greške konzole, dijalozi. */
interface Pracenje {
  zahtevi: URL[];
  /** Upozorenja i greške konzole (i iz radnika pdf.js-a). */
  konzola: string[];
  /** `alert`/`confirm`/`prompt`/`beforeunload`: uvoz ih nikad ne otvara (lozinka se nikad ne traži). */
  dijalozi: string[];
  /** Pročitani JS odgovori do sada (čeka i ona čitanja koja počnu dok se raniji čitaju), sa nizovima uvoza PDF-a. */
  skripte(): Promise<{ putanja: string; pdf: string[] }[]>;
}

function prati(page: Page): Pracenje {
  const citanja: Promise<{ putanja: string; pdf: string[] }>[] = [];
  const p: Pracenje = {
    zahtevi: [], konzola: [], dijalozi: [],
    skripte: async () => {
      let procitane: { putanja: string; pdf: string[] }[];
      do {
        procitane = await Promise.all([...citanja]);
      } while (procitane.length < citanja.length);
      return procitane;
    },
  };
  const konzola = (m: ConsoleMessage) => {
    if (m.type() === 'warning' || m.type() === 'error') p.konzola.push(`${m.type()}: ${m.text()}`);
  };
  page.on('console', konzola);
  page.on('worker', w => w.on('console', konzola));
  page.on('dialog', d => {
    p.dijalozi.push(`${d.type()}: ${d.message()}`);
    void d.dismiss();
  });
  page.on('request', r => p.zahtevi.push(new URL(r.url())));
  page.on('response', r => {
    const putanja = new URL(r.url()).pathname;
    if (putanja.endsWith('.js')) {
      // nepročitano telo obara proveru (fail-closed)
      citanja.push(r.text().then(t => ({ putanja, pdf: nizoviPdf(t) }), () => ({ putanja, pdf: ['telo nije pročitano'] })));
    }
  });
  return p;
}

const sviNizovi = async (p: Pracenje): Promise<string[]> => [...new Set((await p.skripte()).flatMap(s => s.pdf))].sort();
const radnici = (p: Pracenje): string[] => p.zahtevi.filter(u => /\/worker-[A-Za-z0-9_-]+\.js$/.test(u.pathname)).map(u => u.pathname);

const dijalog = (page: Page) => page.locator('mat-dialog-container').filter({ has: page.getByRole('heading', { name: 'Uvoz iz PDF-a' }) });

/** Editor prezentacije 5 sa izabranim prvim slajdom (uvoz ide posle njega, `posle` = 51), pa dijalog uvoza PDF-a. */
async function otvoriDijalog(page: Page, p?: Pracenje): Promise<Locator> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  const prvi = page.getByRole('button', { name: /^1\s/ });
  await expect(prvi).toBeEnabled();
  await prvi.click();
  const dugme = page.getByRole('button', { name: 'Uvezi iz PDF-a' });
  await expect(dugme).toBeEnabled();
  if (p) {
    expect(await sviNizovi(p), 'pre klika na "PDF" ništa od uvoza PDF-a').toEqual([]);
  }
  await dugme.click();
  const d = dijalog(page);
  await expect(d.locator('[data-faza="izbor"]')).toBeVisible();
  return d;
}

/** Bira fajl u dijalogu (forma slajda ima svoje skriveno polje za fajl, pa samo unutar dijaloga). */
async function izaberi(d: Locator, name: string, buffer: Buffer): Promise<void> {
  await d.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer });
}

const uvozi = (mock: MockApi) => mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi/uvoz`, 'POST');
const postovi = (mock: MockApi) => mock.zahtevi.filter(z => z.metod === 'POST');

test.describe('uživo: uvoz iz PDF-a (sintetički PDF-ovi, mokovan API)', () => {
  let pracenje: Pracenje;

  test.beforeEach(({ page }) => {
    pracenje = prati(page);
  });

  test.afterEach(() => {
    expect(pracenje.konzola, 'upozorenja ili greške u konzoli (i pdf.js-a)').toEqual([]);
    expect(pracenje.dijalozi, 'dijalog pregledača (npr. lozinka)').toEqual([]);
  });

  test('dve strane (16:9 i 4:3): dve slike, jedan uvoz sa 2 PLATNO slajda; pdf.js i radnik tek posle izbora fajla, sve istog porekla', async ({ page, mock, baseURL }) => {
    const d = await otvoriDijalog(page, pracenje);
    // posle klika: samo chunk dijaloga, ni pdf.js ni radnik
    expect(await sviNizovi(pracenje), 'posle klika samo dijalog').toEqual([NIZ_UVOZA_PDF]);
    expect(radnici(pracenje)).toEqual([]);
    expect(pracenje.zahtevi.filter(u => u.pathname.includes('/assets/pdfjs/'))).toEqual([]);

    await izaberi(d, 'Sinteticki.pdf', napraviPdf([{ sirina: 960, visina: 540 }, { sirina: 720, visina: 540 }]));
    await expect(d.locator('[data-faza="pregled"]')).toBeVisible();
    await expect(d.getByText('Strana u PDF-u: 2.')).toBeVisible();
    await expect(d.getByRole('radio', { name: 'Posle slajda 1' })).toBeChecked();
    expect(await sviNizovi(pracenje)).toEqual([NIZ_UVOZA_PDF, NIZ_PDFJS, NIZ_PDFJS_RADNIK].sort());
    expect(radnici(pracenje), 'radnik pdf.js-a je worker-*.js').toHaveLength(1);

    const uvezi = d.getByRole('button', { name: 'Uvezi' });
    await expect(uvezi).toBeEnabled();
    await uvezi.click();
    await expect(d).toHaveCount(0);
    await expect(page.getByText('Uvezeno slajdova: 2.')).toBeVisible();

    const slike = mock.zahteviZa('mediji', 'POST');
    expect(slike).toHaveLength(2);
    expect(mock.mediji.map(m => m.mime)).toEqual(['image/png', 'image/png']);
    expect(mock.mediji.map(m => m.naziv).sort()).toEqual(['Sinteticki - str. 1.png', 'Sinteticki - str. 2.png']);
    expect(uvozi(mock)).toHaveLength(1);
    const telo = uvozi(mock)[0].telo as TeloUvoza;
    expect(telo.posle).toBe(51);
    expect(telo.slajdovi.map(s => s.tip)).toEqual(['PLATNO', 'PLATNO']);
    const slojevi = telo.slajdovi.map(s => s.platno.slojevi);
    expect(slojevi.map(s => s.length)).toEqual([1, 1]);
    expect(slojevi.map(([s]) => ({ id: s.id, tip: s.tip, x: s.x, y: s.y, sirina: s.sirina, visina: s.visina, zakljucan: s.zakljucan }))).toEqual([
      { id: 's1', tip: 'SLIKA', x: 0, y: 0, sirina: 960, visina: 540, zakljucan: true },
      { id: 's1', tip: 'SLIKA', x: 120, y: 0, sirina: 720, visina: 540, zakljucan: true },
    ]);
    expect(slojevi.map(([s]) => s.naziv)).toEqual(['Sinteticki - str. 1', 'Sinteticki - str. 2']);
    // svaka strana ima svoju sliku (id servera, ne heš)
    expect(slojevi.map(([s]) => s.medijId).sort()).toEqual(mock.mediji.map(m => m.id).sort());
    expect(telo.slajdovi.map(s => [s.beleske, s.platno.animacije.length])).toEqual([[null, 0], [null, 0]]);

    // lista editora: 1, dva nova PLATNO slajda, pa stari drugi i treći
    const stavke = page.locator('.uz-ed-stavka-dugme');
    await expect(stavke).toHaveCount(5);
    const tipovi = await stavke.locator('.uz-ed-ikona').evaluateAll(el => el.map(e => e.getAttribute('aria-label')));
    expect(tipovi).toEqual(['Info slajd', 'Platno', 'Platno', 'Platno', 'Platno']);

    // PDF nikad ne ide na server: nijedno telo zahteva nema PDF
    expect(mock.zahtevi.filter(z => typeof z.telo === 'string' && z.telo.includes('%PDF-'))).toEqual([]);
    // pdf.js traži standardni font (Helvetica nije ugrađena) iz assets/pdfjs/, istog porekla; ništa van porekla stranice
    const origin = new URL(baseURL!).origin;
    const pdfjs = pracenje.zahtevi.filter(u => u.pathname.includes('/assets/pdfjs/'));
    expect(pdfjs.length, 'zahtevi na assets/pdfjs/').toBeGreaterThan(0);
    expect(pdfjs.filter(u => u.origin !== origin)).toEqual([]);
    expect(pracenje.zahtevi.filter(u => u.origin !== origin && u.protocol !== 'blob:' && u.protocol !== 'data:').map(String)).toEqual([]);
  });

  test('PDF zaključan lozinkom: poruka, nikad upit za lozinku, nijedan POST', async ({ page, mock }) => {
    const d = await otvoriDijalog(page);
    await izaberi(d, 'Zakljucan.pdf', zakljucanPdf());
    await expect(d.getByRole('alert')).toHaveText('PDF je zaključan lozinkom. Sačuvaj ga ponovo bez lozinke i pokušaj opet.');
    await expect(d.getByRole('button', { name: 'Izaberi drugi fajl' })).toBeVisible();
    expect(postovi(mock)).toEqual([]);
  });

  test('fajl koji nije PDF (x.pdf): "Fajl nije ispravan PDF.", nijedan POST', async ({ page, mock }) => {
    const d = await otvoriDijalog(page);
    await izaberi(d, 'x.pdf', Buffer.from('ovo nije pdf'));
    await expect(d.getByRole('alert')).toHaveText('Fajl nije ispravan PDF.');
    expect(postovi(mock)).toEqual([]);
  });

  test('"Otkaži" dok slika strane još putuje: poruka o otkazivanju, nijedan uvoz slajdova', async ({ page, mock }) => {
    const zadrzan = mock.zadrzi('POST', 'mediji');
    try {
      const d = await otvoriDijalog(page);
      await izaberi(d, 'Sinteticki.pdf', napraviPdf([{ sirina: 960, visina: 540 }, { sirina: 720, visina: 540 }]));
      const uvezi = d.getByRole('button', { name: 'Uvezi' });
      await expect(uvezi).toBeEnabled();
      await uvezi.click();
      await expect(d.locator('[data-faza="slanje"]')).toBeVisible();
      await zadrzan.stigao;

      const otkazi = d.getByRole('button', { name: 'Otkaži' });
      await expect(otkazi).toBeEnabled();
      await otkazi.click();
      await expect(d.getByRole('alert')).toHaveText('Uvoz je otkazan; nijedan slajd nije dodat.');
      await expect(d.getByRole('button', { name: 'Pokušaj ponovo' })).toBeVisible();
      expect(uvozi(mock)).toEqual([]);
    } finally {
      // otkazan zahtev mok više ne može da ispuni; puštanje samo oslobađa rukovaoca rute
      zadrzan.pusti();
    }
  });
});
