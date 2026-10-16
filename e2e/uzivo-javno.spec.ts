import { devices, type Page } from '@playwright/test';
import { expect, test } from './javna-mreza';
import { NIZ_MATHLIVE, NIZ_PROSEMIRROR, NIZOVI_EDITORA, NIZOVI_ZABRANJENI_JAVNO, zabranjeniJavno } from './nizovi-editora';
import { lazniBroker } from './lazni-stomp';
import { IZVORI_TEKSTA, OPCIJE_SA_FORMULOM, SPREMNIH_FORMULA, TEKST_SA_FORMULOM } from './mock-izvodjenje';

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
    // provera nizova pokriva i biblioteke 4b (ProseMirror, MathLive), a bez formule se ništa od formula ne učitava:
    // nijedan JS sa `ML__latex` (ni `mathlive/ssr`), nijedan zahtev na `assets/mathlive/` (ni stil ni fontovi)
    expect(NIZOVI_EDITORA).toEqual(expect.arrayContaining([NIZ_PROSEMIRROR, NIZ_MATHLIVE]));
    expect(skripte.saFormulom, 'JS sa ML__latex bez formule').toEqual([]);
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

/**
 * Granica mreže formule na telefonu (odluka 25): JS, CSS i woff2 koji stignu posle pitanja sa formulom. Izmereno
 * 2026-10-14 (build e13cfdd, F5 Step 0): 404 112 B = `mathlive/ssr` 348 195 (dva chunk-a) + `mathlive-static.css` 13 205 +
 * KaTeX_Main-Regular 26 272 + KaTeX_Math-Italic 16 440 (fontovi aplikacije iz `media/` se ne broje). Granica = izmereno
 * + 10 % (444 523 B), a izmereno ne sme preći 450 000 B (inače lakši učitavač stila, `ucitajStilFormulaUTekstu`, ne radi).
 */
const MREZA_FORMULE_IZMERENO = 404_112;
const GRANICA_MREZE_FORMULE = Math.min(Math.floor(MREZA_FORMULE_IZMERENO * 1.1), 450_000);

