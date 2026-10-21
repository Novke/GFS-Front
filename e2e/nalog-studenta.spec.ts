import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/*
 * Sekcija "Nalog" na kartici studenta (spec prijave, 5.3). Fikstura `nalozi.json`: student 1 (Ana) ima mejl, dva uređaja i
 * Moodle vezu; student 2 (Bojan) nema mejl i ima otvoreno obaveštenje "Ne stiže kod"; student 3 ima mejl i nema ništa.
 */

const nalog = (page: Page) => page.locator('app-student-nalog');
const znacka = (page: Page) => page.locator('app-obavestenja-meni [data-znacka]');
const NEMA_MEJL = 'Student nema mejl: upiši ga da bi mogao da dobije kod.';

test.describe('kartica studenta: sekcija "Nalog"', () => {
  test('prikazuje uređaje (opis, način, poslednji ulaz) i Moodle; "Pošalji kod" i opoziv uređaja', async ({ page, mock }) => {
    await page.goto('studenti/1');
    await expect(nalog(page).getByRole('heading', { name: 'Nalog' })).toBeVisible();
    const uredjaji = nalog(page).locator('[data-uredjaj]');
    await expect(uredjaji).toHaveCount(2);
    await expect(uredjaji.nth(0)).toContainText('Android · Chrome');
    await expect(uredjaji.nth(0)).toContainText('Kod');
    await expect(uredjaji.nth(0)).toContainText('19. 10. 2026. 08:30');
    await expect(uredjaji.nth(1)).toContainText('Moodle');
    await expect(nalog(page).locator('[data-moodle]')).toContainText('povezan');

    await nalog(page).getByRole('button', { name: 'Pošalji kod' }).click();
    await expect(page.locator('.snackbar-uspeh')).toContainText('Kod je poslat na mejl studenta.');

    await nalog(page).getByRole('button', { name: 'Opozovi uređaje' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Opozvati uređaje studenta?' });
    await potvrda.getByRole('button', { name: 'Opozovi uređaje' }).click();
    await expect(page.locator('.snackbar-uspeh').filter({ hasText: 'Opozvano uređaja: 2.' })).toBeVisible();
    await expect(nalog(page).locator('[data-uredjaj]')).toHaveCount(0);
    await expect(nalog(page).getByRole('button', { name: 'Opozovi uređaje' })).toBeDisabled();
    expect(mock.podaci.naloziStudenata.find(n => n.studentId === 1)!.uredjaji).toEqual([]);
  });

  test('"Raskini Moodle vezu" traži potvrdu; Odustani ne menja ništa', async ({ page, mock }) => {
    await page.goto('studenti/1');
    await nalog(page).getByRole('button', { name: 'Raskini Moodle vezu' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Raskinuti vezu sa Moodle nalogom?' });
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(potvrda).toHaveCount(0);
    expect(mock.podaci.naloziStudenata.find(n => n.studentId === 1)!.moodle.povezan).toBe(true);

    await nalog(page).getByRole('button', { name: 'Raskini Moodle vezu' }).click();
    const potvrda2 = page.getByRole('alertdialog', { name: 'Raskinuti vezu sa Moodle nalogom?' });
    await expect(potvrda2).toContainText('Uređaji prijavljeni preko Moodle-a biće odjavljeni.');
    await potvrda2.getByRole('button', { name: 'Raskini vezu' }).click();
    await expect(page.locator('.snackbar-uspeh')).toContainText('Moodle veza je raskinuta.');
    await expect(nalog(page).locator('[data-uredjaj]')).toHaveCount(1); // Moodle uređaj je odjavljen
    await expect(nalog(page).locator('[data-moodle]')).toContainText('nije povezan');
    await expect(nalog(page).getByRole('button', { name: 'Raskini Moodle vezu' })).toBeDisabled();
  });

  test('student bez mejla: objašnjenje i onemogućeno "Pošalji kod"; posle upisa mejla sekcija se osvežava, kod rešava obaveštenje', async ({ page, mock }) => {
    await page.goto('studenti/2');
    await expect(znacka(page)).toHaveText('2');
    await expect(nalog(page).locator('[data-bez-mejla]')).toHaveText(NEMA_MEJL);
    await expect(nalog(page).getByRole('button', { name: 'Pošalji kod' })).toBeDisabled();
    await expect(nalog(page).locator('[data-bez-uredjaja]')).toBeVisible();

    await page.getByRole('button', { name: 'Još akcija' }).click();
    await page.getByRole('menuitem', { name: 'Izmeni podatke' }).click();
    const dijalog = page.getByRole('dialog');
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await dijalog.locator('[data-email]').fill('bojan@example.test');
    await dijalog.locator('[data-sacuvaj]').click();
    await expect(dijalog).toHaveCount(0);

    await expect(nalog(page).locator('[data-bez-mejla]')).toHaveCount(0);
    const posalji = nalog(page).getByRole('button', { name: 'Pošalji kod' });
    await expect(posalji).toBeEnabled();
    await posalji.click();
    await expect(page.locator('.snackbar-uspeh').filter({ hasText: 'Kod je poslat na mejl studenta.' })).toBeVisible();
    // server je rešio "Ne stiže kod" tog studenta (id 1), pa značka pada sa 2 na 1
    await expect(znacka(page)).toHaveText('1');
    expect(mock.podaci.obavestenja.find(o => o.id === 1)!.reseno).not.toBeNull();
  });

  test('prelazak na drugog studenta prikazuje njegov nalog', async ({ page }) => {
    await page.goto('studenti/1');
    await expect(nalog(page).locator('[data-uredjaj]')).toHaveCount(2);
    await page.goto('studenti/3');
    await expect(nalog(page).locator('[data-bez-uredjaja]')).toBeVisible();
    await expect(nalog(page).locator('[data-bez-mejla]')).toHaveCount(0);
  });

  for (const sirina of [360, 390, 1280]) {
    test(`${sirina} px: sekcija staje u ekran, dugmad su dostupna, bez horizontalnog skrola`, async ({ page }) => {
      await page.setViewportSize({ width: sirina, height: 800 });
      await page.goto('studenti/1');
      await expect(nalog(page).locator('[data-uredjaj]')).toHaveCount(2);
      for (const ime of ['Pošalji kod', 'Opozovi uređaje', 'Raskini Moodle vezu']) {
        const dugme = nalog(page).getByRole('button', { name: ime });
        await expect(dugme).toBeVisible();
        const okvir = (await dugme.boundingBox())!;
        expect(okvir.x).toBeGreaterThanOrEqual(0);
        expect(okvir.x + okvir.width).toBeLessThanOrEqual(sirina);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(sirina);
    });
  }
});
