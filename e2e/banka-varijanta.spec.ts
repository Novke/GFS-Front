import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

/*
 * Editor varijante banke (`/banka/varijante/nova?grupa=` i `/banka/varijante/:id`) nad mokom `mock-banka.ts` (fixture
 * `banka.json`: grupa 2 "2 → 10" sa poljem BROJ `a`, predmet 1; varijanta 13 ima grešku rendera u liniji 3 teksta). Mok
 * renderuje uvek, osim kad tekst ili rešenje sadrži `\foo` (greška u liniji tog dela); render-proba stiže posle 800 ms mira,
 * a otvorena sačuvana varijanta je ne traži dok se ne izmeni (pregled iz sačuvanih SVG-ova).
 */

const editor = (page: Page, deo: 'tekst' | 'resenje') => page.locator(`app-latex-editor[data-deo="${deo}"] textarea`);
const istaknuta = (page: Page, deo: 'tekst' | 'resenje') => page.locator(`app-latex-editor[data-deo="${deo}"] .bk-le-istaknuta`);
const pregled = (page: Page, naslov: 'Zadatak' | 'Rešenje') => page.getByRole('img', { name: `Pregled: ${naslov}` });
const BEZ_ODGOVORA = { prihvatljivi: null, tacna: null, tacne: null };

