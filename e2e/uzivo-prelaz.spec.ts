import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Prelaz slajda (faza 5e, plan odluke 11-14, Review Focus 4). Izvođenje 7 (`fixtures/uzivo-izvodjenje.json`, izmišljeno):
 * 104 (INFO) ima GURANJE zdesna 3000 ms, 105 (PLATNO) FADE 3000 ms i grupu 0 (naslov FADE 2000 ms posle prethodnog).
 * Prelazi traju 3 s, pa stanje "prelaz traje" sigurno postoji dok ga test čita. Provere "nikad dva slajda" čitaju
 * vrhunac koji `MutationObserver` beleži od pre komande (`pratiVrhunac`), a ne uzorak u jednom trenutku.
 */
const IZVODJENJE = 7;
const TEMA = `/topic/izvodjenja/${IZVODJENJE}/nastavnik`;
const SLAJDOVI = '.uz-scena-slajdovi app-slajd-prikaz';

/** Prijava -> 101 (3 koraka) -> 102 (2) -> 103 (pitanje: otvori, zatvori): 10 puta SLEDECI do zatvorenog pitanja 103. */
function doSlajda(mock: MockApi, broj: 10 | 11 | 12): void {
  for (let i = 0; i < broj; i++) mock.izvodjenje.primeni('SLEDECI');
  const id = { 10: 103, 11: 104, 12: 105 }[broj];
  expect(mock.izvodjenje.stanje()).toMatchObject({ prikaz: 'SLAJD', trenutniSlajd: { id }, korak: 0 });
}

/**
 * Pre komande: `MutationObserver` na sceni (`subtree`: omotači su nekoliko nivoa ispod) u `window.__vrhunac` pamti najveći
 * broj prikaza slajda u `.uz-scena-slajdovi`, posle svake mutacije i odmah pri postavljanju.
 */
async function pratiVrhunac(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __vrhunac: number };
    const scena = document.querySelector('app-publika-scena')!;
    const broj = () => scena.querySelectorAll('.uz-scena-slajdovi app-slajd-prikaz').length;
    w.__vrhunac = broj();
    new MutationObserver(() => {
      w.__vrhunac = Math.max(w.__vrhunac, broj());
    }).observe(scena, { childList: true, subtree: true });
  });
}
const vrhunac = (page: Page) => page.evaluate(() => (window as unknown as { __vrhunac: number }).__vrhunac);

/** U jednom čitanju: broj prikaza slajda u sceni i ciljevi svih WAAPI animacija na stranici. */
const scena = (page: Page) => page.evaluate(() => ({
  slajdova: document.querySelectorAll('app-publika-scena .uz-scena-slajdovi app-slajd-prikaz').length,
  ciljevi: document.getAnimations().map((a) => {
    const t = (a.effect as KeyframeEffect | null)?.target ?? null;
    if (!t) return 'bez cilja';
    if (t.matches('.uz-scena-ulazni')) return 'ulazni';
    if (t.matches('.uz-scena-odlazni')) return 'odlazni';
    return t.closest('.uz-pl-sloj') ? 'sloj' : 'ostalo';
  }),
}));

async function posalji(page: Page, mock: MockApi, komanda: 'SLEDECI' | 'PRETHODNI', broker: Awaited<ReturnType<typeof nastavnickiBroker>>) {
  const ishod = mock.izvodjenje.primeni(komanda);
  expect(ishod.status).toBe(200);
  broker.posalji(TEMA, ishod.telo);
}

