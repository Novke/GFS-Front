import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { budanEkranStub, nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Zadatak slajd u konzoli, na daljinskom (MCP projekat B, FE-3) i na projektoru (FE-4). Izvođenje 7 (`fixtures/uzivo-izvodjenje.json`, izmišljeno),
 * slajd 106 na mestu 6/6: lista "2 → 10" sa 2 aktivne varijante (obe sa rešenjem), na slajdu 1 različita. Mok izvlači prvih
 * `brojZaOtvaranje` varijanti redom i deli ih učesnicima (Ana, Bojan) ciklično.
 */
const KOMANDE = 'izvodjenja/7/komande';
/** Indeks slajda 106 (`IDI_NA`). */
const NA_ZADATKU = 5;

const komande = (mock: MockApi) => mock.zahteviZa(KOMANDE, 'POST').map(z => z.telo as { tip: string; vrednost: number | null });
const panel = (page: Page) => page.getByRole('region', { name: 'Zadatak' });
const resenje = (page: Page) => page.getByRole('button', { name: 'Rešenje', exact: true });

/** Server je na Zadatak slajdu (u CEKA) pre otvaranja stranice. */
function naZadatak(mock: MockApi): void {
  expect(mock.izvodjenje.primeni('IDI_NA', NA_ZADATKU).status).toBe(200);
  expect(mock.izvodjenje.stanje()).toMatchObject({ prikaz: 'SLAJD', trenutniSlajd: { id: 106 }, faza: 'CEKA' });
}

test.describe('konzola: Zadatak slajd (1280 x 800)', () => {
  test('broj različitih pre otvaranja, O otvara (kartice varijanti, varijanta uz učesnika), O zatvara, Shift+R rešenje, R traži potvrdu',
    async ({ page, mock }) => {
      naZadatak(mock);
      await nastavnickiBroker(page, mock);
      await page.goto('izvodjenja/7/konzola');
      await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
      await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 6/6');

      const p = panel(page);
      await expect(p.locator('[data-putanja]')).toHaveText('Konverzije brojeva › 2 → 10');
      await expect(p).toContainText('Različitih: 1 od 2');
      const izbor = p.getByLabel('Broj različitih zadataka');
      await expect(izbor.locator('option')).toHaveText(['Kao na slajdu (1)', 'Sve (2)', '1', '2']);
      await expect(resenje(page)).toBeDisabled();

      await izbor.selectOption('2');
      await expect(p).toContainText('Različitih: 2 od 2');
      await expect(izbor).toHaveValue('2');
      expect(komande(mock)).toEqual([{ tip: 'BROJ_VARIJANTI', vrednost: 2 }]);

      await page.keyboard.press('o');
      const kartice = p.getByRole('list', { name: 'Izvučene varijante' }).getByRole('listitem');
      await expect(kartice).toHaveCount(2);
      await expect(p.getByRole('img', { name: 'Zadatak, varijanta 1011 u dekadni' })).toHaveAttribute(
        'src', 'api/public/mediji/c0000000-0000-4000-8000-000000000031');
      await expect(kartice.first()).toContainText('dodeljeno 1 · odgovorilo 0 · tačno 0');
      await expect(izbor).toHaveCount(0);
      const ucesnici = page.getByRole('region', { name: 'Učesnici' }).getByRole('listitem');
      await expect(ucesnici.first()).toContainText('1011 u dekadni');
      await expect(ucesnici.first()).toContainText('nije odgovorio');
      await expect(ucesnici.nth(1)).toContainText('110010 u dekadni');

      await page.keyboard.press('o');
      await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 6/6');
      await expect(resenje(page)).toBeEnabled();
      await expect(resenje(page)).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Shift+R');
      await expect(p).toContainText('Rešenje prikazano');
      await expect(resenje(page)).toHaveAttribute('aria-pressed', 'true');

      // R bez Shift-a je i dalje ponavljanje, uz potvrdu (Caps Lock ne pali rešenje)
      await page.keyboard.press('r');
      const dijalog = page.getByRole('alertdialog', { name: 'Ponoviti zadatak?' });
      await expect(dijalog).toBeVisible();
      await dijalog.getByRole('button', { name: 'Odustani' }).click();
      await expect(dijalog).toHaveCount(0);
      expect(komande(mock).map(k => k.tip)).toEqual(['BROJ_VARIJANTI', 'OTVORI_ZATVORI', 'OTVORI_ZATVORI', 'RESENJE']);
    });

  test('Shift+R pre zatvaranja: razlog servera, rešenje ostaje isključeno', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/konzola');
    await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);

    // u konzoli i nedozvoljena komanda ide serveru: njegov razlog vidi nastavnik
    await page.keyboard.press('Shift+R');
    await expect(page.getByText('Prvo zatvori pitanje.')).toBeVisible();
    expect(komande(mock)).toEqual([{ tip: 'RESENJE', vrednost: null }]);
    await expect(resenje(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('daljinski: Zadatak slajd (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => budanEkranStub(page));

  test('red "Zadatak" ima Rešenje: onemogućeno dok je runda otvorena, posle zatvaranja prekidač', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    const broker = await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/daljinski');
    await expect(page.locator('.uz-dalj-veza')).toHaveText('Povezano');
    const red = page.getByRole('group', { name: 'Zadatak' });
    await expect(red.getByRole('button', { name: 'Zatvori' })).toBeVisible();
    await expect(red.getByRole('button', { name: 'Rešenje' })).toBeDisabled();

    // laptop zatvara rundu
    broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.primeni('OTVORI_ZATVORI').telo);
    const dugme = red.getByRole('button', { name: 'Rešenje' });
    await expect(dugme).toBeEnabled();
    await expect(dugme).toHaveAttribute('aria-pressed', 'false');
    await dugme.tap();
    await expect(dugme).toHaveAttribute('aria-pressed', 'true');
    expect(komande(mock)).toEqual([{ tip: 'RESENJE', vrednost: null }]);
  });
});

test.describe('publika: Zadatak slajd (projektor, 1280 x 800)', () => {
  /** Id-jevi slika rešenja varijanti 31 i 32 iz fikstura (zadatak je `...031` i `...032`). */
  const RESENJA = ['c0000000-0000-4000-8000-000000000131', 'c0000000-0000-4000-8000-000000000132'];

  /** Zahtevi pregledača ka slikama rešenja (mok ne beleži `api/public/mediji/*`, pa ih broji sam pregledač). */
  function pratiResenja(page: Page): string[] {
    const zahtevi: string[] = [];
    page.on('request', r => {
      if (RESENJA.some(id => r.url().includes(id))) zahtevi.push(r.url());
    });
    return zahtevi;
  }
  const scena = (page: Page) => page.locator('app-publika-scena');
  const kartice = (page: Page) => scena(page).locator('.uz-zr-kartica');
  /** Ana (varijanta 31, tačno 11) i Bojan (varijanta 32, netačno 49 umesto 50) odgovaraju u otvorenoj rundi. */
  function odgovori(mock: MockApi): void {
    mock.izvodjenje.odgovori(1, { a: '11' });
    mock.izvodjenje.odgovori(2, { a: '49' });
  }

  test('CEKA i OTVORENO: "Zadatak", grupa i uputstvo (nikad broj varijanti), Space samo "Odgovorilo x od y"; nikad slike ni imena', async ({ page, mock }) => {
    naZadatak(mock);
    expect(mock.izvodjenje.primeni('BROJ_VARIJANTI', 2).status).toBe(200);
    const resenja = pratiResenja(page);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await expect(scena(page).locator('.uz-slajd-naslov')).toHaveText('Zadatak');
    await expect(scena(page).locator('.uz-zad-grupa')).toHaveText('2 → 10');
    await expect(scena(page).locator('[data-zadatak]')).toHaveText('Zadatak stiže na telefone');
    await expect(scena(page).locator('app-zadatak-prikaz')).toHaveAttribute('data-faza', 'CEKA');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveCount(0);

    // nastavnik otvara rundu na drugom prozoru; stiže snimak sa dodelom i prvim odgovorom
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    mock.izvodjenje.odgovori(1, { a: '11' });
    broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.stanje());
    await expect(scena(page).locator('app-zadatak-prikaz')).toHaveAttribute('data-faza', 'OTVORENO');
    await expect(scena(page).locator('[data-zadatak]')).toHaveText('Svako ima svoj zadatak na telefonu');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveCount(0);
    // Space dok se odgovara: samo koliko je odgovorilo, bez kartica
    await page.keyboard.press(' ');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveText('Odgovorilo 1 od 2');
    await expect(kartice(page)).toHaveCount(0);
    await expect(scena(page).locator('[data-zadatak]')).toHaveText('Svako ima svoj zadatak na telefonu');
    await expect(scena(page).locator('img')).toHaveCount(0);
    await page.keyboard.press(' ');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveCount(0);
    await expect(scena(page)).not.toContainText(/Ana|Bojan/);
    expect(resenja).toEqual([]);
  });

  test('posle zatvaranja: Shift+R rešenja bez traka, C "tačno:", Space trake i brojevi; rešenje se ne traži unapred', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('BROJ_VARIJANTI', 2);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    odgovori(mock);
    const resenja = pratiResenja(page);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await expect(scena(page).locator('app-zadatak-prikaz')).toHaveAttribute('data-faza', 'OTVORENO');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveCount(0);

    await page.keyboard.press('o'); // zatvaranje
    await expect(scena(page).locator('app-zadatak-prikaz')).toHaveAttribute('data-faza', 'ZATVORENO');
    await expect(scena(page).locator('.uz-slajd-podnozje .uz-cip--zatvoreno')).toHaveText('Zatvoreno');
    // zatvorena runda, ništa uključeno: opis, bez slika
    await expect(scena(page).locator('[data-zadatak]')).toBeVisible();
    await expect(kartice(page)).toHaveCount(0);
    await expect(scena(page).locator('img')).toHaveCount(0);
    expect(resenja).toEqual([]);

    // 1. samo rešenje (bez Space): mreža sa slikom zadatka i rešenja, bez traka i brojeva, bez "tačno:"
    await page.keyboard.press('Shift+R');
    await expect(kartice(page)).toHaveCount(2);
    await expect(scena(page).locator('[data-zadatak]')).toHaveCount(0);
    await expect(kartice(page).first().getByRole('img', { name: 'Rešenje, varijanta 1011 u dekadni' })).toHaveAttribute(
      'src', 'api/public/mediji/' + RESENJA[0]);
    await expect(kartice(page).nth(1).getByRole('img', { name: 'Zadatak, varijanta 110010 u dekadni' })).toBeVisible();
    await expect(kartice(page).nth(1).getByRole('img', { name: 'Rešenje, varijanta 110010 u dekadni' })).toBeVisible();
    await expect(scena(page).locator('.uz-zr-red, .uz-zr-brojevi, .uz-rez-traka')).toHaveCount(0);
    await expect(scena(page)).not.toContainText('tačno:');
    await expect.poll(() => resenja.length).toBe(2);

    // 2. C: "tačno:" po polju, i dalje bez traka
    await page.keyboard.press('c');
    await expect(kartice(page).first().locator('.uz-zr-tacno')).toHaveText('✓ tačno: 11');
    await expect(kartice(page).nth(1).locator('.uz-zr-tacno')).toHaveText('✓ tačno: 50');
    await expect(scena(page).locator('.uz-zr-red, .uz-zr-brojevi')).toHaveCount(0);

    // 3. Space: brojevi dodeljeno · odgovorilo · tačno i trake vrednosti (tačna vrednost označena)
    await page.keyboard.press(' ');
    await expect(scena(page).locator('.uz-zad-odgovori')).toHaveText('Odgovorilo 2 od 2');
    await expect(kartice(page).first().locator('.uz-zr-brojevi')).toHaveText('dodeljeno 1 · odgovorilo 1 · tačno 1');
    await expect(kartice(page).nth(1).locator('.uz-zr-brojevi')).toHaveText('dodeljeno 1 · odgovorilo 1 · tačno 0');
    const prvi = kartice(page).first().locator('.uz-zr-red');
    await expect(prvi).toHaveCount(1);
    await expect(prvi).toContainText('11');
    await expect(prvi.locator('.uz-zr-red-broj')).toHaveText('1');
    await expect(prvi).toHaveClass(/uz-zr-red--tacna/);
    const drugi = kartice(page).nth(1).locator('.uz-zr-red');
    await expect(drugi).toContainText('49');
    await expect(drugi).not.toHaveClass(/uz-zr-red--tacna/);
    await expect(scena(page)).not.toContainText(/Ana|Bojan/);
  });

  test('samo C ili samo Space posle zatvaranja: kartice bez rešenja; Shift+R ponovo gasi rešenje', async ({ page, mock }) => {
    naZadatak(mock);
    mock.izvodjenje.primeni('BROJ_VARIJANTI', 2);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    odgovori(mock);
    mock.izvodjenje.primeni('OTVORI_ZATVORI');
    const resenja = pratiResenja(page);
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await expect(scena(page).locator('app-zadatak-prikaz')).toHaveAttribute('data-faza', 'ZATVORENO');

    await page.keyboard.press('c');
    await expect(kartice(page)).toHaveCount(2);
    await expect(kartice(page).first().locator('.uz-zr-tacno')).toHaveText('✓ tačno: 11');
    await expect(scena(page).locator('img[alt^="Rešenje"]')).toHaveCount(0);
    await expect(scena(page).locator('.uz-zr-brojevi')).toHaveCount(0);
    await page.keyboard.press('c');
    await expect(kartice(page)).toHaveCount(0);

    await page.keyboard.press(' ');
    await expect(kartice(page).first().locator('.uz-zr-brojevi')).toHaveText('dodeljeno 1 · odgovorilo 1');
    await expect(scena(page).locator('.uz-zr-tacno')).toHaveCount(0);
    await expect(scena(page).locator('.uz-zr-red--tacna')).toHaveCount(0);
    expect(resenja).toEqual([]);

    await page.keyboard.press('Shift+R');
    await expect(scena(page).locator('img[alt^="Rešenje"]')).toHaveCount(2);
    await page.keyboard.press('Shift+R');
    await expect(scena(page).locator('img[alt^="Rešenje"]')).toHaveCount(0);
    await expect(kartice(page)).toHaveCount(2);
  });
});
