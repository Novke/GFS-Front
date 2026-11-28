import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './javna-mreza';
import { MockOnlineTestovi } from './mock-online-testovi';

/*
 * Online test, strana studenta (plan online testova 5 i 6, spec 11-14): kartica na Početnoj, ulaz sa kodom, čekaonica,
 * zadaci sa automatskim čuvanjem (`rev`), predaja, „Nastavi ovde“, rezultat posle objave, i prijava računara (`/r`, QR i
 * broj, odobrenje sa telefona). Sve su javne rute: smeju samo `api/public/nalog/*` (i `api/public/mediji/*` za slike
 * zadataka, koje idu kao `<img>`), bez 401 osim dozvoljenih, i nijedan odgovor studentu ne nosi ključ ni rešenje.
 */

const API = new RegExp(
  '^(GET|POST) /api/public/nalog/(stanje|kod|prijava|ja|odjava|cas|casovi|obavestenja|push|ankete|predmeti|predmeti/\\d+/testovi'
  + '|testovi|testovi/\\d+|testovi/\\d+/(ulaz|predaj|dogadjaj|rezultat)|racunar/zahtev|racunar/[\\w-]+|racunar/[\\w-]+/odobri)$'
  + '|^PUT /api/public/nalog/testovi/\\d+/zadaci/\\d+$|^GET /api/public/mediji/[\\w-]+$',
);

/** Ključevi koje student ne sme da vidi pre objave sa tačnim odgovorima (spec 17). */
const TAJNO = /"(odgovori|tacno|tacna|tacne|resenjeSvgId|prihvatljivi)"/;

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const ozbiljna = rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  expect(ozbiljna).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Tela svih odgovora `api/public/nalog/testovi*` (provera tajnih ključeva). */
function telaTestova(page: Page): string[] {
  const tela: string[] = [];
  page.on('response', async r => {
    if (/\/api\/public\/nalog\/testovi/.test(r.url()) && r.request().method() !== 'PUT') {
      try {
        tela.push(await r.text());
      } catch {
        // stranica je zatvorena
      }
    }
  });
  return tela;
}

