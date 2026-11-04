import { expect, test } from './fixture';
import { lazniBroker } from './lazni-stomp';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Ime učesnika mora da bude čitljivo: u konzoli ("Ovo pitanje" na Zadatak slajdu, dok niko nije predao) i u rangu na projektoru
 * (dve kolone). Pre popravke je ime dobijalo ~30 px, odnosno 0 px, pa se videlo samo prvo slovo.
 */
const IMENA = ['Aleksandra Petrović', 'Bojan Nikolić-Stanković', 'Milica Jovanović', 'Stefan Đorđević', 'Jelena Marković', 'Nemanja Vasiljević'];

test('konzola, "Ovo pitanje" u Zadatak rundi: ime nije stisnuto i ne lomi se slovo po slovo', async ({ page, mock }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mock.izvodjenje as any).f.ucesnici = IMENA.map((ime, i) => ({ id: i + 1, ime, poeni: 0, povezan: true, odgovorio: false }));
  expect(mock.izvodjenje.primeni('IDI_NA', 5).status).toBe(200);
  await nastavnickiBroker(page, mock);
  await page.goto('izvodjenja/7/konzola');
  await expect(page.locator('.uz-kon-veza')).toHaveText('Povezano');
  await page.keyboard.press('o');

  const kartica = page.getByRole('region', { name: 'Učesnici i rang' });
  const redovi = kartica.getByRole('listitem');
  await expect(redovi.first()).toContainText('nije odgovorio');
  for (const sirina of [1280, 1024, 800]) {
    await page.setViewportSize({ width: sirina, height: 800 });
    const imena = kartica.locator('.uz-kon-ucesnik-ime');
    for (let i = 0; i < IMENA.length; i++) {
      const okvir = (await imena.nth(i).boundingBox())!;
      expect(okvir.width, `${IMENA[i]} na ${sirina} px`).toBeGreaterThan(140);
      // dve reči u najviše dva reda (slovo po slovo bi bilo desetak redova)
      expect(okvir.height, `${IMENA[i]} na ${sirina} px`).toBeLessThan(60);
    }
  }
});

for (const n of [4, 12, 24, 30]) {
  test(`projektor, rang sa ${n} redova: ime je vidljivo celo`, async ({ page, mock }) => {
    const stavke = Array.from({ length: n }, (_, i) => ({
      mesto: i + 1, ime: IMENA[i % IMENA.length].replace(/(\S+) (\S).*/, '$1 $2.'), tacnih: 5 - (i % 3), dugovanih: 6, procenat: 80 - i,
      prosekMs: 4200 + i * 100, zvezdice: 9 - (i % 5),
    }));
    const snimak = { ...(mock.izvodjenje.stanje() as unknown as Record<string, unknown>), rangListaPrikazana: true, rangPrikaz: 'PREDAVANJE', javniRangTacnosti: stavke };
    await lazniBroker(page, 'api/ws', o => (o === '/app/izvodjenja/7/nastavnik-pocetno' ? snimak : undefined));
    await page.goto('izvodjenja/7/publika');
    await expect(page.locator('app-rang-tacnosti-projektor')).toBeVisible();

    const imena = page.locator('.uz-rt-red .uz-rang-ime');
    await expect(imena).toHaveCount(n);
    for (let i = 0; i < n; i++) {
      const ime = imena.nth(i);
      // ime se ne odseca elipsom (scrollWidth <= clientWidth) i ima prostora
      const mere = await ime.evaluate(e => ({ scroll: e.scrollWidth, klijent: e.clientWidth }));
      expect(mere.klijent, `red ${i + 1}`).toBeGreaterThan(60);
      expect(mere.scroll, `red ${i + 1}`).toBeLessThanOrEqual(mere.klijent);
    }
    // nijedan red ne štrči iz svoje kolone (poslednja kolona sa ★ ostaje unutra)
    const prelivanje = await page.locator('.uz-rt-kolona').evaluateAll(ks => ks.filter(k => k.scrollWidth > k.clientWidth + 1).length);
    expect(prelivanje).toBe(0);
  });
}
