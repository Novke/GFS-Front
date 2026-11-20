import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect as ocekuj, test } from './javna-mreza';
import { expect as ocekujNastavnik, test as nastavnik } from './fixture';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Javna stranica `/f` i `/f/<kod>` (spec fajlovi uz prezentaciju, odeljak 5) i traka "Fajlovi za vežbu" na projektoru.
 * Student nema sesiju nastavnika: stranica sme da zove samo `api/public/fajlovi/*` (`javna-mreza`: sve van javnog izraza
 * dobija 401 kao na stejdžingu i obara test).
 */

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  await ocekuj
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  ocekuj(rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
}

test.describe('/f: fajlovi sa časa (bez prijave)', () => {
  test.use({ dozvoljeniApi: /^GET \/api\/public\/fajlovi\/[^/]+$/ });

  test('bez koda: unos broja, spisak i tačan href za preuzimanje', async ({ page, javnaMreza }) => {
    await page.goto('f');
    await ocekuj(page.locator('[data-kod-polje]')).toBeVisible();
    ocekuj(javnaMreza.api).toEqual([]);

    await page.locator('[data-kod-polje]').fill('1234');
    await page.locator('[data-kod-dugme]').click();
    await ocekuj(page).toHaveURL(/\/f\/1234$/);
    await ocekuj(page.locator('[data-fajl]')).toHaveCount(2);
    await ocekuj(page.locator('[data-fajl]').first()).toContainText('Zadatak 1.docx');
    await ocekuj(page.locator('[data-fajl]').first()).toContainText('15 KB');

    const veza = page.locator('[data-fajl] a[download]').first();
    const href = await veza.getAttribute('href');
    ocekuj(href).toBe('api/public/fajlovi/1234/5');
    ocekuj(javnaMreza.api).toEqual(['GET /api/public/fajlovi/1234']);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  test('pogrešan kod: poruka i polje ponovo', async ({ page, javnaMreza }) => {
    await page.goto('f/9999');
    await ocekuj(page.locator('[data-poruka]')).toContainText('Kod ne važi. Proveri broj sa table.');
    await ocekuj(page.locator('[data-kod-polje]')).toBeVisible();
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  for (const rezim of ['light', 'dark'] as const) {
    test.describe(`axe, ${rezim === 'dark' ? 'noćni' : 'dnevni'} režim`, () => {
      test.use({ colorScheme: rezim });

      test('unos i spisak bez serious/critical kršenja', async ({ page }) => {
        await page.goto('f');
        await ocekuj(page.locator('[data-kod-polje]')).toBeVisible();
        await bezOzbiljnihKrsenja(page);
        await page.goto('f/1234');
        await ocekuj(page.locator('[data-fajl]')).toHaveCount(2);
        await bezOzbiljnihKrsenja(page);
      });
    });
  }
});

nastavnik.describe('projektor: traka "Fajlovi za vežbu"', () => {
  nastavnik('stanje sa fajlovima prikazuje veliki link; bez polja nema trake', async ({ page, mock }) => {
    mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await ocekujNastavnik(page.locator('app-publika-scena')).toBeVisible();
    await ocekujNastavnik(page.locator('[data-fajlovi-link]')).toHaveCount(0);

    mock.izvodjenje.fajlovi = {
      kod: '1234', link: 'gfs.trif.rs/f/1234',
      fajlovi: [{ id: 5, naziv: 'Zadatak 1.docx', vrsta: 'DOCX', velicina: 15360 }],
    };
    const nova = await page.context().newPage();
    await mock.instaliraj(nova);
    await nastavnickiBroker(nova, mock);
    await nova.goto('izvodjenja/7/publika');
    await ocekujNastavnik(nova.locator('[data-fajlovi-link]')).toHaveText('gfs.trif.rs/f/1234');
    await ocekujNastavnik(nova.locator('app-fajlovi-traka')).toContainText('Fajlovi za vežbu:');
  });
});
