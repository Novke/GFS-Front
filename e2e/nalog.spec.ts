import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test as osnova } from './fixture';
import { expect as ocekuj, test } from './javna-mreza';
import { lazniBroker } from './lazni-stomp';
import { MockApi } from './mock-api';

/*
 * Javni nalog studenta (`/nalog`, spec prijave 5.1 i 10): indeks -> kod na mejl -> prijavljen na ovom telefonu, povratak na
 * `nazad`. Student nema sesiju nastavnika, pa stranica sme da zove samo `assets/*` i `api/public/nalog/*` (`javna-mreza`:
 * sve van javnog izraza dobija 401 kao na stejdžingu i obara test). Jedini dozvoljeni 401 su odgovori aplikacije na
 * `api/public/nalog/prijava` (pogrešan kod) i `api/public/nalog/ja` (istekao kolačić).
 */

const API_NALOGA = /^(GET|POST) \/api\/public\/nalog\/(stanje|kod|prijava|ja|odjava|odjava-svuda|pomoc)$/;
const INDEKS = 'GD1';

async function posaljiKod(page: Page, indeks = 'gd 1'): Promise<void> {
  await page.getByLabel('Broj indeksa').fill(indeks);
  await page.getByRole('button', { name: 'Pošalji kod' }).click();
  await ocekuj(page.getByRole('heading', { level: 2, name: 'Unesi kod' })).toBeVisible();
}

async function unesiKod(page: Page, kod: string): Promise<void> {
  await page.getByLabel('Kod iz mejla').fill(kod);
  await page.getByRole('button', { name: 'Prijavi se' }).click();
}

