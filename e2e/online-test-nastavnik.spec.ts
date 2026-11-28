import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { MockOnlineTestovi } from './mock-online-testovi';

/*
 * Online test, strana nastavnika (plan online testova 4 i 6, spec 7-14): šabloni (spisak, editor sa izvorima iz banke namene
 * TEST i živom proverom kandidata), „Nov test“ -> Online -> „Generiši“, priprema, tok (Otvori ulaz sa kodom, Pokreni, Završi
 * smenu), konzola, rezultati, pregled po zadacima i objava sa „Pokaži tačne odgovore“, projektor bez imena.
 */

/** Banka namene TEST (fikstura banke ima samo PREDAVANJE): jedna tema sa dva tipa. */
function bankaTesta(mock: MockApi): void {
  mock.na('GET', 'banka/stablo', (z, _p, dalje) => {
    if (z.query.get('namena') !== 'TEST') return dalje();
    const tip = (id: number, naziv: string) => ({
      id, naziv, opis: null, tezina: null, uputstvo: null, roditeljId: 100, rb: id, list: true, brojAktivnih: 6, brojNacrta: 0,
      iskljucena: false, deca: [],
    });
    return {
      telo: [{
        id: 100, naziv: 'Konverzije brojeva', opis: null, tezina: null, uputstvo: null, roditeljId: null, rb: 1, list: false,
        brojAktivnih: 12, brojNacrta: 0, iskljucena: false, deca: [tip(2, '2 → 10'), tip(3, '16 → 2')],
      }],
    };
  });
}

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const ozbiljna = rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  expect(ozbiljna).toEqual([]);
}

