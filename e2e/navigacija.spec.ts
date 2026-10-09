import { expect, test } from './fixture';

/** Stavke bočne navigacije: ime linka, očekivana putanja, `<h1>` i naslov taba. */
const STAVKE: { link: RegExp; url: RegExp; h1: RegExp; naslov: string }[] = [
  { link: /^Predavanja/, url: /\/predavanja$/, h1: /^Predavanja$/, naslov: 'Predavanja · GFS' },
  { link: /^Domaći/, url: /\/domaci$/, h1: /^Domaći$/, naslov: 'Domaći · GFS' },
  { link: /^Testovi/, url: /\/testovi$/, h1: /^Testovi$/, naslov: 'Testovi · GFS' },
  { link: /^Ocene/, url: /\/ocene$/, h1: /^Ocene$/, naslov: 'Ocene · GFS' },
  { link: /^Grupe/, url: /\/grupe$/, h1: /^Grupe$/, naslov: 'Grupe · GFS' },
  { link: /^Studenti/, url: /\/studenti$/, h1: /^Studenti$/, naslov: 'Studenti · GFS' },
  { link: /^Programiranje u građevinarstvu/, url: /\/predmeti\/1\/pregled$/, h1: /^Programiranje u građevinarstvu$/, naslov: 'Predmet · GFS' },
  { link: /^Svi predmeti/, url: /\/predmeti$/, h1: /^Predmeti$/, naslov: 'Predmeti · GFS' },
  { link: /^Početna/, url: /:\d+\/$/, h1: /^(Dobro jutro|Dobar dan|Dobro veče)$/, naslov: 'Početna · GFS' },
];

test.describe('navigacija', () => {
  test('svaka stavka bočne navigacije otvara stranicu sa ispravnim h1 i naslovom taba', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^(Dobro jutro|Dobar dan|Dobro veče)$/);
    const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });

    for (const s of STAVKE) {
      await nav.getByRole('link', { name: s.link }).click();
      await expect(page).toHaveURL(s.url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.h1);
      await expect(page).toHaveTitle(s.naslov);
    }
  });

  test('stari linkovi vode na isti sadržaj u novom UI-ju (Review Focus 6)', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });

    await page.goto('predavanje/live/1');
    await expect(page).toHaveURL(/\/predavanja\/1$/);
    await expect(h1).toHaveText('Predavanje 3 · Petlje i nizovi');

    await page.goto('test/1/evidentiranje');
    await expect(page).toHaveURL(/\/testovi\/1$/);
    await expect(h1).toHaveText('Kolokvijum 1');

    // odštampan QR stare sesije: sesija zna grupu tek posle učitavanja, pa preusmerenje ide kroz komponentu
    await page.goto('onboarding/7/qr');
    await expect(page).toHaveURL(/\/grupe\/1\/onboarding\/7\/qr$/);
    await expect(h1).toHaveText('GD-2025');

    await page.goto('student/1');
    await expect(page).toHaveURL(/\/studenti\/1\/pregled$/);
    await expect(h1).toHaveText('Ana Primerović');

    // link iz QR koda se ne menja
    await page.goto('upis/e2eTokenZaUpis_0123456789abcdefg');
    await expect(page).toHaveURL(/\/upis\/e2eTokenZaUpis_0123456789abcdefg$/);
    await expect(h1).toHaveText('Prijava za grupu GD-2025');
  });

  test.describe('telefon (390 px)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('meni se otvara hamburgerom i zatvara posle izbora', async ({ page }) => {
      await page.goto('./');
      const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });
      await expect(nav).toBeHidden();

      await page.getByRole('button', { name: 'Otvori meni' }).click();
      await expect(nav).toBeVisible();
      await nav.getByRole('link', { name: /^Testovi/ }).click();

      await expect(page).toHaveURL(/\/testovi$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Testovi');
      await expect(nav).toBeHidden();
      // bez horizontalnog skrolovanja na telefonu
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
  });
});
