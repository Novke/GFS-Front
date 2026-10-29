import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Rang tačnosti (spec 2026-10-28-rang-tacnosti-design.md): kartica "Učesnici i rang" u konzoli (tabovi), tab "Uživo" studenta i grupe,
 * axe dan/noć. Rang iz moka je zamenjen izmišljenim redovima (`mock.na`); izvođenje 7 iz `fixtures/uzivo-izvodjenje.json`.
 */
const red = (mesto: number | null, ime: string, studentId: number | null, procenat: number | null, dodatno: Record<string, unknown> = {}) => ({
  mesto, ucesnikId: null, studentId, ime, gost: studentId === null, tacnih: 2, dugovanih: 3, odgovorenih: 3, procenat,
  prosekMs: 3240, zvezdice: 4, poeni: null, izvodjenja: null, casova: null, ...dodatno,
});

function rangIzvodjenja(mock: MockApi): void {
  mock.na('GET', 'izvodjenja/:id/rang', () => ({ status: 200, telo: [red(1, 'Ana Anić', 1, 67), red(2, 'Mile', null, 33)] }));
}

const OZNAKE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function ozbiljnaKrsenja(page: Page, ukljuci?: string) {
  const axe = new AxeBuilder({ page }).withTags(OZNAKE);
  const rezultat = await (ukljuci ? axe.include(ukljuci) : axe).analyze();
  return rezultat.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => ({ pravilo: v.id, opis: v.help, elementi: v.nodes.map(n => n.target.join(' ')).slice(0, 5) }));
}

test.describe('rang tačnosti', () => {
  test('konzola: "Ovo pitanje" bez zahteva, "Prezentacija" učitava rang izvođenja; bez predavanja nema taba "Predavanje"', async ({ page, mock }) => {
    rangIzvodjenja(mock);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');

    const kartica = page.getByRole('region', { name: 'Učesnici i rang' });
    await expect(kartica.getByRole('tab')).toHaveText(['Ovo pitanje', 'Prezentacija']);
    expect(mock.zahteviZa('izvodjenja/7/rang', 'GET')).toHaveLength(0);

    await kartica.getByRole('tab', { name: 'Prezentacija' }).click();
    const redovi = kartica.locator('[data-rang="prezentacija"] tbody tr');
    await expect(redovi).toHaveCount(2);
    await expect(redovi.first()).toContainText('Ana Anić');
    await expect(redovi.first()).toContainText('67%');
    await expect(redovi.first()).toContainText('3,2 s');
    await expect(redovi.nth(1)).toContainText('gost');
    expect(mock.zahteviZa('izvodjenja/7/rang', 'GET')).toHaveLength(1);

    await page.waitForLoadState('networkidle');
    expect(await ozbiljnaKrsenja(page, '[aria-label="Učesnici i rang"]'), 'axe: kartica "Učesnici i rang"').toEqual([]);
  });

  test('konzola: L i Shift+L šalju RANG_LISTA i RANG_PREDAVANJA', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
    await page.keyboard.press('l');
    await page.keyboard.press('Shift+L');
    await expect.poll(() => mock.zahteviZa('izvodjenja/7/komande', 'POST').map(z => (z.telo as { tip: string }).tip))
      .toEqual(['RANG_LISTA', 'RANG_PREDAVANJA']);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test.describe(`stranice (${rezim})`, () => {
      test.use({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });

      test('student: tab "Uživo" (zbir i časovi)', async ({ page, mock }) => {
        mock.na('GET', 'studenti/:id/uzivo', () => ({
          status: 200,
          telo: {
            ukupno: red(null, 'Ana Anić', 1, 67, { casova: 2 }),
            casovi: [
              { predavanjeId: 1, izvodjenjeId: null, datum: '2026-10-28', predmetId: 1, predmet: 'Statika', naslov: '4. Sile',
                stavka: red(2, 'Ana Anić', 1, 67), ukupnoURangu: 14 },
              { predavanjeId: null, izvodjenjeId: 7, datum: '2026-10-21', predmetId: 1, predmet: 'Statika', naslov: 'Konverzije',
                stavka: red(1, 'Ana Anić', 1, 100), ukupnoURangu: 9 },
            ],
          },
        }));
        await page.goto('studenti/1/uzivo');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        const redovi = page.locator('[data-casovi] tbody tr');
        await expect(redovi).toHaveCount(2);
        await expect(redovi.first()).toContainText('2 od 14');
        await expect(redovi.first().getByRole('link', { name: '4. Sile' })).toHaveAttribute('href', '/predavanja/1');
        await expect(redovi.nth(1).getByRole('link', { name: 'Konverzije' })).toHaveAttribute('href', '/izvodjenja/7/pregled');
        await expect(page.locator('[data-zbir]')).toContainText('67%');
        await page.waitForLoadState('networkidle');
        expect(await ozbiljnaKrsenja(page), `axe: student, Uživo (${rezim})`).toEqual([]);
      });

      test('grupa: tab "Uživo" (rang spiska, bez mesta na dnu)', async ({ page, mock }) => {
        mock.na('GET', 'grupe/:id/uzivo', () => ({
          status: 200,
          telo: { grupaId: 1, brojCasova: 3, rang: [red(1, 'Ana Anić', 1, 67, { casova: 3 }), red(null, 'Bojan Bojić', 2, null, { casova: 0, prosekMs: null, zvezdice: 0, tacnih: 0, dugovanih: 0 })] },
        }));
        await page.goto('grupe/1/uzivo');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        const rang = page.locator('[data-rang-grupe]');
        await expect(rang).toContainText('Časova sa pitanjima: 3.');
        await expect(rang.locator('tbody tr')).toHaveCount(2);
        await expect(rang.locator('tbody tr').nth(1)).toHaveClass(/bez-mesta/);
        await expect(rang.getByRole('link', { name: 'Ana Anić' })).toHaveAttribute('href', '/studenti/1');
        await page.waitForLoadState('networkidle');
        expect(await ozbiljnaKrsenja(page), `axe: grupa, Uživo (${rezim})`).toEqual([]);
      });
    });
  }
});
