import type { Page } from '@playwright/test';

import { expect, test } from './fixture';

/** Prezentacija i slajdovi iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO, 52 = PLATNO sa 3 KLIK animacije. */
const PREZENTACIJA = 5;
const PLATNO_SLAJD = 52;

/** Sloj u režimu "Pregled" editora platna (F18: PLATNO slajd više nema bočni pregled stranice). */
const sloj = (page: Page, id: string) => page.locator(`.uz-ep-pregled [data-sloj="${id}"]`);

/** Izbor PLATNO slajda, pa prekidač "Pregled" u traci editora (koraci i animacije kao na projektoru). */
async function otvoriPlatnoSlajd(page: Page, vidljiv = 'naslov'): Promise<void> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await page.getByRole('button', { name: /^2\s/ }).click();
  await page.getByRole('group', { name: 'Alati platna' }).getByRole('button', { name: 'Pregled' }).click();
  await expect(sloj(page, vidljiv)).toBeVisible();
}

test.describe('uživo: lista slajdova sa sličicama', () => {
  for (const sirina of [390, 1280]) {
    test(`${sirina} px: oznaka slajda ostaje čitljiva, a Tab preskače link u sličici`, async ({ page }) => {
      await page.setViewportSize({ width: sirina, height: 800 });
      await page.goto(`prezentacije/${PREZENTACIJA}`);
      const stavka = page.locator('.uz-ed-stavka-dugme').first();
      await expect(stavka.locator('a')).toHaveCount(1);
      await expect(stavka.locator('.uz-ed-oznaka')).toBeVisible();
      expect((await stavka.locator('.uz-ed-oznaka').boundingBox())!.width).toBeGreaterThan(60);
      await stavka.focus();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.uz-ed-slicica') !== null)).toBe(false);
    });
  }
});

