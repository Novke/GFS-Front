import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test as osnova } from './fixture';
import { expect as ocekuj, test } from './javna-mreza';
import { lazniBroker } from './lazni-stomp';
import { MockApi } from './mock-api';

/*
 * Čekiranje (studentski portal, faza 1): student skenira QR sa projektora (`/nalog/cas/<token>`), prijavljen je odmah na
 * času, neprijavljen ide kroz prijavu kodom i vraća se na `/nalog/cas`. Stranica časa prati stanje i vodi u Uživo izvođenje
 * (`?sa=cas`), a posle kraja izvođenja nazad na čas. Javna mreža: samo `api/public/nalog/*` i `api/public/uzivo/*`.
 * Projektor predavanja (nastavnik) crta QR čiji token se menja.
 */

const API = new RegExp(
  '^(GET|POST) /api/public/nalog/(stanje|kod|prijava|ja|cas|cas/skeniraj|cas/potvrdi)$'
  + '|^GET /api/public/uzivo/123456(/ja)?$|^POST /api/public/uzivo/123456/prijava$',
);
/** Token oblika servera (`<predavanjeId>.<22 znaka>`) za živo predavanje 1 iz fiksture. */
const TOKEN = `1.${'A'.repeat(22)}`;
/** Opis predavanja 1 kako ga gradi `opisCasa`: predmet · dan datum · tema. */
const CAS = 'Programiranje u građevinarstvu · utorak 6.10. · Petlje i nizovi';

/** Upit stanja odmah, bez čekanja redovnih 10 s: stranica pita i kad se vrati u prvi plan. */
async function vratiStranicu(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).length), { timeout: 5_000 })
    .toBe(0);
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  ocekuj(rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  ocekuj(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('čekiranje (telefon, bez sesije nastavnika)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, dozvoljeniApi: API });

  test('cas: skeniranje -> čeka -> izvođenje -> kraj -> nazad na čas', async ({ page, mock, javnaMreza }) => {
    mock.studentPrijavljen = true;
    const broker = await lazniBroker(page, 'api/public/ws', o => {
      if (o !== '/app/izvodjenja/7/pocetno') return undefined;
      const u = mock.podaci.ucesnici.at(-1)!;
      return {
        javno: {
          izvodjenjeId: 7, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas', kod: '123456',
          prikaz: 'PRIJAVA', slajdTip: null, ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false,
          brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, zadatak: null,
        },
        licno: {
          verzija: 1, ucesnikId: u.ucesnikId, ime: u.ime, poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null,
          zadatak: null,
        },
      };
    }, url => javnaMreza.ws.push(new URL(url).pathname));

    await page.goto(`nalog/cas/${TOKEN}`);
    await ocekuj(page.locator('[data-na-casu]')).toContainText(`Prisutan si: ${CAS}`);
    ocekuj(new URL(page.url()).pathname).toMatch(/\/nalog\/cas$/); // token ne ostaje u adresi ni u istoriji
    await ocekuj(page.getByText('Čeka se prezentacija…')).toBeVisible();
    ocekuj(mock.zahteviZa('public/nalog/cas/skeniraj', 'POST').map(z => z.telo)).toEqual([{ token: TOKEN }]);

    // nastavnik pokreće prezentaciju sa predavanja: sledeći upit vodi u izvođenje
    mock.cekiranje.izvodjenje = { kod: '123456', naziv: 'Statika · uvodni čas' };
    await vratiStranicu(page);
    await ocekuj(page).toHaveURL(/\/uzivo\/123456\?sa=cas$/);
    await ocekuj(page.getByText('Čekamo početak')).toBeVisible();
    mock.cekiranje.izvodjenje = null;

    // kraj izvođenja: posle 3 s nazad na čas, gde opet čeka
    broker.posalji('/topic/izvodjenja/7/javno', {
      izvodjenjeId: 7, verzija: 2, serverVremeMs: Date.now(), status: 'ZAVRSENO', naziv: 'Statika · uvodni čas', kod: '123456',
      prikaz: 'KRAJ', slajdTip: null, ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false,
      brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, zadatak: null,
    });
    await ocekuj(page.getByText('Vraćam te na čas…')).toBeVisible();
    await ocekuj(page).toHaveURL(/\/nalog\/cas$/, { timeout: 10_000 });
    await ocekuj(page.locator('[data-na-casu]')).toContainText('Prisutan si');
    ocekuj(javnaMreza.api.filter(z => !API.test(z))).toEqual([]);
  });

  test('cas: neprijavljen ide na prijavu i potvrđuje', async ({ page, mock, javnaMreza }) => {
    await page.goto(`nalog/cas/${TOKEN}`);
    await ocekuj(page).toHaveURL(/\/nalog\?nazad=nalog(\/|%2F)cas$/);
    await page.getByLabel('Broj indeksa').fill('01');
    await page.getByRole('button', { name: 'Pošalji kod' }).click();
    await page.getByLabel('Kod iz mejla').fill(MockApi.KOD_NALOGA);
    await page.getByRole('button', { name: 'Prijavi se' }).click();
    await ocekuj(page).toHaveURL(/\/nalog\/cas$/);
    await ocekuj(page.locator('[data-na-casu]')).toContainText(`Prisutan si: ${CAS}`);
    ocekuj(mock.zahteviZa('public/nalog/cas/potvrdi', 'POST')).toHaveLength(1);
    ocekuj(await page.evaluate(() => sessionStorage.getItem('gfs-cas-kljuc'))).toBeNull();
    ocekuj(javnaMreza.api).toEqual([
      'POST /api/public/nalog/cas/skeniraj',
      'GET /api/public/nalog/stanje',
      'POST /api/public/nalog/kod',
      'POST /api/public/nalog/prijava',
      'POST /api/public/nalog/cas/potvrdi',
    ]);
  });

  test('istekao QR i završen čas: poruka servera, bez praćenja', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/cas/1.kratak');
    await ocekuj(page.getByRole('alert')).toHaveText('QR je istekao. Skeniraj ponovo sa table.');
    await page.goto(`nalog/cas/2.${'A'.repeat(22)}`); // predavanje 2 je završeno
    await ocekuj(page.getByRole('alert')).toHaveText('Čekiranje za ovaj čas je završeno.');
    ocekuj(mock.zahteviZa('public/nalog/cas', 'GET')).toHaveLength(0);
  });

  test('/nalog: prijavljen i čekiran ide pravo na tab Čas (na času)', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    mock.cekiranje.predavanjeId = 1;
    await page.goto('nalog');
    await ocekuj(page).toHaveURL(/\/nalog\/cas$/);
    await ocekuj(page.locator('[data-na-casu]')).toContainText(CAS);
  });

  test('axe (dan), 360 px: na času i poruka', async ({ page, mock }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 740 });
    mock.studentPrijavljen = true;
    mock.cekiranje.predavanjeId = 1;
    await page.goto('nalog/cas');
    await ocekuj(page.locator('[data-na-casu]')).toBeVisible();
    await bezOzbiljnihKrsenja(page);
    await page.goto('nalog/cas/1.kratak');
    await ocekuj(page.getByRole('alert')).toBeVisible();
    await bezOzbiljnihKrsenja(page);
  });
});

