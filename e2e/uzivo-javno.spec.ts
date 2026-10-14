import type { Page } from '@playwright/test';
import { test as osnovniTest } from './fixture';
import { expect, test } from './javna-mreza';
import { NIZ_MATHLIVE, NIZ_PROSEMIRROR, NIZOVI_EDITORA } from './nizovi-editora';
import { lazniBroker } from './lazni-stomp';

/** Kod aktivnog izvođenja iz `fixtures/uzivo.json` (izmišljen). */
const KOD = '123456';
const IZVODJENJE = 7;

/** Početni snimak "čeka se početak" (javno + lično), kao `PublicUzivoStompController`. */
const pocetno = (ime: string) => ({
  javno: {
    izvodjenjeId: IZVODJENJE, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
    kod: KOD, prikaz: 'PRIJAVA', slajdTip: null, ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: false, brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null,
  },
  licno: { verzija: 1, ucesnikId: 10_000, ime, poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
});

test.describe('javni uživo (telefon studenta, bez basic-auth-a)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: /^(GET \/api\/public\/uzivo\/\d{6}(\/ja)?|POST \/api\/public\/uzivo\/\d{6}\/prijava)$/,
  });

  test('kod pa ime: samo api/public/uzivo i api/public/ws, nijedan 401; posle prijave "Čekamo početak"', async ({ page, mock, javnaMreza }) => {
    let ime = '';
    const zahtevi: string[] = [];
    page.on('request', r => zahtevi.push(new URL(r.url()).pathname));
    // veze kroz `page.routeWebSocket` ne izazivaju događaj `websocket`, pa putanju upisuje broker
    const broker = await lazniBroker(
      page, 'api/public/ws',
      o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? pocetno(ime) : undefined),
      url => javnaMreza.ws.push(new URL(url).pathname),
    );

    await page.goto('uzivo');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Uživo');
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0);
    const kod = page.getByLabel('Kod sa table');
    await expect(kod).toBeVisible();

    // šesta cifra sama proverava kod i vodi na uzivo/:kod
    await kod.fill(KOD);
    await expect(page).toHaveURL(new RegExp(`/uzivo/${KOD}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statika · uvodni čas');

    ime = 'Mina';
    await page.getByLabel('Tvoje ime').fill(ime);
    await page.getByRole('button', { name: 'Uđi' }).click();
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await expect(page.getByText('Ti si: Mina')).toBeVisible();

    expect(mock.zahteviZa(`public/uzivo/${KOD}/prijava`, 'POST')[0].telo).toEqual({ ime: 'Mina' });
    expect(javnaMreza.api).toEqual([
      `GET /api/public/uzivo/${KOD}`,
      `GET /api/public/uzivo/${KOD}`,
      `GET /api/public/uzivo/${KOD}/ja`,
      `POST /api/public/uzivo/${KOD}/prijava`,
    ]);
    // javna ruta ne vuče fontove platna (spec 13): ni jedan zahtev za carlito, caladea, arimo, tinos, cousine, atkinson
    expect(zahtevi.filter(p => /carlito|caladea|arimo|tinos|cousine|atkinson/i.test(p)), 'fontovi platna na javnoj ruti').toEqual([]);
    expect(javnaMreza.ws).toEqual(['/api/public/ws']);
    // nijedan učitan JS (glavni bundle i lenji chunk-ovi stranica studenta) nema fflate, kod uvoza PPTX-a ni kod editora platna
    const skripte = await javnaMreza.skripte();
    expect(skripte.putanje.some(p => /\/main-[^/]+\.js$/.test(p)), 'provera je pročitala glavni bundle').toBe(true);
    expect(skripte.putanje.length, 'lenji chunk-ovi javne rute su provereni').toBeGreaterThan(1);
    expect(skripte.saUvozom).toEqual([]);
    expect(skripte.saEditorom).toEqual([]);
    // provera nizova pokriva i biblioteke 4b (ProseMirror, MathLive), a formule se ovde ne učitavaju (ni stil ni fontovi)
    expect(NIZOVI_EDITORA).toEqual(expect.arrayContaining([NIZ_PROSEMIRROR, NIZ_MATHLIVE]));
    expect(javnaMreza.zahtevi.filter(p => p.includes('/assets/mathlive/'))).toEqual([]);
    expect(javnaMreza.zahtevi.length, 'zahtevi su zabeleženi').toBeGreaterThan(1);
    // samo odredišta koja backend dozvoljava studentu
    expect([...broker.pretplate].sort()).toEqual([
      `/app/izvodjenja/${IZVODJENJE}/pocetno`, `/topic/izvodjenja/${IZVODJENJE}/javno`, '/user/queue/greske', '/user/queue/licno',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nepoznat kod: poruka uz polje, ostaje na unosu koda', async ({ page }) => {
    await page.goto('uzivo');
    await page.getByLabel('Kod sa table').fill('000000');
    await expect(page.getByText('Izvođenje sa tim kodom ne postoji ili je završeno.')).toBeVisible();
    await expect(page).toHaveURL(/\/uzivo$/);
  });
});

/** Dugačka formula (izvor 113 znakova): bez preloma bi na 360 px bila šira od ekrana. */
const DUGA_FORMULA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9}{b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9}=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8$';

/** Snimak sa otvorenim pitanjem (režim PITANJE: tekst i opcije na telefonu) sa dugačkom formulom u tekstu i opciji. */
const saFormulom = (ime: string) => {
  const p = pocetno(ime);
  return {
    licno: p.licno,
    javno: {
      ...p.javno, prikaz: 'SLAJD', slajdTip: 'PITANJE', telefonPrikaz: 'PITANJE',
      pitanje: {
        tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 31, brojOpcija: 2,
        opcije: [{ id: 1, tekst: DUGA_FORMULA }, { id: 2, tekst: '$13$' }],
        tekst: `Izračunaj ${DUGA_FORMULA} za zadate vrednosti.`, slikaId: null, jedinica: null, skalaMinOznaka: null,
        skalaMaxOznaka: null, rokMs: null, preostaloMs: null, tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
      },
    },
  };
};

/*
 * Raspored telefona od 360 px sa dugačkom formulom (F3; napomena recenzije F2, Minor 1). Namerno na osnovnoj fiksturi,
 * ne na `javna-mreza`: ta do F5 obara svaki zahtev na `assets/mathlive/` i svaki JS sa `ML__latex`, a formula ih traži.
 * Mrežu javne rute sa formulom proverava F5 (`uzivo-javno` pod `javna-mreza`, `zabranjeniJavno`).
 */
osnovniTest.describe('javni uživo: dugačka formula na telefonu od 360 px', () => {
  osnovniTest.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  async function otvoriPitanje(page: Page): Promise<void> {
    let ime = '';
    await lazniBroker(page, 'api/public/ws', o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? saFormulom(ime) : undefined));
    await page.goto(`uzivo/${KOD}`);
    ime = 'Mina';
    await page.getByLabel('Tvoje ime').fill(ime);
    const udji = page.getByRole('button', { name: 'Uđi' });
    await expect(udji).toBeEnabled();
    await udji.click();
    await expect(page.locator('app-tekst-formule.uz-st-md')).toBeVisible();
  }

  const preliv = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  osnovniTest('izvor formule (modul se ne učita): dokument nema horizontalni preliv', async ({ page }) => {
    // Očekivan pad (izmereno 2026-10-14: preliv 893 px) dok F2 fix krug ne skine `white-space: nowrap` sa izvora (`.uz-formula`
    // u uzivo-tokeni.css): izvor se ne lomi i izlazi iz ekrana. Kad CSS bude ispravljen, Playwright javi "expected to fail"
    // i ova linija se briše.
    osnovniTest.fail(true, 'F2 Minor 1: .uz-formula nowrap važi i za izvor');
    // lenji chunk-ovi ne stižu (kao telefon bez mreže usred časa): formula ostaje izvor `$...$`
    await page.route(/\/chunk-[^/]+\.js$/, async r => {
      const telo = await (await r.fetch()).text();
      return telo.includes('ML__latex') ? r.abort() : r.fallback();
    });
    const upozorenje = page.waitForEvent('console', m => m.type() === 'warning' && m.text().includes('Formule nisu učitane'));
    await otvoriPitanje(page);
    await upozorenje; // učitavanje je zaista odbijeno (komponenta ostavlja izvor, bez greške na ekranu)
    await expect(page.locator('.uz-st-md span.uz-formula')).toHaveText(DUGA_FORMULA);
    await expect(page.locator('.uz-st-opcija span.uz-formula')).toHaveCount(2);
    await expect(page.locator('.ML__latex')).toHaveCount(0);
    expect(await preliv(page), 'horizontalni preliv (px)').toBe(0);
  });

  osnovniTest('spremna formula (MathLive): dokument nema horizontalni preliv', async ({ page }) => {
    // Očekivan pad (izmereno 2026-10-14: preliv 312 px) dok F2 fix krug ne doda skrol unutar `.uz-formula--spremna`
    // (`.ML__latex` i `nowrap` šire stranu). Kad CSS bude ispravljen, ova linija se briše.
    osnovniTest.fail(true, 'F2 Minor 1: spremna formula nema sopstveni skrol');
    await otvoriPitanje(page);
    await expect(page.locator('.uz-st-md .uz-formula--spremna .ML__latex')).toHaveCount(1);
    await expect(page.locator('.uz-st-opcija .uz-formula--spremna .ML__latex')).toHaveCount(2);
    expect(await preliv(page), 'horizontalni preliv (px)').toBe(0);
  });
});