test.describe('javni uživo: pitanje sa formulom na telefonu (5a)', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  test.use({
    viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, formule: true,
    // kolačić prijave već važi (`GET ja`), pa stranica ne šalje `POST prijava`: svaki `/api/` poziv je `GET /api/public/uzivo/...`
    dozvoljeniApi: /^GET \/api\/public\/uzivo\/\d{6}(\/ja)?$/,
  });

  test('ispravna formula se crta (mathlive/ssr), \\href i nepoznata komanda ostaju izvor; samo javna mreža, lakši stil', async ({ page, mock, javnaMreza, baseURL }) => {
    mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: IZVODJENJE });
    const origin = new URL(baseURL!).origin;
    const spolja: string[] = [];
    page.on('request', r => {
      if (new URL(r.url()).origin !== origin) spolja.push(r.url());
    });
    // tela JS, CSS i woff2 odgovora koji stignu posle pitanja (mreža formule)
    let posle = false;
    const tela: Promise<{ putanja: string; bajtova: number }>[] = [];
    page.on('response', r => {
      const putanja = new URL(r.url()).pathname;
      if (posle && /\.(js|css|woff2)$/.test(putanja)) {
        tela.push(r.body().then(b => ({ putanja, bajtova: b.length }), () => ({ putanja, bajtova: Number.NaN })));
      }
    });
    const broker = await lazniBroker(
      page, 'api/public/ws',
      o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? pocetno('Mina') : undefined),
      url => javnaMreza.ws.push(new URL(url).pathname),
    );

    await page.goto(`uzivo/${KOD}`);
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    const tema = `/topic/izvodjenja/${IZVODJENJE}/javno`;
    await expect.poll(() => broker.pretplate).toContain(tema);
    await page.waitForLoadState('networkidle');
    // dotle nijedna formula: ni JS sa `ML__latex` ni `assets/mathlive/`
    expect(javnaMreza.zahtevi.filter(p => p.includes('/assets/mathlive/')), 'MathLive pre pitanja').toEqual([]);
    expect((await javnaMreza.skripte()).saFormulom, 'mathlive/ssr pre pitanja').toEqual([]);

    posle = true;
    const p = pocetno('Mina').javno;
    broker.posalji(tema, {
      ...p, verzija: 2, prikaz: 'SLAJD', slajdTip: 'PITANJE', telefonPrikaz: 'PITANJE',
      pitanje: {
        tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 31, brojOpcija: OPCIJE_SA_FORMULOM.length,
        opcije: OPCIJE_SA_FORMULOM.map((tekst, i) => ({ id: i + 1, tekst })),
        tekst: TEKST_SA_FORMULOM, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null,
        preostaloMs: null, tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
      },
    });

    // 1. tri ispravne formule (tekst + dve opcije) su nacrtane; \href i \htmlStyle (zabranjene komande) i \nepostoji
    //    (MathLive je odbija) ostaju izvor, bez veze iz formule
    const spremne = page.locator('.uz-formula--spremna .ML__latex');
    await expect(spremne).toHaveCount(SPREMNIH_FORMULA);
    for (const f of await spremne.all()) await expect(f).toBeVisible();
    await expect(page.locator('.uz-st-md .uz-formula--spremna')).toHaveAttribute('aria-label', '1011_2');
    await expect(page.locator('.uz-formula--izvor')).toHaveText([...IZVORI_TEKSTA]);
    await expect(page.locator('.uz-formula a, a[href*="primer.invalid"]')).toHaveCount(0);
    // \htmlStyle sa url( (Review Focus 2): izvor je samo tekst, nijedan atribut (osim `aria-label`) ne nosi url(
    // (zahtev van porekla proverava korak 3)
    expect(await page.locator('.uz-st').evaluate(e => [...e.querySelectorAll('*')].flatMap(x => [...x.attributes])
      .filter(a => a.name !== 'aria-label' && a.value.includes('url(')).map(a => a.name))).toEqual([]);
    // dugmad opcija: formula je nacrtana, a čitač ekrana dobija tekst bez `$` (`tekstZaCitac`)
    await expect(page.locator('.uz-st-opcija .uz-formula--spremna')).toHaveCount(OPCIJE_SA_FORMULOM.length);
    await expect(page.locator('button.uz-st-opcija').first()).toHaveAccessibleName(/: 11$/);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    // 2. svi `/api/` zahtevi su GET /api/public/uzivo/..., WebSocket samo /api/public/ws, nijedan 401
    expect(javnaMreza.api).toEqual([`GET /api/public/uzivo/${KOD}`, `GET /api/public/uzivo/${KOD}/ja`]);
    expect(javnaMreza.ws).toEqual(['/api/public/ws']);
    expect(javnaMreza.odgovori401).toEqual([]);
    // 3. nijedan zahtev van porekla stranice; KaTeX fontovi samo iz assets/mathlive/fonts/
    expect(spolja, 'zahtevi van porekla stranice').toEqual([]);
    const sve = await Promise.all([...tela]);
    // `media/ibm-plex-*.woff2` su fontovi same aplikacije (globalni stil, npr. IBM Plex Sans 600 za tekst pitanja): stižu i za
    // pitanje bez formule, pa nisu deo mreže formule. Samo njih izuzimamo: fontovi platna (fontsource, isto `media/`) ne smeju
    // na telefon i ovde bi pali kao "font van assets/mathlive/fonts/"; svaki drugi font mora biti KaTeX iz assets/mathlive/fonts/
    const ucitano = sve.filter(x => !/^\/media\/ibm-plex-[^/]+\.woff2$/.test(x.putanja));
    const woff2 = ucitano.map(x => x.putanja).filter(x => x.endsWith('.woff2'));
    expect(woff2.filter(x => !x.startsWith('/assets/mathlive/fonts/')), 'fontovi van assets/mathlive/fonts/ (osim IBM Plex aplikacije)').toEqual([]);
    // lakši stil (odluka 5): KaTeX_Main i KaTeX_Math stižu, AMS i Size ne (ostalo drži granica bajtova)
    expect(woff2.some(x => x.includes('KaTeX_Main-Regular')), 'KaTeX_Main-Regular').toBe(true);
    expect(woff2.some(x => x.includes('KaTeX_Math-Italic')), 'KaTeX_Math-Italic').toBe(true);
    expect(woff2.filter(x => /KaTeX_(AMS|Size)/.test(x)), 'KaTeX_AMS / KaTeX_Size').toEqual([]);
    // 4. bar jedan učitan JS ima ML__latex (mathlive/ssr), nijedan nema ceo mathlive ni kod editora
    const skripte = await javnaMreza.skripte();
    expect(skripte.saFormulom.length, 'JS sa ML__latex (mathlive/ssr)').toBeGreaterThan(0);
    expect(skripte.saZabranjenim).toEqual([]);
    // `ML__latex` nije zabranjen javnoj ruti (mathlive/ssr), ceo mathlive jeste
    expect(NIZOVI_ZABRANJENI_JAVNO).not.toContain(NIZ_MATHLIVE);
    expect(zabranjeniJavno('math-virtual-keyboard ML__latex')).toEqual(['math-virtual-keyboard']);
    // 5. mreža formule: zbir tela JS, CSS i woff2 posle pitanja
    expect(sve.filter(x => Number.isNaN(x.bajtova)), 'nepročitana tela').toEqual([]);
    const zbir = ucitano.reduce((n, x) => n + x.bajtova, 0);
    test.info().annotations.push({
      type: 'mreza-formule',
      description: `${zbir} B (${ucitano.length} fajlova: ${ucitano.map(x => `${x.putanja.split('/').pop()} ${x.bajtova}`).join(', ')}; `
        + `van zbira, fontovi aplikacije: ${sve.filter(x => !ucitano.includes(x)).map(x => `${x.putanja.split('/').pop()} ${x.bajtova}`).join(', ') || 'nema'})`,
    });
    expect(zbir, 'mreža formule ispod 450 000 B (lakši stil radi)').toBeLessThanOrEqual(450_000);
    expect(zbir, 'mreža formule (izmereno + 10 %)').toBeLessThanOrEqual(GRANICA_MREZE_FORMULE);
  });
});

