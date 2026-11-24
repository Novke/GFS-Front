import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Crtanje u izvođenju (spec `2026-11-23-crtanje-uzivo-design.md`, 8. Testovi): konzola crta preko slajda i bele pozadine,
 * publika u istom kontekstu vidi crtež kroz kanal (`BroadcastChannel`), „ranije” čip i panel, tabla sa predavanja i
 * Podešavanja → Uživo. Mok čuva strane (`MockIzvodjenje.crtezi`, `MockApi.table`); snimci publici idu kroz lažni broker.
 */

const linija = { tip: 'LINIJA', boja: '#C62828', debljina: 6, tacke: [100, 100, 500, 300] };
const SLOJ = 'app-sloj-crteza svg[viewBox="0 0 960 540"] path';
const TEMA_NASTAVNIK = '/topic/izvodjenja/7/nastavnik';

/** Server je već na prvom slajdu (INFO 101) pre otvaranja konzole. */
const naPrvomSlajdu = (mock: MockApi) => mock.izvodjenje.primeni('SLEDECI');

async function otvoriKonzolu(page: Page, mock: MockApi): Promise<void> {
  await nastavnickiBroker(page, mock);
  await page.goto('izvodjenja/7/konzola');
  await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
}

/** Prozor publike u istom kontekstu (isti `BroadcastChannel`), sa svojim mokom i brokerom. */
async function otvoriPubliku(page: Page, mock: MockApi) {
  const publika = await page.context().newPage();
  await mock.instaliraj(publika);
  const broker = await nastavnickiBroker(publika, mock);
  await publika.goto('izvodjenja/7/publika');
  await expect(publika.locator('app-publika-scena')).toBeVisible();
  return { publika, broker };
}

/** Prevlačenje mišem preko površine, od (x1, y1) do (x2, y2) u delovima širine i visine površine. */
async function prevuci(povrsina: Locator, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const b = (await povrsina.boundingBox())!;
  const page = povrsina.page();
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(b.x + b.width * (x1 + ((x2 - x1) * i) / 8), b.y + b.height * (y1 + ((y2 - y1) * i) / 8));
  }
  await page.mouse.up();
}

const upisi = (mock: MockApi) => mock.zahteviZa('izvodjenja/7/crtezi/strana', 'PUT');