test.describe('banka zadataka: editor varijante', () => {
  test('nova varijanta: LaTeX, živi pregled, odgovor, "Sačuvaj kao nacrt" i povratak u banku', async ({ page, mock }) => {
    await page.goto('banka/varijante/nova?grupa=2');
    await expect(page.getByRole('heading', { level: 1, name: 'Nova varijanta' })).toBeVisible();
    await expect(page.locator('[data-nedostaje]')).toContainText('tekst zadatka');
    const sacuvaj = page.getByRole('button', { name: 'Sačuvaj kao nacrt' });
    await expect(sacuvaj).toHaveAttribute('aria-disabled', 'true');

    await editor(page, 'tekst').fill('Pretvori $101101_2$ u dekadni.');
    await expect(pregled(page, 'Zadatak')).toContainText('Pretvori 101101_2 u dekadni.');
    expect(mock.zahteviZa('banka/render-proba', 'POST').map(z => z.telo)).toEqual([
      { predmetId: 1, tekst: 'Pretvori $101101_2$ u dekadni.', resenje: null, prilozi: [] },
    ]);
    await expect(page.locator('[data-nedostaje]')).toContainText('odgovor za polje „Vrednost u dekadnom sistemu“');

    await page.getByLabel('Tačan broj').fill('45');
    await expect(page.locator('app-odgovori-forma [data-bedz]')).toHaveText('Popunjeno');
    await sacuvaj.click();

    await expect.poll(() => mock.zahteviZa('banka/grupe/2/varijante', 'POST').map(z => z.telo)).toEqual([{
      naziv: null, tekst: 'Pretvori $101101_2$ u dekadni.', resenje: null, odgovori: { a: { broj: 45, ...BEZ_ODGOVORA } }, prilozi: [],
      izvor: 'RUCNO',
    }]);
    await expect(page).toHaveURL(/banka\?predmet=1&namena=PREDAVANJE&grupa=2$/);
    await expect(page.getByText('Varijanta je sačuvana kao nacrt.')).toBeVisible();
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(4);
    // "nova" je zamenjena u istoriji: Nazad ne otvara opet praznu formu
    await page.goBack();
    await expect(page).not.toHaveURL(/varijante\/nova/);
  });

  test('otvorena varijanta: pregled iz sačuvanog rendera, render-proba tek posle prve izmene', async ({ page, mock }) => {
    await page.goto('banka/varijante/12');
    await expect(pregled(page, 'Zadatak')).toContainText('Zadatak 12');
    await expect(pregled(page, 'Rešenje')).toContainText('Rešenje 12');
    await page.waitForTimeout(1000);
    expect(mock.zahteviZa('banka/render-proba', 'POST')).toHaveLength(0);

    await editor(page, 'tekst').fill('Pretvori $110011_2$ u dekadni.');
    await expect(pregled(page, 'Zadatak')).toContainText('Pretvori 110011_2 u dekadni.');
    expect(mock.zahteviZa('banka/render-proba', 'POST')).toHaveLength(1);
  });

  test('tekst sa \\foo: greška sa linijom u pregledu i u gutter-u; napuštanje sa izmenama pita', async ({ page }) => {
    await page.goto('banka/varijante/nova?grupa=2');
    await editor(page, 'tekst').fill('Prvi red\nDrugi \\foo red\nTreći red');
    const poruka = page.locator('#bk-ve-greska-tekst');
    await expect(poruka).toHaveText('Greška u liniji 2: Undefined control sequence \\foo');
    await expect(istaknuta(page, 'tekst')).toHaveText('2');
    await expect(editor(page, 'tekst')).toHaveAttribute('aria-invalid', 'true');
    await expect(editor(page, 'tekst')).toHaveAttribute('aria-describedby', /bk-ve-greska-tekst/);
    await expect(page.getByRole('tab', { name: /Tekst/ })).toContainText('greška');

    // ispravka: pregled stiže, istaknuta linija nestaje
    await editor(page, 'tekst').fill('Prvi red\nDrugi red\nTreći red');
    await expect(pregled(page, 'Zadatak')).toBeVisible();
    await expect(istaknuta(page, 'tekst')).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Putanja grupe' }).getByRole('link', { name: '2 → 10' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Napustiti stranicu?' });
    await expect(potvrda).toBeVisible();
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(page).toHaveURL(/banka\/varijante\/nova\?grupa=2$/);
    await expect(editor(page, 'tekst')).toHaveValue('Prvi red\nDrugi red\nTreći red');
  });

  test('nova varijanta, "Sačuvaj kao nacrt" sa neuspelim renderom: postaje izmena sa trakom i istaknutom linijom', async ({ page, mock }) => {
    await page.goto('banka/varijante/nova?grupa=2');
    await editor(page, 'tekst').fill('Prvi red\nDrugi \\foo red');
    await page.getByLabel('Tačan broj').fill('7');
    await page.getByRole('button', { name: 'Sačuvaj kao nacrt' }).click();

    await expect.poll(() => mock.zahteviZa('banka/grupe/2/varijante', 'POST').length).toBe(1);
    const nova = mock.podaci.bankaVarijante.at(-1)!;
    expect(nova).toMatchObject({ tekst: 'Prvi red\nDrugi \\foo red', status: 'NACRT', renderStatus: 'GRESKA' });
    await expect(page).toHaveURL(new RegExp(`banka/varijante/${nova.id}$`));
    const traka = page.locator('app-form-error-banner [role=alert]');
    await expect(traka).toHaveText('Varijanta je sačuvana kao nacrt, ali render nije uspeo (tekst, linija 2: Undefined control sequence \\foo).');
    await expect(traka).toBeFocused();
    await expect(page.getByRole('heading', { level: 1, name: `Zadatak ${nova.rb}` })).toBeVisible();
    await expect(istaknuta(page, 'tekst')).toHaveText('2');
    // stranica je sad izmena: "Renderuj ponovo" postoji, nema nesačuvanih izmena (veza u banku ne pita)
    await expect(page.getByRole('button', { name: 'Renderuj ponovo' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Putanja grupe' }).getByRole('link', { name: '2 → 10' }).click();
    await expect(page).toHaveURL(/banka\?predmet=1&namena=PREDAVANJE&grupa=2$/);
  });

  test('izmena varijante 13: otvara se sa istaknutom linijom greške; ispravka i "Sačuvaj i odobri"', async ({ page, mock }) => {
    await page.goto('banka/varijante/13');
    await expect(page.getByRole('heading', { level: 1, name: '100111 u dekadni' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Tekst/ })).toHaveAttribute('aria-selected', 'true');
    await expect(istaknuta(page, 'tekst')).toHaveText('3');
    await expect(page.locator('#bk-ve-greska-tekst')).toHaveText('Greška u liniji 3: Undefined control sequence \\foo');
    await expect(page.getByLabel('Tačan broj')).toHaveValue('39');

    await editor(page, 'tekst').fill('Pretvori binarni broj\n$100111_2$\nu dekadni.');
    await expect(pregled(page, 'Zadatak')).toBeVisible();
    await expect(istaknuta(page, 'tekst')).toHaveCount(0);
    await page.getByRole('button', { name: 'Sačuvaj i odobri' }).click();

    await expect.poll(() => mock.zahteviZa('banka/varijante/13', 'PUT').map(z => z.telo)).toEqual([{
      naziv: '100111 u dekadni', tekst: 'Pretvori binarni broj\n$100111_2$\nu dekadni.', resenje: null,
      odgovori: { a: { broj: 39, ...BEZ_ODGOVORA } }, prilozi: [],
    }]);
    await expect(page).toHaveURL(/banka\?predmet=1&namena=PREDAVANJE&grupa=2$/);
    expect(mock.zahteviZa('banka/varijante/13/odobri', 'POST')).toHaveLength(1);
    expect(mock.podaci.bankaVarijante.find(v => v.id === 13)!.status).toBe('AKTIVNA');
  });

  test('"Sačuvaj i odobri" kad render rešenja padne: ostaje na varijanti, kartica Rešenje sa istaknutom linijom', async ({ page, mock }) => {
    await page.goto('banka/varijante/11');
    await page.getByRole('tab', { name: 'Rešenje' }).click();
    await editor(page, 'resenje').fill('Cifre množimo stepenima dvojke:\n$8+2+1 = \\foo$');
    // greška je samo u rešenju: pregled zadatka ostaje (proba šalje i SVG zadatka)
    await expect(page.locator('#bk-ve-greska-resenje')).toHaveText('Greška u liniji 2: Undefined control sequence \\foo');
    await expect(pregled(page, 'Zadatak')).toContainText('Pretvori binarni broj 1011_2 u dekadni.');
    await page.getByRole('tab', { name: /Tekst/ }).click();
    await page.getByRole('button', { name: 'Sačuvaj i odobri' }).click();

    const traka = page.locator('app-form-error-banner [role=alert]');
    await expect(traka).toContainText('sačuvana kao nacrt, ali nije odobrena');
    await expect(traka).toContainText('rešenje, linija 2');
    await expect(traka).toBeFocused();
    await expect(page.getByRole('tab', { name: /Rešenje/ })).toHaveAttribute('aria-selected', 'true');
    await expect(istaknuta(page, 'resenje')).toHaveText('2');
    await expect(page).toHaveURL(/banka\/varijante\/11$/);
    expect(mock.zahteviZa('banka/varijante/11', 'PUT')).toHaveLength(1);
    expect(mock.zahteviZa('banka/varijante/11/odobri', 'POST')).toHaveLength(0);
    expect(mock.podaci.bankaVarijante.find(v => v.id === 11)!.renderStatus).toBe('GRESKA');
  });

  test('prilog: otpremanje, ime iz naziva fajla, "Ubaci u tekst" i prilog u probi i čuvanju', async ({ page, mock }) => {
    await page.goto('banka/varijante/nova?grupa=2');
    await editor(page, 'tekst').fill('Pročitaj vrednost sa grafa:\n');
    await page.locator('app-prilozi input[type=file]').setInputFiles({ name: 'Graf funkcije.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    const ime = page.locator('app-prilozi input[data-ime]');
    await expect(ime).toHaveValue('graf-funkcije');
    await expect(ime).toBeFocused();
    expect(mock.zahteviZa('banka/prilozi', 'POST')).toHaveLength(1);
    const medijId = mock.mediji.at(-1)!.id;

    await page.getByRole('button', { name: 'Ubaci u tekst' }).click();
    await expect(editor(page, 'tekst')).toHaveValue('Pročitaj vrednost sa grafa:\n\\includegraphics[width=\\linewidth]{graf-funkcije}');
    await expect(editor(page, 'tekst')).toBeFocused();
    await expect.poll(() => (mock.zahteviZa('banka/render-proba', 'POST').at(-1)?.telo as { tekst: string; prilozi: unknown })).toEqual({
      predmetId: 1, tekst: 'Pročitaj vrednost sa grafa:\n\\includegraphics[width=\\linewidth]{graf-funkcije}', resenje: null,
      prilozi: [{ ime: 'graf-funkcije', medijId }],
    });

    await page.getByLabel('Tačan broj').fill('2,5');
    await page.getByRole('button', { name: 'Sačuvaj kao nacrt' }).click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/2/varijante', 'POST').map(z => z.telo)).toEqual([{
      naziv: null, tekst: 'Pročitaj vrednost sa grafa:\n\\includegraphics[width=\\linewidth]{graf-funkcije}', resenje: null,
      odgovori: { a: { broj: 2.5, ...BEZ_ODGOVORA } }, prilozi: [{ ime: 'graf-funkcije', medijId }], izvor: 'RUCNO',
    }]);
    await expect(page).toHaveURL(/banka\?predmet=1&namena=PREDAVANJE&grupa=2$/);
  });
});
