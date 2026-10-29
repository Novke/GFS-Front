import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test as osnova } from './fixture';
import { expect as ocekuj, test } from './javna-mreza';
import { MockApi } from './mock-api';
import { PREDMET, PREDMET_OCENA, PREZENTACIJA, TACNO, TIP } from './mock-portal';

/*
 * Nalog studenta, faze 2 i 3 (spec studentskog dela 5, 6 i 12): tabovi Čas · Predmeti · Ja, traka "Prezentacija je počela",
 * strana predmeta (Materijali / Istorija / Ocena), vežbanje tipa i pregled održane prezentacije. Sve su javne rute: student
 * nema sesiju nastavnika, pa stranice smeju da zovu samo `api/public/nalog/*` (i `api/public/mediji/*` za slike zadataka,
 * koje idu kao `<img>`, ne kroz `api`), a `javna-mreza` u teardown-u proverava i da nijedna javna stranica ne učita kod editora
 * platna, uvoza ni pdf.js-a (pregled koristi samo renderer slajda). Na kraju i nastavnički deo: panel „Za vežbanje“ na čvoru
 * banke i statistika vežbanja.
 */

const API_PORTALA = /^(GET|POST) \/api\/public\/nalog\/(stanje|kod|prijava|ja|cas|casovi|predmeti(\/\d+\/(prisustvo|vezbanje|moji-zadaci|prezentacije|ocena))?|prezentacije\/\d+|vezbanje(\/\d+\/(provera|resenje))?)$|^(GET|PUT) \/api\/public\/nalog\/podesavanja$|^GET \/api\/public\/mediji\/[\w-]+$|^(GET \/api\/public\/nalog\/(obavestenja|push)|POST \/api\/public\/nalog\/obavestenja\/otvoreno)$/;

async function posleAnimacija(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
}

