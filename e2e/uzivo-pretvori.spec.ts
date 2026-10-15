import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';

/*
 * "Pretvori u platno" (faza 5c, odluke 20-21; mok API): INFO slajd postaje PLATNO jednom izmenom (`PUT slajdovi/<id>`),
 * "Poništi" u snackbar-u vraća INFO drugom. Ishod se čita iz tela poslednjeg `PUT`-a (server dobija ono što editor
 * pokazuje). Prezentacija 5 iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO, izabran pri učitavanju.
 */
const PREZENTACIJA = 5;
const INFO_SLAJD = 51;

interface Deo { tekst: string }
interface Sloj { id: string; tip: string; pasusi?: { delovi: Deo[] }[] }
interface Animacija { slojId: string; pasus: number | null; okidac: string }
interface SlajdCmd {
  tip: string; naslov: string | null; sadrzaj: string | null; postepeno: boolean;
  platno: { slojevi: Sloj[]; animacije: Animacija[] } | null;
}

const putovi = (mock: MockApi) => mock.zahteviZa(`slajdovi/${INFO_SLAJD}`, 'PUT');
/** Telo poslednjeg `PUT`-a slajda (undefined dok ga nema). */
const poslednji = (mock: MockApi) => putovi(mock).at(-1)?.telo as SlajdCmd | undefined;
const tekstSloja = (cmd: SlajdCmd | undefined, id: string) =>
  cmd?.platno?.slojevi.find(s => s.id === id)?.pasusi?.map(p => p.delovi.map(d => d.tekst).join(''));

const editor = (page: Page) => page.locator('[data-oznaka="gfs-editor-platna"]');
const naslov = (page: Page) => page.getByRole('textbox', { name: 'Naslov', exact: true });
const sadrzaj = (page: Page) => page.getByRole('textbox', { name: 'Tekst (Markdown)' });
const pretvori = (page: Page) => page.getByRole('button', { name: 'Pretvori u platno' });

async function otvoriInfo(page: Page): Promise<void> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await expect(page.locator('.uz-ed-stavka-dugme[aria-current="true"]')).toContainText('Uvod');
  await expect(naslov(page)).toHaveValue('Uvod');
}

/** Upisuje sadržaj i čeka da ga server ima (PUT posle 800 ms mira), da sledeći PUT bude samo pretvaranje. */
async function upisiSadrzaj(page: Page, mock: MockApi, tekst: string): Promise<void> {
  await sadrzaj(page).fill(tekst);
  await expect.poll(() => poslednji(mock)?.sadrzaj).toBe(tekst);
}

test.describe('Pretvori u platno (INFO -> PLATNO)', () => {
  test('lista sa "Otkrivaj stavke": PLATNO (s1 naslov, s2 dva pasusa i dva KLIK), editor platna, "Poništi" vraća INFO', async ({ page, mock }) => {
    await otvoriInfo(page);
    await naslov(page).fill('Pretvaranje');
    await sadrzaj(page).fill('- prvo\n- drugo');
    await page.getByRole('checkbox', { name: /Otkrivaj stavke liste/ }).check();
    await expect.poll(() => {
      const p = poslednji(mock);
      return p && [p.tip, p.naslov, p.sadrzaj, p.postepeno];
    }).toEqual(['INFO', 'Pretvaranje', '- prvo\n- drugo', true]);
    const pre = putovi(mock).length;

    await expect(pretvori(page)).toBeEnabled();
    await pretvori(page).click();
    // bez gubitaka: bez dijaloga potvrde
    await expect(editor(page)).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect.poll(() => poslednji(mock)?.tip).toBe('PLATNO');
    expect(putovi(mock).length).toBe(pre + 1);
    const cmd = poslednji(mock)!;
    expect(cmd).toMatchObject({ naslov: null, sadrzaj: null, postepeno: false });
    expect(tekstSloja(cmd, 's1')).toEqual(['Pretvaranje']);
    expect(tekstSloja(cmd, 's2')).toEqual(['prvo', 'drugo']);
    expect(cmd.platno!.animacije.map(a => [a.slojId, a.pasus, a.okidac])).toEqual([['s2', 0, 'KLIK'], ['s2', 1, 'KLIK']]);
    await expect(page.getByText('Slajd je pretvoren u platno.')).toBeVisible();
    await expect(pretvori(page)).toHaveCount(0);

    // snackbar (traka editora platna ima svoje "Poništi", onemogućeno)
    const ponisti = page.locator('mat-snack-bar-container').getByRole('button', { name: 'Poništi', exact: true });
    await expect(ponisti).toBeEnabled();
    await ponisti.click();
    await expect.poll(() => poslednji(mock)?.tip).toBe('INFO');
    expect(putovi(mock).length).toBe(pre + 2);
    expect(poslednji(mock)).toMatchObject({ naslov: 'Pretvaranje', sadrzaj: '- prvo\n- drugo', postepeno: true, platno: null });
    await expect(editor(page)).toHaveCount(0);
    await expect(naslov(page)).toHaveValue('Pretvaranje');
    await expect(page.getByRole('checkbox', { name: /Otkrivaj stavke liste/ })).toBeChecked();
  });

  test('veza u tekstu: potvrda sa "Veze postaju običan tekst"; Odustani ostavlja INFO, Pretvori pravi PLATNO', async ({ page, mock }) => {
    await otvoriInfo(page);
    await upisiSadrzaj(page, mock, 'Vidi [vezu](https://primer.rs).');
    const pre = putovi(mock).length;

    await expect(pretvori(page)).toBeEnabled();
    await pretvori(page).click();
    const dijalog = page.getByRole('alertdialog', { name: 'Pretvoriti slajd u platno?' });
    await expect(dijalog).toBeVisible();
    await expect(dijalog).toContainText('Veze postaju običan tekst');
    await expect(dijalog).toContainText('Posle pretvaranja možeš da poništiš.');
    const odustani = dijalog.getByRole('button', { name: 'Odustani' });
    await expect(odustani).toBeEnabled();
    await odustani.click();
    await expect(dijalog).toHaveCount(0);
    await expect(naslov(page)).toHaveValue('Uvod');
    await expect(editor(page)).toHaveCount(0);
    expect(putovi(mock).length).toBe(pre);

    await expect(pretvori(page)).toBeEnabled();
    await pretvori(page).click();
    const potvrdi = dijalog.getByRole('button', { name: 'Pretvori' });
    await expect(potvrdi).toBeEnabled();
    await potvrdi.click();
    await expect(editor(page)).toBeVisible();
    await expect.poll(() => poslednji(mock)?.tip).toBe('PLATNO');
    expect(tekstSloja(poslednji(mock), 's2')).toEqual(['Vidi vezu.']);
  });
});
