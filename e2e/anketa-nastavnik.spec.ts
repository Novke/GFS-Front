import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { budanEkranStub, nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Brza anketa, nastavnik (spec brze ankete 6.1 i 6.2): panel sa daljinskog i iz konzole (taster A, 1-9, R, Enter), trake
 * uživo dok studenti glasaju (glasove drugih dodaje mok), projektor predavanja koji pokazuje anketu, a rezultat tek posle
 * "Pokaži rezultat". Izvođenje 7 iz fiksture se vezuje za predavanje 1 (grupa GD-2025), jer anketa "na času" traži predavanje.
 */

const panel = (page: Page) => page.locator('app-anketa-panel');
const kontejner = (page: Page) => page.locator('mat-dialog-container');
const trake = (p: Locator) => p.locator('[data-traka-ankete]');
/** Zaobljenje okvira dijaloga (na telefonu panel je preko celog ekrana, bez zaobljenja: token oblika na okviru dijaloga). */
const zaobljenje = (page: Page) => kontejner(page).locator('.mat-mdc-dialog-surface').evaluate(e => getComputedStyle(e).borderTopLeftRadius);

function naPredavanju(mock: MockApi): void {
  mock.izvodjenje.naPredavanju(
    { id: 1, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 4 },
    { id: 1, rb: 3, datum: '2026-10-06', tema: 'Petlje i nizovi' },
  );
  mock.ankete.brojMogucih = 27;
}

const poslednja = (mock: MockApi) => mock.ankete.ankete.at(-1)!.id;

async function bezOzbiljnihKrsenja(page: Page, ukljuci: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).include(ukljuci).analyze();
  expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
}

test.describe('brza anketa sa daljinskog (telefon)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => budanEkranStub(page));

  test('prečica "Pauza?" kreće odmah, trake rastu dok studenti glasaju', async ({ page, mock }) => {
    naPredavanju(mock);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/daljinski');
    await expect(page.locator('.uz-dalj-veza')).toHaveText('Povezano');

    await page.locator('[data-anketa-otvori]').tap();
    await expect(panel(page)).toBeVisible();
    const plocice = panel(page).locator('[data-precica]');
    await expect(plocice.locator('.pe-natpis')).toHaveText(['Pauza?', 'Tempo', 'Kolokvijum']);
    await plocice.first().tap();

    await expect(panel(page).locator('#anketa-desno-naslov')).toHaveText('Da li vam treba pauza?');
    const post = mock.zahteviZa('ankete', 'POST').at(-1)!;
    expect(post.telo).toMatchObject({ sablonId: 1, publika: 'NA_CASU', predavanjeId: 1, trajanjeSekunde: 60 });
    await expect(panel(page).locator('[data-anketa-glasalo]')).toHaveText('0 / 27 glasalo');

    const id = poslednja(mock);
    mock.ankete.glasajDrugi(id, [0], 14);
    mock.ankete.glasajDrugi(id, [1], 6);
    mock.ankete.glasajDrugi(id, [2], 3);
    // panel osvežava otvorenu anketu na 2 s
    await expect(panel(page).locator('[data-anketa-glasalo]')).toHaveText('23 / 27 glasalo');
    await expect(trake(panel(page)).locator('.at-broj')).toHaveText([/^14/, /^6/, /^3/]);
    await expect(trake(panel(page)).first()).toHaveAttribute('data-pobednik', 'true');
    await expect(panel(page).locator('.re-ostatak')).toContainText('Još nije glasalo: 4.');
  });
});