/** `samo`: proverava samo taj deo strane (nastavničke strane: novi panel, ne ceo stari detalj grupe). */
async function bezOzbiljnihKrsenja(page: Page, samo?: string): Promise<void> {
  await posleAnimacija(page);
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  const rezultat = await (samo ? axe.include(samo) : axe).analyze();
  const ozbiljna = rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  ocekuj(ozbiljna).toEqual([]);
  ocekuj(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

const tab = (page: Page, ime: string) => page.getByRole('navigation', { name: 'Nalog' }).getByRole('link', { name: ime });

test.describe('nalog studenta: tabovi, predmet, vežbanje, pregled (telefon)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: API_PORTALA,
    // `obavestenja`: zvono ljuske tabova pre preusmerenja na prijavu (sakriveno, bez poruke)
    dozvoljeni401: /^\/api\/public\/nalog\/(ja|cas|predmeti|prijava|obavestenja)$/,
  });

  test('tabovi: Predmeti -> predmet -> Istorija i Ocena; traka "Prezentacija je počela" na tabu van Časa', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    mock.cekiranje.predavanjeId = 1;
    mock.cekiranje.izvodjenje = { kod: '123456', naziv: 'Petlje' };
    await page.goto('nalog/predmeti');
    await ocekuj(tab(page, 'Predmeti')).toHaveAttribute('aria-current', 'page');
    // traka: na svakom tabu osim Časa, sa ulazom u izvođenje (ulazi sam samo tab Čas)
    const traka = page.locator('[data-traka]');
    await ocekuj(traka).toContainText('Prezentacija je počela · Petlje');
    await ocekuj(traka.getByRole('link', { name: 'Uđi' })).toHaveAttribute('href', /\/uzivo\/123456\?sa=cas$/);
    await ocekuj(page).toHaveURL(/\/nalog\/predmeti$/);

    const stavke = page.locator('[data-predmet]');
    await ocekuj(stavke).toHaveCount(2);
    await ocekuj(page.locator(`[data-predmet="${PREDMET_OCENA}"]`)).toContainText('Ocena objavljena');
    await page.locator(`[data-predmet="${PREDMET}"]`).click();
    await ocekuj(page).toHaveURL(new RegExp(`/nalog/predmet/${PREDMET}$`));
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Materijali' })).toBeVisible();
    await ocekuj(page.locator(`[data-prezentacija="${PREZENTACIJA}"]`)).toContainText('Konverzije – vežbe');
    await ocekuj(page.locator(`[data-tip="${TIP}"]`)).toContainText('2 → 10');
    // reč "banka" se studentu nikad ne pokazuje
    await ocekuj(page.locator('main, app-root').first()).not.toContainText(/bank/i);

    await page.locator('[data-kartica="istorija"]').click();
    await ocekuj(page).toHaveURL(/\?k=istorija$/);
    await ocekuj(page.locator('[data-prisustvo]')).toHaveText('Prisutan na 2 od 3');
    await ocekuj(page.locator('[data-predavanje]')).toHaveCount(3);
    const moj = page.locator('[data-moj-zadatak]').first();
    await ocekuj(moj).toContainText('Binarni u dekadni');
    await ocekuj(moj.locator('[data-tacno]')).toHaveCount(0); // rešenje tek na dodir
    await moj.getByRole('button', { name: 'Prikaži rešenje' }).click();
    await ocekuj(moj.locator('[data-tacno]')).toContainText('13');

    await page.locator('[data-kartica="ocena"]').click();
    await ocekuj(page.locator('[data-nije-objavljeno]')).toContainText('Ocena još nije objavljena.');

    await tab(page, 'Predmeti').click();
    await page.locator(`[data-predmet="${PREDMET_OCENA}"]`).click();
    await page.locator('[data-kartica="ocena"]').click();
    await ocekuj(page.locator('[data-ocena]')).toContainText('Predlog ocene: 8');

    // svaki zahtev je javni API naloga (dozvoljeniApi), bez 401 osim dozvoljenih
    ocekuj(javnaMreza.api.filter(z => !API_PORTALA.test(z))).toEqual([]);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  test('vežbanje: zadatak bez tačnog odgovora, provera, rešenje i sledeći; nivo bez zadataka je onemogućen', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto(`nalog/predmet/${PREDMET}`);
    await page.locator(`[data-tip="${TIP}"]`).click();
    await ocekuj(page).toHaveURL(new RegExp(`/nalog/predmet/${PREDMET}/vezbanje/${TIP}$`));
    await ocekuj(page.getByRole('heading', { level: 2, name: '2 → 10' })).toBeVisible();
    await ocekuj(page.locator('[data-ucinak]')).toHaveText('Tvoj učinak: 1 od 1 tačno');
    await ocekuj(page.locator('[data-nivo="3"]')).toBeDisabled();
    const izvucen = mock.zahteviZa('public/nalog/vezbanje', 'POST');
    ocekuj(izvucen).toHaveLength(1);
    ocekuj(izvucen[0].telo).toEqual({ tipId: TIP, nivo: null });

    const unos = page.locator('input[data-polje="a"]');
    await unos.fill('11');
    await page.locator('[data-proveri]').click();
    await ocekuj(page.locator('[data-ishod]')).toHaveText('Netačno');
    await ocekuj(page.locator('[data-zbir]')).toContainText('Nije sve tačno.');
    await ocekuj(page.locator('[data-tacno]')).toHaveCount(0); // tačna vrednost se ne odaje proverom
    await unos.fill(TACNO);
    await ocekuj(page.locator('[data-ishod]')).toHaveCount(0); // izmena briše stari ishod
    await page.locator('[data-proveri]').click();
    await ocekuj(page.locator('[data-zbir]')).toContainText('Tačno!');
    await page.locator('[data-resenje]').click();
    await ocekuj(page.locator('[data-tacno]')).toContainText(TACNO);
    await ocekuj(page.locator('img[data-svg="resenje"]')).toHaveCount(1);

    await page.locator('[data-nivo="2"]').click();
    await ocekuj(page).toHaveURL(/\?nivo=2$/);
    await ocekuj.poll(() => mock.zahteviZa('public/nalog/vezbanje', 'POST').at(-1)?.telo).toEqual({ tipId: TIP, nivo: 2 });
    await ocekuj(page.locator('input[data-polje="a"]')).toHaveValue('');
    await page.locator('[data-sledeci]').click();
    await ocekuj.poll(() => mock.zahteviZa('public/nalog/vezbanje', 'POST').length).toBe(3);
    ocekuj(mock.zahteviZa('public/nalog/vezbanje', 'POST').at(-1)?.telo).toEqual({ tipId: TIP, nivo: 2, novi: true });

    // javna ruta: samo API naloga i slike zadataka, bez 401 i bez koda editora (teardown proverava isto, ovde ne sme biti prazno)
    ocekuj(javnaMreza.api.filter(z => z.startsWith('POST /api/public/nalog/vezbanje')).length).toBeGreaterThanOrEqual(5);
    ocekuj(javnaMreza.api.filter(z => !API_PORTALA.test(z))).toEqual([]);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
    const skripte = await javnaMreza.skripte();
    ocekuj(skripte.putanje.length).toBeGreaterThan(0);
    ocekuj(skripte.saEditorom).toEqual([]);
  });

  test('pregled održane prezentacije: slajdovi, moj odgovor i tačan na dodir, Zadatak sa "Vežbaj"; nepoznata je 404', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto(`nalog/prezentacija/${PREZENTACIJA}`);
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Slajdovi sa časa' })).toBeVisible();
    const slajdovi = page.locator('[data-slajd]');
    await ocekuj(slajdovi).toHaveCount(3);
    await ocekuj(slajdovi.nth(0)).toContainText('Pozicioni brojni sistemi');
    await ocekuj(page.locator('[data-moj-odgovor]')).toContainText('Tvoj odgovor: 8');
    await page.locator('[data-tacan]').click();
    await ocekuj(page.locator('[data-tacan]')).toHaveAttribute('aria-pressed', 'true');
    await ocekuj(slajdovi.nth(2).locator('[data-moj-zadatak]')).toBeVisible();
    const vezbaj = slajdovi.nth(2).locator('[data-vezbaj]').first();
    await ocekuj(vezbaj).toHaveAttribute('href', new RegExp(`/nalog/predmet/${PREDMET}/vezbanje/${TIP}$`));

    await page.goto('nalog/prezentacija/999');
    await ocekuj(page.locator('[data-nema]')).toHaveText('Prezentacija nije pronađena.');

    // javna ruta: samo API naloga, bez 401; pregled crta samo renderer slajda, nikad editor platna ni MathLive
    ocekuj(javnaMreza.api).toContain(`GET /api/public/nalog/prezentacije/${PREZENTACIJA}`);
    ocekuj(javnaMreza.api.filter(z => !API_PORTALA.test(z))).toEqual([]);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
    const skripte = await javnaMreza.skripte();
    ocekuj(skripte.putanje.length).toBeGreaterThan(0);
    ocekuj(skripte.saEditorom).toEqual([]);
    ocekuj(javnaMreza.zahtevi.filter(z => z.includes('/assets/mathlive/'))).toEqual([]);
  });

  test('Ja: "Javi mi mejlom kad je čas otkazan" se čuva (PUT), bez ozbiljnih a11y kršenja', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/ja');
    const izbor = page.getByRole('checkbox', { name: 'Javi mi mejlom kad je čas otkazan' });
    await ocekuj(izbor).toBeChecked();
    await izbor.uncheck();
    await ocekuj(page.locator('[data-sacuvano]')).toHaveText('Sačuvano.');
    // PUT nosi ceo objekat (mejl, push i zvono), kao što ga je GET vratio, sa jednom izmenom
    ocekuj(mock.zahteviZa('public/nalog/podesavanja', 'PUT').map(z => z.telo)).toEqual([{
      mejlOtkazanCas: false, pushPodsetnik: true, pushOtkazanCas: true, pushOcene: true, pushPosleCasa: true, zvonoOcene: true,
      zvonoPosleCasa: true,
    }]);
    await page.reload();
    await ocekuj(page.getByRole('checkbox', { name: 'Javi mi mejlom kad je čas otkazan' })).not.toBeChecked();
    await bezOzbiljnihKrsenja(page, '[data-podesavanja]');
    ocekuj(javnaMreza.api.filter(z => !API_PORTALA.test(z))).toEqual([]);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  test('zvono: tačka do otvaranja, spisak od najnovijeg, stavka vodi gde i push; bez ozbiljnih a11y kršenja', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/predmeti');
    const zvono = page.getByRole('button', { name: 'Obaveštenja, ima novih' });
    await ocekuj(zvono).toBeVisible();
    await ocekuj(page.locator('[data-tacka]')).toBeVisible();
    await zvono.click();
    const spisak = page.locator('[data-zvono-spisak]');
    await ocekuj(spisak.locator('[data-vrsta]')).toHaveCount(3);
    await ocekuj(spisak.locator('[data-vrsta]').first()).toContainText('Čas je otkazan');
    await ocekuj(page.locator('[data-tacka]')).toHaveCount(0);
    ocekuj(mock.zahteviZa('public/nalog/obavestenja/otvoreno', 'POST')).toHaveLength(1);
    await bezOzbiljnihKrsenja(page, '[data-zvono-spisak]');
    await spisak.locator('[data-vrsta="OCENE"]').click();
    await ocekuj(page).toHaveURL(/\/nalog\/predmet\/1$/);
    await ocekuj(spisak).toHaveCount(0);
    // posle osvežavanja: viđeno ostaje viđeno (server), tačke nema
    await page.reload();
    await ocekuj(page.getByRole('button', { name: 'Obaveštenja', exact: true })).toBeVisible();
    await ocekuj(page.locator('[data-tacka]')).toHaveCount(0);
    ocekuj(mock.zahteviZa('public/nalog/obavestenja/otvoreno', 'POST')).toHaveLength(1);
    ocekuj(javnaMreza.api.filter(z => !API_PORTALA.test(z))).toEqual([]);
    ocekuj(javnaMreza.odgovori401).toEqual([]);
  });

  test('aplikacija: studentski manifest (ikonica otvara nalog) i service worker sa opsegom korena', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/predmeti');
    await ocekuj(page.getByRole('button', { name: /^Obaveštenja/ })).toBeVisible();
    const manifest = await page.locator('link[rel=manifest]').getAttribute('href');
    ocekuj(manifest).toBe('assets/pwa/manifest-student.webmanifest');
    const m = await page.evaluate(async (h: string) => {
      const url = new URL(h, document.baseURI);
      const odgovor = await fetch(url);
      const json = await odgovor.json() as { start_url: string; scope: string; display: string };
      return { tip: odgovor.headers.get('content-type'), start: new URL(json.start_url, url).pathname,
        opseg: new URL(json.scope, url).pathname, prikaz: json.display };
    }, manifest!);
    ocekuj(m).toEqual({ tip: 'application/manifest+json', start: '/nalog', opseg: '/', prikaz: 'standalone' });
    const opseg = await page.evaluate(() => navigator.serviceWorker.ready.then(r => new URL(r.scope).pathname));
    ocekuj(opseg).toBe('/');
  });

  test('Ja: prekidači telefona i zvona po vrsti; otkazan čas je u zvonu uvek, podsetnik nikad', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/ja');
    // headless Chromium unapred odbija dozvolu za obaveštenja (blokirano); stanje servera se svejedno pročita
    await ocekuj(page.locator('[data-push]')).toHaveAttribute('data-stanje', /^(iskljuceno|blokirano|nepodrzano)$/);
    await ocekuj(page.getByRole('checkbox', { name: 'Zvono: Podsetnik dan pre časa' })).toHaveCount(0);
    await ocekuj(page.getByText('Zvono: uvek')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Zvono: Ocene objavljene' }).uncheck();
    await ocekuj(page.locator('[data-sacuvano]')).toHaveText('Sačuvano.');
    await page.getByRole('checkbox', { name: 'Telefon: Podsetnik dan pre časa' }).uncheck();
    await ocekuj(page.getByRole('checkbox', { name: 'Telefon: Podsetnik dan pre časa' })).not.toBeChecked();
    await ocekuj.poll(() => mock.zahteviZa('public/nalog/podesavanja', 'PUT').length).toBe(2);
    ocekuj(mock.zahteviZa('public/nalog/podesavanja', 'PUT').map(z => z.telo)).toEqual([
      ocekuj.objectContaining({ zvonoOcene: false, pushPodsetnik: true, mejlOtkazanCas: true }),
      ocekuj.objectContaining({ zvonoOcene: false, pushPodsetnik: false, mejlOtkazanCas: true }),
    ]);
    await page.reload();
    await ocekuj(page.getByRole('checkbox', { name: 'Zvono: Ocene objavljene' })).not.toBeChecked();
  });

  test('bez prijave: tab vodi na prijavu sa nazad, pa posle koda nazad na tab', async ({ page, mock }) => {
    await page.goto('nalog/predmeti');
    await ocekuj(page).toHaveURL(/\/nalog\?nazad=nalog%2Fpredmeti$/);
    await page.getByLabel('Broj indeksa').fill('01');
    await page.getByRole('button', { name: 'Pošalji kod' }).click();
    await page.getByLabel('Kod iz mejla').fill(MockApi.KOD_NALOGA);
    await page.getByRole('button', { name: 'Prijavi se' }).click();
    await ocekuj(page).toHaveURL(/\/nalog\/predmeti$/);
    await ocekuj(page.locator('[data-predmet]')).toHaveCount(2);
    ocekuj(mock.zahteviZa('public/nalog/predmeti', 'GET')).toHaveLength(2);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}), 360 px: Predmeti, predmet (tri kartice), vežbanje, pregled, bez serious/critical`, async ({ page, mock }) => {
      test.slow(); // šest axe prolaza
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 740 });
      mock.studentPrijavljen = true;
      mock.cekiranje.predavanjeId = 1;
      mock.cekiranje.izvodjenje = { kod: '123456', naziv: 'Petlje' };
      await page.goto('nalog/predmeti');
      await ocekuj(page.locator('[data-traka]')).toBeVisible();
      await ocekuj(page.locator('[data-predmet]')).toHaveCount(2);
      await bezOzbiljnihKrsenja(page);
      for (const [k, znak] of [['materijali', '[data-prezentacija]'], ['istorija', '[data-prisustvo]'], ['ocena', '[data-nije-objavljeno]']]) {
        await page.goto(`nalog/predmet/${PREDMET}?k=${k}`);
        await ocekuj(page.locator(`[data-kartica="${k}"]`)).toHaveAttribute('aria-current', 'page');
        await ocekuj(page.locator(znak)).toBeVisible();
        await bezOzbiljnihKrsenja(page);
      }
      await page.goto(`nalog/predmet/${PREDMET}/vezbanje/${TIP}`);
      await page.locator('input[data-polje="a"]').fill('11');
      await page.locator('[data-proveri]').click();
      await ocekuj(page.locator('[data-zbir]')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      await page.goto(`nalog/prezentacija/${PREZENTACIJA}`);
      await ocekuj(page.locator('[data-slajd]')).toHaveCount(3);
      await page.locator('[data-slajd]').last().scrollIntoViewIfNeeded();
      await bezOzbiljnihKrsenja(page);
    });
  }
});

osnova.describe('nastavnik: zadaci za vežbanje u banci i statistika', () => {
  osnova('panel „Za vežbanje“ na čvoru za predavanja: stanje po grupi i ručno otvaranje; statistika zbirno', async ({ page, mock }) => {
    osnova.slow();
    await page.goto('banka/grupe/2');
    const panel = page.locator('[data-za-vezbanje]');
    await expect(panel.locator('[data-grupa="1"]')).toContainText('Otvoreno posle časa 20. 10. 2026.');
    await expect(panel.locator('[data-grupa="2"]')).toContainText('Zatvoreno');
    await panel.getByRole('button', { name: 'Otvori za grupu AR-2025 (2025)' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Otvori' }).click();
    await expect(panel.locator('[data-grupa="2"]')).toContainText('Otvoreno ručno 29. 10. 2026.');
    expect(mock.zahteviZa('banka/grupe/2/otvoreno/2', 'PUT')).toHaveLength(1);
    await bezOzbiljnihKrsenja(page, '[data-za-vezbanje]');

    await panel.getByRole('link', { name: 'Statistika vežbanja' }).click();
    await expect(page).toHaveURL(/\/banka\/vezbanje\?predmet=1$/);
    const redovi = page.locator('table[data-statistika] tbody tr');
    await expect(redovi).toHaveCount(2);
    await expect(redovi.first()).toContainText('29 (73 %)');
    await bezOzbiljnihKrsenja(page);
  });
});