/** Dugačka formula (izvor 113 znakova): bez preloma bi na 360 px bila šira od ekrana. */
const DUGA_FORMULA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9}{b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9}=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8$';

/** Snimak sa otvorenim pitanjem (režim PITANJE: tekst i opcije na telefonu) sa dugačkom formulom u tekstu i opciji. */
type Ekran360 = 'unos' | 'tacan' | 'detalji';
const saFormulom = (ime: string, ekran: Ekran360 = 'unos') => {
  const p = pocetno(ime);
  return {
    licno: p.licno,
    javno: {
      ...p.javno, prikaz: 'SLAJD', slajdTip: 'PITANJE',
      // detalji: režim B (dugmad) sa dozvoljenim detaljima, tekst stiže u panel "Detalji"
      telefonPrikaz: ekran === 'detalji' ? 'DUGMAD' : 'PITANJE', detaljiDozvoljeni: ekran === 'detalji',
      pitanje: {
        tip: 'JEDAN_TACAN', faza: ekran === 'tacan' ? 'ZATVORENO' : 'OTVORENO', rundaId: 31, brojOpcija: 2,
        opcije: [{ id: 1, tekst: DUGA_FORMULA }, { id: 2, tekst: '$13$' }],
        tekst: `Izračunaj ${DUGA_FORMULA} za zadate vrednosti.`, slikaId: null, jedinica: null, skalaMinOznaka: null,
        skalaMaxOznaka: null, rokMs: null, preostaloMs: null, tacneOpcije: ekran === 'tacan' ? [1] : null, tacanBroj: null,
        prihvatljiviOdgovori: null,
      },
    },
  };
};

/*
 * Raspored telefona od 360 px sa dugačkom formulom (F3; napomena recenzije F2, Minor 1, ispravljeno u F2 fix krugu). Od F5
 * pod `javna-mreza` sa `formule: true`: i ovde nijedan zahtev van javnih putanja i nijedan JS sa celim mathlive-om.
 */
