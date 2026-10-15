import { expect, test } from './fixture';
import { nastavnickiBroker } from './uzivo-nastavnik';

// ceo fajl: jedan radnik sa klasičnim trakama za skrol (`launchOptions` je opcija radnika, pa ne može u `describe`)
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

/*
 * F2 fix 2 (re-recenzija F2, Important 1 i 2): na projektoru i u konzoli formula nije skrol kontejner i nikad nema traku;
 * šira od svog okvira se smanjuje (`--uz-formula-k`) da stane cela. Bez `--hide-scrollbars` (Playwright ga podrazumevano
 * dodaje, pa traka u ostalim testovima ne postoji): klasične trake kao Chrome na desktopu, pa bi i traka od 15 px na kratkoj
 * formuli (prepust MathLive-a ~2 px) promenila `offsetHeight - clientHeight`.
 */
test.describe('uživo: formule u tekstu pitanja na projektoru i konzoli (klasične trake)', () => {
  const DUGA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}}{b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9+b_{10}}'
    + '=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9+x_{10}+y_1+y_2+y_3+y_4+y_5+y_6$';
  /** Srednja formula za pločicu: šira od pločice, ali staje sa k >= 0,5 (najduža iznad bi se na 0,5 odsekla, po pravilu). */
  const SREDNJA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6}{b_1+b_2+b_3+b_4+b_5+b_6}=x_1+x_2+x_3+x_4+x_5+x_6+x_7$';
  /** Kratke formule koje MathLive crta ~2 px van svoje kutije (gornji indeks, kraj korena). */
  const KRATKE = ['$x_1^2+y_{ij}$', '$\\sqrt{\\frac12}$'];

  for (const stranica of ['publika', 'konzola'] as const) {
    test(`${stranica}: nijedna formula nema traku za skrol; široka je smanjena, kratka nije`, async ({ page, mock }) => {
      mock.izvodjenje.izmeniSlajd(2, {
        pitanje: {
          id: 51, tip: 'JEDAN_TACAN', tekst: `Izračunaj ${DUGA} ako je ${KRATKE[1]} dato.`, slika: null, vremeSekunde: null,
          opcije: [
            { id: 1, rb: 1, tekst: SREDNJA, tacna: false },
            { id: 2, rb: 2, tekst: KRATKE[0], tacna: true },
            { id: 3, rb: 3, tekst: 'Vat', tacna: false },
          ],
          brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
          prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
        },
      });
      for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3) -> slajd 2 (3) -> slajd 3
      await nastavnickiBroker(page, mock);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`izvodjenja/7/${stranica}`);

      const tekst = page.locator('.uz-pitanje-tekst').first();
      await expect(tekst.locator('.uz-formula--spremna .ML__latex')).toHaveCount(2);
      await expect(page.locator('.uz-plocica').first().locator('.uz-formula--spremna .ML__latex')).toHaveCount(1);
      // tekst pitanja i tekst opcije (pločica) kroz `app-tekst-formule` (5a): klase domaćina iz šablona slajda i pločica
      await expect(page.locator('.uz-pitanje-tekst .ML__latex').first()).toBeVisible();
      await expect(page.locator('.uz-plocica-tekst .ML__latex').first()).toBeVisible();
      // merenje posle crtanja: široka formula dobija koeficijent manji od 1
      await expect.poll(() => tekst.locator('.uz-formula--spremna').first()
        .evaluate(f => Number(getComputedStyle(f).getPropertyValue('--uz-formula-k') || 1))).toBeLessThan(1);
      await page.waitForLoadState('networkidle');

      const mere = await page.evaluate(() => {
        const prvi = document.querySelector('.uz-pitanje-tekst')!.closest('.uz-slajd')!;
        return [...prvi.querySelectorAll<HTMLElement>('.uz-formula--spremna')].map(f => {
          const okvir = f.closest('.uz-plocica, .uz-pitanje-tekst')!.getBoundingClientRect();
          const ml = f.querySelector('.ML__latex')!.getBoundingClientRect();
          return {
            latex: f.getAttribute('aria-label')!.slice(0, 12),
            k: Number(getComputedStyle(f).getPropertyValue('--uz-formula-k') || 1),
            traka: [f.offsetHeight - f.clientHeight, f.offsetWidth - f.clientWidth],
            preliv: f.scrollWidth - f.clientWidth,
            celaVidljiva: ml.left >= okvir.left - 0.5 && ml.right <= okvir.right + 0.5,
          };
        });
      });
      expect(mere.length, 'formule na slajdu: dve u tekstu, dve u pločicama').toBe(4);
      for (const m of mere) {
        expect(m.traka, `${m.latex}: traka za skrol`).toEqual([0, 0]);
        // formula nije skrol kontejner; 1 px je zaokruživanje podpiksela pri k < 1 (umanjen prikaz konzole)
        expect(m.preliv, `${m.latex}: scrollWidth - clientWidth`).toBeLessThanOrEqual(1);
        expect(m.k, `${m.latex}: najmanje 0,5`).toBeGreaterThanOrEqual(0.5);
        // projektor: široka formula je smanjena tako da je cela vidljiva (konzola je umanjena, pa tu sme da dođe do 0,5)
        if (stranica === 'publika') expect(m.celaVidljiva, `${m.latex}: cela u okviru`).toBe(true);
      }
      const k = (pocetak: string) => mere.filter(m => m.latex.startsWith(pocetak)).map(m => m.k);
      // tekst pitanja (DUGA) i pločica (SREDNJA) počinju istim \frac
      expect(k('\\frac{a_1+a_').every(x => x < 1), 'široke formule su smanjene').toBe(true);
      expect(k('\\sqrt{\\frac1'), 'kratka u tekstu').toEqual([1]);
      expect(k('x_1^2+y_{ij}'), 'kratka u pločici').toEqual([1]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }
});
