import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Čeka da `mat-dialog-container` (`kontejner`) bude potpuno neproziran i još dva kadra, u kojima CDK posle animacije
 * otvaranja postavlja fokus (`_trapFocus` u `afterNextRender`). Pre toga axe meri kontrast providnog dijaloga, a
 * tasteri otkucani baš kad CDK prebaci fokus mogu da se izgube. Čeka se stvarna neprozirnost, ne skidanje klase
 * `mdc-dialog--opening`: tajmer koji je skida kreće pre kadra koji je dodaje, pa pod opterećenjem može da ostane zauvek.
 */
export async function posleOtvaranjaDijaloga(page: Page, kontejner: Locator): Promise<void> {
  await expect.poll(() => kontejner.evaluate((e) =>
    getComputedStyle(e.querySelector('.mat-mdc-dialog-inner-container') ?? e).opacity)).toBe('1');
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}
