import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { brojaciBrave, budanEkranStub, nastavnickiBroker, vidljivost } from './uzivo-nastavnik';

const STRANICA = 'izvodjenja/7/daljinski';
const KOMANDE = 'izvodjenja/7/komande';
const STANJE = 'izvodjenja/7/stanje';
/** `PORUKA_VEZA` iz `src/app/features/uzivo/data-access/razlog-greske.ts`. */
const PORUKA_VEZA = 'Server nije dostupan. Proveri vezu i pokušaj ponovo.';
/** Namerni dodiri istog dugmeta su razmaknuti više od 300 ms (kraći razmak daljinski odbacuje kao odskok prsta). */
const RAZMAK_DODIRA_MS = 350;

const polozaj = (page: Page) => page.locator('.uz-dalj-polozaj');
const napred = (page: Page) => page.getByRole('button', { name: /^Napred/ });
const nazad = (page: Page) => page.getByRole('button', { name: 'Nazad' });
const veza = (page: Page) => page.locator('.uz-dalj-veza');
const beleske = (page: Page) => page.getByRole('region', { name: 'Beleške' });
const tipoviKomandi = (mock: MockApi) => mock.zahteviZa(KOMANDE, 'POST').map(z => (z.telo as { tip: string }).tip);

/** Dodir kao prstom, pa pauza duža od praga odskoka (sledeći dodir istog dugmeta se računa). */
async function dodirni(page: Page, dugme: Locator): Promise<void> {
  await dugme.tap();
  await page.waitForTimeout(RAZMAK_DODIRA_MS);
}

/** Server je već pomeren (`SLEDECI` n puta) pre otvaranja daljinskog: test počinje na tom mestu bez dodira. */
function pomeriServer(mock: MockApi, n: number): void {
  for (let i = 0; i < n; i++) mock.izvodjenje.primeni('SLEDECI');
}

async function otvori(page: Page): Promise<void> {
  await page.goto(STRANICA);
  await expect(veza(page)).toHaveText('Povezano');
}

