import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

/** Prezentacija i slajdovi iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO, 52 = PLATNO sa 3 KLIK animacije. */
const PREZENTACIJA = 5;
const PLATNO_SLAJD = 52;

const sloj = (page: Page, id: string) => page.locator(`.uz-ed-platno [data-sloj="${id}"]`);

async function otvoriPlatnoSlajd(page: Page): Promise<void> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await page.getByRole('button', { name: /^2\s/ }).click();
  await expect(sloj(page, 'naslov')).toBeVisible();
}

test.describe('uživo: editor sa PLATNO slajdom', () => {
  test('pregled prikazuje slojeve, korak napred ih otkriva redom, korak nazad ih vraća', async ({ page }) => {
    await otvoriPlatnoSlajd(page);
    const status = page.locator('.uz-ed-korak');
    await expect(status).toHaveText('Korak 0 / 3');
    for (const id of ['naslov', 'slika', 'crtez']) {
      await expect(sloj(page, id)).toBeVisible();
    }
    for (const id of ['oblik', 'tabela', 'formula']) {
      await expect(sloj(page, id)).toBeHidden();
    }

    const napred = page.getByRole('button', { name: 'Korak napred' });
    const nazad = page.getByRole('button', { name: 'Korak nazad' });
    await expect(nazad).toBeDisabled();
    const redom = ['oblik', 'tabela', 'formula'];
    for (const [i, id] of redom.entries()) {
      await napred.click();
      await expect(status).toHaveText(`Korak ${i + 1} / 3`);
      await expect(sloj(page, id)).toBeVisible();
      for (const kasniji of redom.slice(i + 1)) {
        await expect(sloj(page, kasniji)).toBeHidden();
      }
    }
    await expect(napred).toBeDisabled();

    await nazad.click();
    await expect(status).toHaveText('Korak 2 / 3');
    await expect(sloj(page, 'formula')).toBeHidden();
    await expect(sloj(page, 'tabela')).toBeVisible();
  });

  test('izmena beleški šalje PUT /slajdovi/{id} sa istim platnom (slojevi se ne brišu)', async ({ page, mock }) => {
    const pre = JSON.parse(JSON.stringify(mock.podaci.prezentacije[0].slajdovi[1].platno)) as unknown;
    await otvoriPlatnoSlajd(page);
    const beleske = page.locator('app-slajd-forma textarea');
    await beleske.fill('Nove beleške o nosaču');
    await expect.poll(() => mock.zahteviZa(`slajdovi/${PLATNO_SLAJD}`, 'PUT').length).toBe(1);
    const telo = mock.zahteviZa(`slajdovi/${PLATNO_SLAJD}`, 'PUT')[0].telo as { tip: string; beleske: string; platno: unknown };
    expect(telo.tip).toBe('PLATNO');
    expect(telo.beleske).toBe('Nove beleške o nosaču');
    expect(telo.platno).toEqual(pre);
    await expect(sloj(page, 'crtez')).toBeVisible();
  });

  test('izbor teme šalje PUT /prezentacije/{id} sa temom, a uzorak nosi --uz-tema-pozadina te teme', async ({ page, mock }) => {
    await otvoriPlatnoSlajd(page);
    await page.getByRole('button', { name: /Podešavanja/ }).click();
    const uzorak = page.locator('mat-radio-button', { hasText: 'Ponoć' }).locator('.uz-ed-uzorak');
    await expect(uzorak).toBeVisible();
    expect(await uzorak.evaluate(e => (e as HTMLElement).style.getPropertyValue('--uz-tema-pozadina'))).toBe('#0F1B2D');
    expect(await uzorak.evaluate(e => getComputedStyle(e).getPropertyValue('--uz-tema-pozadina').trim())).toBe('#0F1B2D');
    const papir = page.locator('mat-radio-button', { hasText: 'Papir' }).locator('.uz-ed-uzorak');
    expect(await papir.evaluate(e => getComputedStyle(e).getPropertyValue('--uz-tema-pozadina').trim())).toBe('#FAF7F2');

    await page.getByRole('radio', { name: /Ponoć/ }).check();
    await expect.poll(() => mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'PUT').length).toBe(1);
    expect((mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'PUT')[0].telo as { tema: string }).tema).toBe('PONOC');
  });
});
