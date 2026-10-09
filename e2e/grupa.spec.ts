import { expect, test } from './fixture';

const TABOVI: { naziv: string; putanja: string; naslov: string }[] = [
  { naziv: 'Studenti', putanja: 'studenti', naslov: 'Studenti grupe · GFS' },
  { naziv: 'Prisustvo', putanja: 'prisustvo', naslov: 'Prisustvo grupe · GFS' },
  { naziv: 'Nastava', putanja: 'nastava', naslov: 'Nastava grupe · GFS' },
  { naziv: 'Onboarding', putanja: 'onboarding', naslov: 'Onboarding grupe · GFS' },
  { naziv: 'Pregled', putanja: 'pregled', naslov: 'Grupa · GFS' },
];

test.describe('grupa', () => {
  test('tabovi su rute: URL, naslov taba, aktivan tab i dugme Nazad', async ({ page }) => {
    await page.goto('grupe/1');
    await expect(page).toHaveURL(/\/grupe\/1\/pregled$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GD-2025');
    const tabovi = page.getByRole('navigation', { name: 'Odeljci grupe' });

    for (const t of TABOVI) {
      await tabovi.getByRole('link', { name: t.naziv, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/grupe/1/${t.putanja}$`));
      await expect(page).toHaveTitle(t.naslov);
      await expect(tabovi.getByRole('link', { name: t.naziv, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('GD-2025');
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/grupe\/1\/onboarding$/);
    await expect(tabovi.getByRole('link', { name: 'Onboarding', exact: true })).toHaveAttribute('aria-current', 'page');

    // direktan link na tab
    await page.goto('grupe/1/prisustvo');
    await expect(tabovi.getByRole('link', { name: 'Prisustvo', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('"Kopiraj emailove" kopira adrese bez praznih i duplikata', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('grupe/1/studenti');
    await expect(page.locator('tbody tr')).toHaveCount(6);

    await page.getByRole('button', { name: 'Kopiraj emailove' }).click();
    await expect(page.getByText('Kopirano 4 adresa')).toBeVisible();
    const kopirano = await page.evaluate(() => navigator.clipboard.readText());
    // Bojan nema email, Dragana ima Goranovu adresu velikim slovima (duplikat)
    expect(kopirano.split('; ').sort()).toEqual([
      'ana.primerovic@primer.test',
      'djordje.lazic@primer.test',
      'goran.probic@primer.test',
      'vesna.testic@primer.test',
    ]);
  });

  test('onboarding: QR za projektor ima canvas od bar 320 px', async ({ page }) => {
    await page.goto('grupe/1/onboarding');
    await page.locator('[data-qr]').first().click();
    await expect(page).toHaveURL(/\/grupe\/1\/onboarding\/7\/qr$/);
    await expect(page).toHaveTitle('QR za upis · GFS');

    const qr = page.getByRole('img', { name: 'QR kod za prijavu' });
    await expect(qr).toBeVisible();
    await expect.poll(async () => (await qr.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);
    expect(await qr.evaluate(c => (c as HTMLCanvasElement).width)).toBeGreaterThanOrEqual(320);
    // link ispod QR koda vodi na javnu formu, pod istim <base href>
    await expect(page.getByText(/\/upis\/e2eTokenZaUpis_0123456789abcdefg$/)).toBeVisible();
  });
});
