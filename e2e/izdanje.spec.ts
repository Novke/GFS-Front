import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import { uzorakPptx } from './pptx-uzorak';

/**
 * Zastarela kartica posle deploy-a (`core/izdanje`). e2e build nema oznaku izdanja (`scripts/oznaci-izdanje.mjs` radi samo
 * Dockerfile), pa je ova simulacija dodaje: svaki dokument dobija `<meta name="gfs-izdanje">` sa izdanjem koje "server"
 * trenutno služi, `assets/izdanje.json` vraća to izdanje, a posle `deploy()` lenji chunk-ovi koje kartica još nije učitala
 * daju 404 (novi build ih nema) dok se dokument ne učita iznova.
 */
class Server {
  izdanje = 'A';
  private stariChunkovi = false;
  /** Putanje (sa query-jem) dokumenata koje je pregledač učitao, redom. */
  readonly dokumenti: string[] = [];

  async instaliraj(page: Page): Promise<void> {
    // Registrovano posle MockApi-ja, pa se pita prvo; sve ostalo ide dalje (`fallback`) do moka ili statičkog servera.
    await page.route('**/*', async route => {
      const zahtev = route.request();
      const url = new URL(zahtev.url());
      if (zahtev.resourceType() === 'document') {
        const odgovor = await route.fetch();
        const html = (await odgovor.text()).replace(/<meta charset="utf-8">/i, m => `${m}<meta name="gfs-izdanje" content="${this.izdanje}">`);
        this.stariChunkovi = false;
        this.dokumenti.push(url.pathname + url.search);
        await route.fulfill({ response: odgovor, body: html });
      } else if (url.pathname.endsWith('/assets/izdanje.json')) {
        await route.fulfill({ json: { izdanje: this.izdanje }, headers: { 'Cache-Control': 'no-store' } });
      } else if (this.stariChunkovi && /\/chunk-[A-Za-z0-9_-]{8}\.js$/.test(url.pathname)) {
        await route.fulfill({ status: 404, body: 'Not Found' });
      } else {
        await route.fallback();
      }
    });
  }

  /** Novo izdanje fronta na serveru; stari heširani fajlovi nestaju. */
  deploy(): void {
    this.izdanje = 'B';
    this.stariChunkovi = true;
  }

  /** Lenji fajlovi nestaju, a izdanje ostaje isto (pravi kvar, ne zastarela kartica). */
  pokvari(): void {
    this.stariChunkovi = true;
  }
}

const traka = (page: Page) => page.getByRole('status').filter({ hasText: 'Dostupna je nova verzija GFS-a.' });

/** Kao povratak na karticu (`visibilitychange` dok je vidljiva): `Izdanje` tada pita server. */
const vratiSeNaKarticu = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test.describe('zastarela kartica posle deploy-a (izdanje)', () => {
  let server: Server;

  test.beforeEach(async ({ page }) => {
    server = new Server();
    await server.instaliraj(page);
  });

  test('povratak na karticu posle deploy-a: traka "Osveži", sledeći prelazak učitava novu verziju', async ({ page }) => {
    await page.goto('prezentacije');
    await expect(page.locator('.uz-ed-tabela')).toBeVisible();
    await expect(traka(page)).toHaveCount(0);

    server.deploy();
    await vratiSeNaKarticu(page);
    await expect(traka(page)).toBeVisible();
    await expect(traka(page).getByRole('button', { name: 'Osveži' })).toBeVisible();

    await page.getByRole('link', { name: 'Banka zadataka' }).click();
    await expect.poll(() => server.dokumenti).toEqual(['/prezentacije', expect.stringMatching(/^\/banka/)]);
    await expect(page.getByRole('heading', { name: 'Banka zadataka' })).toBeVisible();
    await expect(traka(page)).toHaveCount(0);
  });

  test('"Osveži" u traci učitava istu stranu iznova', async ({ page }) => {
    await page.goto('prezentacije?predmet=1');
    await expect(page.locator('.uz-ed-tabela')).toBeVisible();
    server.deploy();
    await vratiSeNaKarticu(page);
    await traka(page).getByRole('button', { name: 'Osveži' }).click();
    await expect.poll(() => server.dokumenti).toEqual(['/prezentacije?predmet=1', '/prezentacije?predmet=1']);
    await expect(traka(page)).toHaveCount(0);
  });

  test('ruta čiji chunk novi build nema: puno učitavanje ciljne adrese sa novom verzijom', async ({ page }) => {
    await page.goto('prezentacije');
    await expect(page.locator('.uz-ed-tabela')).toBeVisible();
    server.deploy(); // kartica još ne zna: nema provere pre klika
    await page.getByRole('link', { name: 'Banka zadataka' }).click();
    await expect.poll(() => server.dokumenti).toEqual(['/prezentacije', expect.stringMatching(/^\/banka/)]);
    await expect(page.getByRole('heading', { name: 'Banka zadataka' })).toBeVisible();
  });

  test('isto izdanje, a chunk fali (pravi kvar): nema osvežavanja ni trake, nema petlje', async ({ page }) => {
    await page.goto('prezentacije');
    await expect(page.locator('.uz-ed-tabela')).toBeVisible();
    const provere = page.waitForRequest(r => r.url().endsWith('/assets/izdanje.json'));
    server.pokvari();
    await page.getByRole('link', { name: 'Banka zadataka' }).click();
    await provere;
    await expect(page).toHaveURL(/\/prezentacije$/);
    await expect(traka(page)).toHaveCount(0);
    expect(server.dokumenti).toEqual(['/prezentacije']);
  });

  test('Nova prezentacija iz PowerPointa posle deploy-a: bez prazne prezentacije, poruka i traka', async ({ page, mock }) => {
    await page.goto('prezentacije');
    await expect(page.locator('.uz-ed-tabela')).toBeVisible();
    server.deploy();
    await page.getByRole('button', { name: 'Nova prezentacija' }).click();
    const nova = page.locator('mat-dialog-container').filter({ has: page.getByRole('heading', { name: 'Nova prezentacija' }) });
    await nova.getByRole('combobox', { name: 'Predmet' }).click();
    await page.getByRole('option', { name: 'Programiranje u građevinarstvu' }).click();
    await nova.getByRole('radio', { name: 'Iz PowerPointa' }).check();
    await nova.locator('input[type=file]').setInputFiles(uzorakPptx());
    await nova.getByRole('button', { name: 'Napravi' }).click();

    await expect(nova.getByRole('alert')).toHaveText(/Uvoz iz PowerPointa nije učitan, pa prezentacija nije napravljena/);
    expect(mock.zahteviZa('prezentacije', 'POST')).toEqual([]);
    // traka je iza modalnog dijaloga (pozadina je aria-hidden), pa se proverava posle zatvaranja
    await nova.getByRole('button', { name: 'Otkaži' }).click();
    await expect(traka(page)).toBeVisible();
    expect(server.dokumenti).toEqual(['/prezentacije']);
    expect(mock.zahteviZa('prezentacije', 'POST')).toEqual([]);
  });
});

for (const rezim of ['dan', 'noc'] as const) {
  test.describe(`traka novog izdanja: pristupačnost (axe), režim ${rezim}`, () => {
    test.use({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });

    test('bez ozbiljnih kršenja', async ({ page }) => {
      const server = new Server();
      await server.instaliraj(page);
      await page.goto('prezentacije');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      server.deploy();
      await vratiSeNaKarticu(page);
      await expect(traka(page)).toBeVisible();
      const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).include('app-izdanje-traka').analyze();
      expect(rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
    });
  });
}