test.describe('crtanje u izvođenju (konzola i publika)', () => {
  test('D: crtanje preko slajda se vidi na publici; Esc završava, crtež ostaje', async ({ page, mock }) => {
    naPrvomSlajdu(mock);
    const { publika } = await otvoriPubliku(page, mock);
    await otvoriKonzolu(page, mock);

    await page.keyboard.press('d');
    const raspored = page.locator('app-raspored-crtanja');
    await expect(raspored).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Alati za crtanje' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crtaj' })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'Linija', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await prevuci(page.locator('app-povrsina-crtanja'), 0.2, 0.3, 0.6, 0.6);

    await expect.poll(() => upisi(mock).length).toBe(1);
    const put = upisi(mock)[0];
    expect(put.query.get('slajdId')).toBe('101');
    expect(put.query.get('pozadina')).toBe('SLAJD');
    expect((put.telo as { elementi: { tip: string }[] }).elementi.map(e => e.tip)).toEqual(['LINIJA']);
    await expect(publika.locator(SLOJ)).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(raspored).toBeHidden();
    await expect(page.getByRole('button', { name: 'Crtaj' })).toHaveAttribute('aria-pressed', 'false');
    await expect(publika.locator(SLOJ)).toHaveCount(1);
    await publika.close();
  });

  test('sačuvan crtež stiže sa servera; alati na projektoru samo uz „oko”; Ctrl+Z i Ctrl+Y menjaju i publiku', async ({ page, mock }) => {
    naPrvomSlajdu(mock);
    mock.izvodjenje.crtezi.set('SLAJD:101', { elementi: [linija], verzija: 1, izmenjeno: '2026-10-07T10:05:00' });
    const { publika } = await otvoriPubliku(page, mock);
    await otvoriKonzolu(page, mock);
    await page.keyboard.press('d');
    await expect(publika.locator(SLOJ)).toHaveCount(1);
    await expect(page.locator(`[data-crt-scena] ${SLOJ}`)).toHaveCount(1);
    await expect(publika.locator('[data-crt-pub-alati]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Publika vidi alate' }).click();
    await expect(publika.locator('[data-crt-pub-alati]')).toBeVisible();

    // sačuvan crtež je početak istorije: poništava se samo ono što je ova konzola nacrtala
    await expect(page.getByRole('button', { name: 'Poništi' })).toBeDisabled();
    await prevuci(page.locator('app-povrsina-crtanja'), 0.5, 0.2, 0.8, 0.7);
    await expect(publika.locator(SLOJ)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(publika.locator(SLOJ)).toHaveCount(1);
    await page.keyboard.press('Control+y');
    await expect(publika.locator(SLOJ)).toHaveCount(2);
    await expect.poll(() => upisi(mock).map(z => (z.telo as { elementi: unknown[] }).elementi.length).at(-1)).toBe(2);
    expect(mock.izvodjenje.crtezi.get('SLAJD:101')?.elementi).toHaveLength(2);

    await page.keyboard.press('d');
    await expect(publika.locator('[data-crt-pub-alati]')).toHaveCount(0);
    await publika.close();
  });

  test('W: bela pozadina ima svoj crtež; W ponovo vraća slajd i njegov (prazan) crtež', async ({ page, mock }) => {
    naPrvomSlajdu(mock);
    const { publika, broker } = await otvoriPubliku(page, mock);
    await otvoriKonzolu(page, mock);

    const bela = page.getByRole('button', { name: 'Bela pozadina' });
    await bela.click();
    await expect(bela).toHaveAttribute('aria-pressed', 'true');
    broker.posalji(TEMA_NASTAVNIK, mock.izvodjenje.stanje());
    await expect(publika.locator('app-publika')).toHaveClass(/uz-pub--beo/);

    await page.keyboard.press('d');
    await prevuci(page.locator('app-povrsina-crtanja'), 0.3, 0.3, 0.7, 0.5);
    await expect.poll(() => upisi(mock).length).toBe(1);
    expect(upisi(mock)[0].query.get('pozadina')).toBe('BELA');
    expect(upisi(mock)[0].query.get('slajdId')).toBe('101');
    await expect(publika.locator(SLOJ)).toHaveCount(1);

    await page.keyboard.press('w');
    await expect(bela).toHaveAttribute('aria-pressed', 'false');
    broker.posalji(TEMA_NASTAVNIK, mock.izvodjenje.stanje());
    await expect(publika.locator('app-publika')).not.toHaveClass(/uz-pub--beo/);
    await expect(publika.locator(SLOJ)).toHaveCount(0);
    await expect(page.locator('app-raspored-crtanja')).toBeVisible();

    // nazad na belu: crtež bele strane je i dalje tu
    await page.keyboard.press('w');
    broker.posalji(TEMA_NASTAVNIK, mock.izvodjenje.stanje());
    await expect(publika.locator(SLOJ)).toHaveCount(1);
    await publika.close();
  });

  test('„Ranije si na ovom slajdu crtao”: čip ulazi u crtanje, klik u panelu ubacuje stari crtež (Ctrl+Z ga vraća)', async ({ page, mock }) => {
    naPrvomSlajdu(mock);
    mock.ranijiCrtezi.set(101, [{ izvodjenjeId: 3, pocetak: '2026-10-01T10:00:00', grupa: 'GD-2024', pozadina: 'SLAJD', elementi: [linija] }]);
    await otvoriKonzolu(page, mock);

    const cip = page.getByRole('button', { name: 'Ranije si na ovom slajdu crtao' });
    await expect(cip).toBeVisible();
    await cip.click();
    const panel = page.getByRole('region', { name: 'Ranije ovde' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Ubaci raniji crtež: GD-2024 · 1. 10. 2026.' }).click();
    await expect.poll(() => upisi(mock).length).toBe(1);
    expect((upisi(mock)[0].telo as { elementi: unknown[] }).elementi).toEqual([linija]);
    await expect(page.locator(`[data-crt-scena] ${SLOJ}`)).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => upisi(mock).length).toBe(2);
    expect((upisi(mock)[1].telo as { elementi: unknown[] }).elementi).toEqual([]);
  });

  test('Podešavanja → Uživo: isključeni raniji crteži, nema čipa ni zahteva', async ({ page, mock }) => {
    naPrvomSlajdu(mock);
    mock.ranijiCrtezi.set(101, [{ izvodjenjeId: 3, pocetak: '2026-10-01T10:00:00', grupa: null, pozadina: 'SLAJD', elementi: [linija] }]);
    await page.goto('podesavanja/uzivo');
    await expect(page.getByRole('heading', { level: 1, name: 'Uživo' })).toBeVisible();
    const prekidac = page.getByRole('switch', { name: 'Nudi ranije crteže na slajdu' });
    await expect(prekidac).toBeChecked();
    await prekidac.click();
    await expect(prekidac).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('gfs.ranije-crteze.v1'))).toBe('0');

    await otvoriKonzolu(page, mock);
    await expect(page.locator('.uz-kon-meta')).toContainText('Slajd 1/6');
    await expect(page.getByRole('button', { name: 'Ranije si na ovom slajdu crtao' })).toHaveCount(0);
    expect(mock.zahteviZa('izvodjenja/7/crtezi/ranije', 'GET')).toEqual([]);
  });

  test('na prijavi se ne crta: D ne ulazi u crtanje, „Crtaj” je onemogućeno', async ({ page, mock }) => {
    await otvoriKonzolu(page, mock);
    await page.keyboard.press('d');
    await expect(page.locator('app-raspored-crtanja')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crtaj' })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('pregled izvođenja: kartica „Crteži”', () => {
  test('sličice ne-praznih strana redom, klik otvara veliki prikaz', async ({ page, mock }) => {
    mock.na('GET', 'izvodjenja/:id/crtezi', () => ({
      telo: [
        { slajdId: 51, slajdBroj: 1, pozadina: 'SLAJD', elementi: [linija], verzija: 2, izmenjeno: '2026-10-07T10:10:00' },
        { slajdId: 51, slajdBroj: 1, pozadina: 'BELA', elementi: [linija], verzija: 1, izmenjeno: '2026-10-07T10:12:00' },
        { slajdId: null, slajdBroj: null, pozadina: 'SLAJD', elementi: [linija], verzija: 1, izmenjeno: '2026-10-07T10:14:00' },
      ],
    }));
    mock.na('GET', 'izvodjenja/:id/rezultati', () => ({ telo: rezultatiBezPitanja() }));
    await page.goto('izvodjenja/7/pregled');
    const kartica = page.locator('[data-crtezi]');
    await expect(kartica.getByRole('heading', { name: 'Crteži' })).toBeVisible();
    await expect(kartica.locator('button span')).toHaveText(['Slajd 1', 'Slajd 1, bela pozadina', 'Obrisan slajd']);
    await kartica.getByRole('button', { name: 'Otvori crtež: Slajd 1, bela pozadina' }).click();
    const dijalog = page.getByRole('dialog', { name: 'Slajd 1, bela pozadina' });
    await expect(dijalog.locator(SLOJ)).toHaveCount(1);
    await dijalog.getByRole('button', { name: 'Zatvori' }).click();
    await expect(dijalog).toHaveCount(0);
  });
});

/** `IzvodjenjeRezultati` završenog izvođenja prezentacije 5 bez pitanja (pregled bez rundi). */
export function rezultatiBezPitanja() {
  return {
    izvodjenje: {
      id: 7, prezentacija: { id: 5, naziv: 'Statika · nosači', predmetId: 1 }, kod: null, status: 'ZAVRSENO', cuvanje: false,
      grupa: null, predavanje: null, pocetak: '2026-10-07T10:00:00', kraj: '2026-10-07T10:30:00', brojUcesnika: 0, brojPitanja: 0,
      takmicenje: false, boduje: false,
    },
    takmicenje: false, rangLista: [], pitanja: [],
  };
}

test.describe('tabla sa predavanja', () => {
  test('„Tabla” u novoj kartici: odmah bela strana i crtanje; publika vidi crtež; sličica na predavanju', async ({ page, mock }) => {
    await mock.instaliraj(page.context());   // nova kartica table i prozor publike
    await page.goto('predavanja/1');
    await expect(page.locator('[data-tabla-casa]')).toHaveCount(0);
    const [tabla] = await Promise.all([page.context().waitForEvent('page'), page.locator('[data-tabla]').click()]);
    await expect(tabla).toHaveURL(/\/predavanja\/1\/tabla$/);
    await expect(tabla.locator('[data-naslov-table]')).toHaveText('Tabla · Programiranje u građevinarstvu, predavanje 6. 10. 2026.');
    await expect(tabla.getByRole('toolbar', { name: 'Alati za crtanje' })).toBeVisible();
    await expect(tabla.locator('app-povrsina-crtanja')).not.toHaveClass(/crt-povrsina--neaktivna/);

    const [publika] = await Promise.all([tabla.waitForEvent('popup'), tabla.getByRole('button', { name: 'Otvori publiku' }).click()]);
    await expect(publika).toHaveURL(/\/predavanja\/1\/tabla\/publika$/);
    await expect(publika.locator('[data-tabla-publika]')).toBeVisible();

    await tabla.keyboard.press('5');
    await prevuci(tabla.locator('app-povrsina-crtanja'), 0.2, 0.2, 0.5, 0.6);
    await expect.poll(() => mock.zahteviZa('predavanja/1/tabla', 'PUT').length).toBe(1);
    expect((mock.zahteviZa('predavanja/1/tabla', 'PUT')[0].telo as { elementi: { tip: string }[] }).elementi.map(e => e.tip))
      .toEqual(['PRAVOUGAONIK']);
    await expect(publika.locator(SLOJ)).toHaveCount(1);
    await publika.close();
    await tabla.close();

    await page.reload();
    const casa = page.locator('[data-tabla-casa]');
    await expect(casa.getByRole('heading', { name: 'Tabla sa ovog časa' })).toBeVisible();
    await expect(casa.locator(SLOJ)).toHaveCount(1);
    const [opet] = await Promise.all([page.context().waitForEvent('page'), casa.getByRole('link').click()]);
    await expect(opet).toHaveURL(/\/predavanja\/1\/tabla$/);
  });

  test('publika bez table u istom pregledaču: server na 3 s (`?posle=`), 204 dok se ne promeni', async ({ page, mock }) => {
    mock.table.set(1, { elementi: [linija], verzija: 2 });
    await page.goto('predavanja/1/tabla/publika');
    await expect(page.locator(SLOJ)).toHaveCount(1);
    expect(mock.zahteviZa('predavanja/1/tabla', 'GET')[0].query.get('posle')).toBe('0');

    mock.table.set(1, { elementi: [linija, { ...linija, tacke: [600, 100, 900, 400] }], verzija: 3 });
    await expect(page.locator(SLOJ)).toHaveCount(2, { timeout: 8_000 });
    const posle = mock.zahteviZa('predavanja/1/tabla', 'GET').map(z => z.query.get('posle'));
    expect(posle.slice(0, 2)).toEqual(['0', '2']);
  });
});
