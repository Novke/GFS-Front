import { expect, test } from './fixture';

/** Token otvorene sesije iz `fixtures/onboarding.json` (izmišljen). */
const TOKEN = 'e2eTokenZaUpis_0123456789abcdefg';

test.describe('javni upis (telefon studenta, bez basic-auth-a)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('nijedan zahtev ka zaključanom /api/*, nijedan 401; slanje forme -> "Prijava primljena" (Review Focus 1)', async ({ page, mock }) => {
    const apiZahtevi: string[] = [];
    const odgovori401: string[] = [];
    page.on('request', r => {
      const putanja = new URL(r.url()).pathname;
      if (putanja.includes('/api/')) {
        apiZahtevi.push(`${r.method()} ${putanja}`);
      }
    });
    page.on('response', r => {
      if (r.status() === 401) {
        odgovori401.push(r.url());
      }
    });
    // kao na stejdžingu i prodi: sve pod /api/ osim /api/public/ traži lozinku
    await page.route('**/api/**', route =>
      new URL(route.request().url()).pathname.startsWith('/api/public/')
        ? route.fallback()
        : route.fulfill({ status: 401, contentType: 'application/json', body: '{"reason":"Potrebna je prijava."}' }),
    );

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
    await page.getByLabel('Broj telefona').fill('060 111 0011');
    await page.getByRole('button', { name: 'Pošalji' }).click();

    await expect(page.getByText('Prijava primljena. Asistent će je odobriti.')).toBeVisible();
    const poslato = mock.zahteviZa(`public/upis/${TOKEN}`, 'POST');
    expect(poslato).toHaveLength(1);
    expect(poslato[0].telo).toMatchObject({ ime: 'Nikola', prezime: 'Upisić', indeks: 'GD11', godina: 2025 });
    expect(mock.podaci.prijave.at(-1)).toMatchObject({ indeks: 'GD11', status: 'NA_CEKANJU' });

    await page.waitForLoadState('networkidle');
    expect(apiZahtevi).toEqual([`GET /api/public/upis/${TOKEN}`, `POST /api/public/upis/${TOKEN}`]);
    expect(odgovori401).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nepoznat token: poruka, i dalje bez zaključanih poziva', async ({ page, mock }) => {
    await page.goto('upis/nepostojeci-token');
    await expect(page.getByText('Link za prijavu nije ispravan.')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(mock.zahtevi.map(z => `${z.metod} ${z.putanja}`)).toEqual(['GET public/upis/nepostojeci-token']);
  });
});