test.describe('uživo: prelaz slajda na projektoru (5e)', () => {
  test('publika, SLEDECI na GURANJE 3000: dva slajda dok traje, animacija ulaznog omotača, pa jedan', async ({ page, mock }) => {
    doSlajda(mock, 10);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    await expect(page.locator(SLAJDOVI)).toHaveCount(1);
    await expect(page.locator('app-publika-scena')).toContainText('Koja je jedinica za silu?');
    await pratiVrhunac(page);

    await posalji(page, mock, 'SLEDECI', broker);
    await expect(page.locator(SLAJDOVI)).toHaveCount(2);
    // odlazni je pitanje iz prethodnog snimka (aria-hidden), ulazni je nov slajd
    await expect(page.locator('.uz-scena-odlazni')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.uz-scena-ulazni')).toContainText('Za sledeći čas');
    await expect.poll(async () => (await scena(page)).ciljevi).toEqual(expect.arrayContaining(['ulazni', 'odlazni']));
    await expect(page.locator(SLAJDOVI)).toHaveCount(1, { timeout: 6000 });
    await expect(page.locator('.uz-scena-ulazni')).toContainText('Za sledeći čas');
    // posle kraja: ulaznom je animacija prekinuta (bez upisanog stila), odlaznog nema
    expect((await scena(page)).ciljevi.filter(c => c === 'ulazni' || c === 'odlazni')).toEqual([]);
    expect(await page.locator('.uz-scena-ulazni').getAttribute('style')).toBeFalsy();
    expect(await vrhunac(page)).toBe(2);
  });

  test('publika, PRETHODNI (nazad na slajd sa prelazom): bez prelaza, nikad dva slajda', async ({ page, mock }) => {
    doSlajda(mock, 12);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    await expect(page.locator('[data-sloj="naslov5"]')).toBeVisible();
    await pratiVrhunac(page);

    await posalji(page, mock, 'PRETHODNI', broker);
    await expect(page.locator('app-publika-scena')).toContainText('Za sledeći čas');
    await page.waitForTimeout(500); // meri se odsustvo drugog slajda posle novog snimka, ne čeka se uslov
    expect(await vrhunac(page)).toBe(1);
    expect((await scena(page)).ciljevi).not.toContain('ulazni');
  });

  test('publika sa prefers-reduced-motion: SLEDECI bez prelaza', async ({ page, mock }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    doSlajda(mock, 10);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    await expect(page.locator('app-publika-scena')).toContainText('Koja je jedinica za silu?');
    await pratiVrhunac(page);

    await posalji(page, mock, 'SLEDECI', broker);
    await expect(page.locator('app-publika-scena')).toContainText('Za sledeći čas');
    await page.waitForTimeout(500); // odsustvo prelaza
    expect(await vrhunac(page)).toBe(1);
  });

  test('konzola (umanjena scena): SLEDECI bez prelaza', async ({ page, mock }) => {
    doSlajda(mock, 10);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/konzola`);
    await expect(page.locator('app-publika-scena')).toContainText('Koja je jedinica za silu?');
    await pratiVrhunac(page);

    await posalji(page, mock, 'SLEDECI', broker);
    await expect(page.locator('app-publika-scena')).toContainText('Za sledeći čas');
    await page.waitForTimeout(500); // odsustvo prelaza
    expect(await vrhunac(page)).toBe(1);
  });

  test('publika, PLATNO sa grupom 0 i FADE 3000: grupa 0 tek posle prelaza (Review Focus 4)', async ({ page, mock }) => {
    doSlajda(mock, 11);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    await expect(page.locator('app-publika-scena')).toContainText('Za sledeći čas');
    await pratiVrhunac(page);

    await posalji(page, mock, 'SLEDECI', broker);
    // jedno čitanje dok su oba slajda u sceni: animira se samo ulazni omotač (FADE nema odlazni pokret), nijedan sloj
    let tokom: Awaited<ReturnType<typeof scena>> = { slajdova: 0, ciljevi: [] };
    await expect.poll(async () => {
      tokom = await scena(page);
      return tokom.slajdova === 2 && tokom.ciljevi.includes('ulazni');
    }).toBe(true);
    expect(tokom.ciljevi).not.toContain('sloj');
    expect(tokom.ciljevi).not.toContain('odlazni');
    // naslov grupe 0 je skriven dok prelaz traje (korak -1)
    await expect(page.locator('.uz-scena-ulazni [data-sloj="naslov5"]')).toBeHidden();

    await expect(page.locator(SLAJDOVI)).toHaveCount(1, { timeout: 6000 });
    await expect.poll(async () => (await scena(page)).ciljevi).toContain('sloj');
    await expect(page.locator('[data-sloj="naslov5"]')).toBeVisible();
    expect(await vrhunac(page)).toBe(2);
  });

  /*
   * Recenzija F17, Minor 1: odlazni slajd (pitanje sa formulama i slikom) ne sme ni u jednom kadru prelaza da pokaže LaTeX
   * izvor ili praznu sliku. Provera je stroga: u svakom pozivu `MutationObserver`-a (mikrozadatak posle izmene DOM-a, pre
   * crtanja kadra) odlazni omotač već ima sve formule nacrtane i sliku učitanu, pa nijedan kadar ne može da ih nema.
   */
  test('publika: odlazni slajd sa formulama i slikom je u svakom kadru prelaza već nacrtan', async ({ page, mock }) => {
    mock.izvodjenje.izmeniSlajd(2, {
      pitanje: {
        id: 51, tip: 'JEDAN_TACAN', tekst: 'Koliko je $\\frac{1}{2}+\\frac{1}{3}$?', vremeSekunde: null,
        slika: { id: '00000000-0000-4000-8000-0000000000a1', naziv: 'Skica', mime: 'image/png', velicina: 68 },
        opcije: [
          { id: 1, rb: 1, tekst: '$\\frac{5}{6}$', tacna: true },
          { id: 2, rb: 2, tekst: '$\\frac{2}{5}$', tacna: false },
        ],
        brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
        prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
      },
    });
    doSlajda(mock, 10);
    const broker = await nastavnickiBroker(page, mock);
    await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
    const nacrtane = page.locator('app-publika-scena .uz-formula--spremna .ML__latex');
    await expect(nacrtane).toHaveCount(3);
    await expect.poll(() => page.locator('app-publika-scena img.uz-slajd-slika').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    await page.evaluate(() => {
      const w = window as unknown as { __odlazni: { mutacija: number; formula: number; nenacrtanih: number; slikaSpremna: boolean; dolar: boolean }[] };
      w.__odlazni = [];
      const scena = document.querySelector('app-publika-scena')!;
      let n = 0;
      new MutationObserver(() => {
        n++;
        const o = scena.querySelector('.uz-scena-odlazni');
        if (!o) return;
        const img = o.querySelector<HTMLImageElement>('img.uz-slajd-slika');
        w.__odlazni.push({
          mutacija: n,
          formula: o.querySelectorAll('.uz-formula').length,
          nenacrtanih: o.querySelectorAll('.uz-formula:not(.uz-formula--spremna)').length,
          slikaSpremna: !!img && img.complete && img.naturalWidth > 0,
          dolar: (o.textContent ?? '').includes('$'),
        });
      }).observe(scena, { childList: true, subtree: true, attributes: true, characterData: true });
    });

    await posalji(page, mock, 'SLEDECI', broker);
    await expect(page.locator(SLAJDOVI)).toHaveCount(2);
    await expect(page.locator(SLAJDOVI)).toHaveCount(1, { timeout: 6000 });
    const zapisi = await page.evaluate(() => (window as unknown as { __odlazni: unknown[] }).__odlazni);
    expect(zapisi.length, 'odlazni omotač je viđen').toBeGreaterThan(0);
    expect(zapisi.filter((z) => {
      const x = z as { formula: number; nenacrtanih: number; slikaSpremna: boolean; dolar: boolean };
      return x.formula !== 3 || x.nenacrtanih > 0 || !x.slikaSpremna || x.dolar;
    }), 'kadrovi odlaznog slajda bez formula ili slike').toEqual([]);
  });
});

test.describe('uživo: prelaz slajda u editoru (5e)', () => {
  const PREZENTACIJA = 5;
  const NOV = 54;
  /** INFO slajd 54 posle PLATNO slajda 53 (prethodni slajd pregleda je platno, crta se posle svih koraka). */
  const dodajInfo = (mock: MockApi) => {
    const p = mock.podaci.prezentacije.find(x => x.id === PREZENTACIJA)!;
    p.slajdovi.push({
      id: NOV, rb: p.slajdovi.length + 1, tip: 'INFO', naslov: 'Zaključak', sadrzaj: 'Sile su u ravnoteži.', slika: null,
      beleske: null, postepeno: false, pitanje: null, platno: null, prelaz: null,
    });
  };

  test('forma INFO: Guranje, Zdesna, 0,8 s -> PUT {GURANJE, DESNO, 800}; dvoklik "Pregledaj prelaz" -> jedan dijalog, fokus, Esc', async ({ page, mock }) => {
    dodajInfo(mock);
    await page.goto(`prezentacije/${PREZENTACIJA}`);
    await page.getByRole('button', { name: /^4\s/ }).click();
    const grupa = page.getByRole('group', { name: 'Prelaz na ovaj slajd' });
    await grupa.getByRole('combobox', { name: 'Efekat' }).click();
    await page.getByRole('option', { name: 'Guranje' }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await grupa.getByRole('combobox', { name: 'Smer' }).click();
    await page.getByRole('option', { name: 'Zdesna' }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const trajanje = grupa.getByRole('textbox', { name: 'Trajanje (s)' });
    await expect(trajanje).toHaveValue('0,5');
    // decimalni zarez (sr-Latn) ne sme dati 0 ms
    await trajanje.fill('0,8');
    await expect(trajanje).not.toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Control+s');
    await expect.poll(() => (mock.zahteviZa(`slajdovi/${NOV}`, 'PUT').at(-1)?.telo as { prelaz?: unknown } | undefined)?.prelaz)
      .toEqual({ efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 800 });

    // neispravno trajanje: greška na samom polju (mat-error, aria-invalid) i u zbirnoj listi
    await trajanje.fill('9');
    await expect(trajanje).toHaveAttribute('aria-invalid', 'true');
    await expect(grupa.locator('mat-error')).toContainText('od 0,1 do 5');
    await expect(page.getByText('Trajanje prelaza mora biti od 0,1 do 5 sekundi.')).toBeVisible();
    // 4 s: pregled traje dovoljno dugo da se oba slajda vide
    await trajanje.fill('4');
    await expect(trajanje).not.toHaveAttribute('aria-invalid', 'true');

    await grupa.getByRole('button', { name: 'Pregledaj prelaz' }).dblclick();
    const dijalog = page.getByRole('dialog', { name: 'Pregled prelaza' });
    await expect(dijalog).toBeVisible();
    await expect(page.locator('mat-dialog-container')).toHaveCount(1);
    await expect(dijalog.locator('app-slajd-prikaz')).toHaveCount(2);
    await expect(dijalog.getByRole('button', { name: 'Ponovi' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
  });
});
