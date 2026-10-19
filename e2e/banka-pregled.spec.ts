import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/*
 * Pregled nacrta (`/banka/pregled`) nad mokom `mock-banka.ts` (fixture `banka.json`): serija uvoz-kol1-2024 u grupi "8 → 2 (Klod)"
 * su Klodovi nacrti 16 (kopija koja menja aktivnu ručnu 15 "17 u binarni"), 17 i 18, nastali tim redom; pregled traži redosled
 * nastanka (`sort=id,asc`), pa redom 16, 17, 18, i taj redosled se ne menja kad izmena (PUT) pomeri `izmenjeno`. Ručni nacrti
 * predmeta 1 su 11 i 13 (greška u LaTeX-u, linija 3).
 */

const napredak = (page: Page) => page.locator('[data-napredak]');
const naziv = (page: Page) => page.locator('[data-naziv]');

test.describe('banka zadataka: pregled nacrta', () => {
  test('serija iz MCP linka (bez predmeta): kopija pored originala, O dva puta, Uredi pa nazad na isti nacrt, Odbaci celu seriju', async ({ page, mock }) => {
    await page.goto('banka/pregled?serija=uvoz-kol1-2024');
    await expect(page.getByRole('heading', { level: 1, name: 'Pregled nacrta' })).toBeVisible();
    await expect(napredak(page)).toHaveText('1 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 2');
    // link nema predmet: pretraga ide kroz sve predmete
    expect(mock.zahteviZa('banka/pretraga', 'GET').map(z => [z.query.get('predmetId'), z.query.get('serija'), z.query.get('status'), z.query.get('sort')]))
      .toEqual([['1', 'uvoz-kol1-2024', 'NACRT', 'id,asc'], ['2', 'uvoz-kol1-2024', 'NACRT', 'id,asc']]);

    const nacrt = page.locator('[data-nacrt]');
    await expect(nacrt.getByRole('img', { name: 'Zadatak: Kol. 1, 2024/25, zad. 2' })).toBeVisible();
    await expect(nacrt.getByRole('img', { name: 'Rešenje: Kol. 1, 2024/25, zad. 2' })).toBeVisible();
    await expect(nacrt.locator('app-odgovori-pregled')).toContainText('1111');
    await expect(nacrt.locator('[data-zamenjuje]')).toHaveText('Zamenjuje: 17 u binarni');
    const original = page.getByRole('region', { name: '17 u binarni' });
    await expect(original).toContainText('Aktivna');
    await expect(original.getByRole('img', { name: 'Zadatak (original): 17 u binarni' })).toBeVisible();
    await expect(original.locator('app-odgovori-pregled')).toContainText('001111');

    await page.keyboard.press('o');
    await expect.poll(() => mock.zahteviZa('banka/varijante/16/odobri', 'POST').length).toBe(1);
    await expect(napredak(page)).toHaveText('1 / 2');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 3');
    await expect(page.getByRole('region', { name: '17 u binarni' })).toHaveCount(0);
    // odobrena kopija arhivira original
    expect(mock.podaci.bankaVarijante.find(v => v.id === 15)!.status).toBe('ARHIVIRANA');
    await page.keyboard.press('o');
    await expect(napredak(page)).toHaveText('1 / 1');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4');

    await page.getByRole('link', { name: 'Uredi' }).click();
    await expect(page).toHaveURL(/banka\/varijante\/18\?povratak=%2Fbanka%2Fpregled%3Fserija%3Duvoz-kol1-2024%26od%3D18$/);
    await page.getByLabel('Naziv (opciono)').fill('Kol. 1, 2024/25, zad. 4 (oktalni)');
    await page.getByRole('button', { name: 'Sačuvaj kao nacrt' }).click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/18', 'PUT').length).toBe(1);
    await expect(page).toHaveURL(/banka\/pregled\?serija=uvoz-kol1-2024&od=18$/);
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4 (oktalni)');
    await expect(napredak(page)).toHaveText('1 / 1');

    await page.getByRole('button', { name: 'Odbaci celu seriju' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Odbaciti seriju „uvoz-kol1-2024“?' });
    await expect(potvrda).toContainText('ovde ih je 1');
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await potvrda.getByRole('button', { name: 'Odbaci seriju' }).click();
    await expect.poll(() => mock.zahteviZa('banka/serije/uvoz-kol1-2024/odbaci', 'POST').length).toBe(1);
    // 16 i 17 su odobrene, a grupa serije nije prazna: preskočene
    await expect(page.getByText('Obrisano: 1 varijanta, 0 grupa. Preskočeno: 3.')).toBeVisible();
    await expect(page.locator('[data-kraj]')).toContainText('Nema više nacrta.');
    expect(mock.podaci.bankaVarijante.some(v => v.id === 18)).toBe(false);
  });

  test('Uredi usred serije: povratak na isto mesto i dalje redom nastanka (izmena ne pomera varijantu na početak)', async ({ page, mock }) => {
    await page.goto('banka/pregled?serija=uvoz-kol1-2024');
    await expect(napredak(page)).toHaveText('1 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(napredak(page)).toHaveText('2 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 3');

    await page.keyboard.press('u');
    await expect(page).toHaveURL(/banka\/varijante\/17\?povratak=%2Fbanka%2Fpregled%3Fserija%3Duvoz-kol1-2024%26od%3D17$/);
    await page.getByLabel('Naziv (opciono)').fill('Kol. 1, 2024/25, zad. 3 (heksadekadni)');
    await page.getByRole('button', { name: 'Sačuvaj kao nacrt' }).click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/17', 'PUT').length).toBe(1);
    await expect(page).toHaveURL(/banka\/pregled\?serija=uvoz-kol1-2024&od=17$/);
    // PUT je pomerio `izmenjeno` iza svih u seriji (podrazumevani sort pretrage bi 17 stavio prvu, a preskočenu 16 posle nje)
    const izmenjeno = (id: number) => mock.podaci.bankaVarijante.find(v => v.id === id)!.izmenjeno;
    expect(izmenjeno(17) > izmenjeno(18)).toBe(true);
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 3 (heksadekadni)');
    await expect(napredak(page)).toHaveText('2 / 3');

    await page.keyboard.press('ArrowRight');
    await expect(napredak(page)).toHaveText('3 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(napredak(page)).toHaveText('1 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 2');
  });

  test('Uredi pa "Sačuvaj i odobri": povratak na sledeći nacrt, a preskočeni ostaje pre njega', async ({ page, mock }) => {
    await page.goto('banka/pregled?serija=uvoz-kol1-2024');
    await expect(napredak(page)).toHaveText('1 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(napredak(page)).toHaveText('2 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 3');

    await page.keyboard.press('u');
    await expect(page).toHaveURL(/banka\/varijante\/17\?povratak=%2Fbanka%2Fpregled%3Fserija%3Duvoz-kol1-2024%26od%3D17$/);
    await page.getByLabel('Naziv (opciono)').fill('Kol. 1, 2024/25, zad. 3 (heksadekadni)');
    await page.getByRole('button', { name: 'Sačuvaj i odobri' }).click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/17/odobri', 'POST').length).toBe(1);
    expect(mock.zahteviZa('banka/varijante/17', 'PUT')).toHaveLength(1);
    await expect(page).toHaveURL(/banka\/pregled\?serija=uvoz-kol1-2024&od=17$/);
    expect(mock.podaci.bankaVarijante.find(v => v.id === 17)!.status).toBe('AKTIVNA');
    // 17 više nije nacrt (lista nacrta je 16, 18): na njenom mestu je sledeća po nastanku, kao posle O na pregledu
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4');
    await expect(napredak(page)).toHaveText('2 / 2');

    await page.keyboard.press('ArrowLeft');
    await expect(napredak(page)).toHaveText('1 / 2');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 2');
  });

  test('tasteri: → preskače, Delete briše Klodov nacrt bez pitanja, posle poslednjeg "Nema više nacrta.", ← vraća', async ({ page, mock }) => {
    await page.goto('banka/pregled?predmet=1&serija=uvoz-kol1-2024');
    await expect(napredak(page)).toHaveText('1 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(napredak(page)).toHaveText('2 / 3');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 3');

    await page.keyboard.press('Delete');
    await expect.poll(() => mock.zahteviZa('banka/varijante/17', 'DELETE').length).toBe(1);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(napredak(page)).toHaveText('2 / 2');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4');

    await page.keyboard.press('ArrowRight');
    const kraj = page.locator('[data-kraj]');
    await expect(kraj).toContainText('Nema više nacrta.');
    await expect(kraj.getByRole('link', { name: 'Banka zadataka' })).toHaveAttribute('href', '/banka?predmet=1');
    await page.keyboard.press('ArrowRight');
    await expect(kraj).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(naziv(page)).toHaveText('Kol. 1, 2024/25, zad. 4');
    expect(mock.zahteviZa(/^banka\/varijante\/\d+$/, 'DELETE')).toHaveLength(1);
  });

  test('ručni nacrt: Delete pita, a tasteri dok je dijalog otvoren ne rade ništa; Odustani ostavlja varijantu', async ({ page, mock }) => {
    await page.goto('banka/pregled?predmet=1&izvor=RUCNO');
    await expect(napredak(page)).toHaveText('1 / 2');
    await expect(naziv(page)).toHaveText('1011 u dekadni');
    await page.keyboard.press('ArrowRight');
    await expect(napredak(page)).toHaveText('2 / 2');
    await expect(naziv(page)).toHaveText('100111 u dekadni');
    await expect(page.locator('[data-nacrt]')).toContainText('linija 3: Undefined control sequence \\foo');
    await expect(page.getByRole('button', { name: 'Odobri' })).toHaveAttribute('aria-disabled', 'true');

    await page.keyboard.press('Delete');
    const potvrda = page.getByRole('alertdialog', { name: 'Obrisati varijantu „100111 u dekadni“?' });
    await expect(potvrda).toBeVisible();
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await page.keyboard.press('Delete');
    await page.keyboard.press('o');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(mock.zahteviZa('banka/varijante/13', 'DELETE')).toHaveLength(0);
    await expect(naziv(page)).toHaveText('100111 u dekadni');
    await expect(napredak(page)).toHaveText('2 / 2');
  });
});