test.describe('brza anketa: pristupačnost panela na 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => budanEkranStub(page));

  test('početni ekran i rezultati: bez ozbiljnih kršenja axe-a i bez vodoravnog pomeranja', async ({ page, mock }) => {
    naPredavanju(mock);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/daljinski');
    await expect(page.locator('.uz-dalj-veza')).toHaveText('Povezano');
    await page.locator('[data-anketa-otvori]').tap();
    await expect(panel(page).locator('[data-precica]').first()).toBeVisible();
    await posleOtvaranjaDijaloga(page, kontejner(page));
    await bezOzbiljnihKrsenja(page, 'mat-dialog-container');
    expect(await panel(page).evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await zaobljenje(page)).toBe('0px');

    await panel(page).locator('[data-precica]').nth(1).tap();
    await expect(panel(page).locator('#anketa-desno-naslov')).toHaveText('Kakav je tempo?');
    mock.ankete.glasajDrugi(poslednja(mock), [1], 2);
    await expect(panel(page).locator('[data-anketa-glasalo]')).toHaveText('2 / 27 glasalo');
    await bezOzbiljnihKrsenja(page, 'mat-dialog-container');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('brza anketa iz konzole (tastatura)', () => {
  test('A otvara panel, 1 pokreće prvu prečicu, R pokazuje rezultat, Enter zatvara, Esc zatvara panel', async ({ page, mock }) => {
    naPredavanju(mock);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');

    await page.keyboard.press('a');
    await expect(panel(page).locator('[data-precica]').first()).toBeVisible();
    await posleOtvaranjaDijaloga(page, kontejner(page));
    // konzola ne prima tastere dok je panel otvoren: 1 je prečica panela, ne komanda izvođenja
    const komandePre = mock.zahteviZa('izvodjenja/7/komande', 'POST').length;
    await page.keyboard.press('1');
    await expect(panel(page).locator('#anketa-desno-naslov')).toHaveText('Da li vam treba pauza?');
    expect(mock.zahteviZa('ankete', 'POST').at(-1)?.telo).toMatchObject({ sablonId: 1, predavanjeId: 1 });
    const id = poslednja(mock);

    await page.keyboard.press('r');
    await expect(panel(page).locator('[data-anketa-vidljivost]')).toContainText('studenti i projektor');
    expect(mock.zahteviZa(`ankete/${id}/rezultat`, 'PUT').at(-1)?.telo).toEqual({ prikazan: true });

    await page.keyboard.press('Enter');
    await expect(panel(page).locator('[data-anketa-status]')).toHaveText('zatvoreno');
    await expect(panel(page).locator('[data-anketa-ponovo]')).toBeVisible();
    expect(mock.zahteviZa(`ankete/${id}/zatvori`, 'POST')).toHaveLength(1);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    expect(mock.zahteviZa('izvodjenja/7/komande', 'POST')).toHaveLength(komandePre);
  });
});

test.describe('brza anketa na projektoru predavanja', () => {
  test('stranica predavanja pokreće anketu; projektor je pokazuje, a trake tek posle "Pokaži rezultat"', async ({ page, mock }) => {
    mock.ankete.brojMogucih = 20;
    const projektor = await page.context().newPage();
    await mock.instaliraj(projektor);
    await projektor.goto('predavanja/1/projektor');

    await page.goto('predavanja/1');
    await page.locator('[data-anketa]').click();
    await expect(panel(page).locator('[data-precica]').first()).toBeVisible();
    expect(await zaobljenje(page)).not.toBe('0px');
    await panel(page).locator('[data-precica]').nth(1).click();
    await expect(panel(page).locator('#anketa-desno-naslov')).toHaveText('Kakav je tempo?');
    const id = poslednja(mock);
    mock.ankete.glasajDrugi(id, [1], 5);
    mock.ankete.glasajDrugi(id, [0], 2);

    const prozor = projektor.locator('[data-anketa-projektor]');
    await expect(prozor).toContainText('Kakav je tempo?');
    await expect(prozor.locator('li')).toHaveText(['Prebrzo', 'Taman', 'Presporo']);
    await expect(prozor.locator('[data-anketa-projektor-broj]')).toHaveText('7 glasova');
    await expect(prozor.locator('[data-anketa-projektor-rezultat]')).toHaveCount(0);

    await panel(page).locator('[data-anketa-rezultat]').click();
    await expect(prozor.locator('[data-anketa-projektor-rezultat]')).toBeVisible();
    await expect(prozor.locator('[data-traka-ankete][data-pobednik] .at-odgovor')).toHaveText('Taman');

    // zatvorena anketa sa pokazanim rezultatom ostaje na projektoru; sakriven rezultat ga sklanja
    await panel(page).locator('[data-anketa-zatvori]').click();
    await expect(prozor).toContainText('Anketa · zatvorena');
    await panel(page).locator('[data-anketa-rezultat]').click();
    await expect(prozor).toHaveCount(0);
    await projektor.close();
  });
});
