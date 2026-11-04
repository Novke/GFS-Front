import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/* Ručna oznaka "Stariji student": čekira se u izmeni studenta, vidi se samo na nastavničkim ekranima i ništa drugo ne menja. */

test.describe('oznaka stariji', () => {
  test('čekiranje u izmeni studenta: oznaka na kartici, u listi i na grupi, grupa ostaje ista', async ({ page, mock }) => {
    await page.goto('studenti/2');
    await expect(page.locator('[data-oznaka-stariji]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Još akcija' }).click();
    await page.getByRole('menuitem', { name: 'Izmeni podatke' }).click();
    const dijalog = page.getByRole('dialog');
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await expect(dijalog).toContainText('Ne menja grupu, bodove ni pristup.');
    await dijalog.getByRole('checkbox', { name: 'Stariji student' }).check();
    await dijalog.locator('[data-sacuvaj]').click();
    await expect(dijalog).toHaveCount(0);

    await expect(page.locator('[data-oznaka-stariji]')).toHaveText('Stariji student');
    const student = mock.podaci.studenti.find(s => s.id === 2)!;
    expect(student.stariji).toBe(true);

    await page.goto('studenti');
    await expect(page.locator('tr[data-student="2"] app-oznaka-stariji')).toHaveText('stariji');
    await expect(page.locator('app-oznaka-stariji')).toHaveCount(1);

    await page.goto(`grupe/${student.grupaId}/studenti`);
    await expect(page.locator('tr[data-student="2"] app-oznaka-stariji')).toHaveText('stariji');
  });
});
