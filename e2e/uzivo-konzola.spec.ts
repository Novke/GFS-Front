import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

const STRANICA = 'izvodjenja/7/konzola';

const sledece = (page: Page) => page.getByRole('region', { name: 'Sledeće' });
const stoperica = (page: Page) => page.getByRole('timer', { name: 'Štoperica' });
const beleskeTelo = (page: Page) => page.locator('.uz-beleske-telo');

/** Server je već pomeren (`SLEDECI` n puta) pre otvaranja konzole. */
function pomeriServer(mock: MockApi, n: number): void {
  for (let i = 0; i < n; i++) mock.izvodjenje.primeni('SLEDECI');
}

async function otvori(page: Page, mock: MockApi): Promise<void> {
  await nastavnickiBroker(page, mock);
  await page.goto(STRANICA);
  await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
}

test.describe('konzola (1280 x 800)', () => {
  test('zaglavlje: štoperica i sat; tri puta → daje slajd 1 na koraku 2, a "Sledeće" korak 3', async ({ page, mock }) => {
    await otvori(page, mock);
    await expect(stoperica(page)).toHaveText(/^12:\d\d$/);
    await expect(page.getByRole('timer', { name: 'Sat' })).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.locator('.uz-kon-meta')).toContainText('Prijava');

    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 1/5 · korak 2/3');
    await expect(sledece(page).getByRole('heading', { level: 2 })).toHaveText('Sledeće · korak 3/3');
    expect(mock.zahteviZa('izvodjenja/7/komande', 'POST').map(z => z.telo)).toEqual(
      Array.from({ length: 3 }, () => ({ tip: 'SLEDECI', vrednost: null })));
  });

  test('PLATNO: "Sledeće" je isti slajd na koraku 1 (prvi sloj vidljiv, drugi još sakriven)', async ({ page, mock }) => {
    pomeriServer(mock, 5); // prijava -> slajd 1 (3 koraka) -> slajd 2 na koraku 0
    await otvori(page, mock);
    await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 2/5 · korak 0/2');
    await expect(sledece(page).getByRole('heading', { level: 2 })).toHaveText('Sledeće · korak 1/2');
    await expect(sledece(page).locator('[data-sloj="t1"]')).toBeVisible();
    await expect(sledece(page).locator('[data-sloj="t2"]')).toBeHidden();
  });

  test('pitanje u CEKA: "Sledeći klik otvara pitanje" i "Zatim: slajd 4/5"', async ({ page, mock }) => {
    pomeriServer(mock, 8);
    await otvori(page, mock);
    await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 3/5');
    await expect(sledece(page)).toContainText('Sledeći klik otvara pitanje');
    await expect(sledece(page)).toContainText('Zatim: slajd 4/5');
  });

  test('A+ menja veličinu beležaka i pamti se posle ponovnog učitavanja', async ({ page, mock }) => {
    pomeriServer(mock, 1);
    await otvori(page, mock);
    await expect(beleskeTelo(page)).toContainText('Prvo pitaj šta već znaju o sili.');
    await expect(beleskeTelo(page)).toHaveCSS('font-size', '18px');
    await page.getByRole('button', { name: 'Veća slova beležaka' }).click();
    await expect(beleskeTelo(page)).toHaveCSS('font-size', '20px');

    await page.reload();
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
    await expect(beleskeTelo(page)).toHaveCSS('font-size', '20px');
  });

  test('Telefon: QR za daljinski, "Cela konzola" menja QR na konzolu', async ({ page, mock }) => {
    await otvori(page, mock);
    await page.getByRole('button', { name: 'Telefon', exact: true }).click();
    const dijalog = page.getByRole('dialog', { name: 'Telefon' });
    const qr = dijalog.getByRole('img', { name: /^QR kod:/ });
    await expect(qr).toHaveAttribute('aria-label', /izvodjenja\/7\/daljinski$/);
    await expect(dijalog.getByRole('button', { name: 'Daljinski' })).toHaveAttribute('aria-pressed', 'true');

    await dijalog.getByRole('button', { name: 'Cela konzola' }).click();
    await expect(qr).toHaveAttribute('aria-label', /izvodjenja\/7\/konzola$/);
    await expect(dijalog.getByRole('button', { name: 'Cela konzola' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('štoperica: pauza stoji, nastavak teče, nulovanje pa "Poništi" vraća vreme', async ({ page, mock }) => {
    await page.clock.install();
    await otvori(page, mock);
    await expect(stoperica(page)).toHaveText(/^12:\d\d$/);

    await page.getByRole('button', { name: 'Pauziraj štopericu' }).click();
    await expect(page.getByRole('button', { name: 'Nastavi štopericu' })).toHaveAttribute('aria-pressed', 'true');
    const zaustavljeno = await stoperica(page).innerText();
    await page.clock.runFor(3_000);
    await expect(stoperica(page)).toHaveText(zaustavljeno);

    await page.getByRole('button', { name: 'Nastavi štopericu' }).click();
    await page.clock.runFor(2_000);
    await expect(stoperica(page)).not.toHaveText(zaustavljeno);
    await expect(stoperica(page)).toHaveText(/^12:\d\d$/);

    await page.getByRole('button', { name: 'Nuluj štopericu' }).click();
    await expect(stoperica(page)).toHaveText(/^0:[0-5]\d$/);
    await page.getByRole('button', { name: 'Poništi' }).click();
    await expect(stoperica(page)).toHaveText(/^12:\d\d$/);
  });
});