test.describe('uživo: editor sa PLATNO slajdom', () => {
  test('pregled prikazuje slojeve, korak napred ih otkriva redom, korak nazad ih vraća', async ({ page }) => {
    await otvoriPlatnoSlajd(page);
    const status = page.locator('.uz-ep-korak');
    await expect(status).toHaveText('Korak 0 / 3');
    for (const id of ['naslov', 'slika', 'crtez']) {
      await expect(sloj(page, id)).toBeVisible();
    }
    for (const id of ['oblik', 'tabela', 'formula']) {
      await expect(sloj(page, id)).toBeHidden();
    }

    const napred = page.getByRole('button', { name: 'Korak napred' });
    const nazad = page.getByRole('button', { name: 'Korak nazad' });
    await expect(nazad).toBeDisabled();
    const redom = ['oblik', 'tabela', 'formula'];
    for (const [i, id] of redom.entries()) {
      await napred.click();
      await expect(status).toHaveText(`Korak ${i + 1} / 3`);
      await expect(sloj(page, id)).toBeVisible();
      for (const kasniji of redom.slice(i + 1)) {
        await expect(sloj(page, kasniji)).toBeHidden();
      }
    }
    await expect(napred).toBeDisabled();

    await nazad.click();
    await expect(status).toHaveText('Korak 2 / 3');
    await expect(sloj(page, 'formula')).toBeHidden();
    await expect(sloj(page, 'tabela')).toBeVisible();
  });

  test('Pusti slajd ide sam do poslednjeg koraka (tabovi onemogućeni); u uređivanju tab Animacije crta brojeve grupa', async ({ page }) => {
    await otvoriPlatnoSlajd(page);
    await expect(page.locator('.uz-ed-pregled')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Animacije' })).toBeDisabled();
    const status = page.locator('.uz-ep-korak');
    await page.getByRole('button', { name: 'Pusti slajd' }).click();
    await expect(status).toHaveText('Korak 1 / 3');
    await expect(status).toHaveText('Korak 3 / 3', { timeout: 10_000 });
    await expect(sloj(page, 'formula')).toBeVisible();

    await page.getByRole('button', { name: 'Uređivanje' }).click();
    await expect(page.locator('.uz-ep-pregled')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Animacije' }).click();
    await expect(page.locator('.uz-ep-znacka')).toHaveText(['1', '2', '3']);
    await page.getByRole('tab', { name: 'Svojstva' }).click();
    await expect(page.locator('.uz-ep-znacka')).toHaveCount(0);
  });

  test('izmena beleški šalje PUT /slajdovi/{id} sa istim platnom (slojevi se ne brišu)', async ({ page, mock }) => {
    const pre = JSON.parse(JSON.stringify(mock.podaci.prezentacije[0].slajdovi[1].platno)) as unknown;
    await otvoriPlatnoSlajd(page);
    const beleske = page.locator('app-slajd-forma textarea');
    await beleske.fill('Nove beleške o nosaču');
    await expect.poll(() => mock.zahteviZa(`slajdovi/${PLATNO_SLAJD}`, 'PUT').length).toBe(1);
    const telo = mock.zahteviZa(`slajdovi/${PLATNO_SLAJD}`, 'PUT')[0].telo as { tip: string; beleske: string; platno: unknown };
    expect(telo.tip).toBe('PLATNO');
    expect(telo.beleske).toBe('Nove beleške o nosaču');
    expect(telo.platno).toEqual(pre);
    await expect(sloj(page, 'crtez')).toBeVisible();
  });

  /*
   * Regresija (Chromium): brzi "Korak napred" do koraka u kome sloj izlazi (IZLAZ) ostavljao je sadržaj tog sloja
   * vidljiv (a ulazne slojeve skrivene) i posle kraja svih animacija: sloj je `hidden`, a njegov `.uz-pl-sadrzaj` je
   * zadržao zastareo računski stil iz otkazane animacije. Raspored liči na demo slajd 2: k1 ULET + SA_PRETHODNIM,
   * k2 PODELI, k3 BRISANJE + POSLE_PRETHODNOG, k4 IZLAZ sloja `slika`.
   */
  test('brzi koraci napred: posle svake serije vidi se tačno krajnje stanje (IZLAZ skriven, ULAZ vidljiv)', async ({ page, mock }) => {
    test.setTimeout(120_000);
    const a = (id: string, slojId: string, efekat: string, okidac: string, izmene: Record<string, unknown> = {}) => ({
      id, slojId, pasus: null, vrsta: 'ULAZ', efekat, smer: null, okidac, trajanjeMs: 500, kasnjenjeMs: 0, ...izmene,
    });
    const slajd = mock.podaci.prezentacije[0].slajdovi[1];
    (slajd.platno as { animacije: unknown[] }).animacije = [
      a('b1', 'oblik', 'ULET', 'KLIK', { smer: 'LEVO' }),
      a('b2', 'tabela', 'ULET', 'SA_PRETHODNIM', { smer: 'DOLE' }),
      a('b3', 'formula', 'PODELI', 'KLIK', { smer: 'HORIZONTALNO' }),
      a('b4', 'crtez', 'BRISANJE', 'KLIK', { smer: 'DESNO' }),
      a('b5', 'naslov', 'ZUM', 'POSLE_PRETHODNOG'),
      a('b6', 'slika', 'FADE', 'KLIK', { vrsta: 'IZLAZ' }),
    ];
    await otvoriPlatnoSlajd(page, 'slika');
    const status = page.locator('.uz-ep-korak');
    await expect(status).toHaveText('Korak 0 / 4');

    /** Slojevi čiji sloj ili sadržaj ne odgovara očekivanom (računski stil, isto što vidi korisnik). */
    const pogresni = (vidljivi: string[]) => page.evaluate((vidljivi) => {
      const rezultat: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.uz-ep-pregled .uz-pl-sloj')) {
        const ocekivano = vidljivi.includes(el.dataset['sloj'] ?? '') ? 'visible' : 'hidden';
        const sadrzaj = el.querySelector(':scope > .uz-pl-sadrzaj')!;
        const stvarno = [getComputedStyle(el).visibility, getComputedStyle(sadrzaj).visibility];
        if (stvarno.some((v) => v !== ocekivano)) {
          rezultat.push(`${el.dataset['sloj']}: sloj ${stvarno[0]}, sadržaj ${stvarno[1]}, očekivano ${ocekivano}`);
        }
      }
      return rezultat;
    }, vidljivi);
    const bezAnimacija = () => expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    /** Klikne dugme `naziv` `n` puta u stranici, sa `razmakMs` između klikova (brže nego što animacija traje). */
    const serija = (naziv: string, n: number, razmakMs: number) => page.evaluate(async ({ naziv, n, razmakMs }) => {
      const dugme = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(naziv))!;
      for (let i = 0; i < n; i++) {
        dugme().click();
        await new Promise((r) => setTimeout(r, razmakMs));
      }
    }, { naziv, n, razmakMs });

    const greske: string[] = [];
    // Staro ponašanje je padalo u ~4 od 25 serija; 15 serija ga hvata u velikoj većini pokretanja, a test traje ~30 s.
    // Pokriva put editora (dugmad koraka); projektor deli isti renderer, a njegovu putanju kroz snimke pokrivaju unit testovi.
    const RAZMACI = [20, 35, 50, 65, 80];
    for (let i = 0; i < 15; i++) {
      await serija('Korak napred', 4, RAZMACI[i % RAZMACI.length]);
      await expect(status).toHaveText('Korak 4 / 4');
      await bezAnimacija();
      for (const g of await pogresni(['naslov', 'oblik', 'tabela', 'formula', 'crtez'])) {
        greske.push(`ponavljanje ${i}, korak 4: ${g}`);
      }
      await serija('Korak nazad', 4, 20);
      await expect(status).toHaveText('Korak 0 / 4');
      await bezAnimacija();
      for (const g of await pogresni(['slika'])) {
        greske.push(`ponavljanje ${i}, korak 0: ${g}`);
      }
    }
    expect(greske).toEqual([]);

    // Sloj koji izlazi se vidi dok njegova animacija traje (sloj je već `hidden`, sadržaj ima inline `visible`).
    await serija('Korak napred', 3, 20);
    await expect(status).toHaveText('Korak 3 / 4');
    await bezAnimacija();
    const tokomIzlaza = await page.evaluate(async () => {
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Korak napred'))!.click();
      const sadrzaj = document.querySelector('.uz-ep-pregled [data-sloj="slika"] > .uz-pl-sadrzaj')!;
      const rok = performance.now() + 250; // FADE traje 500 ms: animacija mora da je počela, a još traje
      while (sadrzaj.getAnimations().length === 0 && performance.now() < rok) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { animacija: sadrzaj.getAnimations().length, vidljivost: getComputedStyle(sadrzaj).visibility };
    });
    expect(tokomIzlaza).toEqual({ animacija: 1, vidljivost: 'visible' });
    await bezAnimacija();
    expect(await pogresni(['naslov', 'oblik', 'tabela', 'formula', 'crtez'])).toEqual([]);
  });

  test('mereni tabovi: tab se završava na visećoj stanici, sopstvenom stopu i podrazumevanom stopu (36) od margine okvira', async ({ page, mock }) => {
    const deo = (tekst: string, font = 'Carlito') => ({
      tekst, font, velicina: 20, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
    });
    const pasus = (delovi: unknown[], izmene: Record<string, unknown>) => ({
      poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0,
      proredProcenat: 100, tabulatori: [], delovi, ...izmene,
    });
    const naslov = (mock.podaci.prezentacije[0].slajdovi[1].platno as { slojevi: { id: string; pasusi?: unknown[] }[] })
      .slojevi.find((s) => s.id === 'naslov')!;
    naslov.pasusi = [
      pasus([deo('a)\tviseća stanica')], { uvlacenje: { levo: 36, prviRed: -36 } }),
      pasus([deo('Ime'), deo('\tPrezime', 'Tinos'), deo('\tIndeks')], { tabulatori: [{ poz: 150, poravnanje: 'LEVO' }, { poz: 300, poravnanje: 'LEVO' }] }),
      pasus([deo('Uvlačenje 18\ttab')], { uvlacenje: { levo: 18, prviRed: 0 } }),
    ];
    await otvoriPlatnoSlajd(page);
    await page.evaluate(() => document.fonts.ready);
    /** Desna ivica svakog `.uz-pl-tab` u jedinicama od leve ivice pasusa (= unutrašnja margina okvira). */
    const krajevi = () => sloj(page, 'naslov').evaluate((s) => {
      const px = s.closest<HTMLElement>('.uz-pl-platno')!.getBoundingClientRect().width / 960;
      return Array.from(s.querySelectorAll<HTMLElement>('p[data-meri-tabove]')).map((p) => Array.from(
        p.querySelectorAll('.uz-pl-tab'), (t) => (t.getBoundingClientRect().right - p.getBoundingClientRect().left) / px));
    });
    await expect.poll(async () => (await krajevi()).flat().length).toBe(4);
    const [visece, kolone, uvlacenje] = await krajevi();
    expect(visece[0]).toBeCloseTo(36, 0);
    expect(kolone[0]).toBeCloseTo(150, 0);
    expect(kolone[1]).toBeCloseTo(300, 0);
    // "Uvlačenje 18" je širi od 36 jedinica: sledeći podrazumevani stop je umnožak 36 od margine, ne od uvlačenja.
    expect(uvlacenje[0] % 36 < 0.5 || uvlacenje[0] % 36 > 35.5).toBe(true);
    expect(uvlacenje[0]).toBeGreaterThan(36);
    // Znak taba ostaje u tekstu (kopiranje, čitač ekrana), a ne crta se sam (`tab-size: 0`).
    expect(await sloj(page, 'naslov').locator('p').first().evaluate((p) => p.textContent)).toBe('a)\tviseća stanica');
  });

  test('izbor teme šalje PUT /prezentacije/{id} sa temom, a uzorak nosi --uz-tema-pozadina te teme', async ({ page, mock }) => {
    await otvoriPlatnoSlajd(page);
    await page.getByRole('button', { name: /Podešavanja/ }).click();
    const uzorak = page.locator('mat-radio-button', { hasText: 'Ponoć' }).locator('.uz-ed-uzorak');
    await expect(uzorak).toBeVisible();
    expect(await uzorak.evaluate(e => (e as HTMLElement).style.getPropertyValue('--uz-tema-pozadina'))).toBe('#0F1B2D');
    expect(await uzorak.evaluate(e => getComputedStyle(e).getPropertyValue('--uz-tema-pozadina').trim())).toBe('#0F1B2D');
    const papir = page.locator('mat-radio-button', { hasText: 'Papir' }).locator('.uz-ed-uzorak');
    expect(await papir.evaluate(e => getComputedStyle(e).getPropertyValue('--uz-tema-pozadina').trim())).toBe('#FAF7F2');

    await page.getByRole('radio', { name: /Ponoć/ }).check();
    await expect.poll(() => mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'PUT').length).toBe(1);
    expect((mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'PUT')[0].telo as { tema: string }).tema).toBe('PONOC');
  });
});
