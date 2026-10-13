import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';

/*
 * Editor platna, deo 4a (mok API): nov PLATNO slajd, ubacivanje oblika i slike, miš, samo tastatura, poništavanje i
 * čuvanje. Ishod se uvek čita iz tela poslednjeg `PUT slajdovi/<id>` (server dobija ono što editor pokazuje).
 * Prezentacija 5 iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO (izabran pri učitavanju), 52 = PLATNO.
 */
const PREZENTACIJA = 5;
const INFO_SLAJD = 51;
/** Pozadina teme NACRT (`ui/teme.ts`): tema prezentacije 5. */
const POZADINA_NACRT = '#FFFFFF';
/** Podrazumevani oblici (`data-access/platno-novo.ts`, centar platna 960 x 540): strelica 240 x 24, pravougaonik 200 x 120. */
const STRELICA = { x: 360, y: 258 };
const PRAVOUGAONIK = { x: 380, y: 210, sirina: 200, visina: 120 };

/** PNG 1 x 1 (prolazi `createImageBitmap` u Chromium-u, pa ga editor meri pre otpremanja). */
const PIKSEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

interface Sloj { id: string; tip: string; x: number; y: number; sirina: number; visina: number; medijId?: string }
interface Platno { pozadina: { boja: string; medijId: string | null }; slojevi: Sloj[]; animacije: unknown[] }
interface SlajdCmd { tip: string; beleske: string | null; platno: Platno }

const putovi = (mock: MockApi, id: number) => mock.zahteviZa(`slajdovi/${id}`, 'PUT');
/** Telo poslednjeg `PUT`-a slajda (undefined dok ga nema). */
const poslednji = (mock: MockApi, id: number) => putovi(mock, id).at(-1)?.telo as SlajdCmd | undefined;
const slojUPut = (mock: MockApi, id: number, slojId: string) => poslednji(mock, id)?.platno.slojevi.find(s => s.id === slojId);

const editor = (page: Page) => page.locator('[data-oznaka="gfs-editor-platna"]');
const okvir = (page: Page) => page.locator('.uz-ep-platno');
/** Sloj u prikazu editora (ne u bočnom pregledu `.uz-ed-platno`). */
const slojEditora = (page: Page, id: string) => page.locator(`.uz-ep-platno [data-sloj="${id}"]`);
const traka = (page: Page) => page.getByRole('group', { name: 'Alati platna' });

