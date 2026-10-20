import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/*
 * Podešavanja -> Moodle (nastavnik, spec prijave 8.1): registracije alata po Moodle predmetu, vrednosti za Moodle formu sa
 * "Kopiraj" i uputstvo. Mok (`e2e/fixtures/lti.json`) proverava adrese i duplikate kao server.
 */

const VREDNOSTI = {
  'Tool URL': 'https://gfs.example.test/api/public/lti/start',
  'Initiate login URL': 'https://gfs.example.test/api/public/lti/prijava',
  'Redirection URI(s)': 'https://gfs.example.test/api/public/lti/start',
  'Public keyset URL': 'https://gfs.example.test/api/public/lti/jwks',
};

const registracije = (page: Page) => page.locator('[data-registracija]');

async function otvoriStranu(page: Page): Promise<void> {
  await page.goto('podesavanja/moodle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Moodle');
  await expect(registracije(page)).toHaveCount(2);
}

async function bezHorizontalnogSkrola(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('podešavanja: Moodle', () => {
  test('stavka "Moodle" u navigaciji; /podesavanja vodi na Moodle; mrvice i naslov taba', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });
    await nav.getByRole('link', { name: 'Moodle' }).click();
    await expect(page).toHaveURL(/\/podesavanja\/moodle$/);
    await expect(page).toHaveTitle('Moodle · GFS');
    await expect(nav.getByRole('link', { name: 'Moodle' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: /mrvice/i })).toContainText('Podešavanja');

    await page.goto('podesavanja');
    await expect(page).toHaveURL(/\/podesavanja\/moodle$/);
  });

  test('lista i vrednosti; "Kopiraj" stavlja adresu u clipboard i potvrđuje', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await otvoriStranu(page);
    await expect(registracije(page).first()).toContainText('Uvod u primenu računara');
    await expect(registracije(page).nth(1)).toContainText('Isključena');

    const blok = page.locator('[data-vrednosti]');
    for (const [oznaka, vrednost] of Object.entries(VREDNOSTI)) {
      await expect(blok.getByText(oznaka, { exact: true })).toBeVisible();
      await expect(blok.getByText(vrednost).first()).toBeVisible();
    }
    await blok.getByRole('button', { name: 'Kopiraj Public keyset URL' }).click();
    await expect(page.getByText('Kopirano: Public keyset URL.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VREDNOSTI['Public keyset URL']);

    const uputstvo = page.locator('[data-uputstvo]');
    await expect(uputstvo).toContainText("Share launcher's name with tool: Always");
    await expect(uputstvo).toContainText("Share launcher's email with tool: Never");
    await expect(uputstvo).toContainText('New window');
  });

  test('nova registracija (prazne adrese izvedene), duplikat 409 u traci, izmena i brisanje uz potvrdu', async ({ page, mock }) => {
    await otvoriStranu(page);
    await page.getByRole('button', { name: 'Nova registracija' }).click();
    const dijalog = page.getByRole('dialog', { name: 'Nova registracija' });
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));

    await dijalog.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(dijalog.getByText('Unesi naziv.')).toBeVisible();
    expect(mock.zahteviZa('lti/registracije', 'POST')).toHaveLength(0);

    await dijalog.getByLabel('Naziv').fill('Osnove računarstva');
    await dijalog.getByLabel('Issuer (Platform ID)').fill('https://moodle.example.test/');
    await expect(dijalog.getByText('Prazno: https://moodle.example.test/mod/lti/auth.php')).toBeVisible();
    await dijalog.getByLabel('Client ID').fill('kXr2pQ7vLmN9sT4');
    await dijalog.getByLabel('Deployment ID').fill('5');
    await dijalog.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(registracije(page)).toHaveCount(3);
    await expect(registracije(page).first()).toContainText('Osnove računarstva');
    await expect(page.getByText('Registracija je sačuvana.')).toBeVisible();
    const nova = mock.podaci.ltiRegistracije.at(-1)!;
    expect(nova.authUrl).toBe('https://moodle.example.test/mod/lti/auth.php');
    expect(mock.zahteviZa('lti/registracije', 'POST')[0].telo).toMatchObject({ authUrl: '', jwksUrl: '' });

    // izmena: ista trojka kao "Programiranje" -> 409 sa tekstom servera, dijalog ostaje
    await registracije(page).first().getByRole('button', { name: 'Izmeni Osnove računarstva' }).click();
    const izmena = page.getByRole('dialog', { name: 'Izmena registracije' });
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await izmena.getByLabel('Issuer (Platform ID)').fill('https://moodle.example.test');
    await izmena.getByLabel('Client ID').fill('Zb8wYc3dFh6jKq1');
    await izmena.getByLabel('Deployment ID').fill('7');
    await izmena.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(izmena.getByRole('alert')).toHaveText('Registracija za ovaj Moodle, Client ID i Deployment ID već postoji.');
    await izmena.getByLabel('Deployment ID').fill('8');
    await izmena.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(registracije(page).first()).toContainText('8');

    // brisanje: "Odustani" ne briše, "Obriši" briše
    await registracije(page).first().getByRole('button', { name: 'Obriši Osnove računarstva' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Obrisati registraciju „Osnove računarstva“?' });
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(registracije(page)).toHaveCount(3);
    await registracije(page).first().getByRole('button', { name: 'Obriši Osnove računarstva' }).click();
    await potvrda.getByRole('button', { name: 'Obriši' }).click();
    await expect(registracije(page)).toHaveCount(2);
    await expect(page.getByText('Registracija je obrisana.')).toBeVisible();
    expect(mock.zahteviZa(/^lti\/registracije\/\d+$/, 'DELETE')).toHaveLength(1);
  });

  for (const sirina of [360, 390, 1280]) {
    test(`${sirina} px: bez horizontalnog skrola (stranica i forma)`, async ({ page }) => {
      await page.setViewportSize({ width: sirina, height: 800 });
      await otvoriStranu(page);
      await bezHorizontalnogSkrola(page);
      await page.getByRole('button', { name: 'Nova registracija' }).first().click();
      await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
      await page.getByRole('dialog').getByLabel('Issuer (Platform ID)').fill('https://moodle-sa-vrlo-dugom-adresom.example.test/putanja');
      await bezHorizontalnogSkrola(page);
      const kontejner = await page.locator('mat-dialog-container').boundingBox();
      expect(kontejner!.x).toBeGreaterThanOrEqual(0);
      expect(kontejner!.x + kontejner!.width).toBeLessThanOrEqual(sirina);
    });
  }
});
