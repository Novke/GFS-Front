import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import { API_BEZ_SESIJE } from './javne-putanje';
import { MockApi } from './mock-api';

/*
 * Prijava nastavnika (spec prijave, sekcija 10; Review Focus "isteklo ili opozvano"): čuvar ruta bez sesije vodi na
 * `/prijava?nazad=...`, posle prijave nastavnik stiže tamo gde je bio; 401 usred rada radi isto, a nesačuvan rad ne
 * nestaje bez pitanja. Sesiju drži mok (`mock.prijavljen`): bez nje svaki nastavnički API daje 401, kao server.
 */

const poeni = (page: Page, studentId: number) => page.locator(`tr[data-student="${studentId}"] input[data-kolona="poeni"]`);

/** `METOD /api/...` svih zahteva ka API-ju, redom (kao `JavnaMreza.api`). */
function pratiApi(page: Page): string[] {
  const api: string[] = [];
  page.on('request', r => {
    const putanja = new URL(r.url()).pathname;
    const i = putanja.indexOf('/api/');
    if (i >= 0) {
      api.push(`${r.method()} ${putanja.slice(i)}`);
    }
  });
  return api;
}

/**
 * Gornja traka je spremna: zvono (`@defer`) je učitano i prvi `GET obavestenja/broj` je odgovoren. Pre opoziva sesije u
 * testu, inače bi baš taj zahtev dobio 401 i odveo na `/prijava` pre radnje koju test proverava.
 */
async function trakaSpremna(page: Page): Promise<void> {
  await expect(page.locator('app-obavestenja-meni [data-znacka]')).toHaveText('2');
}

async function prijaviSe(page: Page, lozinka = MockApi.LOZINKA): Promise<void> {
  await page.getByLabel('Korisničko ime').fill('nastavnik');
  await page.getByLabel('Lozinka').fill(lozinka);
  await page.getByRole('button', { name: 'Prijavi se' }).click();
}

test.describe('prijava nastavnika', () => {
  test('bez sesije: /predavanja -> /prijava?nazad=predavanja, prijava vraća na /predavanja', async ({ page, mock }) => {
    mock.prijavljen = false;
    const api = pratiApi(page);
    await page.goto('predavanja');

    await expect(page).toHaveURL(/\/prijava\?nazad=predavanja$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prijava nastavnika');
    await expect(page.locator('app-side-nav')).toHaveCount(0); // bez ljuske
    await page.waitForLoadState('networkidle');
    // dok nastavnik nije prijavljen, stranica ne zove ništa osim provere sesije (čuvar): ni ReferenceStore ni brojače
    expect(api.filter(z => !API_BEZ_SESIJE.test(z))).toEqual([]);

    // pogrešna lozinka: tekst servera u baneru forme, ostaje na prijavi
    await prijaviSe(page, 'pogresno');
    await expect(page.getByRole('alert')).toHaveText('Pogrešno korisničko ime ili lozinka.');
    await expect(page).toHaveURL(/\/prijava\?nazad=predavanja$/);
    expect(api.filter(z => !API_BEZ_SESIJE.test(z))).toEqual([]);

    await prijaviSe(page);
    await expect(page).toHaveURL(/\/predavanja$/);
    await expect(page.getByRole('region', { name: 'Lista predavanja' }).locator('tbody tr').first()).toBeVisible();
    expect(mock.zahteviZa('auth/prijava', 'POST').at(-1)?.telo).toEqual({ korisnik: 'nastavnik', lozinka: MockApi.LOZINKA });
  });

  test('nazad sa spoljnim URL-om se ignoriše: posle prijave početna', async ({ page, mock }) => {
    mock.prijavljen = false;
    await page.goto('prijava?nazad=%2F%2Fevil.example.test');
    await prijaviSe(page);
    await expect(page.getByRole('heading', { name: 'Čeka na tebe' })).toBeVisible();
    expect(new URL(page.url()).pathname).toMatch(/\/$/);
  });

  test('401 usred rada: /prijava?nazad=studenti bez snackbara, posle prijave nazad na studente', async ({ page, mock }) => {
    await page.goto('grupe');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await trakaSpremna(page);

    mock.prijavljen = false; // sesija opozvana sa drugog uređaja
    await page.locator('app-side-nav').getByRole('link', { name: /Studenti/ }).click();

    await expect(page).toHaveURL(/\/prijava\?nazad=studenti$/);
    await expect(page.getByText('Potrebna je prijava.')).toHaveCount(0);

    await prijaviSe(page);
    await expect(page).toHaveURL(/\/studenti$/);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('401 dok se čuvaju poeni: pita pre odlaska; "Odustani" čuva unos, posle prijave "Pokušaj ponovo" upisuje', async ({ page, mock }) => {
    await page.goto('testovi/1');
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await trakaSpremna(page);

    mock.prijavljen = false;
    await poeni(page, 1).fill('20');

    const dijalog = page.getByRole('alertdialog', { name: 'Prijava je istekla' });
    await expect(dijalog).toBeVisible();
    await expect(dijalog).toContainText('Nije sačuvano: 1 izmena.');
    await dijalog.getByRole('button', { name: 'Odustani' }).click();

    // ostaje na ekranu, unos je tu, red nudi ponovni pokušaj; poruka kaže šta dalje
    await expect(page).toHaveURL(/\/testovi\/1$/);
    await expect(poeni(page, 1)).toHaveValue('20');
    // prvo poruka ekrana o redu (greške se ne zatvaraju same), pa ova o isteku
    const snackbar = page.locator('.snackbar-greska');
    await expect(snackbar).toContainText('Potrebna je prijava.');
    await snackbar.getByRole('button', { name: 'Zatvori' }).click();
    await expect(snackbar).toContainText('Prijava je istekla, pa se izmene ne čuvaju. Prijavi se u novoj kartici, pa ovde ponovi čuvanje.');
    const ponovo = page.locator('tr[data-student="1"]').getByRole('button', { name: 'Pokušaj ponovo' });
    await expect(ponovo).toBeVisible();
    expect(mock.podaci.testovi[0].polaganja[0].ostvareniPoeni).toBeNull();

    // nastavnik se prijavio u drugoj kartici (isti kolačić): ponovni pokušaj upisuje
    mock.prijavljen = true;
    await ponovo.click();
    await expect.poll(() => mock.podaci.testovi[0].polaganja[0].ostvareniPoeni).toBe(20);
    await expect(ponovo).toHaveCount(0);
  });

  test('401 dok se čuvaju poeni: "Idi na prijavu" vodi na prijavu, posle nje nazad na test', async ({ page, mock }) => {
    await page.goto('testovi/1');
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await trakaSpremna(page);

    mock.prijavljen = false;
    await poeni(page, 1).fill('20');
    const dijalog = page.getByRole('alertdialog', { name: 'Prijava je istekla' });
    await dijalog.getByRole('button', { name: 'Idi na prijavu' }).click();

    await expect(page).toHaveURL(/\/prijava\?nazad=testovi%2F1$/);
    await prijaviSe(page);
    await expect(page).toHaveURL(/\/testovi\/1$/);
    await expect(page.locator('tbody tr')).toHaveCount(4);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}): /prijava sa greškom forme bez serious/critical kršenja, 360 px bez horizontalnog skrola`, async ({ page, mock }) => {
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 740 });
      mock.prijavljen = false;
      await page.goto('prijava?nazad=studenti');
      await prijaviSe(page, 'pogresno');
      await expect(page.getByRole('alert')).toBeVisible();

      const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const ozbiljna = rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
      expect(ozbiljna).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
