import type { Locator, Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';

/*
 * Banka zadataka (`/banka`) nad mokom `mock-banka.ts` (fixture `banka.json`: predmet 1, PREDAVANJE "Konverzije brojeva" ->
 * "2 → 10" (varijante 11 NACRT, 12 AKTIVNA, 13 NACRT sa greškom) i "16 → 2" (14 AKTIVNA); TEST je prazno).
 */

const stablo = (page: Page) => page.getByRole('tree', { name: 'Grupe zadataka' });
/** Stavka stabla po nazivu (ime stavke je "naziv, brojači"). */
const stavka = (page: Page, naziv: string) =>
  stablo(page).getByRole('treeitem', { name: new RegExp(`^${naziv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`) });
/** Red stavke (bez ugnježdenih podgrupa), za klik. */
const red = (s: Locator) => s.locator(':scope > .bk-red');

async function dijalog(page: Page, naslov: string | RegExp): Promise<Locator> {
  const d = page.getByRole('dialog', { name: naslov });
  await expect(d).toBeVisible();
  await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
  return d;
}

test.describe('banka zadataka', () => {
  test('stablo iz fixture-a; klik na list pokazuje kartice, filter "Nacrt" i Odobri', async ({ page, mock }) => {
    await page.goto('banka?predmet=1&grupa=1');
    await expect(stablo(page).getByRole('treeitem')).toHaveCount(3);
    await expect(stavka(page, 'Konverzije brojeva')).toHaveAttribute('aria-expanded', 'true');
    await expect(stavka(page, 'Konverzije brojeva')).toHaveAttribute('aria-selected', 'true');
    await expect(stavka(page, '2 → 10')).toHaveAccessibleName('2 → 10, 1 aktivna, 2 nacrta, 1 greška');
    // unutrašnji čvor: zbir podstabla, bez kartica
    await expect(page.locator('[data-zbir]')).toContainText('4');
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(0);

    await red(stavka(page, '2 → 10')).click();
    await expect(page).toHaveURL(/grupa=2(&|$)/);
    const kartice = page.locator('app-varijanta-kartica');
    await expect(kartice).toHaveCount(3);
    await expect(page.getByRole('img', { name: 'Zadatak 1011 u dekadni' })).toBeVisible();
    await expect(kartice.filter({ hasText: '100111 u dekadni' })).toContainText('Greška u LaTeX-u');

    await page.getByRole('button', { name: 'Status' }).click();
    await page.getByRole('menuitemradio', { name: 'Nacrt' }).click();
    await expect(kartice).toHaveCount(2);

    await page.getByRole('button', { name: 'Radnje za varijantu 1011 u dekadni' }).click();
    await page.getByRole('menuitem', { name: 'Odobri' }).click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/11/odobri', 'POST').length).toBe(1);
    // posle ponovnog učitavanja: 11 je aktivna (filter "Nacrt" je skriva), brojači u stablu prate
    await expect(kartice).toHaveCount(1);
    // kartica 11 je nestala zajedno sa svojim dugmetom menija: fokus je na kartici koja je došla na njeno mesto
    await expect(page.getByRole('link', { name: '3. 100111 u dekadni' })).toBeFocused();
    await expect(stavka(page, '2 → 10')).toHaveAccessibleName('2 → 10, 2 aktivne, 1 nacrt, 1 greška');
  });

  test('"Dodaj podgrupu" na korenu otvara dijalog i zove POST banka/grupe; nova grupa je izabrana', async ({ page, mock }) => {
    await page.goto('banka?predmet=1');
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);

    await page.getByRole('button', { name: 'Radnje za grupu Konverzije brojeva' }).click();
    await page.getByRole('menuitem', { name: 'Dodaj podgrupu' }).click();
    const d = await dijalog(page, 'Nova podgrupa u „Konverzije brojeva“');
    await d.getByLabel('Naziv').fill('8 → 2');
    await d.getByRole('combobox', { name: 'Težina' }).click();
    await page.getByRole('option', { name: '2', exact: true }).click();
    await d.getByRole('button', { name: 'Napravi grupu' }).click();
    await expect(d).toBeHidden();

    await expect.poll(() => mock.zahteviZa('banka/grupe', 'POST').map(z => z.telo)).toEqual([
      { roditeljId: 1, naziv: '8 → 2', tezina: 2, opis: null, uputstvo: null, polja: null },
    ]);
    await expect(stavka(page, '8 → 2')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { level: 2, name: '8 → 2' })).toBeVisible();
    await expect(page.getByText('Grupa još nema varijanti')).toBeVisible();
    const id = mock.podaci.bankaGrupe.find(g => g.naziv === '8 → 2')!.id;
    await expect(page).toHaveURL(new RegExp(`grupa=${id}(&|$)`));
    await expect(page.getByRole('link', { name: 'Nova varijanta' })).toHaveAttribute('href', `/banka/varijante/nova?grupa=${id}`);
  });

  test('F2 preimenuje grupu u stablu: PUT nosi postojeći opis, težinu i uputstvo i "polja": null', async ({ page, mock }) => {
    await page.goto('banka?predmet=1');
    await red(stavka(page, '16 → 2')).click();
    await expect(page.getByRole('heading', { level: 2, name: '16 → 2' })).toBeVisible();
    await expect(stavka(page, '16 → 2')).toBeFocused();

    await page.keyboard.press('F2');
    const polje = page.getByRole('textbox', { name: 'Nov naziv grupe 16 → 2' });
    await expect(polje).toBeFocused();
    await expect(polje).toHaveValue('16 → 2');
    await polje.fill('Heksadekadno u binarno');
    await polje.press('Enter');

    await expect.poll(() => mock.zahteviZa('banka/grupe/3', 'PUT').map(z => z.telo)).toEqual([
      { naziv: 'Heksadekadno u binarno', tezina: 3, opis: null, uputstvo: null, polja: null },
    ]);
    await expect(stavka(page, 'Heksadekadno u binarno')).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Heksadekadno u binarno' })).toBeVisible();
  });

  test('tastatura u stablu: strelice, sklapanje i Enter', async ({ page }) => {
    await page.goto('banka?predmet=1');
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);
    await stavka(page, '2 → 10').focus();
    await page.keyboard.press('ArrowDown');
    await expect(stavka(page, '16 → 2')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(stavka(page, 'Konverzije brojeva')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(stavka(page, 'Konverzije brojeva')).toHaveAttribute('aria-expanded', 'false');
    await expect(stablo(page).getByRole('treeitem')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(stavka(page, '2 → 10')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: '16 → 2' })).toBeVisible();
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(1);
  });

  test('list bez težine: "Nova varijanta" onemogućena; "Zadaj težinu" šalje težinu', async ({ page, mock }) => {
    mock.podaci.bankaGrupe.push({
      id: 9, predmetId: 1, roditeljId: null, namena: 'PREDAVANJE', naziv: 'Osnove', opis: 'Uvodni zadaci.', rb: 2, tezina: null,
      uputstvo: null, polja: [], izmenjeno: '2026-10-15T09:00:00',
    });
    await page.goto('banka?predmet=1&grupa=9');
    const nova = page.getByRole('button', { name: 'Nova varijanta' });
    await expect(nova).toHaveAttribute('aria-disabled', 'true');
    await expect(nova).toHaveAccessibleDescription('Prvo zadaj težinu grupe');
    await nova.hover();
    await expect(page.locator('.mat-mdc-tooltip')).toHaveText('Prvo zadaj težinu grupe');

    await page.getByRole('button', { name: 'Zadaj težinu' }).click();
    const d = await dijalog(page, 'Izmeni grupu');
    await d.getByRole('combobox', { name: 'Težina' }).click();
    await page.getByRole('option', { name: '4', exact: true }).click();
    await d.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/9', 'PUT').map(z => z.telo)).toEqual([
      { naziv: 'Osnove', tezina: 4, opis: 'Uvodni zadaci.', uputstvo: null, polja: null },
    ]);
    const link = page.getByRole('link', { name: 'Nova varijanta' });
    await expect(link).toHaveAttribute('href', '/banka/varijante/nova?grupa=9');
    await expect(link).toBeFocused();
  });

  test('Testovi: prazno stablo sa pozivom na prvu grupu; izbor se pamti', async ({ page, mock }) => {
    await page.goto('banka?predmet=1');
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);
    await page.getByRole('radio', { name: 'Testovi' }).click();
    await expect(page).toHaveURL(/namena=TEST/);
    await expect(page.getByRole('heading', { name: 'Nema grupa: napravi prvu' })).toBeVisible();
    expect(mock.zahteviZa('banka/stablo').at(-1)!.query.get('namena')).toBe('TEST');

    // bez parametara: zapamćen predmet i namena
    await page.goto('banka');
    await expect(page).toHaveURL(/predmet=1&namena=TEST/);
    await expect(page.getByRole('heading', { name: 'Nema grupa: napravi prvu' })).toBeVisible();
  });

  test('Podešavanja LaTeX-a: čuva preambulu i renderuje sve varijante predmeta', async ({ page, mock }) => {
    await page.goto('banka?predmet=1');
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);
    await page.getByRole('button', { name: 'Podešavanja LaTeX-a' }).click();
    const d = await dijalog(page, /Podešavanja LaTeX-a/);
    const polje = d.getByRole('textbox', { name: 'Preambula' });
    await expect(polje).toHaveValue(/\\usepackage\{amsmath\}/);
    await expect(d).toContainText('podrazumevanu preambulu');
    await polje.fill('\\usepackage{tikz}\n\\newcommand{\\R}{\\mathbb{R}}');
    await d.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(d).toBeHidden();

    expect(mock.zahteviZa('predmeti/1/latex-preambula', 'PUT').map(z => z.telo)).toEqual([
      { preambula: '\\usepackage{tikz}\n\\newcommand{\\R}{\\mathbb{R}}' },
    ]);
    expect(mock.zahteviZa('banka/predmeti/1/renderuj-sve', 'POST')).toHaveLength(1);
    await expect(page.getByText('Preambula je sačuvana. Renderovano varijanti: 4.')).toBeVisible();
  });

  test('brisanje varijante traži potvrdu', async ({ page, mock }) => {
    await page.goto('banka?predmet=1');
    await page.getByRole('button', { name: 'Radnje za varijantu 110010 u dekadni' }).click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Obrisati varijantu „110010 u dekadni“?' });
    await expect(potvrda).toBeVisible();
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(potvrda).toBeHidden();
    expect(mock.zahteviZa('banka/varijante/12', 'DELETE')).toHaveLength(0);

    await page.getByRole('button', { name: 'Radnje za varijantu 110010 u dekadni' }).click();
    await page.getByRole('menuitem', { name: 'Obriši' }).click();
    await potvrda.getByRole('button', { name: 'Obriši varijantu' }).click();
    await expect.poll(() => mock.zahteviZa('banka/varijante/12', 'DELETE').length).toBe(1);
    await expect(page.locator('app-varijanta-kartica')).toHaveCount(2);
  });
});

