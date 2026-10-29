import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';
import { lazniBroker } from './lazni-stomp';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/**
 * Završni ekran konzole (spec redosled prezentacija): posle kraja izvođenja konzola nudi sledeće prezentacije, "Vidi sve
 * prezentacije" u iskačućem prozoru i povratak na predavanje; "Pokreni" ostaje u istoj kartici, a prozor publike prelazi na
 * novo izvođenje sam. Izvođenje 7 iz fiksture se ovde vezuje za predavanje 1 (grupa GD-2025, predmet 1).
 */
async function zavrsenoNaPredavanju(page: Page, mock: MockApi): Promise<void> {
  mock.izvodjenje.zavrsi();
  mock.izvodjenje.naPredavanju(
    { id: 1, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 0 },
    { id: 1, rb: 1, datum: '2026-10-07', tema: null },
  );
  await nastavnickiBroker(page, mock);
}

const kraj = (page: Page) => page.locator('app-kraj-izvodjenja');

test.describe('konzola posle kraja izvođenja', () => {
  test('predlog za grupu, "Pokreni" u istoj kartici i projektor prelazi na novo izvođenje', async ({ page, mock }) => {
    await zavrsenoNaPredavanju(page, mock);
    const publika = await page.context().newPage();
    await mock.instaliraj(publika);
    await lazniBroker(publika, 'api/ws', () => undefined);
    await publika.goto('izvodjenja/7/publika');

    await page.goto('izvodjenja/7/konzola');
    await expect(kraj(page).getByRole('heading', { name: 'Izvođenje je završeno' })).toBeVisible();
    await expect(kraj(page)).toContainText('2 učesnika');
    await expect(kraj(page).locator('[data-predlog] h3')).toHaveText('Sledeće za GD-2025');
    await expect(kraj(page).locator('[data-predlog-stavka]')).toHaveCount(1);
    expect(mock.zahteviZa('prezentacije/izbor', 'GET')[0].query.get('grupaId')).toBe('1');
    await expect(kraj(page).locator('[data-nazad-predavanje]')).toBeVisible();

    await kraj(page).locator('[data-predlog-stavka="6"] [data-pokreni]').click();
    await expect(page).toHaveURL(/\/izvodjenja\/(\d+)\/konzola$/);
    const novo = Number(/izvodjenja\/(\d+)\/konzola/.exec(page.url())![1]);
    expect(novo).not.toBe(7);
    expect(mock.zahteviZa('prezentacije/6/izvodjenja', 'POST')[0].telo).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 1, boduje: false });
    await expect(publika).toHaveURL(new RegExp(`/izvodjenja/${novo}/publika$`));
    expect(page.context().pages()).toHaveLength(2);
    await publika.close();
  });

  test('"Vidi sve prezentacije": iskačući prozor sa celom listom po vežbama, strana se ne menja', async ({ page, mock }) => {
    await zavrsenoNaPredavanju(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await kraj(page).locator('[data-vidi-sve]').click();
    const dijalog = page.getByRole('dialog', { name: 'Sve prezentacije' });
    await posleOtvaranjaDijaloga(page, dijalog);
    await expect(dijalog.locator('h4')).toHaveText(['Vežbe 1', 'Bez broja vežbe']);
    await dijalog.locator('[data-filter-vrste="GRADIVO"]').click();
    await expect(dijalog.locator('li[data-prezentacija]')).toHaveCount(1);
    await dijalog.getByRole('button', { name: 'Zatvori' }).click();
    await expect(dijalog).toHaveCount(0);
    await expect(page).toHaveURL(/\/izvodjenja\/7\/konzola$/);
    expect(mock.zahteviZa(/prezentacije\/\d+\/izvodjenja/, 'POST')).toHaveLength(0);
  });

  test('"Nazad na predavanje" zatvara karticu konzole otvorenu sa predavanja', async ({ page, mock }) => {
    await zavrsenoNaPredavanju(page, mock);
    await page.goto('prezentacije');
    const [konzola] = await Promise.all([
      page.waitForEvent('popup'),
      page.evaluate(() => window.open('izvodjenja/7/konzola', '_blank')),
    ]);
    await mock.instaliraj(konzola);
    await nastavnickiBroker(konzola, mock);
    await konzola.reload();
    await expect(kraj(konzola).locator('[data-nazad-predavanje]')).toBeVisible();
    const zatvorena = konzola.waitForEvent('close');
    // kartica se zatvara usred klika, pa Playwright javlja zatvoren cilj: to je očekivani ishod, svaka druga greška nije
    await kraj(konzola).locator('[data-nazad-predavanje]').click().catch((e: unknown) => {
      if (!konzola.isClosed()) throw e;
    });
    await zatvorena;
    expect(page.isClosed()).toBe(false);
  });
});

for (const rezim of ['dan', 'noc'] as const) {
  test.describe(`završni ekran, režim ${rezim}`, () => {
    test.use({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });

    test('prati dan/noć sajta i nema serious/critical kršenja axe-a (ekran i iskačući prozor)', async ({ page, mock }) => {
      await zavrsenoNaPredavanju(page, mock);
      await page.goto('izvodjenja/7/konzola');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await expect(kraj(page).locator('[data-predlog-stavka]').first()).toBeVisible();
      await expect(page.locator('app-projector-layout')).not.toHaveClass(/rezim-dan/);
      const axe = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
        .violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => ({ pravilo: v.id, elementi: v.nodes.map(n => n.target.join(' ')).slice(0, 5) }));
      expect(await axe(), `axe: završni ekran (${rezim})`).toEqual([]);

      await kraj(page).locator('[data-vidi-sve]').click();
      await posleOtvaranjaDijaloga(page, page.getByRole('dialog', { name: 'Sve prezentacije' }));
      expect(await axe(), `axe: sve prezentacije (${rezim})`).toEqual([]);
    });
  });
}
