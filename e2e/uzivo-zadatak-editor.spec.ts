import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';

/*
 * Zadatak slajd u editoru (FE-2; mok API): dugme "Zadatak" otvara izbor grupe iz banke predmeta prezentacije (lenji dijalog
 * nad `GET banka/stablo?namena=PREDAVANJE`), slajd se šalje odmah, a opis (putanja, kandidati, polja, upozorenja) računa mok
 * istim pravilima i tekstovima kao server (`MockBanka.zadatakSlajda`). Prezentacija 6 iz `fixtures/prezentacije.json`
 * (izmišljeno, predmet 1): 61 = INFO (izabran pri učitavanju), 62 = ZADATAK nad listom `2 → 10` (120 s, sve aktivne). Banka iz
 * `fixtures/banka.json`: koren "Konverzije brojeva" sa listovima `2 → 10` (1 aktivna), `16 → 2` (1), `8 → 2 (Klod)` (1) i
 * "Razlomljeni brojevi (demo)" (isključen temom, bez aktivnih).
 */
const PREZENTACIJA = 6;
const INFO_SLAJD = 61;
const ZADATAK_SLAJD = 62;

interface ZadatakSlajda { grupaId: number | null; vremeSekunde: number | null; brojVarijanti: number | null; nivo: number | null }
interface SlajdCmd { tip: string; pitanje: unknown; platno: unknown; zadatak: ZadatakSlajda | null }

const putovi = (mock: MockApi) => mock.zahteviZa(`slajdovi/${ZADATAK_SLAJD}`, 'PUT');
/** `zadatak` iz tela poslednjeg `PUT`-a slajda 62 (undefined dok ga nema). */
const poslednjiZadatak = (mock: MockApi) => (putovi(mock).at(-1)?.telo as SlajdCmd | undefined)?.zadatak;

const izabranaStavka = (page: Page) => page.locator('.uz-ed-stavka-dugme[aria-current="true"]');
const forma = (page: Page) => page.locator('app-zadatak-forma');
const upozorenja = (page: Page) => forma(page).getByRole('status');
const dijalog = (page: Page) => page.getByRole('dialog', { name: 'Grupa zadataka' });
const brojRazlicitih = (page: Page) => page.getByRole('textbox', { name: 'Broj različitih zadataka' });

async function otvori(page: Page): Promise<void> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  await expect(izabranaStavka(page)).toContainText('Zadaci na času (demo)');
}

/** Bira Zadatak slajd 62 u listi i čeka opis sa servera. */
async function otvoriZadatak(page: Page): Promise<void> {
  await otvori(page);
  await page.getByRole('button', { name: /^2\s/ }).click();
  await expect(izabranaStavka(page)).toContainText('Zadatak: 2 → 10');
  await expect(forma(page)).toContainText('Aktivnih varijanti: 1');
}

/** U otvorenom dijalogu bira čvor po početku naziva i potvrđuje; dijalog se zatvara. */
async function izaberiCvor(d: Locator, naziv: RegExp): Promise<void> {
  await d.getByRole('radio', { name: naziv }).check();
  await d.getByRole('button', { name: 'Izaberi' }).click();
  await expect(d).toHaveCount(0);
}