osnova.describe('projektor predavanja: QR za čekiranje', () => {
  osnova('živo predavanje: QR i adresa se menjaju, "Čekirano: N" bez imena', async ({ page, mock }) => {
    mock.cekiranje.cekirani = [
      { studentId: 2, ime: 'Marko', prezime: 'Marković', indeks: 'GD2', vreme: '2026-10-06T10:01:00', kasnio: false, istiTelefonKao: null },
    ];
    await page.goto('predavanja/1/projektor');
    const qr = page.locator('app-qr-kod canvas');
    await expect(qr).toHaveAttribute('aria-label', /^QR kod: http.*\/nalog\/cas\/1\.T{21}\d$/);
    const prvi = await qr.getAttribute('aria-label');
    await expect.poll(() => qr.getAttribute('aria-label'), { timeout: 8_000 }).not.toBe(prvi);
    await expect(page.locator('[data-adresa-cekiranja]')).toContainText('/nalog/cas/1.');
    await expect(page.locator('[data-cekirano]')).toHaveText('Čekirano: 1');
    await expect(page.getByText('Marko')).toHaveCount(0);
  });

  osnova('završeno predavanje: bez QR-a i bez upita', async ({ page, mock }) => {
    await page.goto('predavanja/2/projektor');
    await expect(page.locator('[data-prisutnih]')).toBeVisible();
    await expect(page.locator('app-qr-kod')).toHaveCount(0);
    expect(mock.zahteviZa('predavanja/2/cekiranje')).toHaveLength(0);
  });
});
