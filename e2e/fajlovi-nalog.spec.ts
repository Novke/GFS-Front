import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './javna-mreza';
import { lazniBroker, type LazniBroker } from './lazni-stomp';
import { FAJL_EXCEL, FAJL_WORD, PREDMET, PREZENTACIJA } from './mock-portal';

/*
 * Fajlovi uz prezentaciju, strana studenta (spec 2026-11-20, odeljak 6): Materijali predmeta i pregled prezentacije
 * (Preuzmi + „Pošalji mi na mejl”) i telefon uživo (samo mejl, lenji blok; bez prijave link na nalog). Sve su javne rute:
 * smeju da zovu samo `api/public/*`, bez 401 (osim namerno mokovanog 401 na slanju mejla gostu).
 */

const API_NALOGA = /^(GET|POST) \/api\/public\/nalog\/(ja|cas|casovi|predmeti(\/\d+\/(prisustvo|vezbanje|moji-zadaci|prezentacije|fajlovi|ocena))?|prezentacije\/\d+|fajlovi\/\d+\/mejl)$|^GET \/api\/public\/nalog\/(obavestenja|push)$|^GET \/api\/public\/mediji\/[\w-]+$/;

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

test.describe('fajlovi uz prezentaciju: nalog studenta (telefon)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: API_NALOGA,
    dozvoljeni401: /^\/api\/public\/nalog\/(ja|cas|predmeti|prijava|obavestenja)$/,
  });

  test('Materijali: Fajlovi po prezentaciji, Preuzmi i „Pošalji mi na mejl” (poruka sa maskom, pa 429)', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto(`nalog/predmet/${PREDMET}`);
    const odeljak = page.locator('[data-fajlovi]');
    await expect(odeljak.getByRole('heading', { level: 3, name: 'Fajlovi' })).toBeVisible();
    await expect(odeljak).toContainText('Konverzije – vežbe');
    const word = odeljak.locator(`[data-fajl="${FAJL_WORD}"]`);
    await expect(word).toContainText('Zadaci za vežbu.docx');
    await expect(word).toContainText('Word · 20 KB');
    await expect(odeljak.locator(`[data-fajl="${FAJL_EXCEL}"]`)).toContainText('Excel · 1,4 MB');
    await expect(word.locator('[data-preuzmi]')).toHaveAttribute('href', `api/public/nalog/fajlovi/${FAJL_WORD}`);

    await word.getByRole('button', { name: 'Pošalji mi na mejl' }).click();
    await expect(word.locator('[data-poruka]')).toHaveText('Poslato na n•••@gmail.com.');
    expect(mock.portal.poslatiFajlovi).toEqual([FAJL_WORD]);

    mock.portal.mejlGreska = 'Već si poslao dosta fajlova. Pokušaj ponovo za sat.';
    await odeljak.locator(`[data-fajl="${FAJL_EXCEL}"]`).getByRole('button', { name: 'Pošalji mi na mejl' }).click();
    await expect(odeljak.locator(`[data-fajl="${FAJL_EXCEL}"] [data-poruka]`)).toHaveText('Već si poslao dosta fajlova. Pokušaj ponovo za sat.');
    expect(mock.portal.poslatiFajlovi).toEqual([FAJL_WORD]);

    expect(javnaMreza.api).toContain(`GET /api/public/nalog/predmeti/${PREDMET}/fajlovi`);
    expect(javnaMreza.api.filter(z => !API_NALOGA.test(z))).toEqual([]);
    expect(javnaMreza.odgovori401).toEqual([]);
  });

  test('pregled prezentacije: spisak fajlova iznad slajdova, preuzimanje i mejl', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto(`nalog/prezentacija/${PREZENTACIJA}`);
    const odeljak = page.locator('[data-fajlovi]');
    await expect(odeljak.getByRole('heading', { name: 'Fajlovi uz prezentaciju' })).toBeVisible();
    const yFajlova = (await odeljak.boundingBox())!.y;
    const ySlajda = (await page.locator('[data-slajd]').first().boundingBox())!.y;
    expect(yFajlova).toBeLessThan(ySlajda);
    await expect(odeljak.locator(`[data-fajl="${FAJL_EXCEL}"] [data-preuzmi]`)).toHaveAttribute('href', `api/public/nalog/fajlovi/${FAJL_EXCEL}`);
    await odeljak.locator(`[data-fajl="${FAJL_EXCEL}"]`).getByRole('button', { name: 'Pošalji mi na mejl' }).click();
    await expect(odeljak.locator(`[data-fajl="${FAJL_EXCEL}"] [data-poruka]`)).toContainText('Poslato na n•••@gmail.com.');
    expect(javnaMreza.api.filter(z => !API_NALOGA.test(z))).toEqual([]);
    expect(javnaMreza.odgovori401).toEqual([]);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}), 360 px: Materijali sa fajlovima i pregled`, async ({ page, mock }) => {
      mock.studentPrijavljen = true;
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`nalog/predmet/${PREDMET}`);
      await expect(page.locator('[data-fajlovi]')).toBeVisible();
      await page.locator(`[data-fajl="${FAJL_WORD}"]`).getByRole('button', { name: 'Pošalji mi na mejl' }).click();
      await expect(page.locator(`[data-fajl="${FAJL_WORD}"] [data-poruka]`)).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      await page.goto(`nalog/prezentacija/${PREZENTACIJA}`);
      await expect(page.locator('[data-fajlovi]')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
    });
  }
});

/* ---- telefon uživo ---- */

const KOD = '123456';
const IZVODJENJE = 7;

const javno = (verzija: number, fajlovi: unknown[], prijava = false) => ({
  izvodjenjeId: IZVODJENJE, verzija, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Konverzije · vežbe', kod: KOD,
  prikaz: prijava ? 'PRIJAVA' : 'SLAJD', slajdTip: prijava ? null : 'INFO', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false,
  brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, zadatak: null, fajlovi,
});
const licno = (verzija: number) => ({
  verzija, ucesnikId: 10_000, ime: 'Mina', poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null, zadatak: null,
});
const FAJLOVI = [{ id: FAJL_WORD, naziv: 'Zadaci za vežbu.docx', vrsta: 'DOCX', velicina: 20_480 }];

async function uđi(page: Page, ws: string[], prijavljen = false): Promise<{ broker: LazniBroker; salji: (fajlovi: unknown[]) => void }> {
  let v = 1;
  let stanje = javno(v, [], true);
  const broker = await lazniBroker(
    page, 'api/public/ws',
    o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? { javno: stanje, licno: licno(v) } : undefined),
    url => ws.push(new URL(url).pathname),
  );
  await page.goto('uzivo');
  await page.getByLabel('Kod sa table').fill(KOD);
  await expect(page).toHaveURL(new RegExp(`/uzivo/${KOD}$`));
  if (!prijavljen) {
    await page.getByLabel('Tvoje ime').fill('Mina');
    await page.getByRole('button', { name: 'Uđi' }).click();
  }
  await expect(page.getByText('Čekamo početak')).toBeVisible();
  await expect.poll(() => broker.pretplate).toContain(`/topic/izvodjenja/${IZVODJENJE}/javno`);
  return {
    broker,
    salji: fajlovi => {
      v++;
      stanje = javno(v, fajlovi);
      broker.posalji(`/topic/izvodjenja/${IZVODJENJE}/javno`, stanje);
      broker.posalji('/user/queue/licno', licno(v));
    },
  };
}

test.describe('fajlovi uz prezentaciju: telefon uživo', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: /^(GET \/api\/public\/(uzivo|mediji)\/|POST \/api\/public\/uzivo\/\d{6}\/prijava$|POST \/api\/public\/nalog\/fajlovi\/\d+\/mejl$)/,
    dozvoljeni401: /^\/api\/public\/nalog\/fajlovi\/\d+\/mejl$/,
  });

  test('student: blok se pojavi tek sa fajlovima, samo mejl; nestane kad slajd nema fajl; mreža bez 401', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    const { salji } = await uđi(page, javnaMreza.ws, true);
    await expect(page.locator('[data-fajlovi-telefon]')).toHaveCount(0);

    salji(FAJLOVI);
    const blok = page.locator('[data-fajlovi-telefon]');
    await expect(blok).toContainText('Zadaci za vežbu.docx');
    await expect(blok.locator('[data-preuzmi]')).toHaveCount(0);
    await blok.getByRole('button', { name: 'Pošalji mi na mejl' }).click();
    await expect(blok.locator('[data-poruka]')).toHaveText('Poslato na n•••@gmail.com.');
    expect(mock.portal.poslatiFajlovi).toEqual([FAJL_WORD]);

    salji([]);
    await expect(blok).toHaveCount(0);
    expect(javnaMreza.odgovori401).toEqual([]);
  });

  test('gost (401): umesto dugmeta link „Prijavi se da ti pošaljemo fajl” na nalog?nazad=uzivo/<kod>; axe', async ({ page, javnaMreza }) => {
    const { salji } = await uđi(page, javnaMreza.ws);
    salji(FAJLOVI);
    const blok = page.locator('[data-fajlovi-telefon]');
    await blok.getByRole('button', { name: 'Pošalji mi na mejl' }).click();
    const link = blok.getByRole('link', { name: 'Prijavi se da ti pošaljemo fajl' });
    await expect(link).toBeVisible();
    expect(decodeURIComponent((await link.getAttribute('href'))!)).toBe(`/nalog?nazad=uzivo/${KOD}`);
    await expect(blok.getByRole('button', { name: 'Pošalji mi na mejl' })).toHaveCount(0);
    expect(javnaMreza.odgovori401).toHaveLength(1);
    await bezOzbiljnihKrsenja(page);
  });
});
