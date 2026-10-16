import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/** Prezentacija i slajdovi iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO, 52 = PLATNO sa 3 KLIK animacije, 53 = crtež (5b). */
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

    // tasteri kao u PowerPointu (F18 m5): fokus je na dugmetu Pregleda; strelica i PageDown napred, Backspace i PageUp nazad
    await expect(nazad).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText('Korak 3 / 3');
    await expect(sloj(page, 'formula')).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(status).toHaveText('Korak 2 / 3');
    await page.keyboard.press('PageUp');
    await expect(status).toHaveText('Korak 1 / 3');
    await page.keyboard.press('PageDown');
    await expect(status).toHaveText('Korak 2 / 3');
  });

  test('Pusti slajd ide sam do poslednjeg koraka (tabovi onemogućeni); u uređivanju tab Animacije crta brojeve grupa', async ({ page }) => {
    await otvoriPlatnoSlajd(page);
    await expect(page.locator('.uz-ed-pregled')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Animacije' })).toBeDisabled();
    const status = page.locator('.uz-ep-korak');
    // međukoraci se beleže dok traju (MutationObserver), pa provera ne zavisi od toga da prozivanje uhvati prozor od ~900 ms
    await status.evaluate((el) => {
      const w = window as unknown as { koraci: string[] };
      w.koraci = [];
      new MutationObserver(() => w.koraci.push(el.textContent!.trim())).observe(el, { subtree: true, characterData: true, childList: true });
    });
    await page.getByRole('button', { name: 'Pusti slajd' }).click();
    await expect(status).toHaveText('Korak 3 / 3', { timeout: 10_000 });
    await expect(sloj(page, 'formula')).toBeVisible();
    const koraci = await page.evaluate(() => (window as unknown as { koraci: string[] }).koraci);
    expect(koraci.filter((k, i) => k !== koraci[i - 1])).toEqual(['Korak 1 / 3', 'Korak 2 / 3', 'Korak 3 / 3']);

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

/*
 * Formula bez slike izvora (F15/F19): projektor (`publika`) i konzola crtaju je pravim putem (snimak izvođenja ->
 * `platno-prikaz` -> lenji `mathlive/ssr` -> sanitizer -> markup), ne kroz učitavače iz specova komponenti. Slajd 2
 * izvođenja 7 dobija platno slajda 52 (FORMULA `M = F \cdot l`, `slikaIzvora: null`) bez animacija.
 */
test.describe('uživo: formula bez slike na projektoru i konzoli', () => {
  for (const stranica of ['publika', 'konzola'] as const) {
    test(`${stranica}: FORMULA bez slikaIzvora se crta MathLive markupom, fontovi iz assets/mathlive`, async ({ page, mock }) => {
      const platno = JSON.parse(JSON.stringify(mock.podaci.prezentacije[0].slajdovi[1].platno)) as {
        slojevi: { id: string; tip: string; latex?: string; slikaIzvora?: string | null }[]; animacije: unknown[];
      };
      const formula = platno.slojevi.find(s => s.id === 'formula')!;
      expect(formula).toMatchObject({ tip: 'FORMULA', slikaIzvora: null });
      platno.animacije = [];
      mock.izvodjenje.izmeniSlajd(1, { platno });
      for (let i = 0; i < 5; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3 koraka) -> slajd 2
      const zahtevi: string[] = [];
      page.on('request', r => zahtevi.push(new URL(r.url()).pathname));
      await nastavnickiBroker(page, mock);
      await page.goto(`izvodjenja/7/${stranica}`);

      const sloj = page.locator('[data-sloj="formula"]').first();
      await expect(sloj.locator('.ML__latex')).toBeVisible();
      // markup, ne rezervni prikaz izvora ni slika
      await expect(sloj.locator('img')).toHaveCount(0);
      await expect(sloj).not.toContainText('\\cdot');
      expect(zahtevi.some(p => p.includes('/assets/mathlive/') && p.endsWith('.css')), 'stil formula').toBe(true);
      // fontovi pre prikaza (spec 5): bar jedan KaTeX font, i svi samo iz assets/mathlive/fonts/
      await page.waitForLoadState('networkidle');
      const fontovi = zahtevi.filter(p => /KaTeX.*\.woff2$/.test(p));
      expect(fontovi.length, 'KaTeX fontovi su učitani').toBeGreaterThan(0);
      expect(fontovi.filter(p => !p.includes('/assets/mathlive/fonts/'))).toEqual([]);
    });
  }
  /*
   * B-I1 (završna recenzija 4b B, Important 1): MathLive za `\cancel` piše `svg` sa `z-index: 2`. Bez `isolation` na
   * omotaču formule taj `svg` se crtao iznad kasnijih slojeva (sloj bez rotacije, providnosti i senke nema stacking context).
   */
  test('publika: sloj posle precrtane formule (\\cancel) ostaje iznad nje', async ({ page, mock }) => {
    const platno = JSON.parse(JSON.stringify(mock.podaci.prezentacije[0].slajdovi[1].platno)) as {
      slojevi: { id: string; tip: string; latex?: string; x: number; y: number; sirina: number; visina: number }[]; animacije: unknown[];
    };
    const formula = platno.slojevi.find(s => s.id === 'formula')!;
    formula.latex = '\\cancel{MMMMMM}';
    const oblik = platno.slojevi.find(s => s.id === 'oblik')!;
    platno.slojevi.push({ ...oblik, id: 'pokrov', x: formula.x, y: formula.y, sirina: formula.sirina, visina: formula.visina });
    platno.animacije = [];
    mock.izvodjenje.izmeniSlajd(1, { platno });
    for (let i = 0; i < 5; i++) mock.izvodjenje.primeni('SLEDECI');
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    const precrtano = page.locator('[data-sloj="formula"] .uz-pl-formula-markup svg').first();
    await expect(precrtano).toBeAttached();
    await expect(page.locator('[data-sloj="pokrov"]')).toBeVisible();
    expect(await page.locator('[data-sloj="formula"] .uz-pl-formula-markup').evaluate(el => getComputedStyle(el).isolation)).toBe('isolate');
    const iznad = await precrtano.evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-sloj]')?.getAttribute('data-sloj');
    });
    expect(iznad).toBe('pokrov');
  });
});

