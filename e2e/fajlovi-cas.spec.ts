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

  // Traka ne stoji stalno: server kaže gde (fajloviNaTabli), a K je pali i gasi; Q ekran uvek nosi link kad postoji.
  nastavnik('traka samo kad je fajloviNaTabli; K je pali i gasi, Q ekran nosi link', async ({ page, mock }) => {
    mock.izvodjenje.primeni('SLEDECI');
    mock.izvodjenje.fajlovi = { kod: '1234', link: 'gfs.trif.rs/f/1234', fajlovi: [] };
    mock.izvodjenje.fajloviNaTabli = false;
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await ocekujNastavnik(page.locator('app-publika-scena')).toBeVisible();
    await ocekujNastavnik(page.locator('app-fajlovi-traka')).toHaveCount(0);
    await ocekujNastavnik(page.locator('app-publika-scena')).not.toHaveClass(/uz-scena--fajlovi/);

    await page.keyboard.press('k');
    await ocekujNastavnik(page.locator('app-fajlovi-traka [data-fajlovi-link]')).toHaveText('gfs.trif.rs/f/1234');
    await ocekujNastavnik(page.locator('app-publika-scena')).toHaveClass(/uz-scena--fajlovi/);
    await page.keyboard.press('K');
    await ocekujNastavnik(page.locator('app-fajlovi-traka')).toHaveCount(0);

    await page.keyboard.press('q');
    await ocekujNastavnik(page.locator('[data-qr-fajlovi]')).toContainText('gfs.trif.rs/f/1234');
  });

  nastavnik('prijava: link ispod ekrana za prijavu staje u 1280 x 720', async ({ page, mock }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    mock.izvodjenje.fajlovi = {
      kod: '1234', link: 'gfs.trif.rs/f/1234',
      fajlovi: [{ id: 6, naziv: 'Polazni.xlsx', vrsta: 'XLSX', velicina: 20480 }],
    };
    mock.izvodjenje.fajloviNaTabli = true;
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    const traka = page.locator('app-fajlovi-traka');
    await ocekujNastavnik(traka).toBeVisible();
    const prijava = await page.locator('app-publika-scena app-prijava-ekran').boundingBox();
    const t = await traka.boundingBox();
    ocekujNastavnik(t!.y).toBeGreaterThanOrEqual(prijava!.y + prijava!.height - 1);
    ocekujNastavnik(t!.y + t!.height).toBeLessThanOrEqual(720 + 1);
  });

  nastavnik('konzola: dugme K prati traku i šalje FAJLOVI; bez fajlova onemogućeno', async ({ page, mock }) => {
    mock.izvodjenje.primeni('SLEDECI');
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    const dugme = page.getByRole('button', { name: /Link za fajlove/ });
    await ocekujNastavnik(dugme).toBeDisabled();

    mock.izvodjenje.fajlovi = { kod: '1234', link: 'gfs.trif.rs/f/1234', fajlovi: [] };
    mock.izvodjenje.fajloviNaTabli = false;
    const nova = await page.context().newPage();
    await mock.instaliraj(nova);
    await nastavnickiBroker(nova, mock);
    await nova.goto('izvodjenja/7/konzola');
    const k = nova.getByRole('button', { name: /Link za fajlove/ });
    await ocekujNastavnik(k).toHaveAttribute('aria-pressed', 'false');
    await ocekujNastavnik(nova.locator('[data-fajlovi-prazno]')).toBeVisible();
    await ocekujNastavnik(nova.locator('[data-fajlovi-tabla]')).toContainText('nije na tabli');
    await k.click();
    await ocekujNastavnik(k).toHaveAttribute('aria-pressed', 'true');
    await ocekujNastavnik(nova.locator('[data-fajlovi-tabla]')).toContainText('Link je na tabli');
  });

  // Traka je ispod slajda, ne preko podnožja (kod za ulazak, „Odgovora”): slajd i traka se ne preklapaju i oba staju u ekran.
  for (const [w, h] of [[1920, 1080], [1280, 720]] as const) {
    nastavnik(`traka ne prekriva slajd i staje u ${w} x ${h}`, async ({ page, mock }) => {
      await page.setViewportSize({ width: w, height: h });
      mock.izvodjenje.primeni('SLEDECI');
      mock.izvodjenje.fajlovi = {
        kod: '1234', link: 'gfs.trif.rs/f/1234',
        fajlovi: [{ id: 5, naziv: 'Zadatak 1.docx', vrsta: 'DOCX', velicina: 15360 }],
      };
      await nastavnickiBroker(page, mock);
      await page.goto('izvodjenja/7/publika');
      const traka = page.locator('app-fajlovi-traka');
      await ocekujNastavnik(traka).toBeVisible();
      const slajd = await page.locator('app-publika-scena .uz-scena-ulazni .uz-platno').first().boundingBox();
      const t = await traka.boundingBox();
      ocekujNastavnik(slajd && t).toBeTruthy();
      ocekujNastavnik(t!.y).toBeGreaterThanOrEqual(slajd!.y + slajd!.height - 1);
      ocekujNastavnik(t!.y + t!.height).toBeLessThanOrEqual(h + 1);
      ocekujNastavnik(slajd!.x).toBeGreaterThanOrEqual(-1);
      ocekujNastavnik(slajd!.x + slajd!.width).toBeLessThanOrEqual(w + 1);
      // link je krupan: bar 3 % visine ekrana
      const link = await page.locator('[data-fajlovi-link]').boundingBox();
      ocekujNastavnik(link!.height).toBeGreaterThan(h * 0.03);
    });
  }
});
