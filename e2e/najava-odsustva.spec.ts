import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { danIDatum } from '../src/app/shared/util/termin';
import { expect as ocekuj, test } from './javna-mreza';

/*
 * Najava odsustva sa naloga studenta (spec najave odsustva, odeljak 4): „Naredni časovi“ na tabu Početna (`/nalog` vodi
 * prijavljenog studenta na `/nalog/pocetna`), sledeći čas, kalendar (dodir na dan otvara njegove termine), „Neću doći“,
 * razlog, „Ipak dolazim“, otkazan čas („Nema časa“ sa napomenom), 409 kad nastavnik otkaže dok je stranica otvorena.
 * Student nikad ne vidi broj najava ni tuđa imena. Javna mreža: samo `api/public/nalog/*` (`javna-mreza`: sve ostalo je
 * 401 kao na stejdžingu i obara test). Mok: `e2e/mock-raspored.ts` (`primer()`: stavke 31 i 32 grupe studenta, 33 tuđa).
 */

const API = /^(GET|POST) \/api\/public\/nalog\/(stanje|ja|cas|casovi|casovi\/najavi|casovi\/povuci|obavestenja)$/;

const kartica = (page: Page) => page.locator('[data-naredni-casovi]');
const termin = (page: Page, stavka: number, datum: string) => page.locator(`[data-termin="${stavka}:${datum}"]`);

