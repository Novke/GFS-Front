import { expect, test } from './fixture';

/** Zahtevi koji menjaju aktivnost studenta na predavanju 1, redom slanja. */
const IZMENA_AKTIVNOSTI = /^predavanja\/1\/(prisustvo|zadatak|zvezdica)(\/\d+)?$/;

test.describe('predavanje uživo', () => {
  test('brzi klikovi na pločicu: zahtevi redom, kasni odgovor ne gazi poslednji klik, "Poništi" vraća (Review Focus 3)', async ({ page, mock }) => {
    await page.goto('predavanja/1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Predavanje 3 · Petlje i nizovi');
    const plocica = page.locator('app-studentska-plocica[data-student="1"]');
    const klik = () => plocica.locator('button.glavno').click();
    await expect(plocica).toHaveAttribute('data-stanje', 'odsutan');

    // prvi odgovor (prisustvo) kasni dok korisnik ne klikne još dvaput
    const prisustvo = mock.zadrzi('PATCH', 'predavanja/:id/prisustvo');
    await klik();
    const prvi = await prisustvo.stigao;
    expect(prvi.telo).toEqual({ id: 1 });
    await klik();
    await klik();
    // optimistično: prikazuje se poslednji klik, pločica čeka server
    await expect(plocica).toHaveAttribute('data-stanje', 'zvezdica');
    await expect(plocica).toHaveClass(/\bceka\b/);
    // dok prvi zahtev čeka, drugi se ne šalje (jedan zahtev po studentu). Granica bez spavanja: zahtev poslat posle
    // klikova stiže do moka posle svega što je aplikacija poslala tokom klikova
    expect(await page.evaluate(() => fetch('api/predmeti').then(r => r.status))).toBe(200);
    expect(mock.zahteviZa(IZMENA_AKTIVNOSTI).map(z => `${z.metod} ${z.putanja}`)).toEqual(['PATCH predavanja/1/prisustvo']);

    // sad stiže zakasneli odgovor (PRISUSTVO); sledeći korak (zvezdica) zadržavamo da se vidi prikaz između njih
    const zvezdica = mock.zadrzi('PATCH', 'predavanja/:id/zvezdica');
    prisustvo.pusti();
    await zvezdica.stigao;
    await expect(plocica).toHaveAttribute('data-stanje', 'zvezdica');
    zvezdica.pusti();

    // srednji klik (zadatak) je nadjačan: dva zahteva, redom, bez zadatka između
    await expect(page.getByText('Ana Primerović: zvezdica')).toBeVisible();
    await expect(plocica).toHaveAttribute('data-stanje', 'zvezdica');
    await expect(plocica).not.toHaveClass(/\bceka\b/);
    expect(mock.zahteviZa(IZMENA_AKTIVNOSTI).map(z => `${z.metod} ${z.putanja}`)).toEqual([
      'PATCH predavanja/1/prisustvo',
      'PATCH predavanja/1/zvezdica',
    ]);
    expect(mock.podaci.predavanja[0].aktivnosti.find(a => a.studentId === 1)?.tip).toBe('SA_ZVEZDICOM');

    // "Poništi" vraća stanje pre poslednjeg klika
    await page.getByRole('button', { name: 'Poništi' }).click();
    await expect(plocica).toHaveAttribute('data-stanje', 'zadatak');
    await expect(plocica).not.toHaveClass(/\bceka\b/);
    await expect.poll(() => mock.podaci.predavanja[0].aktivnosti.find(a => a.studentId === 1)?.tip).toBe('ZADATAK');
    expect(mock.zahteviZa(IZMENA_AKTIVNOSTI).map(z => `${z.metod} ${z.putanja}`).at(-1)).toBe('PATCH predavanja/1/zadatak');
  });

  test('greška servera vraća pločicu na potvrđeno stanje i javlja grešku', async ({ page, mock }) => {
    mock.na('PATCH', 'predavanja/:id/prisustvo', () => ({ status: 500, telo: { reason: 'Sistemska greška.', time: '' } }));
    await page.goto('predavanja/1');
    const plocica = page.locator('app-studentska-plocica[data-student="4"]');
    await plocica.locator('button.glavno').click();

    await expect(page.getByText('Goran Probić: Sistemska greška.')).toBeVisible();
    await expect(plocica).toHaveAttribute('data-stanje', 'odsutan');
    await expect(plocica).not.toHaveClass(/\bceka\b/);
  });
});