async function bezOzbiljnihKrsenja(page: Page): Promise<void> {
  const rezultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const ozbiljna = rezultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
  ocekuj(ozbiljna).toEqual([]);
  ocekuj(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('nalog studenta (telefon, bez sesije nastavnika)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    // posle povratka na uživo prijavljen student ulazi bez forme imena (`POST prijava`), kao kod bodovanog runa
    dozvoljeniApi: new RegExp(`${API_NALOGA.source}|^GET /api/public/uzivo/123456(/ja)?$|^POST /api/public/uzivo/123456/prijava$`),
    dozvoljeni401: /^\/api\/public\/nalog\/(prijava|ja)$/,
  });

  test('ceo tok: indeks -> kod (pogrešan, "Ne stiže mi kod", tačan) -> nazad=uzivo/123456', async ({ page, mock, javnaMreza }) => {
    await page.goto('nalog?nazad=uzivo%2F123456');
    await ocekuj(page.getByRole('heading', { level: 1 })).toHaveText('Nalog studenta');
    await ocekuj(page).toHaveTitle('Nalog · GFS');
    await ocekuj(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0); // bez ljuske

    // prazno: poruka ispod polja, bez zahteva
    await page.getByRole('button', { name: 'Pošalji kod' }).click();
    await ocekuj(page.getByText('Unesi broj indeksa.')).toBeVisible();
    ocekuj(mock.zahteviZa('public/nalog/kod')).toHaveLength(0);

    await posaljiKod(page);
    ocekuj(mock.zahteviZa('public/nalog/kod', 'POST').at(-1)?.telo).toEqual({ indeks: INDEKS });
    await ocekuj(page.getByText('Ako nalog postoji, kod je poslat.')).toBeVisible();
    await ocekuj(page.getByText('a***@example.test')).toBeVisible();
    await ocekuj(page.getByText('Kod ide na mejl koji si dao pri upisu. Proveri i Spam. Ako ga nemaš, nastavnik može da upiše novi.'))
      .toBeVisible();
    const kod = page.getByLabel('Kod iz mejla');
    await ocekuj(kod).toHaveAttribute('inputmode', 'numeric');
    await ocekuj(kod).toHaveAttribute('autocomplete', 'one-time-code');
    await ocekuj(kod).toHaveAttribute('maxlength', '6');
    await ocekuj(page.getByRole('button', { name: /Pošalji ponovo/ })).toBeDisabled();

    await unesiKod(page, '111111');
    await ocekuj(page.getByRole('alert')).toHaveText('Kod nije ispravan ili je istekao.');

    await page.getByRole('button', { name: 'Ne stiže mi kod' }).click();
    await ocekuj(page.getByRole('status')).toHaveText('Javili smo nastavniku.');
    ocekuj(mock.zahteviZa('public/nalog/pomoc', 'POST').at(-1)?.telo).toEqual({ indeks: INDEKS });

    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page).toHaveURL(/\/uzivo\/123456$/);
    ocekuj(mock.studentPrijavljen).toBe(true);
    ocekuj(mock.zahteviZa('public/nalog/prijava', 'POST').at(-1)?.telo).toEqual({ indeks: INDEKS, kod: MockApi.KOD_NALOGA });

    // samo javni API naloga (pa uživo posle povratka), ništa nastavničko
    ocekuj(javnaMreza.api.filter(z => !/^(GET|POST) \/api\/public\/uzivo\//.test(z))).toEqual([
      'GET /api/public/nalog/stanje',
      'POST /api/public/nalog/kod',
      'POST /api/public/nalog/prijava',
      'POST /api/public/nalog/pomoc',
      'POST /api/public/nalog/prijava',
    ]);
    const skripte = await javnaMreza.skripte();
    ocekuj(skripte.putanje.some(p => /\/main-[^/]+\.js$/.test(p)), 'provera je pročitala glavni bundle').toBe(true);
    ocekuj(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nalepljen kod sa razmacima ulazi kao 6 cifara', async ({ page }) => {
    await page.goto('nalog');
    await posaljiKod(page);
    const kod = page.getByLabel('Kod iz mejla');
    await kod.focus();
    await kod.evaluate((el, tekst) => {
      const d = new DataTransfer();
      d.setData('text', tekst);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }));
    }, ` ${MockApi.KOD_NALOGA.slice(0, 3)} ${MockApi.KOD_NALOGA.slice(3)} `);
    await ocekuj(kod).toHaveValue(MockApi.KOD_NALOGA);
    await page.getByRole('button', { name: 'Prijavi se' }).click();
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
  });

  test('nazad sa spoljnim URL-om se ignoriše (Review Focus 4): posle prijave ekran naloga', async ({ page }) => {
    await page.goto('nalog?nazad=%2F%2Fevil.example.test');
    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
    ocekuj(new URL(page.url()).pathname).toMatch(/\/nalog$/);
    await ocekuj(page.getByRole('button', { name: 'Nastavi' })).toHaveCount(0);
  });

  test('nazad na nastavničku rutu se ignoriše: posle prijave ekran naloga, bez nastavničkih zahteva', async ({ page, javnaMreza }) => {
    await page.goto('nalog?nazad=predavanja%2F3');
    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
    ocekuj(new URL(page.url()).pathname).toMatch(/\/nalog$/);
    await ocekuj(page.getByRole('button', { name: 'Nastavi' })).toHaveCount(0);
    ocekuj(javnaMreza.api.filter(z => !z.startsWith('GET /api/public/') && !z.startsWith('POST /api/public/'))).toEqual([]);
  });

  test('nazad=nalog (ista stranica): posle prijave ekran naloga, ne ostaje na kodu', async ({ page }) => {
    await page.goto('nalog?nazad=nalog');
    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
    await ocekuj(page.getByText('Ana Primerović')).toBeVisible();
    await ocekuj(page.getByRole('button', { name: 'Nastavi' })).toHaveCount(0);
  });

  test('prijavljen: ime, uređaji; "Odjavi sve uređaje" uz potvrdu, pa "Odjavi se" posle nove prijave', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog');
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
    await ocekuj(page.getByText('Ana Primerović')).toBeVisible();
    await ocekuj(page.getByText('Android · Chrome')).toBeVisible();
    await ocekuj(page.getByText('Windows · Firefox')).toBeVisible();
    ocekuj(mock.zahteviZa('public/nalog/ja', 'GET')).toHaveLength(1);

    await page.getByRole('button', { name: 'Odjavi sve uređaje' }).click();
    const dijalog = page.getByRole('alertdialog', { name: 'Odjaviti sve uređaje?' });
    await dijalog.getByRole('button', { name: 'Odustani' }).click();
    ocekuj(mock.zahteviZa('public/nalog/odjava-svuda')).toHaveLength(0);

    await page.getByRole('button', { name: 'Odjavi sve uređaje' }).click();
    await dijalog.getByRole('button', { name: 'Odjavi sve' }).click();
    await ocekuj(page.getByRole('status')).toHaveText('Odjavljeno: 2 uređaja.');
    await ocekuj(page.getByLabel('Broj indeksa')).toBeVisible();
    ocekuj(mock.studentPrijavljen).toBe(false);

    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page.getByText('Ovaj uređaj')).toBeVisible();
    await page.getByRole('button', { name: 'Odjavi se' }).click();
    await ocekuj(page.getByRole('status')).toHaveText('Odjavljen si sa ovog uređaja.');
    ocekuj(mock.studentPrijavljen).toBe(false);
  });

  test('pogrešan link pod /nalog: javni 404, bez API poziva', async ({ page, javnaMreza }) => {
    await page.goto('nalog/nepostoji');
    await ocekuj(page.getByRole('heading', { name: 'Stranica nije pronađena' })).toBeVisible();
    await ocekuj(page.getByRole('link', { name: 'Na početnu' })).toHaveCount(0);
    ocekuj(javnaMreza.api).toEqual([]);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}), 360 px: ekran koda sa greškom i ekran naloga, bez serious/critical`, async ({ page, mock }) => {
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto('nalog');
      await posaljiKod(page);
      await unesiKod(page, '111111');
      await ocekuj(page.getByRole('alert')).toBeVisible();
      await bezOzbiljnihKrsenja(page);

      mock.studentPrijavljen = true;
      await page.goto('nalog');
      await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
      await bezOzbiljnihKrsenja(page);
    });
  }
});

/*
 * Bodovan uživo run (slajd Zadatak, `prijavaObavezna`): telefon bez prijavljenog studenta ide na `nalog?nazad=uzivo/<kod>`
 * (`features/uzivo/javno/student.store.ts`), prijava kodom vraća na `uzivo/<kod>` (`javnoNazad`), pa student ulazi pod
 * svojim imenom bez forme imena (`POST prijava` sa praznim imenom; ime uzima server). Lažni broker igra STOMP.
 */
test.describe('bodovan uživo run: nalog?nazad=uzivo/<kod> i nazad', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: new RegExp(`${API_NALOGA.source}|^GET /api/public/uzivo/123456(/ja)?$|^POST /api/public/uzivo/123456/prijava$`),
    dozvoljeni401: /^\/api\/public\/nalog\/(prijava|ja)$/,
  });

  test('uzivo/123456 -> nalog?nazad=uzivo/123456 -> kod -> nazad na uzivo/123456 pod svojim imenom', async ({ page, mock, javnaMreza }) => {
    mock.podaci.izvodjenja.find(i => i.kod === '123456')!.prijavaObavezna = true;
    const ime = `${mock.podaci.nalogStudenta.ime} ${mock.podaci.nalogStudenta.prezime}`;
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

    await page.goto('uzivo/123456');
    // tačno putanja koju gradi student.store (`nalog?nazad=uzivo/<kod>`; ruter `/` u query-ju može da kodira)
    await ocekuj(page).toHaveURL(/\/nalog\?nazad=uzivo(\/|%2F)123456$/);
    await ocekuj(page.getByRole('heading', { level: 1 })).toHaveText('Nalog studenta');
    ocekuj(mock.zahteviZa('public/uzivo/123456/prijava', 'POST')).toHaveLength(0);

    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page).toHaveURL(/\/uzivo\/123456$/);
    await ocekuj(page.getByText('Čekamo početak')).toBeVisible();
    await ocekuj(page.getByText(`Ti si: ${ime}`)).toBeVisible();
    await ocekuj(page.getByLabel('Tvoje ime')).toHaveCount(0);
    ocekuj(mock.podaci.prijavljenStudent).toBe(ime);
    ocekuj(mock.zahteviZa('public/uzivo/123456/prijava', 'POST').map(z => z.telo)).toEqual([{ ime: '' }]);
    ocekuj(mock.zahteviZa('public/nalog/prijava', 'POST')).toHaveLength(1);
  });
});

/*
 * Moodle (`/nalog/moodle`, spec prijave 8.3): backend posle ulaska iz Moodle-a preusmerava ovde studenta bez veze (uparivanje
 * kodom, pa `POST api/public/lti/povezi`; pre toga `GET api/public/lti/povezivanje` za ime Moodle naloga), nastavnika (`?uloga=nastavnik`) ili grešku (`?greska=<kod>`). Ista pravila mreže
 * kao `/nalog`, plus `api/public/lti/povezi` i `api/public/lti/povezivanje`.
 */
test.describe('nalog/moodle (telefon, bez sesije nastavnika)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: new RegExp(`${API_NALOGA.source}|^(POST /api/public/lti/povezi|GET /api/public/lti/povezivanje)$`),
    dozvoljeni401: /^\/api\/public\/nalog\/(prijava|ja)$/,
  });

  test('uparivanje: indeks -> kod -> potvrda -> "Poveži" -> "Moodle nalog je povezan", pa nalog kaže "povezan"', async ({ page, mock, javnaMreza }) => {
    await page.goto('nalog/moodle');
    await ocekuj(page).toHaveTitle('Moodle · GFS');
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Poveži Moodle nalog sa GFS-om' })).toBeVisible();
    await ocekuj(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0); // bez ljuske

    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    // R19: kod ne povezuje sam; student prvo vidi oba naloga
    await ocekuj(page.getByText('GFS nalog: Ana Primerović (GD1)')).toBeVisible();
    await ocekuj(page.getByText('Moodle nalog: Pera Test')).toBeVisible();
    ocekuj(mock.zahteviZa('public/lti/povezi')).toHaveLength(0);
    ocekuj(mock.podaci.nalogStudenta.moodlePovezan).toBe(false);
    await page.getByRole('button', { name: 'Poveži', exact: true }).click();
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Moodle nalog je povezan' })).toBeVisible();
    ocekuj(mock.podaci.nalogStudenta.moodlePovezan).toBe(true);
    ocekuj(mock.moodlePar).toBe(false);

    await page.getByRole('link', { name: 'Otvori nalog' }).click();
    await ocekuj(page).toHaveURL(/\/nalog$/);
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijavljen si' })).toBeVisible();
    await ocekuj(page.getByText('povezan', { exact: true })).toBeVisible();

    ocekuj(javnaMreza.api).toEqual([
      'GET /api/public/lti/povezivanje',
      'GET /api/public/nalog/stanje',
      'POST /api/public/nalog/kod',
      'POST /api/public/nalog/prijava',
      'GET /api/public/nalog/ja',
      'POST /api/public/lti/povezi',
      'GET /api/public/nalog/stanje',
      'GET /api/public/nalog/ja',
    ]);
    ocekuj(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('Moodle nije poslao ime: posle koda potvrda sa upozorenjem, bez povezivanja dok student ne pritisne "Poveži"', async ({ page, mock }) => {
    mock.moodleIme = null;
    await page.goto('nalog/moodle');
    await posaljiKod(page);
    await unesiKod(page, MockApi.KOD_NALOGA);
    await ocekuj(page.getByText('GFS nalog: Ana Primerović (GD1)')).toBeVisible();
    await ocekuj(page.getByText('Moodle nije poslao ime naloga. Poveži samo ako je Moodle na ovom računaru otvoren pod tvojim nalogom.'))
      .toBeVisible();
    ocekuj(mock.zahteviZa('public/lti/povezi')).toHaveLength(0);
    await page.getByRole('button', { name: 'Poveži', exact: true }).click();
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Moodle nalog je povezan' })).toBeVisible();
  });

  test('već prijavljen: "Poveži" (bez automatskog povezivanja); 409 je tekst servera', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    const PORUKA = 'Ovaj Moodle nalog je već povezan sa drugim studentom. Javi se nastavniku.';
    mock.na('POST', 'public/lti/povezi', () => ({ status: 409, telo: { reason: PORUKA, time: '2026-10-20T10:00:00' } }));
    await page.goto('nalog/moodle');
    await ocekuj(page.getByText('GFS nalog: Ana Primerović (GD1)')).toBeVisible();
    await ocekuj(page.getByText('Moodle nalog: Pera Test')).toBeVisible();
    await ocekuj(page.getByText('Ako ovo nisi ti, izaberi „Drugi indeks“.')).toBeVisible();
    ocekuj(mock.zahteviZa('public/lti/povezi')).toHaveLength(0);
    await page.getByRole('button', { name: 'Poveži', exact: true }).click();
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Povezivanje nije uspelo' })).toBeVisible();
    await ocekuj(page.getByRole('alert')).toHaveText(PORUKA);
    await page.getByRole('link', { name: 'Otvori GFS' }).click();
    await ocekuj(page).toHaveURL(/\/nalog$/);
  });

  test('zajednički računar, "Drugi indeks": odjava uređaja i prazno polje indeksa (nalog prethodnog studenta ne ostaje)', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    await page.goto('nalog/moodle');
    await ocekuj(page.getByText('GFS nalog: Ana Primerović (GD1)')).toBeVisible();
    await page.getByRole('button', { name: 'Drugi indeks' }).click();
    await ocekuj(page.getByLabel('Broj indeksa')).toBeVisible();
    await ocekuj(page.getByLabel('Broj indeksa')).toHaveValue('');
    ocekuj(mock.zahteviZa('public/nalog/odjava', 'POST')).toHaveLength(1);
    ocekuj(mock.studentPrijavljen).toBe(false);
    ocekuj(mock.zahteviZa('public/lti/povezi')).toHaveLength(0);
  });

  test('veza iz Moodle-a je istekla (nema __Host-gfs_lti_par): 410 odmah, bez ponude povezivanja', async ({ page, mock }) => {
    mock.studentPrijavljen = true;
    mock.moodlePar = false;
    await page.goto('nalog/moodle');
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Povezivanje nije uspelo' })).toBeVisible();
    await ocekuj(page.getByRole('alert')).toHaveText('Povezivanje je isteklo. Otvori GFS ponovo iz Moodle-a.');
    await ocekuj(page.getByRole('button', { name: 'Poveži', exact: true })).toHaveCount(0);
    ocekuj(mock.zahteviZa('public/lti/povezi')).toHaveLength(0);
    ocekuj(mock.podaci.nalogStudenta.moodlePovezan).toBe(false);
  });

  test('?greska=bez-kolacica: jasna poruka i "Otvori GFS" (prijava kodom), bez API poziva pre klika', async ({ page, javnaMreza }) => {
    await page.goto('nalog/moodle?greska=bez-kolacica');
    await ocekuj(page.getByRole('heading', { level: 2, name: 'Prijava iz Moodle-a nije uspela' })).toBeVisible();
    await ocekuj(page.getByRole('alert')).toContainText('kolačić');
    await ocekuj(page.getByRole('alert')).toContainText('drugom pregledaču');
    ocekuj(javnaMreza.api).toEqual([]);
    await page.getByRole('link', { name: 'Otvori GFS' }).click();
    await ocekuj(page).toHaveURL(/\/nalog$/);
    await ocekuj(page.getByLabel('Broj indeksa')).toBeVisible();
  });

  test('?uloga=nastavnik: "Alat je ispravno registrovan.", bez API poziva', async ({ page, javnaMreza }) => {
    await page.goto('nalog/moodle?uloga=nastavnik');
    await ocekuj(page.getByRole('status')).toHaveText('Alat je ispravno registrovan.');
    await ocekuj(page.getByRole('heading', { level: 1, name: 'GFS i Moodle' })).toBeVisible();
    await ocekuj(page.getByLabel('Broj indeksa')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    ocekuj(javnaMreza.api).toEqual([]);
  });

  for (const rezim of ['dan', 'noc'] as const) {
    test(`axe (${rezim}), 360 px: uparivanje, potvrda, povezan, 410, greška ulaska, nastavnik; bez serious/critical`, async ({ page, mock }) => {
      test.info().annotations.push({ type: 'rezim', description: rezim });
      await page.emulateMedia({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto('nalog/moodle');
      await ocekuj(page.getByLabel('Broj indeksa')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      await posaljiKod(page);
      await unesiKod(page, MockApi.KOD_NALOGA);
      await ocekuj(page.getByText('Moodle nalog: Pera Test')).toBeVisible();
      await bezOzbiljnihKrsenja(page); // korak potvrde
      await page.getByRole('button', { name: 'Poveži', exact: true }).click();
      await ocekuj(page.getByRole('heading', { level: 2, name: 'Moodle nalog je povezan' })).toBeVisible();
      await bezOzbiljnihKrsenja(page);

      mock.moodlePar = false;
      await page.goto('nalog/moodle'); // veza iz Moodle-a je istekla: 410
      await ocekuj(page.getByRole('heading', { level: 2, name: 'Povezivanje nije uspelo' })).toBeVisible();
      await bezOzbiljnihKrsenja(page);

      await page.goto('nalog/moodle?greska=neispravan-token');
      await ocekuj(page.getByRole('alert')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
      await page.goto('nalog/moodle?uloga=nastavnik');
      await ocekuj(page.getByRole('status')).toBeVisible();
      await bezOzbiljnihKrsenja(page);
    });
  }
});

/*
 * Prenos iz F2: brojači ljuske (`DashboardCountsStore`) i zvono osvežavaju samo dok ljuska živi. Nastavnik kome je sesija
 * istekla (odjava u drugoj kartici) i koji u istoj kartici pređe na `/nalog` ne sme da dobije nijedan nastavnički zahtev,
 * pa ni 401 koji bi ga odveo na `/prijava?nazad=nalog`.
 */
osnova.describe('posle ljuske u istoj kartici', () => {
  osnova('prelaz iz ljuske na /nalog: nema nastavničkih zahteva ni preusmeravanja ni posle 2 minuta', async ({ page, mock }) => {
    await page.clock.install();
    await page.goto('');
    await expect(page.locator('app-obavestenja-meni [data-znacka]')).toHaveText('2'); // zvono i brojači su krenuli
    mock.prijavljen = false;
    const posle = mock.zahtevi.length;

    // navigacija rutera u istoj kartici (bez ponovnog učitavanja: root store-ovi ostaju živi)
    await page.evaluate(() => {
      history.pushState(null, '', 'nalog');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nalog studenta');
    await page.clock.fastForward('02:00');
    await page.clock.runFor(1_000);
    await page.waitForLoadState('networkidle'); // i zakasneli odgovor (i lenji chunk isteka sesije) bi stigao do ovde

    await expect(page).toHaveURL(/\/nalog$/);
    const nastavnicki = mock.zahtevi.slice(posle).map(z => `${z.metod} ${z.putanja}`).filter(z => !z.includes(' public/'));
    expect(nastavnicki).toEqual([]);
  });
});