test.describe('online test: student', () => {
  test.use({
    dozvoljeniApi: API,
    dozvoljeni401: /^\/api\/public\/nalog\/(ja|cas|obavestenja|testovi)$/,
  });

  test('kartica na Početnoj -> ulaz sa kodom -> čekaonica -> zadaci, čuvanje sa rev-om -> predaja', async ({ page, mock, javnaMreza }) => {
    test.slow();
    const tela = telaTestova(page);
    mock.studentPrijavljen = true;
    const id = mock.online.napravi('ULAZ', { ulazniKod: MockOnlineTestovi.KOD_ULAZA });
    await page.goto('nalog/pocetna');
    const kartica = page.locator('[data-test-kartica]');
    await expect(kartica).toContainText('Kolokvijum 1');
    await kartica.locator('[data-test-udji]').click();
    await expect(page).toHaveURL(new RegExp(`/nalog/test/${id}$`));

    // pogrešan kod: poruka servera, ostaje na ulazu
    await page.locator('[data-kod]').fill('0000');
    await page.locator('[data-udji]').click();
    await expect(page.locator('[data-greska]')).toContainText('Pogrešan ulazni kod.');
    await page.locator('[data-kod]').fill(MockOnlineTestovi.KOD_ULAZA);
    await page.locator('[data-udji]').click();
    await expect(page.locator('[data-cekaonica]')).toBeVisible();

    // nastavnik pokreće: čekaonica pita na 5 s i prelazi na zadatke
    mock.online.pokreniTest(id);
    await expect(page.locator('app-test-zadatak')).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-sat]')).toHaveText(/4[45]:\d\d/);
    await page.locator('input[data-polje="a"]').fill('13');
    await expect(page.locator('[data-cuvanje]')).toContainText(/Sačuvano/, { timeout: 5_000 });
    expect(mock.online.unetoStudenta(id, 1)).toEqual({ a: '13' });
    const prvi = mock.zahteviZa(/^public\/nalog\/testovi\/\d+\/zadaci\/\d+$/, 'PUT');
    expect(prvi.at(-1)!.telo).toEqual({ rev: 0, uneto: { a: '13' } });

    // drugi zadatak: izbor opcije, čuva se kao id opcije
    await page.locator('[data-stavka="2"]').click();
    await page.getByRole('button', { name: 'Druga' }).click();
    await expect.poll(() => mock.online.unetoStudenta(id, 2)).toEqual({ a: 2 });

    // predaja: potvrda kaže da je sve popunjeno, pa „Predato u …“
    await page.locator('[data-predaj]').click();
    await expect(page.getByRole('alertdialog')).toContainText('Sva polja su popunjena.');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Predaj' }).click();
    await expect(page.locator('[data-predato]')).toContainText('Predato u');
    expect(mock.online.primerakStudenta(id)!.stanje).toBe('PREDAO');

    for (const t of tela) expect(t).not.toMatch(TAJNO);
    expect(javnaMreza.api.some(z => z.startsWith('PUT /api/public/nalog/testovi/'))).toBe(true);
  });

  test('zastarela izmena (409): GET pa ponovo sopstvena vrednost sa novim rev-om; ništa se ne gubi', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const id = mock.online.napravi('U_TOKU');
    await page.goto(`nalog/test/${id}`);
    await page.locator('[data-udji]').click();
    await expect(page.locator('app-test-zadatak')).toBeVisible();
    // druga kartica je u međuvremenu sačuvala svoje (rev 4): ovaj PUT sa rev 0 dobija 409
    mock.online.izmenaSaStrane(id, 1, 4, { a: '99' });
    await page.locator('input[data-polje="a"]').fill('13');
    await expect.poll(() => mock.online.unetoStudenta(id, 1), { timeout: 8_000 }).toEqual({ a: '13' });
    const putovi = mock.zahteviZa(/^public\/nalog\/testovi\/\d+\/zadaci\/\d+$/, 'PUT').map(z => (z.telo as { rev: number }).rev);
    expect(putovi).toEqual([0, 4]);
    await expect(page.locator('input[data-polje="a"]')).toHaveValue('13');
    await expect(page.locator('[data-cuvanje]')).toContainText(/Sačuvano/);
  });

  test('test otvoren na drugom uređaju: „Nastavi ovde“ preuzima', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const id = mock.online.napravi('U_TOKU');
    mock.online.drugiUredjaj = true;
    await page.goto(`nalog/test/${id}`);
    await page.locator('[data-udji]').click();
    await expect(page.locator('[data-drugi-uredjaj]')).toContainText('Test je otvoren na drugom uređaju.');
    await page.locator('[data-nastavi-ovde]').click();
    await expect(page.locator('app-test-zadatak')).toBeVisible();
    const ulazi = mock.zahteviZa(`public/nalog/testovi/${id}/ulaz`, 'POST').map(z => (z.telo as { preuzmi: boolean }).preuzmi);
    expect(ulazi).toEqual([false, true]);
  });

  test('rezultat posle objave sa tačnim odgovorima: tab Testovi na predmetu -> rezultat', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const id = mock.online.napravi('ZAVRSEN', { objavljeno: '2026-11-27T10:00:00', objavaTacni: true });
    mock.online.predaoStudent(id, { 1: '13', 2: 1 });
    await page.goto('nalog/predmet/1?k=testovi');
    const red = page.locator(`a[data-test="${id}"]`);
    await expect(red).toContainText('3 od 5');
    await red.click();
    await expect(page).toHaveURL(new RegExp(`/nalog/test/${id}/rezultat$`));
    await expect(page.locator('[data-ukupno]')).toContainText('3 od 5');
    await expect(page.locator('[data-zadatak]')).toHaveCount(2);
    await expect(page.locator('[data-tacno]').first()).toContainText('13');
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}): zadaci testa na telefonu i rezultat, bez serious/critical`, async ({ page, mock }) => {
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 740 });
      mock.studentPrijavljen = true;
      const id = mock.online.napravi('U_TOKU');
      await page.goto(`nalog/test/${id}`);
      await page.locator('[data-udji]').click();
      await expect(page.locator('app-test-zadatak')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      const drugi = mock.online.napravi('ZAVRSEN', { objavljeno: '2026-11-27T10:00:00', objavaTacni: true });
      mock.online.predaoStudent(drugi, { 1: '12', 2: 2 });
      await page.goto(`nalog/test/${drugi}/rezultat`);
      await expect(page.locator('[data-zadatak]')).toHaveCount(2);
      await bezOzbiljnihKrsenja(page);
    });
  }
});

test.describe('prijava računara (/r)', () => {
  test.use({
    dozvoljeniApi: API,
    dozvoljeni401: /^\/api\/public\/nalog\/(ja|cas|obavestenja|testovi|racunar\/[\w-]+)$/,
  });

  test('QR i broj; posle odobrenja sa telefona računar je prijavljen (RACUNAR): traka „Nisi ti?“, bez instalacije', async ({ page, mock, javnaMreza }) => {
    await page.goto('r');
    await expect(page.locator('[data-broj]')).toHaveText(MockOnlineTestovi.BROJ_RACUNARA);
    await expect(page.locator('canvas[data-qr]')).toBeVisible();
    mock.online.odobriZahtev();
    await expect(page).toHaveURL(/\/nalog\/pocetna$/, { timeout: 8_000 });
    await expect(page.locator('[data-racunar-traka]')).toContainText('Nisi ti?');
    await expect(page.locator('app-instalacija-kartica')).toHaveCount(0);
    expect(javnaMreza.api).toContain('POST /api/public/nalog/racunar/zahtev');
  });

  test('„Imam kod“ na računaru: prijava kodom sa racunar: true', async ({ page, mock }) => {
    await page.goto('r');
    await expect(page.locator('[data-broj]')).toBeVisible();
    await page.locator('[data-imam-kod]').click();
    await page.getByLabel('Broj indeksa').fill('1');
    await page.getByRole('button', { name: 'Pošalji kod' }).click();
    await page.getByLabel('Kod iz mejla').fill('246810');
    await page.getByRole('button', { name: 'Prijavi se' }).click();
    await expect(page).toHaveURL(/\/nalog\/pocetna$/);
    const prijava = mock.zahteviZa('public/nalog/prijava', 'POST').at(-1)!;
    expect((prijava.telo as { racunar?: boolean }).racunar).toBe(true);
    await expect(page.locator('[data-racunar-traka]')).toBeVisible();
  });

  test('telefon: neprijavljen ide na prijavu sa povratkom; prijavljen potvrđuje računar', async ({ page, mock }) => {
    const token = MockOnlineTestovi.TOKEN_RACUNARA;
    mock.online.zahtev = { stanje: 'CEKA', broj: MockOnlineTestovi.BROJ_RACUNARA };
    await page.goto(`nalog/racunar/${token}`);
    await expect(page).toHaveURL(new RegExp(`/nalog\\?nazad=nalog%2Fracunar%2F${token}$|/nalog\\?nazad=nalog/racunar/${token}$`));
    mock.studentPrijavljen = true;
    await page.goto(`nalog/racunar/${token}`);
    await expect(page.locator('main')).toContainText(`Prijavi računar ${MockOnlineTestovi.BROJ_RACUNARA} kao`);
    await page.locator('[data-potvrdi]').click();
    await expect(page.locator('[data-odobreno]')).toBeVisible();
    expect(mock.online.zahtev?.stanje).toBe('ODOBREN');
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}): /r sa QR-om, bez serious/critical`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.goto('r');
      await expect(page.locator('[data-broj]')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
    });
  }
});
