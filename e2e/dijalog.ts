import { expect, type Page } from '@playwright/test';

/**
 * Čeka kraj animacije otvaranja Material dijaloga (`mdc-dialog--opening` skinut) i još dva kadra, u kojima CDK posle
 * animacije postavlja fokus (`_trapFocus` u `afterNextRender`). Pre toga je kontejner providan (axe meri pogrešan
 * kontrast), a tasteri otkucani baš kad CDK prebaci fokus mogu da se izgube.
 */
export async function posleOtvaranjaDijaloga(page: Page): Promise<void> {
  const kontejner = page.locator('mat-dialog-container');
  await expect(kontejner).toHaveClass(/mdc-dialog--open/);
  await expect(kontejner).not.toHaveClass(/mdc-dialog--opening/);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}