/*
 * Crtež kao vektor (5b, plan faze 5 odluke 7-9, Review Focus 3). Slajd 5 izvođenja 7 (105) i slajd 3 prezentacije 5 (53)
 * imaju CRTEZ `crtez2` sa 2 izmišljena poteza i ISCRTAJ KLIK od 3000 ms (dovoljno dugo da animacija traje dok je test
 * čita). Snimak izvođenja nosi crtež bez poteza (`bezPoteza` u moku, kao server), pa ih projektor traži kroz
 * `GET slajdovi/105/potezi`; editor ima ceo dokument i ne traži ništa.
 */
test.describe('uživo: crtež kao vektor i iscrtavanje potez po potez (5b)', () => {
  const SLAJD_CRTEZA = 105;
  const IZVODJENJE = 7;
  const vektor = (page: Page) => page.locator('[data-crtez="vektor"] path[data-potez]');
  /** Prijava -> 101 (3 koraka) -> 102 (2) -> 103 (pitanje: otvori, zatvori) -> 104 -> 105 na koraku 0 (12 puta SLEDECI). */
  const naSlajdCrteza = (mock: MockApi, korak: 0 | 1) => {
    for (let i = 0; i < 12 + korak; i++) mock.izvodjenje.primeni('SLEDECI');
    expect(mock.izvodjenje.stanje()).toMatchObject({ trenutniSlajd: { id: SLAJD_CRTEZA }, korak });
  };
  /** CRTEZ slojevi trenutnog slajda u snimku (server ih šalje bez poteza). */
  const poteziUSnimku = (mock: MockApi) =>
    (mock.izvodjenje.stanje().trenutniSlajd!.platno as unknown as { slojevi: { tip: string; potezi: unknown }[] })
      .slojevi.filter(s => s.tip === 'CRTEZ').map(s => s.potezi);

  test('projektor: vektor iz jednog GET poteza (snimak ga nema), pa ISCRTAJ potez po potez, drugi kad se prvi završi', async ({ page, mock }) => {
    naSlajdCrteza(mock, 0);
    expect(poteziUSnimku(mock)).toEqual([null]);
    await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);

    // 1. vektor sa 2 putanje, iz tačno jednog zahteva
    await expect(vektor(page)).toHaveCount(2);
    await expect(page.locator('[data-crtez="slika"]')).toHaveCount(0);
    expect(mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(1);

    // 2. korak napred (tastatura projektora, kao daljinski): dve animacije putanja, druga počinje kad se prva završi
    const komande = mock.zahteviZa(`izvodjenja/${IZVODJENJE}/komande`, 'POST').length;
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => mock.zahteviZa(`izvodjenja/${IZVODJENJE}/komande`, 'POST').length).toBe(komande + 1);
    const animacijePoteza = () => page.evaluate(() => {
      const putanje = Array.from(document.querySelectorAll('path[data-potez]'));
      return document.getAnimations()
        .filter(a => (a.effect as KeyframeEffect | null)?.target?.matches?.('path[data-potez]'))
        .map(a => {
          const t = a.effect!.getTiming();
          return { indeks: putanje.indexOf((a.effect as KeyframeEffect).target!), delay: Number(t.delay), duration: Number(t.duration) };
        })
        .sort((x, y) => x.indeks - y.indeks);
    });
    // jedno čitanje: vrednost iz istog `evaluate` u kome su obe animacije postojale (ISCRTAJ traje 3000 ms)
    let animacije: Awaited<ReturnType<typeof animacijePoteza>> = [];
    await expect.poll(async () => (animacije = await animacijePoteza()).length).toBe(2);
    const [prva, druga] = animacije;
    expect([prva.indeks, druga.indeks]).toEqual([0, 1]);
    expect(prva.delay).toBe(0);
    expect(druga.delay).toBe(prva.delay + prva.duration);
    expect(prva.duration + druga.duration).toBe(3000);
    // ni sloj ni sadržaj se ne brišu preko slike (BRISANJE) kad potezi već postoje
    expect(await page.evaluate(() => document.getAnimations()
      .filter(a => (a.effect as KeyframeEffect | null)?.target?.matches?.('.uz-pl-sadrzaj')).length)).toBe(0);
    // novi snimak (korak 1) ne traži poteze ponovo (ponavljanje u pauzi i posle nje proveravaju testovi 500)
    expect(mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(1);
  });

  /** Odgovor 500 na `GET slajdovi/105/potezi` (registruje se pre `goto`, pa ga nijedan zahtev ne mimoiđe). */
  const odgovor500 = (page: Page) =>
    page.waitForResponse(r => r.url().endsWith(`/api/slajdovi/${SLAJD_CRTEZA}/potezi`) && r.status() === 500);

  test('projektor: GET poteza vrati 500 -> slika, a novi snimci i 2 s posle toga ne šalju nov zahtev (bez petlje)', async ({ page, mock }) => {
    mock.na('GET', 'slajdovi/:id/potezi', () => ({ status: 500, telo: { reason: 'Greška servera.', time: '' } }));
    naSlajdCrteza(mock, 1); // korak 1: crtež je vidljiv (kasno otvoren prozor ne animira)
    await nastavnickiBroker(page, mock);
    const greska = odgovor500(page);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    // slika je i fallback dok zahtev traje, pa se prvo čeka sam odgovor 500
    await greska;
    const posleGreske = Date.now();

    await expect(page.locator('[data-crtez="slika"] img')).toBeVisible();
    await expect(vektor(page)).toHaveCount(0);
    await expect.poll(() => mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(1);
    // dva nova snimka u pauzi od 10 s (korak nazad pa napred): efekat scene zove `ucitaj`, a zahtev ne ide
    const komande = () => mock.zahteviZa(`izvodjenja/${IZVODJENJE}/komande`, 'POST').length;
    await page.keyboard.press('ArrowLeft');
    await expect.poll(komande).toBe(1);
    await page.keyboard.press('ArrowRight');
    await expect.poll(komande).toBe(2);
    await expect(page.locator('[data-crtez="slika"] img')).toBeVisible();
    // namerno čekanje: meri se odsustvo zahteva (Review Focus 3); sve mora stati u pauzu od 10 s, jer posle nje
    // `PoteziCrteza` s pravom šalje jedan nov zahtev (sledeći test)
    await page.waitForTimeout(2000);
    expect(Date.now() - posleGreske, 'merenje odsustva je unutar pauze od 10 s').toBeLessThan(9000);
    expect(mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(1);
    await expect(page.locator('[data-crtez="slika"] img')).toBeVisible();
  });

  test('projektor: posle pauze od 10 s potezi se traže sami, bez novog snimka (500 pa 200 -> vektor)', async ({ page, mock }) => {
    let prvi = true;
    mock.na('GET', 'slajdovi/:id/potezi', (_z, _p, dalje) => {
      if (!prvi) return dalje();
      prvi = false;
      return { status: 500, telo: { reason: 'Greška servera.', time: '' } };
    });
    naSlajdCrteza(mock, 1);
    // lažni sat stranice: vreme teče, a `fastForward` preskače pauzu (bez čekanja od 10 s); lažni broker nema heartbeat
    await page.clock.install();
    const broker = await nastavnickiBroker(page, mock);
    const greska = odgovor500(page);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    await greska;
    await expect(page.locator('[data-crtez="slika"] img')).toBeVisible();
    await expect.poll(() => mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(1);
    // pretplata na početni snimak je već stigla, pa se broj pretplata ne čita usred povezivanja
    await expect.poll(() => broker.pretplate).toContain(`/app/izvodjenja/${IZVODJENJE}/nastavnik-pocetno`);
    const pretplata = broker.pretplate.length;
    const ostali = mock.zahtevi.filter(z => !z.putanja.endsWith('/potezi')).length;

    const uspeh = page.waitForResponse(r => r.url().endsWith(`/api/slajdovi/${SLAJD_CRTEZA}/potezi`) && r.status() === 200);
    await page.clock.fastForward(10_000);
    await uspeh;
    await expect(vektor(page)).toHaveCount(2);
    await expect(page.locator('[data-crtez="slika"]')).toHaveCount(0);
    expect(mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(2);
    // pokušaj je došao sam: ni nova pretplata (ponovno povezivanje = nov snimak), ni komanda, ni GET stanja
    expect(broker.pretplate.length).toBe(pretplata);
    expect(mock.zahtevi.filter(z => !z.putanja.endsWith('/potezi')).length).toBe(ostali);
    // posle uspeha nema daljih pokušaja
    await page.clock.fastForward(30_000);
    await expect(vektor(page)).toHaveCount(2);
    expect(mock.brojZahtevaPoteza(SLAJD_CRTEZA)).toBe(2);
  });

  test('editor (pun dokument): Uređivanje i Pregled crtaju vektor bez ijednog GET poteza', async ({ page, mock }) => {
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    const slajd3 = page.getByRole('button', { name: /^3\s/ });
    await expect(slajd3).toBeEnabled();
    await slajd3.click();
    await expect(page.locator('app-platno-editor app-platno-prikaz [data-crtez="vektor"] path[data-potez]')).toHaveCount(2);
    const pregled = page.getByRole('group', { name: 'Alati platna' }).getByRole('button', { name: 'Pregled' });
    await expect(pregled).toBeEnabled();
    await pregled.click();
    await expect(page.locator('.uz-ep-pregled [data-crtez="vektor"] path[data-potez]')).toHaveCount(2);
    await expect(page.locator('.uz-ep-pregled [data-crtez="slika"]')).toHaveCount(0);
    expect(mock.zahteviZa(/^slajdovi\/\d+\/potezi$/)).toEqual([]);
  });
});
