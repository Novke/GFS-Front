import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/*
 * Gornja traka nastavnika (spec prijave, sekcije 6 i 10): zvono sa značkom nepročitanih obaveštenja i padajućom listom,
 * meni korisnika ("Prijavljeni uređaji", "Odjava") i kartica "Nalozi" na Početnoj. Podaci: `fixtures/nalozi.json`
 * (dva nepročitana, jedno pročitano i jedno rešeno obaveštenje; tri uređaja nastavnika).
 */

const BOJAN = 'Ne stiže kod: Bojan Izmišljenović · nema mejl · nepoznat uređaj';
const BEZ_STUDENTA = 'Ne stiže kod: GD99 · nema mejl · nepoznat uređaj';
const ANA = 'Previše zahteva za kod: Ana Primerović';

const zvono = (page: Page) => page.locator('app-obavestenja-meni button');
const znacka = (page: Page) => page.locator('app-obavestenja-meni [data-znacka]');
const panel = (page: Page) => page.getByRole('dialog', { name: 'Obaveštenja' });

async function otvoriObavestenja(page: Page): Promise<void> {
  await zvono(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator('[data-obavestenje]').first()).toBeVisible();
}

test.describe('gornja traka: obaveštenja', () => {
  test('značka broji nepročitana; lista ima otvorena; "Pročitano", pa klik na stavku vodi na karticu studenta', async ({ page, mock }) => {
    await page.goto('grupe');
    await expect(znacka(page)).toHaveText('2');
    await expect(zvono(page)).toHaveAccessibleName('Obaveštenja: 2 nepročitana');

    await otvoriObavestenja(page);
    const stavke = panel(page).locator('[data-obavestenje]');
    await expect(stavke).toHaveCount(3); // rešeno (id 4) se ne prikazuje
    await expect(stavke.nth(0)).toContainText(BOJAN);
    await expect(stavke.nth(1)).toContainText(BEZ_STUDENTA);
    await expect(stavke.nth(2)).toContainText(ANA);
    // stavka bez studenta nema vezu, ali se označava pročitanom i ostaje na ekranu
    await expect(stavke.nth(1).getByRole('link')).toHaveCount(0);
    await stavke.nth(1).getByRole('button', { name: `Označi kao pročitano: ${BEZ_STUDENTA}` }).click();
    await expect(znacka(page)).toHaveText('1');
    await expect(page).toHaveURL(/\/grupe$/);
    expect(mock.podaci.obavestenja.find(o => o.id === 2)?.procitano).not.toBeNull();

    await stavke.nth(0).getByRole('link').click();
    await expect(page).toHaveURL(/\/studenti\/2(\/|$)/);
    await expect(panel(page)).toHaveCount(0);
    await expect(znacka(page)).toHaveCount(0);
    await expect(zvono(page)).toHaveAccessibleName('Obaveštenja');
    expect(mock.podaci.obavestenja.find(o => o.id === 1)?.procitano).not.toBeNull();
  });

  test('"Označi sve kao pročitano" i "Rešeno"', async ({ page, mock }) => {
    await page.goto('grupe');
    await otvoriObavestenja(page);
    await panel(page).getByRole('button', { name: 'Označi sve kao pročitano' }).click();
    await expect(znacka(page)).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Označi sve kao pročitano' })).toBeDisabled();
    expect(mock.podaci.obavestenja.every(o => o.procitano !== null)).toBe(true);

    await panel(page).getByRole('button', { name: `Označi kao rešeno: ${ANA}` }).click();
    await expect(panel(page).locator('[data-obavestenje]')).toHaveCount(2);
    expect(mock.podaci.obavestenja.find(o => o.id === 3)?.reseno).not.toBeNull();

    // Esc zatvara listu i vraća fokus na zvono
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(zvono(page)).toBeFocused();
  });

  test('Početna: kartica "Nalozi" sa otvorenim obaveštenjima; "Rešeno" ih skida, "Kartica" vodi na studenta', async ({ page, mock }) => {
    await page.goto('./');
    const kartica = page.getByRole('region', { name: 'Nalozi' });
    await expect(kartica).toBeVisible();
    await expect(kartica.locator('[data-nalog]')).toHaveCount(3);
    await expect(kartica).toContainText(BOJAN);

    await kartica.getByRole('button', { name: `Rešeno — ${BEZ_STUDENTA}` }).click();
    await expect(kartica.locator('[data-nalog]')).toHaveCount(2);
    expect(mock.podaci.obavestenja.find(o => o.id === 2)?.reseno).not.toBeNull();
    await expect(znacka(page)).toHaveText('1');

    await kartica.getByRole('link', { name: `Kartica — ${BOJAN}` }).click();
    await expect(page).toHaveURL(/\/studenti\/2(\/|$)/);
    await expect(znacka(page)).toHaveCount(0);
  });

  test('bez otvorenih obaveštenja: nema značke ni kartice "Nalozi"', async ({ page, mock }) => {
    mock.podaci.obavestenja = [];
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Čeka na tebe' })).toBeVisible();
    await expect(zvono(page)).toBeVisible();
    await expect(znacka(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Nalozi' })).toHaveCount(0);
    await otvoriObavestenjaPrazno(page);
  });
});

async function otvoriObavestenjaPrazno(page: Page): Promise<void> {
  await zvono(page).click();
  await expect(panel(page).getByText('Nema otvorenih obaveštenja.')).toBeVisible();
}

test.describe('gornja traka: meni nastavnika', () => {
  const meni = (page: Page) => page.getByRole('button', { name: 'Nalog: nastavnik' });

  test('"Odjava": odjavljuje i vodi na /prijava bez nazad; posle toga nema poziva obaveštenja', async ({ page, mock }) => {
    await page.goto('studenti');
    await expect(znacka(page)).toHaveText('2');
    await meni(page).click();
    await page.getByRole('menuitem', { name: 'Odjava' }).click();
    await expect(page).toHaveURL(/\/prijava$/);
    expect(mock.prijavljen).toBe(false);
    expect(mock.zahteviZa('auth/odjava', 'POST')).toHaveLength(1);
    const posle = mock.zahtevi.length;
    await page.waitForLoadState('networkidle');
    expect(mock.zahtevi.slice(posle).map(z => z.putanja)).toEqual([]);
  });

  test('"Odjava" kad sesije već nema (401): opet /prijava bez nazad, bez poruke o isteku', async ({ page, mock }) => {
    mock.na('POST', 'auth/odjava', () => {
      mock.prijavljen = false;
      return { status: 401, telo: { reason: 'Potrebna je prijava.', time: '2026-10-19T10:00:00' } };
    });
    await page.goto('studenti');
    await meni(page).click();
    await page.getByRole('menuitem', { name: 'Odjava' }).click();
    await expect(page).toHaveURL(/\/prijava$/);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/prijava$/);
    await expect(page.locator('.snackbar-greska')).toHaveCount(0);
  });

  test('"Prijavljeni uređaji": lista i "Odjavi sve ostale" uz potvrdu', async ({ page, mock }) => {
    await page.goto('grupe');
    await meni(page).click();
    await page.getByRole('menuitem', { name: 'Prijavljeni uređaji' }).click();
    const dijalog = page.getByRole('dialog', { name: 'Prijavljeni uređaji' });
    await expect(dijalog.locator('[data-sesija]')).toHaveCount(3);
    await expect(dijalog.locator('[data-sesija="1"]')).toContainText('Ovaj uređaj');

    await dijalog.getByRole('button', { name: 'Odjavi sve ostale' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Odjaviti sve ostale uređaje?' });
    await expect(potvrda).toContainText('2 uređaja');
    await potvrda.getByRole('button', { name: 'Odjavi sve ostale' }).click();
    await expect(page.locator('.snackbar-uspeh')).toContainText('Odjavljeno: 2 uređaja.');
    await expect(dijalog.locator('[data-sesija]')).toHaveCount(1);
    await expect(dijalog.getByRole('button', { name: 'Odjavi sve ostale' })).toBeDisabled();
    expect(mock.podaci.sesijeNastavnika.map(s => s.id)).toEqual([1]);
  });
});

for (const sirina of [360, 390, 1280]) {
  test.describe(`gornja traka na ${sirina} px`, () => {
    test.use({ viewport: { width: sirina, height: 800 } });

    test('zvono i meni su vidljivi, bez horizontalnog skrola; lista obaveštenja staje u ekran', async ({ page }) => {
      await page.goto('grupe');
      await expect(znacka(page)).toHaveText('2');
      await expect(page.getByRole('button', { name: 'Nalog: nastavnik' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(sirina);
      await otvoriObavestenja(page);
      const kontejner = page.locator('mat-dialog-container');
      await posleOtvaranjaDijaloga(page, kontejner);
      const okvir = (await kontejner.boundingBox())!;
      // ceo panel u ekranu, bar 8 px od ivica (na telefonu nije poravnat sa zvonom)
      expect(okvir.x).toBeGreaterThanOrEqual(7.5);
      expect(okvir.x + okvir.width).toBeLessThanOrEqual(sirina - 7.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(sirina);
    });
  });
}
