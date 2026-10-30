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

/** Kalendar je otvoren i animacija je gotova (dok traje, Material ignoriše Escape). */
async function kalendarOtvoren(page: Page): Promise<void> {
  await expect(page.locator('mat-calendar .mat-calendar-body-active')).toBeFocused();
  // Material ignoriše Escape (`close()`) dok traje animacija otvaranja, a klasu `-animating` dodaje tek na `animationstart`:
  // na sporom runneru provera same klase prođe pre početka animacije i Escape se izgubi. Zato se čeka kraj animacije.
  const sadrzaj = page.locator('.mat-datepicker-content');
  await expect.poll(() => sadrzaj.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect(sadrzaj).not.toHaveClass(/mat-datepicker-content-animating/);
}

async function izaberi(page: Page, polje: ReturnType<Page['locator']>, opcija: string): Promise<void> {
  await polje.click();
  await page.getByRole('option', { name: opcija, exact: true }).click();
}

test.describe('raspored časova (nastavnik)', () => {
  test('bočna navigacija -> naredni termini -> „Uredi raspored“; „Kopiraj u novi“ nosi termine i prag, period se bira iznova', async ({ page, mock }) => {
    const { period } = mock.raspored.primer();
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Glavna navigacija' });
    await nav.getByRole('link', { name: 'Raspored' }).click();
    await expect(page).toHaveURL(/\/raspored\/termini$/);
    await expect(page).toHaveTitle('Naredni termini · GFS');
    await expect(nav.getByRole('link', { name: 'Raspored' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Uredi raspored' }).click();
    await expect(page).toHaveURL(/\/raspored\/periodi$/);
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
    await expect(page).toHaveURL(/\/raspored\/periodi$/);
    await expect(periodi(page)).toHaveCount(2);
    const poslato = mock.zahteviZa('rasporedi', 'POST').at(-1)!.telo as { stavke: { id: number | null }[]; pragNajava: number };
    expect(poslato.pragNajava).toBe(2);
    expect(poslato.stavke.map(s => s.id)).toEqual([null, null, null]);
  });

  test('nov raspored: provera na klijentu, poruka servera u traci, pa sačuvan', async ({ page, mock }) => {
    await page.goto('raspored/periodi');
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
    await expect(page).toHaveURL(/\/raspored\/periodi$/);
    await expect(periodi(page).first()).toContainText('2 termina');
    expect((mock.zahteviZa('rasporedi', 'POST').at(-1)!.telo as { stavke: unknown[] }).stavke).toEqual([
      { id: null, predmetId: 1, grupaId: 1, dan: 3, pocetak: '10:00', kraj: '13:00' },
      { id: null, predmetId: 1, grupaId: 1, dan: 5, pocetak: '10:00', kraj: '13:00' },
    ]);
  });

  test('kalendar i lista vremena: klik na polje otvara izbor, srpski zapis se kuca, zahtev nosi YYYY-MM-DD i HH:mm', async ({ page, mock }) => {
    await page.goto('raspored/novi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nov raspored');
    await page.locator('[data-naziv]').fill('Letnji 2031');
    // klik na polje (ne samo na ikonicu) otvara kalendar; mesec napred, pa dan 3
    await page.locator('[data-vazi-od]').click();
    const kalendar = page.locator('mat-calendar');
    await expect(kalendar).toBeVisible();
    await page.getByRole('button', { name: 'Sledeći mesec' }).click();
    await kalendar.locator('.mat-calendar-body-cell').filter({ hasText: /^\s*3\s*$/ }).click();
    await expect(kalendar).toHaveCount(0);
    await expect(page.locator('[data-vazi-od]')).toHaveValue(/^3\. \d{1,2}\. \d{4}\.$/);
    const [, mesec, godina] = (await page.locator('[data-vazi-od]').inputValue()).match(/\d+/g)!.map(Number);
    const dva = (n: number) => String(n).padStart(2, '0');
    const doDatuma = new Date(godina, mesec - 1 + 3, 28);
    // ikonica pored polja otvara isti kalendar (na mesecu „Važi od“); Escape ga zatvara
    await page.getByRole('button', { name: 'Otvori kalendar: važi do' }).click();
    await kalendarOtvoren(page);
    await expect(kalendar.locator('.mat-calendar-body-active')).toHaveText('3');
    await page.keyboard.press('Escape');
    await expect(kalendar).toHaveCount(0);
    // posle Escape-a iz kalendara otvorenog klikom na polje fokus je u polju, gde se kuca srpski zapis
    await page.locator('[data-vazi-do]').click();
    await kalendarOtvoren(page);
    await page.keyboard.press('Escape');
    await expect(kalendar).toHaveCount(0);
    await expect(page.locator('[data-vazi-do]')).toBeFocused();
    await page.keyboard.type(`28.${doDatuma.getMonth() + 1}.${doDatuma.getFullYear()}`);
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-vazi-do]')).toHaveValue(`28. ${doDatuma.getMonth() + 1}. ${doDatuma.getFullYear()}.`);

    const stavka = page.locator('[data-stavka]').first();
    await izaberi(page, stavka.locator('[data-dan]'), 'utorak');
    // prazno polje: labela leži preko polja, klik na nju je klik na polje i otvara listu vremena
    await stavka.getByText('Početak').click();
    await page.getByRole('option', { name: '10:15', exact: true }).click();
    await expect(stavka.locator('[data-pocetak]')).toHaveValue('10:15');
    await stavka.locator('[data-kraj]').focus();
    await page.keyboard.type('13.40');
    await page.keyboard.press('Tab');
    await expect(stavka.locator('[data-kraj]')).toHaveValue('13:40');
    await izaberi(page, stavka.locator('[data-predmet]'), 'Programiranje u građevinarstvu');
    await izaberi(page, stavka.locator('[data-grupa]'), 'GD-2025');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page).toHaveURL(/\/raspored\/periodi$/);
    const telo = mock.zahteviZa('rasporedi', 'POST').at(-1)!.telo as { vaziOd: string; vaziDo: string; stavke: unknown[] };
    expect(telo.vaziOd).toBe(`${godina}-${dva(mesec)}-03`);
    expect(telo.vaziDo).toBe(`${doDatuma.getFullYear()}-${dva(doDatuma.getMonth() + 1)}-28`);
    expect(telo.stavke).toEqual([{ id: null, predmetId: 1, grupaId: 1, dan: 2, pocetak: '10:15', kraj: '13:40' }]);
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
    const broj = red.locator('button[data-broj-najava]');
    await expect(broj.locator('[data-broj]')).toHaveText('3');
    await expect(broj).toContainText('iznad praga 2');
    await expect(broj).toHaveAttribute('aria-expanded', 'false');
    await broj.click();
    await expect(broj).toHaveAttribute('aria-expanded', 'true');
    await expect(red.getByRole('link', { name: 'Bojan Izmišljenović' })).toHaveAttribute('href', '/studenti/2');
    await expect(red).toContainText('takmičenje');
    await expect(red).toContainText('bolest');
    await expect(termin(page, 33, sutra)).toContainText('AR-2025');

    await red.getByRole('button', { name: /^Otkaži čas/ }).click();
    const dijalog = page.getByRole('dialog', { name: 'Otkazati čas?' });
    await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
    await expect(dijalog.getByRole('checkbox', { name: /^Obavesti studente mejlom i na telefon/ })).toBeChecked();
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
    const mejl = potvrda.getByRole('checkbox', { name: /^Obavesti studente mejlom i na telefon/ });
    await expect(mejl).toBeChecked();
    await mejl.uncheck();
    await potvrda.getByRole('button', { name: 'Vrati čas' }).click();
    await expect(page.getByText('Čas se ipak održava. Mejl i obaveštenje na telefon nisu slati.')).toBeVisible();
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
    await expect(page).toHaveURL(/\/raspored\/periodi$/);
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
