import type { Locator, Page } from '@playwright/test';

import type { Platno as PlatnoModel } from '../src/app/features/uzivo/data-access/platno.models';
import { proveriKaoServer } from '../src/app/features/uzivo/data-access/platno-provera';
import { posleOtvaranjaDijaloga } from './dijalog';
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

interface Deo { tekst: string; font: string; podebljano: boolean }
interface Celija { pasusi: { delovi: Deo[] }[]; spojDesno: number; spojDole: number }
interface Sloj {
  id: string; tip: string; x: number; y: number; sirina: number; visina: number; medijId?: string;
  pasusi?: { delovi: Deo[] }[]; celije?: Celija[][]; latex?: string; slikaIzvora?: string | null;
}
interface Animacija { id: string; slojId: string; pasus: number | null; vrsta: string; efekat: string; smer: string | null; trajanjeMs: number }
interface Platno { pozadina: { boja: string; medijId: string | null }; slojevi: Sloj[]; animacije: Animacija[] }
interface SlajdCmd { tip: string; beleske: string | null; platno: Platno }

const putovi = (mock: MockApi, id: number) => mock.zahteviZa(`slajdovi/${id}`, 'PUT');
/** Telo poslednjeg `PUT`-a slajda (undefined dok ga nema). */
const poslednji = (mock: MockApi, id: number) => putovi(mock, id).at(-1)?.telo as SlajdCmd | undefined;
const slojUPut = (mock: MockApi, id: number, slojId: string) => poslednji(mock, id)?.platno.slojevi.find(s => s.id === slojId);
/** Tekst pasusa sloja u poslednjem `PUT`-u (delovi spojeni). */
const tekstUPut = (mock: MockApi, id: number, slojId: string) =>
  slojUPut(mock, id, slojId)?.pasusi?.map(p => p.delovi.map(d => d.tekst).join(''));

const editor = (page: Page) => page.locator('[data-oznaka="gfs-editor-platna"]');
const okvir = (page: Page) => page.locator('.uz-ep-platno');
/** Sloj u prikazu editora (ne u režimu "Pregled", `.uz-ep-pregled`). */
const slojEditora = (page: Page, id: string) => page.locator(`.uz-ep-platno [data-sloj="${id}"]`);
const traka = (page: Page) => page.getByRole('group', { name: 'Alati platna' });

/**
 * "+ Platno" > "Prazno" posle izabranog INFO slajda: odmah `POST` (nov PLATNO nacrt je ispravan), pa editor. Vraća pravi
 * id slajda.
 */
