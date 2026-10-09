import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

/** Token otvorene sesije iz `fixtures/onboarding.json` (izmišljen). */
const TOKEN = 'e2eTokenZaUpis_0123456789abcdefg';

/** Stranice iz brief-a i element koji znači da je sadržaj učitan (ne skeleton). */
const STRANICE: { putanja: string; spremno: (page: Page) => ReturnType<Page['locator']> }[] = [
  { putanja: '', spremno: p => p.getByRole('heading', { name: 'Čeka na tebe' }) },
  { putanja: 'predavanja', spremno: p => p.getByRole('region', { name: 'Lista predavanja' }).locator('tbody tr').first() },
  { putanja: 'predavanja/1', spremno: p => p.locator('app-studentska-plocica').first() },
  { putanja: 'testovi/1', spremno: p => p.locator('tbody tr').first() },
  { putanja: 'grupe/1/studenti', spremno: p => p.locator('tbody tr').first() },
  { putanja: 'studenti/1', spremno: p => p.getByRole('heading', { level: 1, name: 'Ana Primerović' }) },
  { putanja: `upis/${TOKEN}`, spremno: p => p.getByRole('button', { name: 'Pošalji' }) },
];

const OZNAKE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

for (const rezim of ['dan', 'noc'] as const) {
  test.describe(`pristupačnost (axe), režim ${rezim}`, () => {
    // režim "Sistem" (podrazumevan) prati prefers-color-scheme pregledača
    test.use({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });

    for (const s of STRANICE) {
      test(`/${s.putanja}: bez serious/critical kršenja`, async ({ page }) => {
        await page.goto(s.putanja || './');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        await expect(s.spremno(page)).toBeVisible();
        await page.waitForLoadState('networkidle');

        const rezultat = await new AxeBuilder({ page }).withTags(OZNAKE).analyze();
        const ozbiljna = rezultat.violations
          .filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => ({ pravilo: v.id, uticaj: v.impact, opis: v.help, elementi: v.nodes.map(n => n.target.join(' ')).slice(0, 5) }));
        expect(ozbiljna, `axe: /${s.putanja} (${rezim})`).toEqual([]);
      });
    }
  });
}
