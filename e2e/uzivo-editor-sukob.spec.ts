import { expect, test } from './fixture';

/*
 * Klod izmeni slajd dok je editor otvoren (mok API): verzija u `PUT slajdovi/<id>` više nije ona sa servera, pa server odbije izmenu
 * (409), bez ponavljanja. Traka nudi "Učitaj ponovo", a posle čitanja forma pokazuje Klodov sadržaj i izmene nose novu verziju.
 * Prezentacija 5 iz `fixtures/prezentacije.json` (izmišljeno): 51 = INFO "Uvod", izabran pri učitavanju.
 */
const PREZENTACIJA = 5;
const SLAJD = 51;

test.describe('uživo: editor, Klod izmeni otvoren slajd', () => {
  test('409 ostaje u traci bez ponavljanja, Učitaj ponovo donosi Klodov sadržaj i novu verziju', async ({ page, mock }) => {
    // uvek iz `podaci`: mok pri PUT-u zamenjuje objekat slajda
    const slajd = () => mock.podaci.prezentacije.find(p => p.id === PREZENTACIJA)!.slajdovi.find(s => s.id === SLAJD)!;
    slajd().verzija = 3;
    const putovi = () => mock.zahteviZa(`slajdovi/${SLAJD}`, 'PUT');
    const naslov = page.getByRole('textbox', { name: 'Naslov', exact: true });
    const traka = page.locator('[data-sukob]');

    await page.goto(`prezentacije/${PREZENTACIJA}`);
    await expect(naslov).toHaveValue('Uvod');
    slajd().verzija = 4;
    slajd().naslov = 'Klodov naslov';

    await naslov.fill('Moj naslov');
    await expect(traka).toContainText('Klod je izmenio slajd 1 dok je bio otvoren.');
    await expect(page.locator('.uz-ed-status')).toContainText('Nije sačuvano');
    expect(putovi()).toHaveLength(1);
    expect(putovi()[0].telo).toMatchObject({ naslov: 'Moj naslov', verzija: 3 });

    // i dalje kucanje u slajdu u sukobu ne šalje ništa
    await naslov.fill('Moj naslov 2');
    await page.waitForTimeout(1000);
    expect(putovi()).toHaveLength(1);

    await page.locator('[data-ucitaj-ponovo]').click();
    await expect(traka).toHaveCount(0);
    await expect(naslov).toHaveValue('Klodov naslov');

    await naslov.fill('Klodov naslov i moje');
    await expect.poll(() => putovi().length).toBe(2);
    expect(putovi()[1].telo).toMatchObject({ naslov: 'Klodov naslov i moje', verzija: 4 });
    await expect(page.locator('.uz-ed-status')).toContainText('Sačuvano');
    await expect(traka).toHaveCount(0);
    expect(slajd()).toMatchObject({ naslov: 'Klodov naslov i moje', verzija: 4 });
  });
});