async function novoPlatno(page: Page, mock: MockApi, raspored: 'Prazno' | 'Naslov i tekst' = 'Prazno'): Promise<number> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await expect(page.locator('.uz-ed-stavka-dugme[aria-current="true"]')).toContainText('Uvod');
  await page.getByRole('button', { name: 'Platno', exact: true }).click();
  await page.getByRole('menuitem', { name: raspored, exact: true }).click();
  // meni se gasi izlaznom animacijom, a njegov providni backdrop (preko celog ekrana) prima pokazivač sve dok se ne
  // odvoji na kraju animacije: miš na koordinate bi pogodio backdrop (CI #16)
  await expect(page.getByRole('menu')).toHaveCount(0);
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
  // meni se gasi izlaznom animacijom, a njegov providni backdrop (preko celog ekrana) prima pokazivač sve dok se ne
  // odvoji na kraju animacije: miš na koordinate bi pogodio backdrop (CI #16)
  await expect(page.getByRole('menu')).toHaveCount(0);
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

  test('Ctrl+Z radi i kad je fokus u panelu (prekidač senke), a u polju panela ne menja dokument', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Pravougaonik');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(PRAVOUGAONIK.x);
    const senka = editor(page).getByRole('switch', { name: 'Senka' });
    await senka.click();
    await expect(senka).toBeFocused();
    const saSenkom = () => (poslednji(mock, id)?.platno.slojevi[0] as { senka?: unknown } | undefined)?.senka;
    await expect.poll(() => saSenkom() ?? null).not.toBeNull();
    await page.keyboard.press('Control+z');
    await expect.poll(() => saSenkom() ?? null).toBeNull();
    await expect(senka).toBeFocused();
    await page.keyboard.press('Control+y');
    await expect.poll(() => saSenkom() ?? null).not.toBeNull();

    // Ctrl+Z u polju "Širina" je poništavanje polja, ne dokumenta
    const sirina = editor(page).getByRole('textbox', { name: 'Širina', exact: true });
    await sirina.click();
    const broj = putovi(mock, id).length;
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Tab');
    await expect(sirina).not.toBeFocused();
    // nema vidljivog ishoda koji bi se čekao: pogrešno poništavanje dokumenta bi poslalo PUT tek posle debounce-a
    // (800 ms), pa se odsustvo proverava posle 1,2 s (kao u testu istorije po instanci)
    await page.waitForTimeout(1_200);
    expect(putovi(mock, id).length).toBe(broj);
    expect(saSenkom() ?? null).not.toBeNull();
  });

  test('Review Focus 1: pomeranje pa odmah beleška pa Ctrl+S, poslednji PUT nosi i platno i belešku', async ({ page, mock }) => {
    // lažni sat stranice: posle zaustavljanja debounce čuvanja (800 ms) ne može da okine, pa PUT sme da dođe samo od Ctrl+S
    await page.clock.install();
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Strelica');
    await expect.poll(() => slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);
    // skok unapred sme samo u budućnost lažnog sata (on teče dok se ne zaustavi); posle prethodnog PUT-a ništa ne čeka
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
    const pre = putovi(mock, id).length;

    await page.keyboard.press('ArrowRight');
    const beleske = page.getByRole('textbox', { name: 'Beleške za predavača' });
    await beleske.click();
    await page.keyboard.type('Pokazati smer sile');
    await expect(beleske).toHaveValue('Pokazati smer sile');
    expect(putovi(mock, id).length).toBe(pre);   // sat stoji: bez Ctrl+S nema PUT-a
    await page.keyboard.press('Control+s');
    await expect.poll(() => putovi(mock, id).length).toBe(pre + 1);
    const t = poslednji(mock, id)!;
    expect({ beleske: t.beleske, x: t.platno.slojevi[0]?.x }).toEqual({ beleske: 'Pokazati smer sile', x: STRELICA.x + 1 });
    await page.clock.resume();
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
    await expect(okvir(page)).toBeFocused();
    await page.keyboard.press('Control+z');
    // nema vidljivog ishoda koji bi se čekao: provera je da u 1 s (više od 800 ms čekanja čuvanja) ne stigne PUT
    await page.waitForTimeout(1_200);
    expect(putovi(mock, id).length).toBe(pre);
    expect(slojUPut(mock, id, 's1')?.x).toBe(STRELICA.x);
  });

  // Raspored (završna recenzija 4a, Important 1): na uobičajenim laptopima paneli su desno od platna, a vrh tabova je na
  // ekranu dok je okvir platna ceo vidljiv; na telefonu paneli idu ispod, bez horizontalnog skrola.
  /** PLATNO slajd 52 sa izabranim oblikom (Svojstva oblika: najduži panel); mere okvira, tabova i panela posle skrola do okvira. */
  async function mereRasporeda(page: Page, sirina: number, visina: number) {
    await page.setViewportSize({ width: sirina, height: visina });
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    await page.getByRole('button', { name: /^2\s/ }).click();
    await expect(slojEditora(page, 'oblik')).toBeVisible();
    // sloj izbora (overlay) leži preko prikaza i prima pokazivač: klik u centar sloja
    const c = await centar(slojEditora(page, 'oblik'));
    await page.mouse.click(c.x, c.y);
    await expect(editor(page).getByText('Izabrano: Elipsa 1')).toBeAttached();
    await expect(editor(page).locator('app-panel-svojstva app-svojstva-oblika')).toBeVisible();
    await okvir(page).scrollIntoViewIfNeeded();
    const o = (await okvir(page).boundingBox())!;
    const tabovi = (await editor(page).getByRole('tablist').boundingBox())!;
    const panel = (await editor(page).locator('.uz-ep-paneli').boundingBox())!;
    const r = Math.round;
    test.info().annotations.push({ type: 'raspored', description: `${sirina}x${visina}: okvir x${r(o.x)} y${r(o.y)} `
      + `${r(o.width)}x${r(o.height)}; tabovi y${r(tabovi.y)}; panel x${r(panel.x)} y${r(panel.y)} ${r(panel.width)}x${r(panel.height)}` });
    const traka = (await page.locator('app-top-bar').boundingBox())!;
    expect(o.y).toBeGreaterThanOrEqual(traka.y + traka.height);
    expect(o.y + o.height).toBeLessThanOrEqual(visina);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(sirina);
    return { o, tabovi, panel };
  }

  for (const [sirina, visina] of [[1366, 768], [1440, 900]] as const) {
    test(`raspored ${sirina} x ${visina}: paneli desno od platna, tabovi vidljivi uz celo platno`, async ({ page }) => {
      const { o, tabovi, panel } = await mereRasporeda(page, sirina, visina);
      expect(tabovi.y).toBeGreaterThanOrEqual(o.y);
      expect(tabovi.y + tabovi.height).toBeLessThanOrEqual(visina);
      expect(panel.x).toBeGreaterThan(o.x + o.width);
      expect(o.width).toBeGreaterThanOrEqual(500);   // platno ostaje čitljivo

      // skrol do dna dugačkog panela (Svojstva oblika): platno i tabovi su lepljivi, pa ostaju celi na ekranu
      const poslednje = editor(page).locator('app-svojstva-oblika').locator('button, input').last();
      await poslednje.scrollIntoViewIfNeeded();
      const dno = (await poslednje.boundingBox())!;
      const o2 = (await okvir(page).boundingBox())!;
      const t2 = (await editor(page).getByRole('tablist').boundingBox())!;
      // lepljiva gornja traka ljuske prekriva vrh sadržaja: platno i tabovi moraju biti ispod nje
      const traka = (await page.locator('app-top-bar').boundingBox())!;
      const vrh = traka.y + traka.height;
      test.info().annotations.push({ type: 'raspored', description: `${sirina}x${visina} posle skrola: okvir y${Math.round(o2.y)}, `
        + `tabovi y${Math.round(t2.y)}, poslednja kontrola panela y${Math.round(dno.y)}, gornja traka do y${Math.round(vrh)}` });
      expect(dno.y + dno.height).toBeLessThanOrEqual(visina);
      expect(o2.y).toBeGreaterThanOrEqual(vrh);
      expect(o2.y + o2.height).toBeLessThanOrEqual(visina);
      expect(t2.y).toBeGreaterThanOrEqual(vrh);
      expect(t2.y + t2.height).toBeLessThanOrEqual(o2.y + o2.height);
    });
  }

  test('raspored 1280 x 800: editor je uži od praga (736 px), paneli su ispod platna pune širine', async ({ page }) => {
    const { o, panel } = await mereRasporeda(page, 1280, 800);
    expect(panel.y).toBeGreaterThanOrEqual(o.y + o.height);
    expect(o.width).toBeGreaterThanOrEqual(700);
  });

  test('raspored 390 x 844: paneli ispod platna, bez horizontalnog skrola', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    await page.getByRole('button', { name: /^2\s/ }).click();
    await expect(slojEditora(page, 'oblik')).toBeVisible();
    const o = (await okvir(page).boundingBox())!;
    const panel = (await editor(page).locator('.uz-ep-paneli').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(o.y + o.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.locator('mat-sidenav-content').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('uživo: tekst na platnu (4b, F12)', () => {
  const uredjivac = (page: Page) => page.getByRole('textbox', { name: /^Tekst sloja/ });

  test('"Tekst" iz trake: kucanje, Enter, Esc; dvoklik, kucanje i Ctrl+S bez Esc; PUT nosi tekst', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await traka(page).getByRole('button', { name: 'Tekst', exact: true }).click();
    await expect(uredjivac(page)).toBeFocused();
    await page.keyboard.type('Zdravo');
    await page.keyboard.press('Enter');
    await page.keyboard.type('svete');
    await page.keyboard.press('Escape');
    await expect(uredjivac(page)).toHaveCount(0);
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Zdravo', 'svete']);
    // font tela teme (NACRT: IBM Plex Sans) u oba pasusa
    expect(slojUPut(mock, id, 's1')!.pasusi!.map(p => p.delovi[0].font)).toEqual(['IBM Plex Sans', 'IBM Plex Sans']);

    // dvoklik na sloj (overlay je iznad prikaza, pa koordinatama), kursor je na kraju; Ctrl+S upisuje otvoren tekst
    const c = await centar(slojEditora(page, 's1'));
    await page.mouse.dblclick(c.x, c.y);
    await expect(uredjivac(page)).toBeFocused();
    await page.keyboard.type('!');
    await page.keyboard.press('Control+s');
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Zdravo', 'svete!']);
    await expect(uredjivac(page)).toBeFocused();

    // Ctrl+Z u tekstu poništava kucanje (ProseMirror), ne platno; klik van sloja završava uređivanje
    await page.keyboard.type('?');
    await page.keyboard.press('Control+z');
    const b = (await page.locator('.uz-ep-platno .uz-platno').boundingBox())!;
    await page.mouse.click(b.x + 10, b.y + 10);
    await expect(uredjivac(page)).toHaveCount(0);
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Zdravo', 'svete!']);
    expect(poslednji(mock, id)!.platno.slojevi.map(s => s.id)).toEqual(['s1']);
  });
});

test.describe('uživo: formula (4b, F16)', () => {
  const dijalog = (page: Page) => page.locator('[data-oznaka="gfs-formula-editor"]');

  test('"Formula": math-field u fokusu, kucanje, polje LaTeX, Sačuvaj; nijedan zahtev van porekla, fontovi lokalni', async ({ page, mock }) => {
    const zahtevi: { url: string; metod: string }[] = [];
    page.on('request', r => zahtevi.push({ url: r.url(), metod: r.method() }));
    const id = await novoPlatno(page, mock);
    const poreklo = new URL(page.url()).origin;

    await traka(page).getByRole('button', { name: 'Formula', exact: true }).click();
    await expect(dijalog(page)).toBeVisible();
    const mf = dijalog(page).locator('math-field');
    // dijalog sam fokusira math-field posle učitavanja MathLive-a (autoFocus: false, odluka 20)
    await expect(mf).toBeFocused();
    // MathLive je često spreman pre kraja animacije otvaranja; tasteri baš u trenutku kad CDK posle nje prebaci fokus
    // na kontejner (dijalog ga vraća) bi se izgubili
    await posleOtvaranjaDijaloga(page);
    await expect(mf).toBeFocused();
    await page.keyboard.type('x^2');
    const latex = dijalog(page).getByRole('textbox', { name: 'LaTeX' });
    await expect(latex).toHaveValue('x^2');
    // Esc u math-field-u pripada MathLive-u (LaTeX režim): dijalog ostaje otvoren
    await page.keyboard.press('Escape');
    await expect(dijalog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await latex.fill('x^2');
    const sacuvaj = dijalog(page).getByRole('button', { name: 'Sačuvaj' });
    await expect(sacuvaj).toBeEnabled();
    await sacuvaj.click();
    await expect(dijalog(page)).toHaveCount(0);
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.map(s => ({ tip: s.tip, latex: (s as { latex?: string }).latex })))
      .toEqual([{ tip: 'FORMULA', latex: 'x^2' }]);
    expect((poslednji(mock, id)!.platno.slojevi[0] as { slikaIzvora?: string | null }).slikaIzvora).toBeNull();
    await expect(okvir(page).locator('.ML__latex')).toBeVisible();

    // drugi prolaz bez math-field-a: samo polje LaTeX (pristupačna alternativa), razlomak na platnu
    await traka(page).getByRole('button', { name: 'Formula', exact: true }).click();
    await expect(dijalog(page).locator('math-field')).toBeFocused();
    await dijalog(page).getByRole('textbox', { name: 'LaTeX' }).fill('\\frac{a}{b}');
    await expect(dijalog(page).getByRole('button', { name: 'Sačuvaj' })).toBeEnabled();
    await dijalog(page).getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(dijalog(page)).toHaveCount(0);
    await expect.poll(() => poslednji(mock, id)?.platno.slojevi.map(s => s.latex)).toEqual(['x^2', '\\frac{a}{b}']);
    expect(poslednji(mock, id)!.platno.slojevi[1].slikaIzvora).toBeNull();
    await expect(okvir(page).locator('.ML__mfrac')).toBeVisible();

    // nijedan zahtev van porekla (CDN fontova, zvuci, HEAD provera putanje MathLive-a), fontovi samo iz assets/mathlive/fonts/
    await page.waitForLoadState('networkidle');
    expect(zahtevi.filter(z => new URL(z.url).origin !== poreklo)).toEqual([]);
    expect(zahtevi.filter(z => z.metod === 'HEAD')).toEqual([]);
    const fontovi = zahtevi.filter(z => /\.woff2?$/.test(new URL(z.url).pathname) && /KaTeX/.test(z.url));
    expect(fontovi.length).toBeGreaterThan(0);
    expect(fontovi.filter(z => !new URL(z.url).pathname.includes('/assets/mathlive/fonts/'))).toEqual([]);
    expect(zahtevi.filter(z => /sounds|\.wav$/.test(z.url))).toEqual([]);
  });

  test('polje LaTeX -> math-field za uobičajene formule (sanitizer ne menja markup celog MathLive-a); \\mathtip ne ulazi', async ({ page, mock }) => {
    await novoPlatno(page, mock);
    await traka(page).getByRole('button', { name: 'Formula', exact: true }).click();
    const mf = dijalog(page).locator('math-field');
    await expect(mf).toBeFocused();
    const latex = dijalog(page).getByRole('textbox', { name: 'LaTeX' });
    const vrednost = () => mf.evaluate(el => (el as HTMLElement & { value: string }).value);
    for (const f of [
      '\\frac{a}{b}+\\sqrt[3]{x}', '\\int_0^1 x\\,dx', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\begin{array}{c|c}1&2\\end{array}',
      '\\overrightarrow{AB}', '\\cancel{x}', '\\enclose{circle}[2px dashed red]{x}', '\\left(\\frac{a}{b}\\right)', '\\ce{H2O}',
      '\\colorbox{yellow}{z}', '\\mathbb{R}',
    ]) {
      await latex.fill(f);
      await expect.poll(vrednost, { message: f }).toBe(f);
    }
    // oblačić bi MathLive nacrtao, a sanitizer projektora ga briše: polje ostaje na prethodnoj formuli
    await latex.fill('\\mathtip{a}{b}');
    await expect(latex).toHaveValue('\\mathtip{a}{b}');
    expect(await vrednost()).toBe('\\mathbb{R}');
  });

  test('zabranjena komanda u polju LaTeX: poruka i "Sačuvaj" onemogućeno; Otkaži vraća fokus na dugme', async ({ page, mock }) => {
    await novoPlatno(page, mock);
    const dugme = traka(page).getByRole('button', { name: 'Formula', exact: true });
    await dugme.click();
    await expect(dijalog(page).locator('math-field')).toBeFocused();
    await dijalog(page).getByRole('textbox', { name: 'LaTeX' }).fill('\\href{http://e.com}{x}');
    await expect(dijalog(page).getByRole('alert')).toContainText('nije dozvoljena');
    await expect(dijalog(page).getByRole('button', { name: 'Sačuvaj' })).toBeDisabled();
    await dijalog(page).getByRole('button', { name: 'Otkaži' }).click();
    await expect(dijalog(page)).toHaveCount(0);
    await expect(dugme).toBeFocused();
  });
});

/*
 * Spec 13 (4b): tekst, tabela, formula i animacije kroz pravi put (miš i tastatura -> `PUT slajdovi/<id>`), uspeh 4 i 5.
 * Ishod se čita iz tela poslednjeg `PUT`-a; posle svake akcije čeka se vidljiv ishod (bez trka).
 */
test.describe('uživo: editor platna (4b, F19)', () => {
  const uredjivac = (page: Page) => page.getByRole('textbox', { name: /^Tekst sloja/ });
  const animacijeUPut = (mock: MockApi, id: number) => poslednji(mock, id)?.platno.animacije;
  /** Dvoklik na sloj (overlay je iznad prikaza, pa koordinatama): otvara uređivač teksta. */
  const uredi = async (page: Page, slojId: string) => {
    // preko lokatora overlay-a: Playwright čeka da tačku ništa ne prekriva (npr. backdrop menija koji se gasi, CI #16)
    const overlay = page.locator('.uz-ep-platno app-platno-overlay');
    const c = await centar(slojEditora(page, slojId));
    const o = (await overlay.boundingBox())!;
    await overlay.dblclick({ position: { x: c.x - o.x, y: c.y - o.y } });
    await expect(uredjivac(page)).toBeFocused();
  };
  /**
   * Tab "Animacije" i kraj klizanja tela taba (vidljiv ishod pre klika u panelu): klik na dugme koje još klizi može da
   * promaši (kao u svakom Material tabu sa animacijom), a uzrok jednog pada u celom paketu nije utvrđen (izveštaj F19,
   * fix 1). Redosled je bitan: klasa `.mat-tab-body-animating` se dodaje tek na `transitionstart` (posle kadra ili
   * rezervnog tajmera od 100 ms), pa bi provera "0" odmah posle klika prošla PRE animacije. Zato prvo čeka sadržaj novog
   * taba (`app-panel-animacije` se kači na `transitionstart`, zajedno sa klasom), pa tek onda kraj animacije.
   */
  const tabAnimacije = async (page: Page) => {
    await page.getByRole('tab', { name: 'Animacije' }).click();
    await expect(page.getByRole('tab', { name: 'Animacije' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('app-panel-animacije')).toBeVisible();
    await expect(page.locator('.mat-tab-body-animating')).toHaveCount(0);
  };
  /** Meni "Dodaj ulaz" > efekat (tab Animacije mora biti otvoren, `tabAnimacije`). */
  const dodajUlaz = async (page: Page, efekat: string) => {
    const dugme = page.getByRole('button', { name: 'Dodaj ulaz' });
    await expect(dugme).toBeEnabled();
    await dugme.click();
    await page.getByRole('menuitem', { name: efekat, exact: true }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
  };

  test('naslov: kucanje, izbor reči i Ctrl+B, Esc na okvir; Ctrl+Z i Ctrl+Y nad celom sesijom', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock, 'Naslov i tekst');
    await uredi(page, 's1');
    await page.keyboard.type('Uvod u statiku');
    // odmah posle izbora (bez čekanja selectionchange): uređivač pre komande usklađuje izbor sa DOM-om (F19 fix 1)
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Escape');
    await expect(uredjivac(page)).toHaveCount(0);
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Uvod u statiku']);
    const delovi = slojUPut(mock, id, 's1')!.pasusi![0].delovi;
    expect(delovi.map(d => [d.tekst, d.podebljano])).toEqual([['Uvod u ', false], ['statiku', true]]);

    const pre = putovi(mock, id).length;
    await page.keyboard.press('Control+z');
    await expect.poll(() => putovi(mock, id).length).toBeGreaterThan(pre);
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['']);
    await page.keyboard.press('Control+y');
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Uvod u statiku']);
    expect(slojUPut(mock, id, 's1')!.pasusi![0].delovi.map(d => d.podebljano)).toEqual([false, true]);
  });

  test('pražnjenje (Critical): otkucan tekst bez Esc pa "Pokreni" -> PUT sa tekstom stiže pre GET predavanja dijaloga', async ({ page, mock }) => {
    // pitanje u prezentaciji: "Pokreni" tada otvara dijalog (bez pitanja kreće odmah, bez čuvanja rezultata)
    const prezentacija = mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!;
    prezentacija.slajdovi.push({
      id: 59, rb: prezentacija.slajdovi.length + 1, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: null,
      postepeno: false, platno: null,
      pitanje: {
        id: 590, tip: 'JEDAN_TACAN', tekst: 'Koja je jedinica za silu?', slika: null, vremeSekunde: null,
        opcije: [{ id: 1, rb: 1, tekst: 'Džul', tacna: false }, { id: 2, rb: 2, tekst: 'Njutn', tacna: true }],
        brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
        prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
      },
    });
    const id = await novoPlatno(page, mock, 'Naslov i tekst');
    await uredi(page, 's1');
    await page.keyboard.type('X');
    const pokreni = page.getByRole('button', { name: 'Pokreni', exact: true });
    await expect(pokreni).toBeEnabled();
    await pokreni.click();
    const dijalog = page.getByRole('dialog');
    await expect(dijalog.getByRole('button', { name: 'Otkaži' })).toBeVisible();

    const put = () => putovi(mock, id).find(z => (z.telo as SlajdCmd).platno.slojevi.find(s => s.id === 's1')?.pasusi
      ?.some(p => p.delovi.some(d => d.tekst === 'X')));
    const predavanja = () => mock.zahteviZa(`prezentacije/${PREZENTACIJA}/predavanja`, 'GET')[0];
    await expect.poll(put, { message: 'PUT sa otkucanim tekstom' }).toBeDefined();
    await expect.poll(predavanja, { message: 'GET predavanja dijaloga' }).toBeDefined();
    expect(put()!.rb).toBeLessThan(predavanja().rb);
    await dijalog.getByRole('button', { name: 'Otkaži' }).click();
    await expect(dijalog).toHaveCount(0);
  });

  test('strelica sa ULET-om: značka 1, Pregled i Korak napred je otkrivaju, Ctrl+Z na okviru briše animaciju', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Strelica');
    await tabAnimacije(page);
    await dodajUlaz(page, 'Ulet');
    await expect.poll(() => animacijeUPut(mock, id)?.map(a => [a.slojId, a.vrsta, a.efekat, a.smer]))
      .toEqual([['s1', 'ULAZ', 'ULET', 'DOLE']]);
    await expect(okvir(page).locator('.uz-ep-znacka')).toHaveText(['1']);

    await traka(page).getByRole('button', { name: 'Pregled' }).click();
    const strelica = page.locator('.uz-ep-pregled [data-sloj="s1"]');
    await expect(page.locator('.uz-ep-korak')).toHaveText('Korak 0 / 1');
    await expect(strelica).toBeHidden();
    // F18 m3: u Pregledu je sadržaj panela sakriven (globalno pravilo), ne samo tabovi onemogućeni
    await expect(page.getByRole('button', { name: 'Dodaj ulaz' })).toBeHidden();
    await expect(page.locator('app-panel-animacije')).toBeHidden();
    await page.getByRole('button', { name: 'Korak napred' }).click();
    await expect(page.locator('.uz-ep-korak')).toHaveText('Korak 1 / 1');
    await expect(strelica).toBeVisible();
    await page.getByRole('button', { name: 'Uređivanje' }).click();
    await expect(page.locator('.uz-ep-pregled')).toHaveCount(0);

    await okvir(page).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => animacijeUPut(mock, id)).toEqual([]);
    expect(poslednji(mock, id)!.platno.slojevi.map(s => s.id)).toEqual(['s1']);
  });

  test('tabela 2 x 2: Enter uređuje ćeliju 1, 1, Tab ide u sledeću; opseg 1-1/1-2 i "Spoji ćelije"', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await traka(page).getByRole('button', { name: 'Tabela', exact: true }).click();
    const ubaci = page.getByRole('dialog', { name: 'Ubaci tabelu' });
    await expect(ubaci.getByLabel('Redova')).toBeFocused();
    await ubaci.getByLabel('Redova').fill('2');
    await ubaci.getByLabel('Kolona').fill('2');
    await page.keyboard.press('Enter');
    await expect(ubaci).toBeHidden();
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => slojUPut(mock, id, 's1')?.celije?.map(r => r.length)).toEqual([2, 2]);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Tekst ćelije 1, 1' })).toBeFocused();
    await page.keyboard.type('A');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Tekst ćelije 1, 2' })).toBeFocused();
    await page.keyboard.type('B');
    await page.keyboard.press('Escape');
    await expect(okvir(page)).toBeFocused();
    const tekstCelije = (c: Celija | undefined) => c?.pasusi.map(p => p.delovi.map(d => d.tekst).join('')).join('\n');
    await expect.poll(() => slojUPut(mock, id, 's1')?.celije?.[0].map(tekstCelije)).toEqual(['A', 'B']);

    const celije = page.getByRole('group', { name: 'Ćelije' });
    for (const [naziv, vrednost] of [['Od reda', '1'], ['Do reda', '1'], ['Od kolone', '1'], ['Do kolone', '2']] as const) {
      const polje = celije.getByRole('textbox', { name: naziv });
      await polje.fill(vrednost);
      await polje.press('Enter');
      await expect(polje).toHaveValue(vrednost);
    }
    const spoji = page.getByRole('button', { name: 'Spoji ćelije' });
    await expect(spoji).toBeEnabled();
    await spoji.click();
    await expect.poll(() => slojUPut(mock, id, 's1')?.celije?.[0][0].spojDesno).toBe(1);
    expect(slojUPut(mock, id, 's1')!.celije![1][0].spojDesno).toBe(0);
  });

  test('Review Focus 2: "Po pasusima", brisanje drugog pasusa briše njegovu animaciju; Ctrl+Z pre Esc je vraća', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await traka(page).getByRole('button', { name: 'Tekst', exact: true }).click();
    await expect(uredjivac(page)).toBeFocused();
    await page.keyboard.type('Prvi');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Drugi');
    await page.keyboard.press('Escape');
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Prvi', 'Drugi']);

    await tabAnimacije(page);
    await page.getByRole('combobox', { name: 'Cilj' }).click();
    await page.getByRole('option', { name: 'Po pasusima' }).click();
    await expect(page.getByRole('combobox', { name: 'Cilj' })).toContainText('Po pasusima');
    await dodajUlaz(page, 'Postepeno');
    await expect.poll(() => animacijeUPut(mock, id)?.map(a => [a.slojId, a.pasus])).toEqual([['s1', 0], ['s1', 1]]);

    /**
     * Izabran sloj, Enter na okviru: uređivanje sa kursorom na kraju. Izbor "\nDrugi" Shift+strelicama (kraj prvog do
     * kraja drugog pasusa) i odmah jedan Backspace: jedan korak istorije.
     */
    const obrisiDrugi = async () => {
      await okvir(page).focus();
      await page.keyboard.press('Enter');
      await expect(uredjivac(page)).toBeFocused();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Backspace');
      await expect(uredjivac(page).locator('p')).toHaveCount(1);
      await expect(uredjivac(page)).toHaveText('Prvi');
    };

    // brisanje pa Ctrl+Z u tekstu pre Esc: oba pasusa i obe animacije ostaju
    await obrisiDrugi();
    await page.keyboard.press('Control+z');
    await expect(uredjivac(page).locator('p')).toHaveText(['Prvi', 'Drugi']);
    await page.keyboard.press('Escape');
    await expect(uredjivac(page)).toHaveCount(0);
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Prvi', 'Drugi']);
    expect(animacijeUPut(mock, id)!.map(a => a.pasus)).toEqual([0, 1]);

    // brisanje pa Esc: jedan pasus, jedna animacija, a dokument prolazi proveru servera
    await obrisiDrugi();
    await page.keyboard.press('Escape');
    await expect(uredjivac(page)).toHaveCount(0);
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Prvi']);
    expect(animacijeUPut(mock, id)!.map(a => [a.slojId, a.pasus])).toEqual([['s1', 0]]);
    expect(proveriKaoServer(poslednji(mock, id)!.platno as unknown as PlatnoModel)).toBeNull();
  });

  test('samo tastatura: tab Animacije, Tab do reda, Enter, "Trajanje (s)" 2 i Enter -> trajanjeMs 2000', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    await ubaciOblik(page, 'Pravougaonik');
    // okvir -> zaglavlje tabova (Svojstva), strelica desno do Animacije (tabovi menjaju fokus strelicama), Enter ga otvara
    const tabAnimacije = page.getByRole('tab', { name: 'Animacije' });
    await tasterDo(page, page.getByRole('tab', { name: 'Svojstva' }), 'Tab');
    for (let i = 0; i < 3 && !(await jeFokusiran(tabAnimacije)); i++) await page.keyboard.press('ArrowRight');
    await expect(tabAnimacije).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabAnimacije).toHaveAttribute('aria-selected', 'true');

    const dodaj = page.getByRole('button', { name: 'Dodaj ulaz' });
    await tasterDo(page, dodaj, 'Tab');
    await page.keyboard.press('Enter');
    // meni otvoren tastaturom fokusira prvu stavku (Pojavi); strelica dole do "Postepeno"
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    const postepeno = page.getByRole('menuitem', { name: 'Postepeno', exact: true });
    for (let i = 0; i < 7 && !(await jeFokusiran(postepeno)); i++) await page.keyboard.press('ArrowDown');
    await expect(postepeno).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => animacijeUPut(mock, id)?.map(a => [a.efekat, a.trajanjeMs])).toEqual([['FADE', 500]]);

    const red = page.locator('[data-animacija] > button').first();
    await tasterDo(page, red, 'Tab');
    await page.keyboard.press('Enter');
    await expect(red).toHaveAttribute('aria-pressed', 'true');
    const trajanje = page.getByRole('textbox', { name: 'Trajanje (s)' });
    await tasterDo(page, trajanje, 'Tab');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');
    await expect.poll(() => animacijeUPut(mock, id)?.map(a => a.trajanjeMs)).toEqual([2000]);
    await expect(trajanje).toHaveValue('2');
  });
});