/** "+ Platno" posle izabranog INFO slajda: odmah `POST` (nov PLATNO nacrt je ispravan), pa editor. Vraća pravi id slajda. */
async function novoPlatno(page: Page, mock: MockApi): Promise<number> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await expect(page.locator('.uz-ed-stavka-dugme[aria-current="true"]')).toContainText('Uvod');
  await page.getByRole('button', { name: 'Platno', exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await expect.poll(() => mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi`, 'POST').length).toBe(1);
  const post = mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi`, 'POST')[0];
  expect(post.query.get('posle')).toBe(String(INFO_SLAJD));
  const prezentacija = mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!;
  return prezentacija.slajdovi[1].id;
}

/** Meni "Oblik" > stavka: nov sloj je izabran, a fokus je na okviru platna (odluka 12). */
async function ubaciOblik(page: Page, naziv: string): Promise<void> {
  await traka(page).getByRole('button', { name: 'Oblik', exact: true }).click();
  await page.getByRole('menuitem', { name: naziv, exact: true }).click();
  await expect(okvir(page)).toBeFocused();
}

/** Px ekrana po jedinici platna (širina `.uz-platno` editora / 960). */
async function pxPoJedinici(page: Page): Promise<number> {
  const b = (await page.locator('.uz-ep-platno .uz-platno').boundingBox())!;
  return b.width / 960;
}

async function centar(l: Locator): Promise<{ x: number; y: number }> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const jeFokusiran = (l: Locator) => l.evaluate(e => e === document.activeElement);

/** Pritiska taster dok element ne dobije fokus (najviše `n` puta), pa proverava fokus. */
async function tasterDo(page: Page, cilj: Locator, taster: 'Tab' | 'Shift+Tab', n = 15): Promise<void> {
  for (let i = 0; i < n && !(await jeFokusiran(cilj)); i++) await page.keyboard.press(taster);
  await expect(cilj).toBeFocused();
}

test.describe('uživo: editor platna (4a)', () => {
  test('"+ Platno" šalje prazan PLATNO slajd sa pozadinom teme i otvara editor', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    const telo = mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi`, 'POST')[0].telo as SlajdCmd;
    expect(telo.tip).toBe('PLATNO');
    expect(telo.platno.pozadina).toEqual({ boja: POZADINA_NACRT, medijId: null });
    expect(telo.platno.slojevi).toEqual([]);
    expect(id).toBeGreaterThan(0);
    await expect(page.getByRole('tab', { name: 'Svojstva' })).toHaveAttribute('aria-selected', 'true');
  });

  test('strelica: prevlačenje mišem, poništi, ponovi, brisanje i vraćanje', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Strelica');
    await expect(page.getByText('Izabrano: Strelica 1')).toBeAttached();
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);

    // uz Alt: vođice ne pomeraju rezultat (prianjanje uz centar platna bi ga inače privuklo)
    const px = await pxPoJedinici(page);
    const c = await centar(slojEditora(page, 's1'));
    await page.keyboard.down('Alt');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 50, c.y, { steps: 5 });
    await page.mouse.move(c.x + 100, c.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const ocekivano = STRELICA.x + 100 / px;
    await expect.poll(() => Math.abs((slojUPut(mock, id, 's1')?.x ?? NaN) - ocekivano)).toBeLessThanOrEqual(1);
    const pomereno = slojUPut(mock, id, 's1')!.x;
    expect(slojUPut(mock, id, 's1')!.y).toBe(STRELICA.y);
    await expect(okvir(page)).toBeFocused();

    await page.keyboard.press('Control+z');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(pomereno);
    await page.keyboard.press('Delete');
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.length).toBe(0);
    await page.keyboard.press('Control+z');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(pomereno);
  });

  test('samo tastatura: izbor u panelu Slojevi, strelice, redosled i širina iz panela Svojstva', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Pravougaonik');
    await ubaciOblik(page, 'Strelica'); // izabrana strelica (s2), iznad pravougaonika (s1)
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.map(s => s.id)).toEqual(['s1', 's2']);

    // okvir -> zaglavlje taba "Svojstva"; ArrowRight na zaglavlju menja tab, a NE pomera izabranu strelicu
    const tabSvojstva = page.getByRole('tab', { name: 'Svojstva' });
    const tabSlojevi = page.getByRole('tab', { name: 'Slojevi' });
    await tasterDo(page, tabSvojstva, 'Tab');
    await page.keyboard.press('ArrowRight');
    await expect(tabSlojevi).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabSlojevi).toHaveAttribute('aria-selected', 'true');

    // Tab do reda pravougaonika, Enter ga bira; Shift+Tab nazad do okvira platna
    const red = page.locator('[data-sloj-panel="s1"] .uz-ep-sloj-ime');
    await tasterDo(page, red, 'Tab');
    await page.keyboard.press('Enter');
    await expect(red).toHaveAttribute('aria-pressed', 'true');
    await tasterDo(page, okvir(page), 'Shift+Tab');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(PRAVOUGAONIK.x + 1);
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => slojUPut(mock, id, 's1')?.y).toBe(PRAVOUGAONIK.y + 10);
    await page.keyboard.press('Control+]');
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.map(s => s.id)).toEqual(['s2', 's1']);
    // strelica se nije pomerila ni od ArrowRight na zaglavlju taba
    expect(slojUPut(mock, id, 's2')).toMatchObject({ x: STRELICA.x, y: STRELICA.y });

    // okvir -> zaglavlje (Slojevi) -> ArrowLeft + Enter -> Svojstva -> Tab do polja "Širina"
    await tasterDo(page, tabSlojevi, 'Tab');
    await page.keyboard.press('ArrowLeft');
    await expect(tabSvojstva).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabSvojstva).toHaveAttribute('aria-selected', 'true');
    const sirina = page.getByRole('textbox', { name: 'Širina', exact: true });
    await tasterDo(page, sirina, 'Tab', 25);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('250');
    await page.keyboard.press('Enter');
    await expect.poll(() => slojUPut(mock, id, 's1')?.sirina).toBe(250);
    expect(slojUPut(mock, id, 's1')).toMatchObject({ x: PRAVOUGAONIK.x + 1, y: PRAVOUGAONIK.y + 10, visina: PRAVOUGAONIK.visina });
  });

  test('slika iz trake: POST /mediji (PNG 1 x 1), sloj SLIKA sa tim medijem', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    const biranje = page.waitForEvent('filechooser');
    await traka(page).getByRole('button', { name: 'Slika', exact: true }).click();
    await (await biranje).setFiles({ name: 'piksel.png', mimeType: 'image/png', buffer: PIKSEL });
    await expect.poll(() => mock.mediji.length).toBe(1);
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.map(s => ({ tip: s.tip, medijId: s.medijId })))
      .toEqual([{ tip: 'SLIKA', medijId: mock.mediji[0].id }]);
    await expect(okvir(page)).toBeFocused();
    await expect(slojEditora(page, 's1')).toBeVisible();
  });

  test('ručka JI uz Shift (i Alt) čuva odnos strana', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Pravougaonik');
    await expect.poll(() => slojUPut(mock, id, 's1')?.sirina).toBe(PRAVOUGAONIK.sirina);

    const c = await centar(page.locator('[data-rucka="JI"]'));
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 40, c.y + 5, { steps: 5 });
    await page.mouse.move(c.x + 80, c.y + 10, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await expect.poll(() => slojUPut(mock, id, 's1')?.sirina).toBeGreaterThan(PRAVOUGAONIK.sirina);
    const s = slojUPut(mock, id, 's1')!;
    expect(Math.abs(s.sirina / s.visina - PRAVOUGAONIK.sirina / PRAVOUGAONIK.visina)).toBeLessThan(0.02);
    // suprotni ugao (SZ) ostaje na mestu
    expect(s).toMatchObject({ x: PRAVOUGAONIK.x, y: PRAVOUGAONIK.y });
  });

  test('Review Focus 1: pomeranje pa odmah beleška pa Ctrl+S, poslednji PUT nosi i platno i belešku', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Strelica');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);

    await page.keyboard.press('ArrowRight');
    const beleske = page.getByRole('textbox', { name: 'Beleške za predavača' });
    await beleske.click();
    await page.keyboard.type('Pokazati smer sile');
    await page.keyboard.press('Control+s');
    await expect.poll(() => {
      const t = poslednji(mock, id);
      return t && { beleske: t.beleske, x: t.platno.slojevi[0]?.x };
    }).toEqual({ beleske: 'Pokazati smer sile', x: STRELICA.x + 1 });
  });

  test('istorija pripada instanci editora: posle prelaska na drugi slajd i nazad Ctrl+Z ne šalje ništa', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Strelica');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);

    // dokaz da Ctrl+Z radi u ovoj instanci
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x + 1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);

    const stavke = page.locator('.uz-ed-stavka-dugme');
    await stavke.nth(0).click();
    await expect(editor(page)).toHaveCount(0);
    await stavke.nth(1).click();
    await expect(slojEditora(page, 's1')).toBeVisible();
    await expect(traka(page).getByRole('button', { name: 'Poništi', exact: true })).toBeDisabled();

    const pre = putovi(mock, id).length;
    await okvir(page).focus();
    await page.keyboard.press('Control+z');
    // nema vidljivog ishoda koji bi se čekao: provera je da u 1 s (više od 800 ms čekanja čuvanja) ne stigne PUT
    await page.waitForTimeout(1_200);
    expect(putovi(mock, id).length).toBe(pre);
    expect(slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);
  });
});