test.describe('uživo: Zadatak slajd u editoru (mokovan API)', () => {
  test('"Zadatak": stablo banke predavanja (isključeno, bez aktivnih), slajd posle izabranog, opis sa servera', async ({ page, mock }) => {
    await otvori(page);
    await page.getByRole('button', { name: 'Zadatak', exact: true }).click();
    const d = dijalog(page);
    // koren i četiri lista, sa uvlakom; svaki se sme izabrati (isključeno i bez aktivnih su samo upozorenja)
    await expect(d.getByRole('radio')).toHaveCount(5);
    const stablo = mock.zahteviZa('banka/stablo', 'GET');
    expect(stablo.map(z => [z.query.get('predmetId'), z.query.get('namena')])).toEqual([['1', 'PREDAVANJE']]);
    const razlomljeni = d.locator('mat-radio-button').filter({ hasText: 'Razlomljeni brojevi (demo)' });
    await expect(razlomljeni).toContainText('Nema aktivnih varijanti');
    await expect(razlomljeni).toContainText('Isključeno');
    await expect(d.locator('mat-radio-button').filter({ hasText: 'Konverzije brojeva' })).toContainText('aktivnih: 3');
    await expect(d.getByRole('button', { name: 'Izaberi' })).toBeDisabled();
    await izaberiCvor(d, /^2 → 10/);

    // lista odmah kaže "Zadatak: <grupa>" (naziv iz čvora), POST ide odmah, posle izabranog INFO slajda
    await expect(izabranaStavka(page)).toContainText('Zadatak: 2 → 10');
    await expect.poll(() => mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi`, 'POST').length).toBe(1);
    const post = mock.zahteviZa(`prezentacije/${PREZENTACIJA}/slajdovi`, 'POST')[0];
    expect(post.query.get('posle')).toBe(String(INFO_SLAJD));
    expect(post.telo).toMatchObject({
      tip: 'ZADATAK', pitanje: null, platno: null, zadatak: { grupaId: 2, vremeSekunde: null, brojVarijanti: null, nivo: null },
    });
    // opis sa servera: putanja od korena, kandidati lista, polja lista; bez upozorenja i bez veze na banku
    await expect(forma(page).locator('[data-putanja]')).toHaveText('Konverzije brojeva › 2 → 10');
    await expect(forma(page)).toContainText('Aktivnih varijanti: 1');
    await expect(forma(page)).toContainText('Polja odgovora: Vrednost u dekadnom sistemu (broj)');
    await expect(forma(page)).toContainText('Prazno = sve aktivne (1). Menja se i u konzoli pre otvaranja.');
    await expect(upozorenja(page)).toHaveText('');
    await expect(page.getByRole('link', { name: 'Otvori u banci' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Vreme (s)' })).toHaveValue('');
    await expect(page.locator('.uz-ed-pregled')).toContainText('Različitih: sve');
    await expect(page.locator('.uz-ed-oznaka')).toHaveText(['Zadaci na času (demo)', 'Zadatak: 2 → 10', 'Zadatak: 2 → 10']);
  });

  test('Broj različitih zadataka: PUT nosi broj (vreme ostaje), pregled ga pokazuje; neispravan se ne šalje, prazno = sve', async ({ page, mock }) => {
    await otvoriZadatak(page);
    await expect(page.getByRole('textbox', { name: 'Vreme (s)' })).toHaveValue('120');
    await brojRazlicitih(page).fill('2');
    await expect.poll(() => poslednjiZadatak(mock)).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: 2, nivo: null });
    await expect(page.locator('.uz-ed-pregled')).toContainText('Različitih: 2');

    await brojRazlicitih(page).fill('51');
    await expect(page.locator('.uz-ed-greske')).toContainText('Broj različitih zadataka mora biti od 1 do 50.');
    await brojRazlicitih(page).fill('');
    await expect.poll(() => poslednjiZadatak(mock)).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: null, nivo: null });
    await expect(page.locator('.uz-ed-greske')).toHaveCount(0);
    expect(putovi(mock).map(z => (z.telo as SlajdCmd).zadatak?.brojVarijanti)).not.toContain(51);
  });

  test('Nivo: kandidati po nivou uz svaku opciju, izbor ★★★ ide u PUT i sužava kandidate, "Svi" ga skida', async ({ page, mock }) => {
    // grupa 2: aktivna je samo varijanta 12 (nivo 2); 11 i 13 su nacrti
    await otvoriZadatak(page);
    const nivo = (n: string) => forma(page).locator(`[data-zadatak-nivo] [role=radio][data-nivo="${n}"]`);
    await expect(nivo('svi')).toHaveAttribute('aria-checked', 'true');
    await expect(nivo('1')).toHaveAttribute('aria-label', 'Nivo 1 od 3 (lakši), 0 varijanti');
    await expect(nivo('2')).toHaveAttribute('aria-label', 'Nivo 2 od 3 (srednji), 1 varijanta');
    await expect(nivo('svi')).toHaveAttribute('aria-label', 'Svi nivoi, 1 varijanta');

    await nivo('3').click();
    await expect.poll(() => poslednjiZadatak(mock)).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: null, nivo: 3 });
    await expect(nivo('3')).toHaveAttribute('aria-checked', 'true');
    await expect(forma(page)).toContainText('Aktivnih varijanti: 0');
    await expect(upozorenja(page)).toContainText('Nema aktivnih varijanti nivoa ★★★; odobri nacrte ili izaberi drugi nivo.');

    await nivo('2').click();
    await expect.poll(() => poslednjiZadatak(mock)?.nivo).toBe(2);
    await expect(forma(page)).toContainText('Aktivnih varijanti: 1');
    await nivo('svi').click();
    await expect.poll(() => poslednjiZadatak(mock)).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: null, nivo: null });
  });

  test('"Promeni grupu…" na isključenu grupu bez aktivnih: upozorenja servera i veza "Otvori u banci" na čvor', async ({ page, mock }) => {
    await otvoriZadatak(page);
    await page.getByRole('button', { name: 'Promeni grupu…' }).click();
    const d = dijalog(page);
    // trenutna grupa slajda je izabrana unapred
    await expect(d.getByRole('radio', { name: /^2 → 10/ })).toBeChecked();
    await izaberiCvor(d, /^Razlomljeni brojevi \(demo\)/);
    // do odgovora servera forma pokazuje izabran čvor
    await expect(forma(page).locator('[data-putanja]')).toContainText('Razlomljeni brojevi (demo)');

    await expect.poll(() => poslednjiZadatak(mock)).toEqual({ grupaId: 5, vremeSekunde: 120, brojVarijanti: null, nivo: null });
    await expect(upozorenja(page).locator('p')).toHaveText([
      'Tema je isključena.', 'Grupa nema aktivnih varijanti; odobri nacrte u banci pre časa.',
    ]);
    await expect(forma(page).locator('[data-putanja]')).toHaveText('Konverzije brojeva › Razlomljeni brojevi (demo)');
    await expect(forma(page)).toContainText('Aktivnih varijanti: 0');
    await expect(izabranaStavka(page)).toContainText('Zadatak: Razlomljeni brojevi (demo)');
    const veza = page.getByRole('link', { name: 'Otvori u banci' });
    await expect(veza).toHaveAttribute('href', '/banka?predmet=1&namena=PREDAVANJE&grupa=5');
    await veza.click();
    await expect(page).toHaveURL(/\/banka\?predmet=1&namena=PREDAVANJE&grupa=5$/);
    await expect(page.getByRole('heading', { name: 'Banka zadataka' })).toBeVisible();
  });

  test('unutrašnji čvor: aktivne u podgrupama, isključena podgrupa se ne izvlači (upozorenje), bez polja lista', async ({ page, mock }) => {
    await otvoriZadatak(page);
    await page.getByRole('button', { name: 'Promeni grupu…' }).click();
    await izaberiCvor(dijalog(page), /^Konverzije brojeva/);
    await expect.poll(() => poslednjiZadatak(mock)?.grupaId).toBe(1);
    await expect(upozorenja(page).locator('p')).toHaveText(['Isključene podgrupe se ne izvlače: Razlomljeni brojevi (demo).']);
    await expect(forma(page)).toContainText('Aktivnih varijanti u podgrupama: 3');
    await expect(forma(page)).not.toContainText('Polja odgovora');
    await expect(forma(page).locator('[data-putanja]')).toHaveText('Konverzije brojeva');
    await expect(page.getByRole('link', { name: 'Otvori u banci' })).toHaveCount(0);
  });
});
