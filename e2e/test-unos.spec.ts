import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

const poeni = (page: Page, studentId: number) => page.locator(`tr[data-student="${studentId}"] input[data-kolona="poeni"]`);
const kpi = (page: Page, ime: string) => page.locator(`app-stat-tile[data-kpi-${ime}] .vrednost`);

test.describe('unos poena na testu', () => {
  test('Enter prelazi na sledeći red, poeni preko max su greška, statistika se računa uživo', async ({ page, mock }) => {
    await page.goto('testovi/1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kolokvijum 1');
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await expect(kpi(page, 'uneto')).toHaveText('0 od 4');

    // red 1: 20 poena, Enter -> fokus na poenima u redu 2 (kuca se dalje bez miša)
    await poeni(page, 1).fill('20');
    await poeni(page, 1).press('Enter');
    await expect(poeni(page, 2)).toBeFocused();

    // red 2: 35 > 30 -> greška ispod polja, red se ne šalje
    await page.keyboard.type('35');
    await expect(page.locator('#greska-reda-2')).toHaveText('Najviše 30.');
    await expect(poeni(page, 2)).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Enter');
    await expect(poeni(page, 3)).toBeFocused();

    // red 3: 10 poena; kad stigne njegov PATCH, debounce reda 2 (kucan ranije) je odavno istekao
    await page.keyboard.type('10');
    await expect.poll(() => mock.zahteviZa('test/1/polaganje', 'PATCH').map(z => (z.telo as { studentId: number }).studentId)).toEqual([1, 3]);
    expect(mock.zahteviZa('test/1/polaganje', 'PATCH')[0].telo).toEqual({
      studentId: 1, grupa: 'A', ostvareniPoeni: 20, prepisivao: false, napomene: null,
    });

    // statistika uživo: samo ispravni poeni (20 i 10), prag 15 -> polovina je prošla
    await expect(kpi(page, 'uneto')).toHaveText('2 od 4');
    await expect(kpi(page, 'prosek')).toHaveText('15 / 30');
    await expect(kpi(page, 'prolaz')).toHaveText('50 %');
    await expect(kpi(page, 'min')).toHaveText('10');
    await expect(kpi(page, 'max')).toHaveText('20');

    // ispravka reda 2: greška nestaje, red se čuva, statistika se menja
    await poeni(page, 2).fill('30');
    await expect(page.locator('#greska-reda-2')).toBeHidden();
    await expect(poeni(page, 2)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(kpi(page, 'uneto')).toHaveText('3 od 4');
    await expect(kpi(page, 'prosek')).toHaveText('20 / 30');
    await expect(kpi(page, 'prolaz')).toHaveText('67 %');
    await expect(kpi(page, 'max')).toHaveText('30');
    await expect.poll(() => mock.podaci.testovi[0].polaganja.map(p => p.ostvareniPoeni)).toEqual([20, 30, 10, null]);
  });
});