/** Dodir na dan u kalendaru; dan može biti u susednom mesecu (npr. sutra je poslednji dan meseca), pa prvo strelica. */
async function izaberiDan(page: Page, datum: string): Promise<void> {
  const dan = page.locator(`[data-dan="${datum}"]`);
  if (!(await dan.count())) {
    const izabran = await page.locator('[data-dan][aria-pressed="true"]').getAttribute('data-dan');
    await page.locator(datum > izabran! ? '[data-sledeci-mesec]' : '[data-prethodni-mesec]').click();
  }
  await dan.click();
}

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  await ocekuj
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  ocekuj(rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  ocekuj(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('najava odsustva (telefon, bez sesije nastavnika)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, dozvoljeniApi: API });

  test('naredni časovi: samo svoja grupa, kalendar, 4 po terminu; „Neću doći“, razlog, „Ipak dolazim“; bez brojeva i imena', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    const { sutra, prekosutra } = mock.raspored.primer();
    // dva druga studenta su već javila za sutra (prag primera je 2): najava studenta naloga ga prelazi
    mock.raspored.najavaDrugog(2, 31, sutra, 'privatno');
    mock.raspored.najavaDrugog(3, 31, sutra);

    await page.goto('nalog');
    await ocekuj(page).toHaveURL(/\/nalog\/pocetna$/); // prijavljen student: /nalog vodi na tab Početna
    await ocekuj(kartica(page).getByRole('heading', { name: 'Naredni časovi' })).toBeVisible();
    const naredni = await page.evaluate(async () => (await fetch('api/public/nalog/casovi')).json() as Promise<{ termini: { stavkaId: number }[] }>);
    ocekuj(naredni.termini).toHaveLength(8);
    ocekuj(naredni.termini.filter(t => t.stavkaId === 33)).toEqual([]); // tuđa grupa
    await ocekuj(kartica(page).locator('[data-termin^="33:"]')).toHaveCount(0);
    await ocekuj(page.locator('[data-sledeci-cas]')).toContainText('Sledeći čas · sutra');
    await ocekuj(page.locator('[data-sledeci-cas]')).toContainText('Programiranje u građevinarstvu');
    await ocekuj(page.locator('[data-dan-naslov]')).toContainText(`${danIDatum(sutra)} · sutra`, { ignoreCase: true });
    const prvi = termin(page, 31, sutra);
    await ocekuj(prvi).toContainText('10:00–13:00');
    await ocekuj(prvi).toContainText('Programiranje u građevinarstvu');

    // „Neću doći“ jednim dodirom: najava bez razloga, obaveštenje nastavniku jer je prag pređen
    await prvi.getByRole('button', { name: /^Neću doći/ }).click();
    await ocekuj(prvi.locator('[data-najavljeno]')).toContainText('Javljeno da nećeš doći.');
    await ocekuj(page.locator('[data-sledeci-cas]')).toContainText('Sledeći čas · za 2 dana'); // ne ide na sutrašnji čas
    ocekuj(mock.zahteviZa('public/nalog/casovi/najavi', 'POST').map(z => z.telo)).toEqual([{ stavkaId: 31, datum: sutra, razlog: null }]);
    ocekuj(mock.podaci.obavestenja.filter(o => o.vrsta === 'MNOGO_NAJAVA')).toHaveLength(1);
    await bezOzbiljnihKrsenja(page);

    // razlog po želji
    await prvi.getByRole('button', { name: /^Dodaj razlog/ }).click();
    await prvi.getByLabel('Razlog (nije obavezno)').fill('pregled kod lekara');
    await prvi.getByRole('button', { name: 'Sačuvaj' }).click();
    await ocekuj(prvi).toContainText('Razlog: pregled kod lekara');
    ocekuj(mock.zahteviZa('public/nalog/casovi/najavi', 'POST').at(-1)?.telo).toEqual({ stavkaId: 31, datum: sutra, razlog: 'pregled kod lekara' });
    ocekuj(mock.podaci.obavestenja.filter(o => o.vrsta === 'MNOGO_NAJAVA')).toHaveLength(1); // jednom po terminu

    // student nikad ne vidi koliko je drugih javilo ni ko (ni u odgovoru ni na ekranu)
    await ocekuj(kartica(page)).not.toContainText('privatno');
    const odgovor = await page.evaluate(async () => (await fetch('api/public/nalog/casovi')).text());
    ocekuj(odgovor).not.toMatch(/broj|prag|najave|studentId|privatno/);

    // „Ipak dolazim“ vraća termin
    await prvi.getByRole('button', { name: /^Ipak dolazim/ }).click();
    await ocekuj(prvi.getByRole('button', { name: /^Neću doći/ })).toBeVisible();
    ocekuj(mock.zahteviZa('public/nalog/casovi/povuci', 'POST').map(z => z.telo)).toEqual([{ stavkaId: 31, datum: sutra }]);

    // dodir na drugi dan u kalendaru otvara njegov termin
    await izaberiDan(page, prekosutra);
    await ocekuj(termin(page, 32, prekosutra)).toContainText('08:15–09:45');
    await ocekuj(prvi).toHaveCount(0);

    ocekuj(javnaMreza.api.every(z => API.test(z))).toBe(true);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  test('otkazan čas: „Nema časa“ sa napomenom, bez dugmadi; otkazivanje dok je stranica otvorena daje poruku i osvežava', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const { sutra, prekosutra } = mock.raspored.primer();
    mock.raspored.otkazani.set(`32:${prekosutra}`, 'sednica veća');

    await page.goto('nalog');
    await ocekuj(kartica(page)).toBeVisible();
    await izaberiDan(page, prekosutra);
    const otkazan = termin(page, 32, prekosutra);
    await ocekuj(otkazan.locator('[data-nema-casa]')).toHaveText(/Nema časa\.\s+sednica veća/);
    await ocekuj(otkazan.getByRole('button')).toHaveCount(0);

    // nastavnik otkazuje sutrašnji čas posle učitavanja: najava dobija 409, poruka ostaje uz termin, lista se osvežava
    mock.raspored.otkazani.set(`31:${sutra}`, null);
    await izaberiDan(page, sutra);
    const prvi = termin(page, 31, sutra);
    await prvi.getByRole('button', { name: /^Neću doći/ }).click();
    await ocekuj(prvi.getByRole('alert')).toHaveText('Ovaj čas je otkazan.');
    await ocekuj(prvi.locator('[data-nema-casa]')).toContainText('Nema časa.');
    await bezOzbiljnihKrsenja(page);
  });

  test('bez rasporeda: nema kartice (i nema greške)', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog');
    await ocekuj(page).toHaveURL(/\/nalog\/pocetna$/); // prijavljen student: /nalog vodi na tab Početna
    await ocekuj.poll(() => mock.zahteviZa('public/nalog/casovi', 'GET').length).toBe(1);
    await ocekuj(kartica(page)).toHaveCount(0);
  });
});
