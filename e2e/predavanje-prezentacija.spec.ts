import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';
import type { IzvodjenjeNaPredavanju } from './mock-api';

/** Konzola u novoj kartici se ovde ne učitava (aplikacija ima svoje testove): kartica dobija praznu stranicu. */
async function prazneKonzole(page: Page): Promise<void> {
  await page.context().route(/\/izvodjenja\/\d+\/konzola$/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>konzola</title>' }));
}

function zavrseno(id: number, predavanjeId: number, prezentacijaId = 5): IzvodjenjeNaPredavanju {
  return {
    id, kod: '123456', prezentacija: { id: prezentacijaId, naziv: 'Statika · nosači', predmetId: 1 }, status: 'ZAVRSENO', cuvanje: true, grupa: null,
    predavanje: { id: predavanjeId, rb: 2, datum: '2026-09-29', tema: 'Uslovi i grananje' }, pocetak: '2026-09-29T10:00:00',
    kraj: '2026-09-29T10:45:00', brojUcesnika: 14, brojPitanja: 3, boduje: false,
  };
}

test.describe('prezentacije na predavanju', () => {
  test('predavanje u toku: izbor prezentacije pokreće izvođenje vezano za predavanje, konzola u novoj kartici, beleženje ostaje', async ({ page, mock }) => {
    await prazneKonzole(page);
    await page.goto('predavanja/1');
    await expect(page.locator('app-studentska-plocica').first()).toBeVisible();
    // bez izvođenja odeljak se ne vidi
    await expect(page.locator('[data-prezentacije]')).toHaveCount(0);

    await page.locator('[data-prezentacija]').click();
    const dijalog = page.getByRole('dialog', { name: 'Pokreni prezentaciju' });
    await posleOtvaranjaDijaloga(page, dijalog);
    const stavke = dijalog.locator('li[data-prezentacija]');
    await expect(stavke).toHaveCount(2);
    // najskorije izmenjena prva: 6 (18.10.) pre 5 (1.10.)
    expect(await stavke.evaluateAll(l => l.map(x => x.getAttribute('data-prezentacija')))).toEqual(['6', '5']);
    await expect(dijalog.locator('[data-filter]')).toHaveCount(0);

    const [kartica] = await Promise.all([
      page.waitForEvent('popup'),
      dijalog.locator('li[data-prezentacija="5"] [data-pokreni]').click(),
    ]);
    await kartica.waitForURL(/\/izvodjenja\/\d+\/konzola$/);
    const zahtev = mock.zahteviZa('prezentacije/5/izvodjenja', 'POST');
    expect(zahtev).toHaveLength(1);
    expect(zahtev[0].telo).toMatchObject({ cuvanje: true, grupaId: null, predavanjeId: 1 });
    await kartica.close();

    // ova stranica nije napuštena: dijalog je zatvoren, odeljak pokazuje izvođenje u toku sa "Nastavi" u novoj kartici
    await expect(dijalog).toHaveCount(0);
    await expect(page).toHaveURL(/\/predavanja\/1$/);
    const red = page.locator('[data-prezentacije] [data-izvodjenje]');
    await expect(red).toHaveCount(1);
    await expect(red).toContainText('Statika · nosači');
    await expect(red).toContainText('U toku');
    const nastavi = red.locator('[data-nastavi]');
    await expect(nastavi).toHaveAttribute('target', '_blank');
    await expect(nastavi).toHaveAttribute('href', /\/izvodjenja\/\d+\/konzola$/);
    await page.locator('app-studentska-plocica[data-student="1"] button.glavno').click();
    await expect(page.locator('app-studentska-plocica[data-student="1"]')).toHaveAttribute('data-stanje', 'prisutan');

    // ponovo: za prezentaciju u toku nudi se "Nastavi", ne drugi start
    await page.locator('[data-prezentacija]').click();
    const opet = page.getByRole('dialog', { name: 'Pokreni prezentaciju' });
    await posleOtvaranjaDijaloga(page, opet);
    await expect(opet.locator('li[data-prezentacija="5"] [data-nastavi]')).toHaveCount(1);
    await expect(opet.locator('li[data-prezentacija="5"] [data-pokreni]')).toHaveCount(0);
    await expect(opet.locator('li[data-prezentacija="6"] [data-pokreni]')).toBeEnabled();
    expect(mock.zahteviZa('prezentacije/5/izvodjenja', 'POST')).toHaveLength(1);
  });

  test('prezentacija u toku van ovog predavanja je zaključana sa objašnjenjem; greška servera ostaje u dijalogu', async ({ page, mock }) => {
    mock.podaci.prezentacije.find(x => x.id === 6)!['aktivnoIzvodjenjeId'] = 999;
    await page.goto('predavanja/1');
    await page.locator('[data-prezentacija]').click();
    const dijalog = page.getByRole('dialog', { name: 'Pokreni prezentaciju' });
    await posleOtvaranjaDijaloga(page, dijalog);
    await expect(dijalog.locator('li[data-prezentacija="6"] [data-pokreni]')).toBeDisabled();
    await expect(dijalog.locator('li[data-prezentacija="6"] [data-zauzeta]')).toContainText('ne na ovom predavanju');

    mock.na('POST', 'prezentacije/:id/izvodjenja', () => ({ status: 409, telo: { reason: 'Prezentacija je već u toku.', time: '' } }));
    await prazneKonzole(page);
    const [kartica] = await Promise.all([
      page.waitForEvent('popup'),
      dijalog.locator('li[data-prezentacija="5"] [data-pokreni]').click(),
    ]);
    // prazna kartica otvorena iz klika se zatvara kad server odbije
    await expect.poll(() => kartica.isClosed()).toBe(true);
    await expect(dijalog.locator('[data-greska]')).toContainText('Prezentacija je već u toku.');
    await expect(dijalog.locator('li[data-prezentacija="5"] [data-pokreni]')).toBeEnabled();
  });

  test('završeno predavanje: odeljak sa pregledom, bez pokretanja; predavanje bez prezentacija to kaže', async ({ page, mock }) => {
    mock.izvodjenjaPredavanja.push(zavrseno(77, 2));
    await page.goto('predavanja/2');
    await expect(page.getByRole('heading', { name: 'Prezentacije na ovom predavanju' })).toBeVisible();
    const red = page.locator('[data-prezentacije] [data-izvodjenje="77"]');
    await expect(red).toContainText('Statika · nosači');
    await expect(red).toContainText('Završeno');
    await expect(red).toContainText('učesnika: 14');
    const pregled = red.locator('[data-pregled]');
    await expect(pregled).toHaveAttribute('href', '/izvodjenja/77/pregled');
    await expect(pregled).not.toHaveAttribute('target', '_blank');
    await expect(page.locator('[data-prezentacija]')).toHaveCount(0);

    await page.goto('predavanja/3');
    await expect(page.locator('[data-prezentacije] [data-prazno]')).toContainText('Nijedna prezentacija nije prikazana');
  });

  test('pristupačnost: stranica sa izvođenjem i dijalog izbora', async ({ page, mock }) => {
    mock.izvodjenjaPredavanja.push(zavrseno(77, 1));
    await page.goto('predavanja/1');
    await expect(page.locator('[data-izvodjenje="77"]')).toBeVisible();
    const stranica = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(stranica.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    await page.locator('[data-prezentacija]').click();
    const dijalog = page.getByRole('dialog', { name: 'Pokreni prezentaciju' });
    await posleOtvaranjaDijaloga(page, dijalog);
    await expect(dijalog.locator('li[data-prezentacija]')).toHaveCount(2);
    const dijalogAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(dijalogAxe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});