test.describe('uživo: editor platna (4b, završni talas)', () => {
  const uredjivac = (page: Page) => page.getByRole('textbox', { name: /^Tekst sloja/ });

  test('samo tastatura: izbor dela teksta Shift+strelicama, F6, font iz panela, F6 nazad, kucanje dalje', async ({ page, mock }) => {
    const id = await novoPlatno(page, mock);
    // "Tekst" iz trake tastaturom: nov sloj odmah u uređivanju (fokus u tekstu)
    await traka(page).getByRole('button', { name: 'Tekst', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(uredjivac(page)).toBeFocused();
    await expect(uredjivac(page)).toHaveAttribute('aria-describedby', 'uz-ep-tekst-pomoc');
    await expect(page.locator('#uz-ep-tekst-pomoc')).toContainText('F6 prelazi u panel Svojstva');
    await page.keyboard.type('Statika');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
    // F6: prva kontrola panela teksta (Font), sesija ostaje (uređivač je i dalje tu)
    await page.keyboard.press('F6');
    const font = editor(page).getByRole('combobox', { name: 'Font' });
    await expect(font).toBeFocused();
    await expect(uredjivac(page)).toHaveCount(1);
    // font tastaturom: Enter otvara, Home pa tri puta dole = Tinos (redosled kataloga), Enter bira; fokus ostaje na izboru
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Font' })).toBeVisible();
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Tinos', exact: true })).toHaveClass(/mat-mdc-option-active/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Font' })).toHaveCount(0);
    await expect(font).toBeFocused();
    await expect(font).toContainText('Tinos');
    // F6 nazad: tekst sa sačuvanim izborom ("ika"), pa kucanje dalje sa kraja izbora
    await page.keyboard.press('F6');
    await expect(uredjivac(page)).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('ika');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' 1');
    await page.keyboard.press('Escape');
    await expect(okvir(page)).toBeFocused();
    await expect.poll(() => tekstUPut(mock, id, 's1')).toEqual(['Statika 1']);
    expect(slojUPut(mock, id, 's1')!.pasusi![0].delovi.map(d => [d.tekst, d.font])).toEqual([
      ['Stat', 'IBM Plex Sans'], ['ika 1', 'Tinos'],
    ]);
  });
});

