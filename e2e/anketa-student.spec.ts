import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './javna-mreza';
import { lazniBroker } from './lazni-stomp';
import type { MockApi } from './mock-api';

/*
 * Brza anketa, student (spec brze ankete 6.3; javna ruta, telefon): donji list na tabu Čas (glas i promena glasa),
 * kartica rezultata, anketa za grupu na Početnoj ("Kasnije" sklanja list, kartica ostaje) i list preko prezentacije
 * (`/uzivo/<kod>?sa=cas`, upit `public/nalog/ankete`). Javna mreža: samo `api/public/nalog/*` i `api/public/uzivo/*`.
 */

const API = new RegExp(
  '^(GET|POST) /api/public/nalog/(testovi|stanje|ja|cas|casovi|cas/skeniraj|obavestenja|ankete|ankete/\\d+/glas)$'
  + '|^GET /api/public/uzivo/123456(/ja)?$|^POST /api/public/uzivo/123456/prijava$',
);

const list = (page: Page) => page.locator('[data-anketa-list]');
const odgovor = (page: Page, tekst: string) => list(page).locator('[data-anketa-odgovor]', { hasText: tekst });

/** Upit odmah (stranica pita i kad se vrati u prvi plan), bez čekanja redovnog ritma. */
async function vratiStranicu(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/** Čekiran prijavljen student na predavanju 1 (kao posle skeniranja QR-a). */
function naCasu(mock: MockApi): void {
  mock.studentPrijavljen = true;
  mock.cekiranje.predavanjeId = 1;
  mock.cekiranje.cekiranU = '2026-10-06T10:00:00';
}

async function bezOzbiljnihKrsenja(page: Page, ukljuci: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).include(ukljuci).analyze();
  expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('brza anketa: student na telefonu', () => {
  test.use({
    viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, dozvoljeniApi: API,
  });

  test('tab Čas: list iskače, dodir glasa, promena glasa; pokazan rezultat je kartica', async ({ page, mock, javnaMreza }) => {
    naCasu(mock);
    const id = mock.ankete.otvori({ predavanjeId: 1 });
    await page.goto('nalog/cas');
    await expect(page.locator('[data-na-casu]')).toContainText('Prisutan si');

    await expect(list(page).getByRole('heading', { level: 2 })).toHaveText('Da li vam treba pauza?');
    await expect(list(page)).toContainText('anonimno');
    await expect(list(page).locator('[data-anketa-skloni]')).toHaveText('Kasnije');
    await bezOzbiljnihKrsenja(page, '[data-anketa-list]');

    await odgovor(page, 'Da, 15 min').tap();
    await expect(list(page).locator('[data-anketa-stanje]')).toHaveText('Glas je zabeležen ✓ · možeš da ga promeniš dok je otvoreno');
    await expect(odgovor(page, 'Da, 15 min')).toHaveAttribute('aria-pressed', 'true');
    expect(mock.ankete.glasStudenta(id)).toEqual([1]);

    await odgovor(page, 'Ne, završimo ranije').tap();
    await expect(odgovor(page, 'Ne, završimo ranije')).toHaveAttribute('aria-pressed', 'true');
    await expect(odgovor(page, 'Da, 15 min')).toHaveAttribute('aria-pressed', 'false');
    expect(mock.ankete.glasStudenta(id)).toEqual([2]);
    expect(mock.zahteviZa(`public/nalog/ankete/${id}/glas`, 'POST').map(z => z.telo)).toEqual([{ opcije: [1] }, { opcije: [2] }]);
    await bezOzbiljnihKrsenja(page, '[data-anketa-list]');

    // nastavnik zatvara i pokazuje rezultat: kartica "Rezultat ankete" na tabu Čas, trake u listu
    mock.ankete.glasajDrugi(id, [0], 14);
    mock.ankete.zatvori(id);
    mock.ankete.prikaziRezultat(id);
    await vratiStranicu(page);
    const kartica = page.locator(`[data-anketa-kartica][data-anketa-id="${id}"]`);
    await expect(kartica).toContainText('Rezultat ankete');
    await expect(kartica.locator('[data-anketa-ishod]')).toHaveText('Da, 10 min · 14 od 15 glasova');
    await expect(list(page).locator('[data-anketa-stanje]')).toHaveText('Anketa je zatvorena.');
    await expect(list(page).locator('[data-anketa-rezultat] [data-traka-ankete]')).toHaveCount(3);
    await list(page).locator('[data-anketa-skloni]').tap();
    await expect(list(page)).toHaveCount(0);
    await expect(kartica).toBeVisible();
    expect(javnaMreza.odgovori401).toEqual([]);
  });

  test('Početna: anketa za grupu (nije na času) iskače; "Kasnije" je sklanja, kartica ostaje i "Glasaj" je vraća', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const rok = new Date();
    rok.setDate(rok.getDate() + 1);
    rok.setHours(20, 0, 0, 0);
    const id = mock.ankete.otvori({
      publika: 'GRUPA', predavanjeId: null, grupaId: 1, pitanje: 'Kolokvijum 1: koji datum vam odgovara?',
      opcije: ['Sreda 3.12.', 'Petak 5.12.'], rokMs: rok.getTime(),
    });
    // anketa na času tuđeg predavanja (grupa AR-2025): nije za ovog studenta, pa je nema ni u listu ni u kartici
    mock.ankete.otvori({ predavanjeId: 4, grupaId: 2, pitanje: 'Tuđa anketa?' });

    await page.goto('nalog/pocetna');
    await expect(list(page).getByRole('heading', { level: 2 })).toHaveText('Kolokvijum 1: koji datum vam odgovara?');
    await expect(list(page)).toContainText('cela grupa');
    await list(page).locator('[data-anketa-skloni]').tap();
    await expect(list(page)).toHaveCount(0);

    const kartice = page.locator('[data-anketa-kartica]');
    await expect(kartice).toHaveCount(1);
    await expect(kartice).toContainText(/Anketa za grupu · do sutra u \d\d:00/);
    await expect(kartice).toContainText('Sreda 3.12. · Petak 5.12.');
    await kartice.locator('[data-anketa-glasaj]').tap();
    await odgovor(page, 'Petak 5.12.').tap();
    await expect(list(page).locator('[data-anketa-stanje]')).toContainText('Glas je zabeležen ✓');
    await expect(kartice.locator('[data-anketa-glasaj]')).toHaveText('Promeni glas');
    expect(mock.ankete.glasStudenta(id)).toEqual([1]);
    await expect(page.getByText('Tuđa anketa?')).toHaveCount(0);
  });

  test('telefon u prezentaciji (?sa=cas): list preko slajda, glas; STOMP i stanje izvođenja se ne diraju', async ({ page, mock, javnaMreza }) => {
    naCasu(mock);
    mock.cekiranje.izvodjenje = { kod: '123456', naziv: 'Statika · uvodni čas' };
    await lazniBroker(page, 'api/public/ws', o => {
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

    await page.goto('nalog/cas');
    await expect(page).toHaveURL(/\/uzivo\/123456\?sa=cas$/);
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await expect(list(page)).toHaveCount(0);

    // nastavnik pokreće anketu: telefon je dobija na sledeći upit (10 s ± 2 s), a odmah kad se stranica vrati u prvi plan
    const id = mock.ankete.otvori({ predavanjeId: 1, pitanje: 'Kakav je tempo?', opcije: ['Prebrzo', 'Taman', 'Presporo'] });
    await vratiStranicu(page);
    await expect(list(page).getByRole('heading', { level: 2 })).toHaveText('Kakav je tempo?');
    await odgovor(page, 'Taman').tap();
    await expect(list(page).locator('[data-anketa-stanje]')).toContainText('Glas je zabeležen ✓');
    expect(mock.ankete.glasStudenta(id)).toEqual([1]);
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await bezOzbiljnihKrsenja(page, '[data-anketa-list]');

    expect(javnaMreza.api).toContain('GET /api/public/nalog/ankete');
    expect(javnaMreza.api).toContain(`POST /api/public/nalog/ankete/${id}/glas`);
    expect(javnaMreza.odgovori401).toEqual([]);
  });
});
