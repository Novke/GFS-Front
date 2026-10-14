import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';

const PRETRAGA = 'predavanja/pretraga';

/** Query poslednjeg zahteva liste predavanja koji je stigao do moka. */
function poslednjiUpit(mock: MockApi): URLSearchParams | undefined {
  return mock.zahteviZa(PRETRAGA, 'GET').at(-1)?.query;
}

function redovi(page: Page) {
  return page.getByRole('region', { name: 'Lista predavanja' }).locator('tbody tr');
}

async function izaberiPredmet(page: Page, naziv: string): Promise<void> {
  await page.getByRole('button', { name: 'Predmet', exact: true }).click();
  await page.getByRole('menuitemradio', { name: naziv }).click();
}

test.describe('liste (predavanja)', () => {
  test('filter predmeta menja URL i zahtev; "Očisti filtere" ih vraća', async ({ page, mock }) => {
    await page.goto('predavanja');
    await expect(redovi(page)).toHaveCount(5);
    expect(poslednjiUpit(mock)?.has('predmetId')).toBe(false);

    await izaberiPredmet(page, 'Primenjena informatika');
    await expect(page).toHaveURL(/\/predavanja\?predmet=2$/);
    await expect(redovi(page)).toHaveCount(1);
    await expect(redovi(page)).toContainText('Tabele i formule');
    expect(poslednjiUpit(mock)?.get('predmetId')).toBe('2');
    // filter vraća na prvu stranu
    expect(poslednjiUpit(mock)?.get('page')).toBe('0');
    await expect(page.getByRole('button', { name: 'Predmet: Primenjena informatika' })).toBeVisible();

    await page.getByRole('button', { name: 'Očisti filtere' }).click();
    await expect(page).toHaveURL(/\/predavanja$/);
    await expect(redovi(page)).toHaveCount(5);
    expect(poslednjiUpit(mock)?.has('predmetId')).toBe(false);
    await expect(page.getByRole('button', { name: 'Očisti filtere' })).toBeHidden();
  });

  test('povratak na /predavanja bez parametara vraća zapamćene filtere', async ({ page, mock }) => {
    await page.goto('predavanja');
    await izaberiPredmet(page, 'Programiranje u građevinarstvu');
    await expect(page).toHaveURL(/\/predavanja\?predmet=1$/);
    await expect(redovi(page)).toHaveCount(4);

    const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });
    await nav.getByRole('link', { name: /^Testovi/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Testovi');

    const pre = mock.zahteviZa(PRETRAGA).length;
    await nav.getByRole('link', { name: /^Predavanja/ }).click();
    await expect(page).toHaveURL(/\/predavanja\?predmet=1$/);
    await expect(redovi(page)).toHaveCount(4);
    // jedan zahtev, odmah sa zapamćenim filterom (ne prvo bez filtera pa sa njim)
    expect(mock.zahteviZa(PRETRAGA).slice(pre).map(z => z.query.get('predmetId'))).toEqual(['1']);

    // isto posle ponovnog učitavanja (filteri su u localStorage)
    await page.goto('predavanja');
    await expect(page).toHaveURL(/\/predavanja\?predmet=1$/);
    await expect(redovi(page)).toHaveCount(4);
  });

  test('neispravni parametri (?strana=abc&velicina=999) ne ruše stranicu i ne prave petlju (Review Focus 2)', async ({ page, mock }) => {
    await page.goto('predavanja?strana=abc&velicina=999&sort=lozinka,asc');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Predavanja');
    await expect(redovi(page)).toHaveCount(5);
    await page.waitForLoadState('networkidle');

    const zahtevi = mock.zahteviZa(PRETRAGA);
    expect(zahtevi).toHaveLength(1);
    // neispravno se tumači kao podrazumevano: prva strana, 25 po strani, poznat sort
    const q = zahtevi[0].query;
    expect([q.get('page'), q.get('size'), q.get('sort')]).toEqual(['0', '25', 'datum,desc']);
    // URL se ne prepravlja (nema navigacije, pa ni petlje)
    expect(new URL(page.url()).search).toBe('?strana=abc&velicina=999&sort=lozinka,asc');
  });

  test('grupa iz starog linka koja više ne postoji: prazna lista sa "Očisti filtere", bez petlje', async ({ page, mock }) => {
    await page.goto('predavanja?grupa=999');
    await expect(page.getByRole('heading', { name: 'Nema predavanja za izabrane filtere' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grupa: —' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(mock.zahteviZa(PRETRAGA).map(z => z.query.get('grupaId'))).toEqual(['999']);

    await page.getByRole('region', { name: 'Lista predavanja' }).getByRole('button', { name: 'Očisti filtere' }).last().click();
    await expect(page).toHaveURL(/\/predavanja$/);
    await expect(redovi(page)).toHaveCount(5);
  });
});