test.describe('javni uživo: dugačka formula na telefonu od 360 px', () => {
  test.use({
    viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, formule: true,
    dozvoljeniApi: /^(GET \/api\/public\/uzivo\/\d{6}(\/ja)?|POST \/api\/public\/uzivo\/\d{6}\/prijava)$/,
  });

  async function otvoriPitanje(page: Page, ekran: Ekran360 = 'unos'): Promise<void> {
    let ime = '';
    await lazniBroker(page, 'api/public/ws', o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? saFormulom(ime, ekran) : undefined));
    await page.goto(`uzivo/${KOD}`);
    ime = 'Mina';
    await page.getByLabel('Tvoje ime').fill(ime);
    const udji = page.getByRole('button', { name: 'Uđi' });
    await expect(udji).toBeEnabled();
    await udji.click();
    if (ekran === 'detalji') {
      const detalji = page.getByRole('button', { name: 'Detalji' });
      await expect(detalji).toBeEnabled();
      await detalji.click();
      await expect(page.getByRole('dialog', { name: 'Pitanje' })).toBeVisible();
    }
    if (ekran === 'tacan') {
      await expect(page.locator('.uz-st-tacna app-tekst-formule')).toBeVisible();
    } else {
      await expect(page.locator('app-tekst-formule.uz-st-md')).toBeVisible();
    }
  }

  /** Desna ivica svake nacrtane formule unutar okvira (fiksiran panel "Detalji" se ne vidi u `scrollWidth` dokumenta). */
  const formuleUOkviru = (page: Page, okvir: string) => page.evaluate((sel) => {
    const o = document.querySelector(sel)!.getBoundingClientRect();
    return [...document.querySelectorAll(`${sel} .uz-formula--spremna`)].map((f) => {
      const r = f.getBoundingClientRect();
      return r.left >= o.left - 0.5 && r.right <= o.right + 0.5;
    });
  }, okvir);

  const preliv = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test('izvor formule (modul se ne učita): dokument nema horizontalni preliv', async ({ page }) => {
    // Izvor se lomi i usred LaTeX-a bez razmaka (`.uz-formula`, uzivo-tokeni.css; pre F2 fix kruga preliv 893 px).
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

  test('spremna formula (MathLive): dokument nema horizontalni preliv', async ({ page }) => {
    // Šira formula se skroluje u sebi (`.uz-formula--spremna`, uzivo-tokeni.css; pre F2 fix kruga preliv 312 px).
    await otvoriPitanje(page);
    await expect(page.locator('.uz-st-md .uz-formula--spremna .ML__latex')).toHaveCount(1);
    await expect(page.locator('.uz-st-opcija .uz-formula--spremna .ML__latex')).toHaveCount(2);
    expect(await preliv(page), 'horizontalni preliv (px)').toBe(0);
    expect(await formuleUOkviru(page, '.uz-st-telo')).toEqual([true, true, true]);
    // F2 fix 3: telefon se ne smanjuje (nema `--uz-formula-k`); kratka `$13$` nije skrol, široka se skroluje u sebi
    const opcije = await page.locator('.uz-st-opcija .uz-formula--spremna').evaluateAll(f => f.map(e => ({
      k: getComputedStyle(e).getPropertyValue('--uz-formula-k'), preliv: e.scrollWidth - e.clientWidth,
    })));
    expect(opcije.map(o => o.k)).toEqual(['', '']);
    expect(opcije[0].preliv, 'široka opcija se skroluje u sebi').toBeGreaterThan(0);
    expect(opcije[1].preliv, 'kratka opcija ($13$) bez skrola').toBeLessThanOrEqual(0);
  });

  test('ekran "tačan odgovor" (flex red sa značkom): nacrtana formula ostaje u ekranu', async ({ page }) => {
    await otvoriPitanje(page, 'tacan');
    await expect(page.locator('.uz-st-tacna .uz-formula--spremna .ML__latex')).toHaveCount(1);
    expect(await preliv(page), 'horizontalni preliv (px)').toBe(0);
    expect(await formuleUOkviru(page, '.uz-st-telo')).toEqual([true]);
  });

  test('panel "Detalji" (position: fixed): nema preliva panela, formule u panelu', async ({ page }) => {
    await otvoriPitanje(page, 'detalji');
    const panel = page.locator('.uz-st-detalji');
    await expect(panel.locator('.uz-formula--spremna .ML__latex')).toHaveCount(3);
    expect(await panel.evaluate(e => e.scrollWidth - e.clientWidth), 'preliv panela (px)').toBe(0);
    expect(await formuleUOkviru(page, '.uz-st-detalji')).toEqual([true, true, true]);
    expect(await preliv(page), 'horizontalni preliv (px)').toBe(0);
  });
});
