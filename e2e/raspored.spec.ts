import type { Page } from '@playwright/test';

import { danIDatum } from '../src/app/shared/util/termin';
import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';
import { pomeriDan } from './mock-raspored';

/*
 * Raspored časova i termini (nastavnik; spec najave odsustva, odeljci 3, 6, 7 i 8): periodi, „Kopiraj u novi“, nov
 * raspored kroz formu, naredni termini sa najavama (imena i razlozi samo ovde), otkazivanje i vraćanje termina,
 * obaveštenje „Mnogo najava odsustva“ u zvonu i Početna (hero iz rasporeda, kartica „Raspored, narednih 7 dana“).
 * Mok: `e2e/mock-raspored.ts` (`primer()`: period oko današnjeg dana, prag 2; stavke 31 i 33 sutra, 32 prekosutra).
 */

const periodi = (page: Page) => page.locator('[data-raspored]');
const termin = (page: Page, stavka: number, datum: string) => page.locator(`[data-termin="${stavka}:${datum}"]`);

async function izaberi(page: Page, polje: ReturnType<Page['locator']>, opcija: string): Promise<void> {
  await polje.click();
  await page.getByRole('option', { name: opcija, exact: true }).click();
}

test.describe('raspored časova (nastavnik)', () => {
  test('bočna navigacija -> lista perioda; „Kopiraj u novi“ nosi termine i prag, period se bira iznova', async ({ page, mock }) => {
    const { period } = mock.raspored.primer();
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });
    await nav.getByRole('link', { name: 'Raspored' }).click();
    await expect(page).toHaveURL(/\/raspored$/);
    await expect(page).toHaveTitle('Raspored časova · GFS');
    await expect(periodi(page)).toHaveCount(1);
    await expect(periodi(page).first()).toContainText('Zimski semestar (primer)');
    await expect(periodi(page).first()).toContainText('3 termina · prag najava 2');
    await expect(periodi(page).first()).toContainText('Važi danas');

    await periodi(page).first().getByRole('link', { name: /^Kopiraj u novi/ }).click();
    await expect(page).toHaveURL(/\/raspored\/novi\?kopija=3$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nov raspored (kopija)');
    await expect(page.locator('[data-naziv]')).toHaveValue('Zimski semestar (primer) (kopija)');
    await expect(page.locator('[data-vazi-od]')).toHaveValue('');
    await expect(page.locator('[data-stavka]')).toHaveCount(3);
    await expect(page.locator('[data-prag]')).toHaveValue('2');

    await page.locator('[data-naziv]').fill('Letnji semestar');
    // isti termini u periodu koji se preklapa sa originalom: server odbija, poruka ide u traku
    await page.locator('[data-vazi-od]').fill(period.vaziOd);
    await page.locator('[data-vazi-do]').fill(period.vaziDo);
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Termin 1 već postoji u rasporedu „Zimski semestar (primer)“' })).toBeVisible();
    await expect(periodi(page)).toHaveCount(0);
    await page.locator('[data-vazi-od]').fill('2031-02-20');
    await page.locator('[data-vazi-do]').fill('2031-06-10');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page).toHaveURL(/\/raspored$/);
    await expect(periodi(page)).toHaveCount(2);
    const poslato = mock.zahteviZa('rasporedi', 'POST').at(-1)!.telo as { stavke: { id: number | null }[]; pragNajava: number };
    expect(poslato.pragNajava).toBe(2);
    expect(poslato.stavke.map(s => s.id)).toEqual([null, null, null]);
  });

  test('nov raspored: provera na klijentu, poruka servera u traci, pa sačuvan', async ({ page, mock }) => {
    await page.goto('raspored');
    await expect(page.getByText('Nema rasporeda')).toBeVisible();
    await page.locator('[data-novi]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nov raspored');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByText('Proveri označena polja.')).toBeVisible();
    expect(mock.zahteviZa('rasporedi', 'POST')).toHaveLength(0);

    await page.locator('[data-naziv]').fill('Zimski 2030/31');
    await page.locator('[data-vazi-od]').fill('2030-10-01');
    await page.locator('[data-vazi-do]').fill('2031-01-31');
    const stavka = page.locator('[data-stavka]').first();
    await izaberi(page, stavka.locator('[data-dan]'), 'sreda');
    await stavka.locator('[data-pocetak]').fill('10:00');
    await stavka.locator('[data-kraj]').fill('13:00');
    await izaberi(page, stavka.locator('[data-predmet]'), 'Programiranje u građevinarstvu');
    await izaberi(page, stavka.locator('[data-grupa]'), 'GD-2025');
    // drugi termin nasleđuje sve osim dana; isti dan = duplikat, server ga odbija porukom koja ide u traku
    await page.getByRole('button', { name: 'Dodaj termin' }).click();
    await izaberi(page, page.locator('[data-stavka]').nth(1).locator('[data-dan]'), 'sreda');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Termin 2 se ponavlja' })).toBeVisible();
    await izaberi(page, page.locator('[data-stavka]').nth(1).locator('[data-dan]'), 'petak');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page).toHaveURL(/\/raspored$/);
    await expect(periodi(page).first()).toContainText('2 termina');
    expect((mock.zahteviZa('rasporedi', 'POST').at(-1)!.telo as { stavke: unknown[] }).stavke).toEqual([
      { id: null, predmetId: 1, grupaId: 1, dan: 3, pocetak: '10:00', kraj: '13:00' },
      { id: null, predmetId: 1, grupaId: 1, dan: 5, pocetak: '10:00', kraj: '13:00' },
    ]);
  });

  test('naredni termini: ko ne dolazi i zašto; otkazivanje sa napomenom rešava obaveštenje; vraćanje uz potvrdu', async ({ page, mock }) => {
    const { sutra } = mock.raspored.primer();
    mock.raspored.najavaDrugog(2, 31, sutra, 'takmičenje');
    mock.raspored.najavaDrugog(3, 31, sutra);
    mock.raspored.najavaDrugog(4, 31, sutra, 'bolest'); // 3 > prag 2: obaveštenje
    expect(mock.podaci.obavestenja.filter(o => o.vrsta === 'MNOGO_NAJAVA')).toHaveLength(1);

    await page.goto('raspored/termini');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Naredni termini');
    const red = termin(page, 31, sutra);
    await expect(red).toContainText('10:00–13:00');
    await expect(red.locator('[data-broj-najava]')).toHaveText(/Ne dolazi: 3/);
    await red.getByText('Ko ne dolazi (3)').click();
    await expect(red.getByRole('link', { name: 'Bojan Izmišljenović' })).toHaveAttribute('href', '/studenti/2');
    await expect(red).toContainText('takmičenje');
    await expect(red).toContainText('bolest');
    await expect(termin(page, 33, sutra)).toContainText('AR-2025');

    await red.getByRole('button', { name: /^Otkaži čas/ }).click();
    const dijalog = page.getByRole('dialog', { name: 'Otkazati čas?' });
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await expect(dijalog.getByRole('checkbox', { name: /^Pošalji mejl studentima/ })).toBeChecked();
    await dijalog.getByLabel('Napomena za studente (nije obavezno)').fill('sednica veća');
    await dijalog.getByRole('button', { name: 'Otkaži čas' }).click();
    await expect(page.getByText('Čas je otkazan. Mejl je poslat: 6 studenata.')).toBeVisible();
    await expect(red).toContainText('Otkazano');
    await expect(red).toContainText('Napomena: sednica veća');
    expect(mock.zahteviZa('rasporedi/termini/otkazi', 'POST').map(z => z.telo)).toEqual([
      { stavkaId: 31, datum: sutra, napomena: 'sednica veća', posaljiMejl: true },
    ]);
    expect(mock.podaci.obavestenja.find(o => o.vrsta === 'MNOGO_NAJAVA')!.reseno).not.toBeNull();

    await red.getByRole('button', { name: /^Vrati čas/ }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Vratiti čas?' });
    // bez mejla: nastavnik isključi kvačicu (npr. već je javio na času)
    const mejl = potvrda.getByRole('checkbox', { name: /^Pošalji mejl studentima/ });
    await expect(mejl).toBeChecked();
    await mejl.uncheck();
    await potvrda.getByRole('button', { name: 'Vrati čas' }).click();
    await expect(page.getByText('Čas se ipak održava. Mejl studentima nije slat.')).toBeVisible();
    await expect(red.getByRole('button', { name: /^Otkaži čas/ })).toBeVisible();
    expect(mock.zahteviZa('rasporedi/termini/vrati', 'POST').map(z => z.telo)).toEqual([{ stavkaId: 31, datum: sutra, posaljiMejl: false }]);

    // „Kasnije“ pomera prozor za 4 nedelje, „Od danas“ vraća
    await page.getByRole('button', { name: 'Kasnije' }).click();
    await expect(page).toHaveURL(new RegExp(`od=${pomeriDan(pomeriDan(sutra, -1), 28)}$`));
    await page.getByRole('button', { name: 'Od danas' }).click();
    await expect(page).toHaveURL(/\/raspored\/termini$/);
  });

  test('izmena perioda koja ukida otkazan čas: upozorenje pre čuvanja, broj ukinutih posle', async ({ page, mock }) => {
    const { sutra } = mock.raspored.primer();
    mock.raspored.otkazani.set(`31:${sutra}`, 'sednica veća');
    await page.goto('raspored/3');
    await expect(page.locator('[data-stavka]')).toHaveCount(3);
    await expect(page.locator('[data-izgubljena-otkazivanja]')).toHaveCount(0);
    // period se skraćuje na danas: sutrašnji otkazan čas više nije u periodu
    await page.locator('[data-vazi-do]').fill(pomeriDan(sutra, -1));
    const upozorenje = page.locator('[data-izgubljena-otkazivanja]');
    await expect(upozorenje).toContainText('Čuvanje ukida jedan otkazan čas');
    await expect(upozorenje).toContainText(`Programiranje u građevinarstvu · GD-2025 · ${danIDatum(sutra)}`);
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByText('Raspored je sačuvan. Ukinuto otkazanih časova: 1.')).toBeVisible();
    await expect(page).toHaveURL(/\/raspored$/);
    expect(mock.raspored.otkazani.has(`31:${sutra}`)).toBe(false);
  });

  test('zvono: „Mnogo najava odsustva“ bez imena vodi na termine od dana termina', async ({ page, mock }) => {
    mock.podaci.obavestenja = [];
    const { sutra } = mock.raspored.primer();
    [2, 3, 4].forEach(id => mock.raspored.najavaDrugog(id, 31, sutra, 'lično'));
    await page.goto('./');
    await page.locator('app-obavestenja-meni button').click();
    const stavka = page.locator('mat-dialog-container [data-obavestenje]').first();
    await expect(stavka).toContainText(`Mnogo najava odsustva: Programiranje u građevinarstvu · GD-2025 · ${danIDatum(sutra)} (3)`);
    await expect(stavka).not.toContainText('lično');
    await expect(stavka).not.toContainText('Izmišljenović');
    await stavka.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/raspored/termini\\?od=${sutra}$`));
    await expect(termin(page, 31, sutra)).toBeVisible();
  });

  test('Početna: predlog iz rasporeda (danas nema časa -> sledeći) i kartica narednih 7 dana', async ({ page, mock }) => {
    const { sutra } = mock.raspored.primer();
    mock.raspored.najavaDrugog(2, 31, sutra);
    await page.goto('./');
    const hero = page.locator('app-sledece-predavanje');
    // primer nema današnji čas (stavke su sutra i prekosutra), pa je predlog sutrašnji termin
    await expect(hero.locator('[data-eyebrow]')).toHaveText('Danas nema časa po rasporedu');
    await expect(hero.locator('[data-termin]')).toHaveText(`Sledeći: ${danIDatum(sutra)}, 10:00–13:00`);
    await expect(hero.locator('[data-najave]')).toHaveText('najavljeno odsustvo: 1');
    await expect(hero.getByRole('button', { name: 'Ipak započni danas' })).toBeVisible();

    const kartica = page.getByRole('region', { name: 'Raspored, narednih 7 dana' });
    await expect(kartica.locator(`[data-termin="31:${sutra}"]`)).toContainText('ne dolazi: 1');
    await kartica.locator(`[data-termin="31:${sutra}"] [data-najave]`).click();
    await expect(page).toHaveURL(new RegExp(`/raspored/termini\\?od=${sutra}$`));
  });

  test('bez rasporeda Početna je kao ranije (nema kartice ni oznake iz rasporeda)', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Čeka na tebe' })).toBeVisible();
    await expect(page.locator('app-sledece-predavanje [data-eyebrow]')).toHaveText('Sledeće predavanje');
    await expect(page.locator('[data-raspored-kartica]')).toHaveCount(0);
  });
});