test.describe('daljinski na telefonu (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => budanEkranStub(page));

  test('Napred i Nazad prate server: položaj, korak, beleške sa praznim redovima, štoperica i sat', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect(polozaj(page)).toHaveText('Prijava');

    await dodirni(page, napred(page));
    expect(mock.zahteviZa(KOMANDE, 'POST').at(-1)?.telo).toEqual({ tip: 'SLEDECI', vrednost: null });
    await expect(polozaj(page)).toHaveText('1/4 · 0/3');
    for (const ocekivano of ['1/4 · 1/3', '1/4 · 2/3', '1/4 · 3/3']) {
      await dodirni(page, napred(page));
      await expect(polozaj(page)).toHaveText(ocekivano);
    }
    expect(await beleske(page).innerText()).toContain('\n\n');

    await dodirni(page, nazad(page));
    await expect(polozaj(page)).toHaveText('1/4 · 2/3');
    expect(tipoviKomandi(mock)).toEqual(['SLEDECI', 'SLEDECI', 'SLEDECI', 'SLEDECI', 'PRETHODNI']);

    await expect(page.getByRole('timer', { name: 'Štoperica' })).toHaveText(/^12:\d\d$/);
    await expect(page.getByRole('timer', { name: 'Sat' })).toHaveText(/^\d{2}:\d{2}$/);
  });

  test('dvostruki dodir na Napred šalje tačno jednu komandu', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await napred(page).dblclick();
    await expect(polozaj(page)).toHaveText('1/4 · 0/3');
    // Nazad ide u isti red komandi iza svega pre njega: kad stigne, i eventualni drugi SLEDECI je već obrađen.
    await page.waitForTimeout(RAZMAK_DODIRA_MS);
    await dodirni(page, nazad(page));
    await expect(polozaj(page)).toHaveText('Prijava');
    expect(tipoviKomandi(mock)).toEqual(['SLEDECI', 'PRETHODNI']);
  });

  test('pitanje: Otvori postaje Zatvori; posle zatvaranja Rezultati i Tačan rade; Tačan je pritisnut', async ({ page, mock }) => {
    pomeriServer(mock, 8); // prijava -> slajd 1 (3 koraka) -> slajd 2 (2 koraka) -> slajd 3 (pitanje, CEKA)
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect(polozaj(page)).toHaveText('3/4');
    const pitanje = page.getByRole('group', { name: 'Pitanje' });
    await expect(pitanje).toBeVisible();
    await expect(beleske(page)).toHaveText('Pitaj pa sačekaj.');
    await expect(pitanje.getByRole('button', { name: 'Rezultati' })).toBeDisabled();
    await expect(pitanje.getByRole('button', { name: 'Tačan' })).toBeDisabled();

    await dodirni(page, pitanje.getByRole('button', { name: 'Otvori' }));
    await expect(pitanje.getByRole('button', { name: 'Zatvori' })).toBeVisible();
    await expect(pitanje.getByText('Odgovorili 0/2')).toBeVisible();
    await dodirni(page, pitanje.getByRole('button', { name: 'Zatvori' }));
    await expect(pitanje.getByRole('button', { name: 'Otvori' })).toBeVisible();
    await expect(pitanje.getByRole('button', { name: 'Rezultati' })).toBeEnabled();
    const tacan = pitanje.getByRole('button', { name: 'Tačan' });
    await expect(tacan).toBeEnabled();
    await expect(tacan).toHaveAttribute('aria-pressed', 'false');
    await dodirni(page, tacan);
    await expect(tacan).toHaveAttribute('aria-pressed', 'true');
    expect(tipoviKomandi(mock)).toEqual(['OTVORI_ZATVORI', 'OTVORI_ZATVORI', 'TACAN']);
  });

  test('komanda sa laptopa stiže kroz STOMP: traka se menja bez dodira', async ({ page, mock }) => {
    const broker = await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect(polozaj(page)).toHaveText('Prijava');
    await expect.poll(() => broker.pretplate).toContain('/topic/izvodjenja/7/nastavnik');

    broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.primeni('SLEDECI').telo);
    await expect(polozaj(page)).toHaveText('1/4 · 0/3');
    expect(mock.zahteviZa(KOMANDE, 'POST')).toEqual([]);
  });

  test('buđenje: posle povratka na stranicu nov GET stanja i nov zahtev za budan ekran', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect.poll(async () => (await brojaciBrave(page)).zahtevi).toBe(1);
    const getPre = mock.zahteviZa(STANJE, 'GET').length;

    // ekran se gasi: pregledač pušta bravu i sakriva stranicu; pa se pali
    await page.evaluate(() => (window as unknown as { __brava: { poslednja: { release(): Promise<void> } } }).__brava.poslednja.release());
    await vidljivost(page, 'hidden');
    await vidljivost(page, 'visible');

    await expect.poll(async () => (await brojaciBrave(page)).zahtevi).toBe(2);
    await expect.poll(() => mock.zahteviZa(STANJE, 'GET').length).toBe(getPre + 1);
    await expect(polozaj(page)).toHaveText('Prijava');
  });

  test('pad veze: traka javlja prekid, pa nova veza i "Povezano"', async ({ page, mock }) => {
    const broker = await nastavnickiBroker(page, mock);
    await otvori(page);
    expect(broker.veze).toBe(1);

    broker.prekini();
    await expect(veza(page)).toHaveText('Veza prekinuta, povezujem…');
    await expect.poll(() => broker.veze, { timeout: 8_000 }).toBe(2);
    await expect(veza(page)).toHaveText('Povezano');
  });

  test('tiho mrtav socket (telefon je spavao): povratak posle >= 5 s otvara novu vezu i dovodi stanje', async ({ page, mock }) => {
    await page.clock.install();
    const broker = await nastavnickiBroker(page, mock);
    await otvori(page);
    expect(broker.veze).toBe(1);

    // socket ne javlja ništa, ni ne potvrđuje zatvaranje; STOMP i dalje misli da je povezan
    broker.utisaj();
    mock.izvodjenje.primeni('SLEDECI'); // laptop je u međuvremenu pomerio prezentaciju
    await vidljivost(page, 'hidden');
    await page.clock.fastForward(6_000);
    await vidljivost(page, 'visible');

    await expect(polozaj(page)).toHaveText('1/4 · 0/3'); // GET odmah po povratku
    await expect.poll(() => broker.veze, { timeout: 8_000 }).toBe(2);
    await expect(veza(page)).toHaveText('Povezano');
  });

  test('greške: 409 i prekinut zahtev se vide u traci, dugmad ostaju upotrebljiva', async ({ page, mock }) => {
    pomeriServer(mock, 2);
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect(polozaj(page)).toHaveText('1/4 · 1/3');

    mock.na('POST', 'izvodjenja/:id/komande', () => ({ status: 409, telo: { reason: 'Prvo zatvori pitanje.', time: '' } }));
    await dodirni(page, napred(page));
    await expect(page.locator('.uz-dalj-greska')).toHaveText('Prvo zatvori pitanje.');
    await expect(page.locator('.uz-dalj-greska')).toHaveAttribute('role', 'alert');

    await page.route('**/api/izvodjenja/7/komande', r => r.abort());
    await dodirni(page, napred(page));
    await expect(page.locator('.uz-dalj-greska')).toHaveText(PORUKA_VEZA);
    await expect(napred(page)).toBeEnabled();
    await expect(nazad(page)).toBeEnabled();
    await expect(polozaj(page)).toHaveText('1/4 · 1/3');
  });

  test('kraj: komanda posle završetka sa laptopa (410) -> "Izvođenje je završeno.", bez dugmadi, brava puštena', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect.poll(async () => (await brojaciBrave(page)).zahtevi).toBe(1);

    mock.izvodjenje.zavrsi();
    await dodirni(page, napred(page));
    await expect(page.locator('.uz-dalj-kraj')).toHaveText('Izvođenje je završeno.');
    await expect(napred(page)).toHaveCount(0);
    await expect(nazad(page)).toHaveCount(0);
    await expect.poll(async () => (await brojaciBrave(page)).otpustanja).toBeGreaterThanOrEqual(1);
  });

  test('bez Wake Lock API-ja: vidljivo upozorenje', async ({ page, mock }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { wakeLock?: unknown }).wakeLock;
    });
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await expect(page.getByText('Ovaj pregledač ne može da drži ekran upaljenim.', { exact: false })).toBeVisible();
  });

  test('A+ se pamti posle ponovnog učitavanja; A− ima vidljiv fokus sa tastature; prazne beleške su prigušene', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    const telo = beleske(page);
    await expect(telo).toHaveCSS('font-size', '18px');

    // prazne beleške (prijava): tekst u boji --muted, ne podrazumevana boja
    const prazno = telo.locator('.uz-prazno');
    await expect(prazno).toHaveText('Prijava studenata. „Napred“ prikazuje prvi slajd.');
    const boje = await prazno.evaluate(el => {
      const proba = document.createElement('span');
      proba.style.color = 'var(--muted)';
      el.appendChild(proba);
      const muted = getComputedStyle(proba).color;
      proba.remove();
      return { tekst: getComputedStyle(el).color, muted, ink: getComputedStyle(el.closest('.uz-beleske')!).color };
    });
    expect(boje.tekst).toBe(boje.muted);
    expect(boje.tekst).not.toBe(boje.ink);

    const vece = page.getByRole('button', { name: 'Veća slova beležaka' });
    await vece.click();
    await vece.click();
    await expect(telo).toHaveCSS('font-size', '22px');

    // fokus sa tastature (Shift+Tab sa A+ na A−): prsten od 3 px
    await vece.focus();
    await page.keyboard.press('Shift+Tab');
    const manje = page.getByRole('button', { name: 'Manja slova beležaka' });
    await expect(manje).toBeFocused();
    await expect(manje).toHaveCSS('outline-style', 'solid');
    await expect(manje).toHaveCSS('outline-width', '3px');

    await page.reload();
    await expect(veza(page)).toHaveText('Povezano');
    await expect(beleske(page)).toHaveCSS('font-size', '22px');
  });

  test('nulovana štoperica ostaje nulovana posle ponovnog učitavanja', async ({ page, mock }) => {
    await nastavnickiBroker(page, mock);
    await otvori(page);
    const stoperica = page.getByRole('timer', { name: 'Štoperica' });
    await expect(stoperica).toHaveText(/^12:\d\d$/);
    await page.getByRole('button', { name: 'Nuluj štopericu' }).click();
    await expect(stoperica).toHaveText(/^0:[0-5]\d$/);

    await page.reload();
    await expect(veza(page)).toHaveText('Povezano');
    await expect(stoperica).toHaveText(/^0:[0-5]\d$/);
  });
});