/*
 * B-I1 (završna recenzija 4b B, Important 1): `svg` precrtavanja MathLive-a (`z-index: 2`) bez `isolation` na omotaču
 * formule bio je iznad overlay-a editora: klik na precrtani deo nije birao formulu, a `\cancel{\rule{500em}{500em}}`
 * pokrivao je celo platno, pa se mišem nije mogao izabrati nijedan sloj. Slajd 52 iz `fixtures/prezentacije.json`.
 */
test.describe('uživo: editor platna (4b, završni talas B): formula ne presreće pokazivač', () => {
  async function slajdSaFormulom(page: Page, mock: MockApi, latex: string): Promise<void> {
    const slajd = mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!.slajdovi[1];
    const platno = slajd.platno as unknown as Platno;
    platno.slojevi.find(s => s.id === 'formula')!.latex = latex;
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    await page.getByRole('button', { name: /^2\s/ }).click();
    await expect(slojEditora(page, 'formula').locator('.ML__latex')).toBeVisible();
  }
  const svojstva = (page: Page, vrsta: 'formule' | 'oblika') => editor(page).locator(`app-svojstva-${vrsta}`);

  test('klik na precrtani deo formule (\\cancel) bira formulu', async ({ page, mock }) => {
    await slajdSaFormulom(page, mock, '\\cancel{MMMMMM}');
    const precrtano = slojEditora(page, 'formula').locator('.uz-pl-formula-markup svg').first();
    await expect(precrtano).toBeAttached();
    const c = await centar(precrtano);
    await page.mouse.click(c.x, c.y);
    await expect(svojstva(page, 'formule')).toBeVisible();
  });

  test('\\cancel{\\rule{500em}{500em}} ne pokriva platno za miš: drugi sloj se bira klikom', async ({ page, mock }) => {
    await slajdSaFormulom(page, mock, '\\cancel{\\rule{500em}{500em}}');
    const c = await centar(slojEditora(page, 'oblik'));
    await page.mouse.click(c.x, c.y);
    await expect(svojstva(page, 'oblika')).toBeVisible();
    await expect(svojstva(page, 'formule')).toHaveCount(0);
  });
});

