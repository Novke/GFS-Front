import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { budanEkranStub, nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Zadatak slajd u konzoli i na daljinskom (MCP projekat B, FE-3). Izvođenje 7 (`fixtures/uzivo-izvodjenje.json`, izmišljeno),
 * slajd 106 na mestu 6/6: lista "2 → 10" sa 2 aktivne varijante (obe sa rešenjem), na slajdu 1 različita. Mok izvlači prvih
 * `brojZaOtvaranje` varijanti redom i deli ih učesnicima (Ana, Bojan) ciklično.
 */
const KOMANDE = 'izvodjenja/7/komande';
/** Indeks slajda 106 (`IDI_NA`). */
const NA_ZADATKU = 5;

const komande = (mock: MockApi) => mock.zahteviZa(KOMANDE, 'POST').map(z => z.telo as { tip: string; vrednost: number | null });
const panel = (page: Page) => page.getByRole('region', { name: 'Zadatak' });
const resenje = (page: Page) => page.getByRole('button', { name: 'Rešenje', exact: true });

/** Server je na Zadatak slajdu (u CEKA) pre otvaranja stranice. */
function naZadatak(mock: MockApi): void {
  expect(mock.izvodjenje.primeni('IDI_NA', NA_ZADATKU).status).toBe(200);
  expect(mock.izvodjenje.stanje()).toMatchObject({ prikaz: 'SLAJD', trenutniSlajd: { id: 106 }, faza: 'CEKA' });
}

test.describe('konzola: Zadatak slajd (1280 x 800)', () => {
  test('broj različitih pre otvaranja, O otvara (kartice varijanti, varijanta uz učesnika), O zatvara, Shift+R rešenje, R traži potvrdu',
    async ({ page, mock }) => {
      naZadatak(mock);
      await nastavnickiBroker(page, mock);
      await page.goto('izvodjenja/7/konzola');
      await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
      await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 6/6');

      const p = panel(page);
      await expect(p.locator('[data-putanja]')).toHaveText('Konverzije brojeva › 2 → 10');
      await expect(p).toContainText('Različitih: 1 od 2');
      const izbor = p.getByLabel('Broj različitih zadataka');
      await expect(izbor.locator('option')).toHaveText(['Kao na slajdu (1)', 'Sve (2)', '1', '2']);
      await expect(resenje(page)).toBeDisabled();

      await izbor.selectOption('2');
      await expect(p).toContainText('Različitih: 2 od 2');
      await expect(izbor).toHaveValue('2');
      expect(komande(mock)).toEqual([{ tip: 'BROJ_VARIJANTI', vrednost: 2 }]);

      await page.keyboard.press('o');
      const kartice = p.getByRole('list', { name: 'Izvučene varijante' }).getByRole('listitem');
      await expect(kartice).toHaveCount(2);
      await expect(p.getByRole('img', { name: 'Zadatak, varijanta 1011 u dekadni' })).toHaveAttribute(
        'src', 'api/public/mediji/c0000000-0000-4000-8000-000000000031');
      await expect(kartice.first()).toContainText('dodeljeno 1 · odgovorilo 0 · tačno 0');
      await expect(izbor).toHaveCount(0);
      const ucesnici = page.getByRole('region', { name: 'Učesnici' }).getByRole('listitem');
      await expect(ucesnici.first()).toContainText('1011 u dekadni');
      await expect(ucesnici.first()).toContainText('nije odgovorio');
      await expect(ucesnici.nth(1)).toContainText('110010 u dekadni');

      await page.keyboard.press('o');
      await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 6/6');
      await expect(resenje(page)).toBeEnabled();
      await expect(resenje(page)).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Shift+R');
      await expect(p).toContainText('Rešenje prikazano');
      await expect(resenje(page)).toHaveAttribute('aria-pressed', 'true');

      // R bez Shift-a je i dalje ponavljanje, uz potvrdu (Caps Lock ne pali rešenje)
      await page.keyboard.press('r');
      const dijalog = page.getByRole('alertdialog', { name: 'Ponoviti zadatak?' });
      await expect(dijalog).toBeVisible();
      await dijalog.getByRole('button', { name: 'Odustani' }).click();
      await expect(dijalog).toHaveCount(0);
      expect(komande(mock).map(k => k.tip)).toEqual(['BROJ_VARIJANTI', 'OTVORI_ZATVORI', 'OTVORI_ZATVORI', 'RESENJE']);
    });

  test('Shift+R pre zatvaranja: razlog servera, rešenje ostaje isključeno', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);

    // u konzoli i nedozvoljena komanda ide serveru: njegov razlog vidi nastavnik
    await page.keyboard.press('Shift+R');
    await expect(page.getByText('Prvo zatvori pitanje.')).toBeVisible();
    expect(komande(mock)).toEqual([{ tip: 'RESENJE', vrednost: null }]);
    await expect(resenje(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('daljinski: Zadatak slajd (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => budanEkranStub(page));

  test('red "Zadatak" ima Rešenje: onemogućeno dok je runda otvorena, posle zatvaranja prekidač', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    const broker = await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/daljinski');
    await expect(page.locator('.uz-dalj-veza')).toHaveText('Povezano');
    const red = page.getByRole('group', { name: 'Zadatak' });
    await expect(red.getByRole('button', { name: 'Zatvori' })).toBeVisible();
    await expect(red.getByRole('button', { name: 'Rešenje' })).toBeDisabled();

    // laptop zatvara rundu
    broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.primeni('OTVORI_ZATVORI').telo);
    const dugme = red.getByRole('button', { name: 'Rešenje' });
    await expect(dugme).toBeEnabled();
    await expect(dugme).toHaveAttribute('aria-pressed', 'false');
    await dugme.tap();
    await expect(dugme).toHaveAttribute('aria-pressed', 'true');
    expect(komande(mock)).toEqual([{ tip: 'RESENJE', vrednost: null }]);
  });
});