/** Polje šeme po rednom broju (fieldset "Polje N ključ k" u editoru polja). */
const poljeSeme = (page: Page, n: number) => page.getByRole('group', { name: new RegExp(`^Polje ${n}\\b`) });

test.describe('banka zadataka: detalj grupe', () => {
  test('izmena oznake polja šalje PUT sa celom šemom; samo preimenovanje šalje "polja": null', async ({ page, mock }) => {
    await page.goto('banka?predmet=1&grupa=2');
    await page.getByRole('link', { name: 'Šema i uputstvo' }).click();
    await expect(page).toHaveURL(/banka\/grupe\/2$/);
    await expect(page.getByRole('heading', { level: 1, name: '2 → 10' })).toBeVisible();
    const sacuvaj = page.getByRole('button', { name: 'Sačuvaj' });
    await expect(sacuvaj).toHaveAttribute('aria-disabled', 'true');

    await poljeSeme(page, 1).getByLabel('Oznaka', { exact: true }).fill('Dekadna vrednost');
    await sacuvaj.click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/2', 'PUT').map(z => z.telo)).toEqual([{
      naziv: '2 → 10', opis: 'Binarni broj u dekadni.', tezina: 2, uputstvo: 'Kratki zadaci sa jednim binarnim brojem do 8 cifara.',
      polja: [{
        kljuc: 'a', oznaka: 'Dekadna vrednost', tip: 'BROJ', odstupanje: 0, odstupanjeTip: 'APSOLUTNO', jedinica: null,
        zanemariVelicinu: true, zanemariRazmake: true, opcije: null,
      }],
    }]);
    await expect(page.getByText('Grupa je sačuvana.')).toBeVisible();
    // posle čuvanja nema izmena: dugme je onemogućeno, a fokus ostaje na njemu
    await expect(sacuvaj).toHaveAttribute('aria-disabled', 'true');
    await expect(sacuvaj).toBeFocused();

    await page.getByLabel('Naziv', { exact: true }).fill('Binarno u dekadno');
    await page.keyboard.press('Enter');
    await expect.poll(() => mock.zahteviZa('banka/grupe/2', 'PUT').at(-1)?.telo).toEqual({
      naziv: 'Binarno u dekadno', opis: 'Binarni broj u dekadni.', tezina: 2,
      uputstvo: 'Kratki zadaci sa jednim binarnim brojem do 8 cifara.', polja: null,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Binarno u dekadno' })).toBeVisible();
    expect(mock.podaci.bankaGrupe.find(g => g.id === 2)!.polja[0].oznaka).toBe('Dekadna vrednost');
  });

  test('dodato polje uz aktivne varijante: upozorenje pre čuvanja, posle čuvanja aktivna je nacrt i tip se otključava', async ({ page, mock }) => {
    await page.goto('banka/grupe/2');
    await expect(page.locator('app-varijanta-kartica[data-varijanta="12"]')).toContainText('Aktivna');
    const tipA = poljeSeme(page, 1).getByRole('combobox', { name: 'Tip' });
    await expect(tipA).toHaveAttribute('aria-disabled', 'true');
    await expect(poljeSeme(page, 1)).toContainText('Grupa ima aktivne varijante: tip polja se ne menja');

    await page.getByRole('button', { name: 'Dodaj polje' }).click();
    await expect(page.locator('[data-posledice]')).toContainText('Aktivne varijante će postati nacrti dok ne dobiju odgovor za novo polje.');
    await expect(page.locator('[data-greska-polja]')).toHaveText('Oznaka polja mora imati 1 do 200 znakova.');
    const oznakaB = poljeSeme(page, 2).getByLabel('Oznaka', { exact: true });
    await expect(oznakaB).toBeFocused();
    await page.keyboard.type('Zapis bez vodećih nula');
    await expect(page.locator('[data-greska-polja]')).toHaveCount(0);
    await poljeSeme(page, 2).getByRole('combobox', { name: 'Tip' }).click();
    await page.getByRole('option', { name: 'Tekst' }).click();

    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/2', 'PUT').map(z => (z.telo as { polja: { kljuc: string; tip: string }[] }).polja
      .map(p => `${p.kljuc}:${p.tip}`))).toEqual([['a:BROJ', 'b:TEKST']]);
    // mok kao server: aktivnoj varijanti fali odgovor za "b", pa je nacrt; bez aktivnih tip polja "a" više nije zaključan
    await expect(page.locator('app-varijanta-kartica[data-varijanta="12"]')).toContainText('Nacrt');
    await expect(tipA).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('[data-posledice]')).toBeEmpty();
  });

  test('greška servera ide u traku iznad forme i dobija fokus', async ({ page, mock }) => {
    await page.goto('banka/grupe/2');
    await page.getByLabel('Naziv', { exact: true }).fill('16 → 2');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    const traka = page.locator('app-form-error-banner [role=alert]');
    await expect(traka).toHaveText('Grupa sa tim nazivom već postoji.');
    await expect(traka).toBeFocused();
    expect(mock.podaci.bankaGrupe.find(g => g.id === 2)!.naziv).toBe('2 → 10');
  });

  test('napuštanje sa nesačuvanim izmenama traži potvrdu; putanja vodi nazad u banku na tu grupu', async ({ page }) => {
    await page.goto('banka/grupe/2');
    await page.getByLabel('Opis (opciono)').fill('Novi opis');
    await page.getByRole('navigation', { name: 'Putanja grupe' }).getByRole('link', { name: 'Konverzije brojeva' }).click();
    const potvrda = page.getByRole('alertdialog', { name: 'Napustiti stranicu?' });
    await expect(potvrda).toBeVisible();
    await potvrda.getByRole('button', { name: 'Odustani' }).click();
    await expect(potvrda).toBeHidden();
    await expect(page).toHaveURL(/banka\/grupe\/2$/);
    await expect(page.getByLabel('Opis (opciono)')).toHaveValue('Novi opis');

    await page.getByRole('navigation', { name: 'Putanja grupe' }).getByRole('link', { name: 'Konverzije brojeva' }).click();
    await potvrda.getByRole('button', { name: 'Napusti' }).click();
    await expect(page).toHaveURL(/banka\?predmet=1&namena=PREDAVANJE&grupa=1$/);
    await expect(stavka(page, 'Konverzije brojeva')).toHaveAttribute('aria-selected', 'true');
  });

  test('unutrašnji čvor: samo naziv i opis; PUT zadržava težinu i uputstvo', async ({ page, mock }) => {
    await page.goto('banka/grupe/1');
    await expect(page.getByRole('heading', { level: 1, name: 'Konverzije brojeva' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Težina' })).toHaveCount(0);
    await expect(page.locator('app-polja-editor')).toHaveCount(0);
    await expect(page.locator('textarea[data-uputstvo]')).toHaveCount(0);
    await page.getByLabel('Opis (opciono)').fill('Sve konverzije.');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect.poll(() => mock.zahteviZa('banka/grupe/1', 'PUT').map(z => z.telo)).toEqual([
      { naziv: 'Konverzije brojeva', opis: 'Sve konverzije.', tezina: null, uputstvo: null, polja: null },
    ]);
  });
});

