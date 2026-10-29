import { expect, test } from './javna-mreza';
import { NIZ_MATHLIVE, NIZ_PROSEMIRROR, NIZOVI_EDITORA } from './nizovi-editora';

/** Token otvorene sesije iz `fixtures/onboarding.json` (izmišljen). */
const TOKEN = 'e2eTokenZaUpis_0123456789abcdefg';

test.describe('javni upis (telefon studenta, bez basic-auth-a)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: /^(GET|POST) \/api\/public\/upis\/[^/]+$/,
  });

  test('nijedan zahtev ka zaključanom /api/*, nijedan 401; slanje forme -> "Prijava primljena" (Review Focus 1)', async ({ page, mock, javnaMreza }) => {
    await page.goto(`upis/${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prijava za grupu GD-2025');
    await expect(page).toHaveTitle('Prijava za grupu · GFS');
    // javni layout: bez ljuske nastavnika
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0);

    await page.getByLabel('Ime', { exact: true }).fill('Nikola');
    await page.getByLabel('Prezime').fill('Upisić');
    // indeks u tri dela: GD je stalno, broj posebno, godina predložena iz grupe (menja se)
    await expect(page.getByLabel('Godina upisa')).toHaveValue('2025');
    await page.getByLabel('Broj indeksa').fill('011');
    await expect(page.getByText('Indeks: GD11/2025')).toBeVisible();
    await page.getByLabel('Email').fill('nikola.upisic@primer.test');
    // telefon: Srbija je podrazumevana; pun broj sa pozivnim brojem druge zemlje bira zemlju sam
    await expect(page.getByLabel('Zemlja')).toHaveValue('RS');
    await page.getByLabel('Broj telefona').fill('+387 60 000 011');
    await page.getByLabel('Broj telefona').blur();
    await expect(page.getByLabel('Zemlja')).toHaveValue('BA');
    await expect(page.getByLabel('Broj telefona')).toHaveValue('60000011');
    await expect(page.getByText('Biće sačuvan kao +387 60 000011')).toBeVisible();
    await page.getByRole('button', { name: 'Pošalji' }).click();

    await expect(page.getByText('Prijava primljena. Asistent će je odobriti.')).toBeVisible();
    const poslato = mock.zahteviZa(`public/upis/${TOKEN}`, 'POST');
    expect(poslato).toHaveLength(1);
    expect(poslato[0].telo).toMatchObject({
      ime: 'Nikola', prezime: 'Upisić', indeks: 'GD11', godina: 2025, brojTelefona: '+38760000011',
    });
    await expect(page.getByText('GD11/2025')).toBeVisible();
    expect(mock.podaci.prijave.at(-1)).toMatchObject({ indeks: 'GD11', status: 'NA_CEKANJU' });

    expect(javnaMreza.api).toEqual([`GET /api/public/upis/${TOKEN}`, `POST /api/public/upis/${TOKEN}`]);
    // nijedan učitan JS (glavni bundle i lenji chunk-ovi upisa) nema fflate, kod uvoza PPTX-a ni kod editora platna
    const skripte = await javnaMreza.skripte();
    expect(skripte.putanje.some(p => /\/main-[^/]+\.js$/.test(p)), 'provera je pročitala glavni bundle').toBe(true);
    expect(skripte.saUvozom).toEqual([]);
    expect(skripte.saEditorom).toEqual([]);
    // provera nizova pokriva i biblioteke 4b (ProseMirror, MathLive), a formule se ovde ne učitavaju (ni stil ni fontovi)
    expect(NIZOVI_EDITORA).toEqual(expect.arrayContaining([NIZ_PROSEMIRROR, NIZ_MATHLIVE]));
    expect(javnaMreza.zahtevi.filter(p => p.includes('/assets/mathlive/'))).toEqual([]);
    expect(javnaMreza.zahtevi.length, 'zahtevi su zabeleženi').toBeGreaterThan(1);
    // aplikacija na telefonu (spec „Aplikacija i obaveštenja“ 8): javna ruta nema manifest ni service worker
    await expect(page.locator('link[rel=manifest]')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nepoznat token: poruka, i dalje bez zaključanih poziva', async ({ page, mock }) => {
    await page.goto('upis/nepostojeci-token');
    await expect(page.getByText('Link za prijavu nije ispravan.')).toBeVisible();
    expect(mock.zahtevi.map(z => `${z.metod} ${z.putanja}`)).toEqual(['GET public/upis/nepostojeci-token']);
  });
});
