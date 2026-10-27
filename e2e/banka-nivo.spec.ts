import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

/*
 * Nivo varijante (1-3, prikaz zvezdicama) u banci nad mokom `mock-banka.ts` (fixture `banka.json`, nivoi: 11 = 2, 12 = 2, 13 = 3,
 * 14 = 2, 15 = 1, 16 = 2, 17 = 3, 18 = 1). Nivo se menja samo kroz `PATCH banka/varijante/{id}/nivo` (kartica, pregled nacrta,
 * editor postojeće varijante); nova varijanta ga šalje u komandi za pravljenje (podrazumevano 2); `PUT` ga nikad ne nosi.
 */

const nivoRadio = (oblast: ReturnType<Page['locator']>, n: number | 'svi') => oblast.locator(`[role=radio][data-nivo="${n}"]`);
const kartica = (page: Page, naziv: string) => page.locator('app-varijanta-kartica').filter({ hasText: naziv });
const patchevi = (mock: import('./mock-api').MockApi, id: number) => mock.zahteviZa(`banka/varijante/${id}/nivo`, 'PATCH').map(z => z.telo);

test.describe('banka zadataka: nivo varijante', () => {
  test('kartica: izbor nivoa šalje PATCH, vrednost ostaje i posle odgovora; kartica nije link na varijantu', async ({ page, mock }) => {
    await page.goto('banka/grupe/2');
    const k = kartica(page, '1011 u dekadni');
    const izbor = k.getByRole('radiogroup');
    await expect(nivoRadio(izbor, 2)).toHaveAttribute('aria-checked', 'true');

    await nivoRadio(izbor, 3).click();
    await expect(nivoRadio(izbor, 3)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => patchevi(mock, 11)).toEqual([{ nivo: 3 }]);
    await expect(page).toHaveURL(/banka\/grupe\/2$/);
    expect(mock.podaci.bankaVarijante.find(v => v.id === 11)!.nivo).toBe(3);
    expect(mock.zahteviZa('banka/varijante/11', 'PUT')).toHaveLength(0);

    // ista vrednost ne šalje ništa
    await nivoRadio(izbor, 3).click();
    expect(patchevi(mock, 11)).toHaveLength(1);
  });

  test('pregled nacrta: nivo nacrta i originala, izmena PATCH-om bez prelaska na sledeći nacrt, filter po nivou u URL-u', async ({ page, mock }) => {
    await page.goto('banka/pregled?serija=uvoz-kol1-2024');
    await expect(page.locator('[data-napredak]')).toHaveText('1 / 3');
    const nacrt = page.locator('[data-nacrt] [data-nivo-varijante]');
    await expect(nivoRadio(nacrt, 2)).toHaveAttribute('aria-checked', 'true');
    // original (15) ima nivo 1, samo prikaz
    await expect(page.locator('[data-original] [data-nivo-originala] [data-nivo-prikaz]')).toHaveAttribute('aria-label', 'Nivo 1 od 3 (lakši)');

    await nivoRadio(nacrt, 3).click();
    await expect.poll(() => patchevi(mock, 16)).toEqual([{ nivo: 3 }]);
    await expect(nivoRadio(nacrt, 3)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-napredak]')).toHaveText('1 / 3');
    expect(mock.zahteviZa('banka/varijante/16/odobri', 'POST')).toHaveLength(0);

    // strelice na izboru nivoa ne listaju nacrte
    await nacrt.locator('[role=radio][data-nivo="3"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => patchevi(mock, 16)).toEqual([{ nivo: 3 }, { nivo: 2 }]);
    await expect(page.locator('[data-napredak]')).toHaveText('1 / 3');
  });

  test('pregled nacrta: filter nivoa ide u upit pretrage i URL, "Svi" ga skida', async ({ page, mock }) => {
    await page.goto('banka/pregled?predmet=1&status=NACRT');
    const filter = page.locator('[data-filter-nivo]');
    await expect(filter).toBeVisible();
    const poslednja = () => mock.zahteviZa('banka/pretraga', 'GET').at(-1)?.query.get('nivo') ?? null;
    await expect.poll(poslednja).toBeNull();

    await nivoRadio(filter, 3).click();
    await expect(page).toHaveURL(/nivo=3/);
    await expect.poll(poslednja).toBe('3');
    await expect(nivoRadio(filter, 3)).toHaveAttribute('aria-checked', 'true');

    await nivoRadio(filter, 'svi').click();
    await expect(page).not.toHaveURL(/nivo=/);
    await expect.poll(poslednja).toBeNull();
  });

  test('nova varijanta: nivo je podrazumevano 2, izbor ide u komandu za pravljenje', async ({ page, mock }) => {
    await page.goto('banka/varijante/nova?grupa=2');
    const izbor = page.locator('[data-nivo-varijante]');
    await expect(nivoRadio(izbor, 2)).toHaveAttribute('aria-checked', 'true');
    await nivoRadio(izbor, 1).click();
    await expect(nivoRadio(izbor, 1)).toHaveAttribute('aria-checked', 'true');
    // nova varijanta još ne postoji: nema PATCH-a
    expect(mock.zahteviZa(/banka\/varijante\/\d+\/nivo/, 'PATCH')).toHaveLength(0);

    await page.locator('app-latex-editor[data-deo="tekst"] textarea').fill('Pretvori $101_2$ u dekadni.');
    await page.getByLabel('Tačan broj').fill('5');
    await page.getByRole('button', { name: 'Sačuvaj kao nacrt' }).click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/2/varijante', 'POST').map(z => (z.telo as { nivo: number }).nivo)).toEqual([1]);
  });

  test('izmena postojeće varijante: nivo ide PATCH-om odmah, PUT ga ne nosi', async ({ page, mock }) => {
    await page.goto('banka/varijante/12');
    const izbor = page.locator('[data-nivo-varijante]');
    await expect(nivoRadio(izbor, 2)).toHaveAttribute('aria-checked', 'true');
    await nivoRadio(izbor, 3).click();
    await expect.poll(() => patchevi(mock, 12)).toEqual([{ nivo: 3 }]);

    await page.getByLabel('Naziv (opciono)').fill('110010 u dekadni (izmenjen)');
    await page.getByRole('button', { name: /^Sačuvaj/ }).first().click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/12', 'PUT').length).toBe(1);
    expect(mock.zahteviZa('banka/varijante/12', 'PUT')[0].telo).not.toHaveProperty('nivo');
    expect(mock.podaci.bankaVarijante.find(v => v.id === 12)!.nivo).toBe(3);
  });
});