test.describe('daljinski: vrlo duge beleške na 360 x 740', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('20 000 znakova i A+ na maksimumu: bez horizontalnog skrola, Nazad/Napred na ekranu i >= 25% visine', async ({ page, mock }) => {
    await budanEkranStub(page);
    const red = 'Beleška za proveru prelamanja na malom ekranu telefona, red po red do kraja. '.padEnd(79, '.');
    const redovi = Array.from({ length: 300 }, (_, i) => (i === 40 ? 'x'.repeat(300) : red));
    const tekst = redovi.join('\n').slice(0, 20_000);
    expect(tekst.length).toBe(20_000);
    // menja fiksturu (ne `mock.na` na GET: početni STOMP snimak iste verzije bi ga prepisao)
    mock.izvodjenje.izmeniSlajd(0, { beleske: tekst });
    await nastavnickiBroker(page, mock);
    await otvori(page);
    await dodirni(page, napred(page));
    await expect(polozaj(page)).toHaveText('1/4 · 0/3');

    const vece = page.getByRole('button', { name: 'Veća slova beležaka' });
    // posle svakog klika sačekati novu veličinu: inače `isEnabled` pročita stanje pre renderovanja, a klik na dugme
    // koje je u međuvremenu onemogućeno čeka do isteka testa
    for (let i = 0; i < 10 && await vece.isEnabled(); i++) {
      const pre = await beleske(page).evaluate(el => getComputedStyle(el).fontSize);
      await vece.click();
      await expect(beleske(page)).not.toHaveCSS('font-size', pre);
    }
    await expect(vece).toBeDisabled();
    await expect(beleske(page)).toHaveCSS('font-size', '40px');

    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(360);
    for (const dugme of [napred(page), nazad(page)]) {
      const okvir = (await dugme.boundingBox())!;
      expect(okvir.y).toBeGreaterThanOrEqual(0);
      expect(okvir.y + okvir.height).toBeLessThanOrEqual(740);
      expect(okvir.height).toBeGreaterThanOrEqual(185);
    }
    const skrol = await beleske(page).evaluate(el => ({ visina: el.scrollHeight, vidljivo: el.clientHeight }));
    expect(skrol.visina).toBeGreaterThan(skrol.vidljivo);
  });
});
