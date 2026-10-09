import { expect, test as osnova } from './fixture';

/** Token otvorene sesije iz `fixtures/onboarding.json` (izmišljen). */
const TOKEN = 'e2eTokenZaUpis_0123456789abcdefg';

interface JavnaMreza {
  /** Svi zahtevi stranice ka `/api/` (`METOD /api/...`), i oni koje odbije zaključavanje. */
  api: string[];
  /** URL-ovi odgovora 401. */
  odgovori401: string[];
}

/**
 * Kao na stejdžingu i prodi: sve pod `/api/` osim `/api/public/` traži lozinku (401), pa bi student na telefonu dobio dijalog.
 * Provera je u teardown-u, posle celog testa, da uhvati i zakasneli poziv ka zaključanom API-ju (Review Focus 1).
 */
const test = osnova.extend<{ javnaMreza: JavnaMreza }>({
  javnaMreza: [
    async ({ page, mock }, use) => {
      void mock; // mok mora biti instaliran pre ove rute: `route.fallback()` ide na njega
      const mreza: JavnaMreza = { api: [], odgovori401: [] };
      page.on('request', r => {
        const putanja = new URL(r.url()).pathname;
        if (putanja.includes('/api/')) {
          mreza.api.push(`${r.method()} ${putanja}`);
        }
      });
      page.on('response', r => {
        if (r.status() === 401) {
          mreza.odgovori401.push(r.url());
        }
      });
      await page.route('**/api/**', route =>
        new URL(route.request().url()).pathname.startsWith('/api/public/')
          ? route.fallback()
          : route.fulfill({ status: 401, contentType: 'application/json', body: '{"reason":"Potrebna je prijava."}' }),
      );
      await use(mreza);
      expect(mreza.api.filter(z => !/^(GET|POST) \/api\/public\/upis\/[^/]+$/.test(z)), 'pozivi van /api/public/upis/').toEqual([]);
      expect(mreza.odgovori401, 'odgovori 401').toEqual([]);
    },
    { auto: true },
  ],
});

test.describe('javni upis (telefon studenta, bez basic-auth-a)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('nijedan zahtev ka zaključanom /api/*, nijedan 401; slanje forme -> "Prijava primljena" (Review Focus 1)', async ({ page, mock, javnaMreza }) => {
    await page.goto(`upis/${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prijava za grupu GD-2025');
    await expect(page).toHaveTitle('Prijava za grupu · GFS');
    // javni layout: bez ljuske nastavnika
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0);

    await page.getByLabel('Ime', { exact: true }).fill('Nikola');
    await page.getByLabel('Prezime').fill('Upisić');
    await page.getByLabel('Indeks').fill('gd 11');
    await page.getByLabel('Godina upisa').fill('2025');
    await page.getByLabel('Email').fill('nikola.upisic@primer.test');
    await page.getByLabel('Broj telefona').fill('000 000 0011');
    await page.getByRole('button', { name: 'Pošalji' }).click();

    await expect(page.getByText('Prijava primljena. Asistent će je odobriti.')).toBeVisible();
    const poslato = mock.zahteviZa(`public/upis/${TOKEN}`, 'POST');
    expect(poslato).toHaveLength(1);
    expect(poslato[0].telo).toMatchObject({ ime: 'Nikola', prezime: 'Upisić', indeks: 'GD11', godina: 2025 });
    expect(mock.podaci.prijave.at(-1)).toMatchObject({ indeks: 'GD11', status: 'NA_CEKANJU' });

    expect(javnaMreza.api).toEqual([`GET /api/public/upis/${TOKEN}`, `POST /api/public/upis/${TOKEN}`]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nepoznat token: poruka, i dalje bez zaključanih poziva', async ({ page, mock }) => {
    await page.goto('upis/nepostojeci-token');
    await expect(page.getByText('Link za prijavu nije ispravan.')).toBeVisible();
    expect(mock.zahtevi.map(z => `${z.metod} ${z.putanja}`)).toEqual(['GET public/upis/nepostojeci-token']);
  });
});