test.describe('online test: nastavnik', () => {
  test('šablon: nov šablon sa izvorom iz banke, kandidati iz provere, čuvanje i spisak', async ({ page, mock }) => {
    bankaTesta(mock);
    await page.goto('testovi/sabloni?predmet=1');
    await expect(page.locator('[data-sablon]')).toHaveCount(1);
    await page.locator('[data-nov-sablon]').click();
    await expect(page).toHaveURL(/\/testovi\/sabloni\/novo\?predmet=1$/);
    await page.locator('[data-naziv]').fill('Kolokvijum 2 – online');
    await page.locator('[data-naziv-stavke]').first().fill('Konverzije');
    await page.locator('[data-dodaj-izvor]').first().click();
    const dijalog = page.getByRole('dialog');
    await dijalog.locator('[data-cvor="2"]').click();
    await dijalog.locator('[data-potvrdi-izvore]').click();
    await expect(page.locator('[data-kandidati]').first()).toContainText('Kandidata: 6', { timeout: 5_000 });
    expect(mock.zahteviZa('sabloni-testa/provera', 'POST').length).toBeGreaterThan(0);
    await page.locator('[data-sacuvaj-sablon]').click();
    await expect(page).toHaveURL(/\/testovi\/sabloni\/\d+$/);
    const sacuvan = mock.zahteviZa('sabloni-testa', 'POST').at(-1)!.telo as { naziv: string; stavke: { izvori: number[] }[] };
    expect(sacuvan.naziv).toBe('Kolokvijum 2 – online');
    expect(sacuvan.stavke[0].izvori).toEqual([2]);
    await page.goto('testovi/sabloni?predmet=1');
    await expect(page.locator('[data-sablon]')).toHaveCount(2);
  });

  test('Nov test -> Online -> Generiši; priprema, ulaz sa kodom, Pokreni, konzola, Završi smenu, rezultati, objava', async ({ page, mock }) => {
    test.slow();
    await page.goto('testovi/novo?predmet=1&grupa=1');
    await page.locator('[data-nacin-online]').click();
    await expect(page).toHaveURL(/nacin=online/);
    await expect(page.locator('[data-o-sablon]')).toHaveValue('1');
    await expect(page.locator('[data-o-studenti] [data-o-student]').first()).toBeVisible();
    await page.locator('[data-generisi]').click();
    await expect(page).toHaveURL(/\/testovi\/\d+$/);
    const id = Number(new URL(page.url()).pathname.split('/').pop());
    const cmd = mock.zahteviZa('test/online', 'POST').at(-1)!.telo as { sablonId: number; grupaId: number; studentIds: number[] };
    expect(cmd).toMatchObject({ sablonId: 1, grupaId: 1 });
    expect(cmd.studentIds.length).toBeGreaterThan(0);

    // priprema: izbor po grupi testa sa slikom zadatka
    await expect(page.locator('[data-tab="priprema"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-grupa-testa]').first()).toBeVisible();

    // ulaz sa kodom, pa Pokreni (potvrda)
    await page.locator('[data-sa-kodom]').click();
    await page.locator('[data-otvori-ulaz]').click();
    await expect(page.locator('[data-ulazni-kod]')).toContainText(MockOnlineTestovi.KOD_ULAZA);
    await page.locator('[data-pokreni]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Pokreni' }).click();
    await expect(page.locator('[data-zavrsi-smenu]')).toBeVisible();

    // konzola: student predao, prepisivao se upisuje
    mock.online.predaoStudent(id, { 1: '13', 2: 2 });
    await page.locator('[data-tab="uzivo"]').click();
    await expect(page.locator('[data-primerak]').first()).toBeVisible();
    await expect(page.locator('[data-zbir]')).toContainText('1', { timeout: 6_000 });
    await page.locator('[data-prepisivao]').first().click();
    await expect.poll(() => mock.zahteviZa(/^test\/\d+\/online\/primerci\/\d+\/prepisivao$/, 'PATCH').length).toBe(1);

    await page.locator('[data-zavrsi-smenu]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Završi smenu' }).click();
    await expect(page.locator('[data-tab="studenti"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-rezultat-studenta]').first()).toBeVisible();

    // po zadacima: obe varijante sa grupama odgovora
    await page.locator('[data-tab="zadaci"]').click();
    await expect(page.locator('[data-varijanta-odgovora]')).toHaveCount(2);

    // objava sa tačnim odgovorima
    await page.locator('[data-tacni] input, input[data-tacni]').first().check();
    await page.locator('[data-objavi]').click();
    await expect(page.getByRole('alertdialog')).toContainText('tačne vrednosti i rešenja');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Objavi' }).click();
    await expect.poll(() => mock.zahteviZa(`test/${id}/objava`, 'POST').at(-1)?.telo).toEqual({ tacni: true });
  });

  test('projektor: sat, adresa /r i ulazni kod, „Predalo X od Y“, bez imena', async ({ page, mock }) => {
    const id = mock.online.napravi('U_TOKU', { ulazniKod: MockOnlineTestovi.KOD_ULAZA });
    mock.online.predaoStudent(id, { 1: '13' });
    await page.goto(`testovi/${id}/projektor`);
    await expect(page.locator('[data-adresa]')).toContainText('/r');
    await expect(page.locator('[data-ulazni-kod]')).toContainText(MockOnlineTestovi.KOD_ULAZA);
    await expect(page.locator('[data-predalo]')).toContainText('Predalo 1 od 4');
    await expect(page.locator('[data-projektor-testa]')).not.toContainText('Primerović');
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}): šabloni, editor, nov online test, test (priprema, uživo, studenti, po zadacima)`, async ({ page, mock }) => {
      test.slow();
      bankaTesta(mock);
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.goto('testovi/sabloni?predmet=1');
      await expect(page.locator('[data-sablon]')).toHaveCount(1);
      await bezOzbiljnihKrsenja(page);
      await page.goto('testovi/sabloni/1');
      await expect(page.locator('[data-kandidati]').first()).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      await page.goto('testovi/novo?predmet=1&grupa=1&nacin=online');
      await expect(page.locator('[data-o-student]').first()).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      const id = mock.online.napravi('U_TOKU');
      mock.online.predaoStudent(id, { 1: '13', 2: 1 });
      await page.goto(`testovi/${id}`);
      for (const [tab, znak] of [['priprema', '[data-grupa-testa]'], ['uzivo', '[data-primerak]'], ['studenti', '[data-rezultat-studenta]'],
        ['zadaci', '[data-varijanta-odgovora]']] as const) {
        await page.locator(`[data-tab="${tab}"]`).click();
        await expect(page.locator(znak).first()).toBeVisible();
        await bezOzbiljnihKrsenja(page);
      }
    });
  }
});