test.describe('uživo: prelaz slajda u formi (5e, F16)', () => {
  test('polja prelaza (lenji chunk) za PLATNO i INFO; PUT beleški nosi postojeći prelaz, a nikad ga ne briše', async ({ page, mock }) => {
    const prelaz = { efekat: 'GURANJE', smer: 'LEVO', trajanjeMs: 700 };
    mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!.slajdovi.find(s => s.id === 52)!.prelaz = prelaz;
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    // INFO 51 (izabran): bez prelaza
    const grupa = page.getByRole('group', { name: 'Prelaz na ovaj slajd' });
    await expect(grupa).toBeVisible();
    await expect(grupa.getByRole('combobox', { name: 'Efekat' })).toContainText('Bez prelaza');
    await expect(grupa.getByRole('combobox', { name: 'Smer' })).toHaveCount(0);
    // PLATNO 52: prelaz iz servera u poljima
    await page.locator('.uz-ed-stavka-dugme').nth(1).click();
    await expect(editor(page)).toBeVisible();
    await expect(grupa.getByRole('combobox', { name: 'Efekat' })).toContainText('Guranje');
    await expect(grupa.getByRole('combobox', { name: 'Smer' })).toContainText('Sleva');
    await expect(grupa.getByRole('textbox', { name: 'Trajanje (s)' })).toHaveValue('0,7');
    const beleske = page.getByRole('textbox', { name: 'Beleške za predavača' });
    await beleske.fill('Posle prelaza');
    await page.keyboard.press('Control+s');
    await expect.poll(() => (poslednji(mock, 52) as unknown as { beleske: string } | undefined)?.beleske).toBe('Posle prelaza');
    expect((poslednji(mock, 52) as unknown as { prelaz: unknown }).prelaz).toEqual(prelaz);
    // mok je puna zamena kao server: prelaz je i posle PUT-a tu
    expect(mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!.slajdovi.find(s => s.id === 52)!.prelaz).toEqual(prelaz);
  });
});
