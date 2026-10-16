import type { Page } from '@playwright/test';
import { expect, test } from './javna-mreza';
import { lazniBroker } from './lazni-stomp';

// ceo fajl: jedan radnik sa klasičnim trakama za skrol (`launchOptions` je opcija radnika, pa ne može u `describe`)
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

/*
 * F2 fix 3 (re-recenzija F2 2, I1): studentska stranica u pregledaču sa klasičnim trakama (laptop studenta, prozor od
 * 360 px; telefon ima overlay trake, koje Playwright bez `--hide-scrollbars` ne bi pokazao). Na javnoj ruti formula se ne
 * smanjuje (nema `MERA_FORMULE`): kratka formula (`$13$`, MathLive crta ~2 px van svoje kutije) nema traku, široka se
 * skroluje samo u sebi, dokument nema horizontalni preliv.
 */
const KOD = '123456';
const IZVODJENJE = 7;
const DUGA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9}{b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9}=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8$';
const KRATKA = '$13$';

const snimak = (ime: string, tacan: boolean) => ({
  javno: {
    izvodjenjeId: IZVODJENJE, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
    kod: KOD, prikaz: 'SLAJD', slajdTip: 'PITANJE', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'PITANJE',
    detaljiDozvoljeni: false, brojUcesnika: 1, rezultat: null, rangLista: null,
    pitanje: {
      tip: 'JEDAN_TACAN', faza: tacan ? 'ZATVORENO' : 'OTVORENO', rundaId: 31, brojOpcija: 2,
      opcije: [{ id: 1, tekst: DUGA }, { id: 2, tekst: KRATKA }],
      tekst: `Izračunaj ${DUGA} ako je ${KRATKA}.`, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null,
      rokMs: null, preostaloMs: null, tacneOpcije: tacan ? [2] : null, tacanBroj: null, prihvatljiviOdgovori: null,
    },
  },
  licno: { verzija: 1, ucesnikId: 10_000, ime, poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
});

/** Mere svake nacrtane formule: traka (visina i širina), preliv sadržaja, koeficijent i da li je u ekranu. */
const mere = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('.uz-formula--spremna')].map((f) => {
    const r = f.getBoundingClientRect();
    return {
      // formula u dugmetu opcije nema ime (dugme ga daje kroz `tekstZaCitac`): tada vidljivi tekst markupa (`13`)
      latex: f.getAttribute('aria-label') ?? (f.textContent ?? '').replace(/[\s\u200b-\u200d\u2060\ufeff]/g, ''),
      traka: f.offsetHeight - f.clientHeight,
      preliv: f.scrollWidth - f.clientWidth,
      k: getComputedStyle(f).getPropertyValue('--uz-formula-k'),
      uEkranu: r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5,
    };
  }));

test.describe('javni uživo: formule sa klasičnim trakama (360 px, laptop studenta)', () => {
  test.use({
    viewport: { width: 360, height: 740 }, formule: true,
    dozvoljeniApi: /^(GET \/api\/public\/uzivo\/\d{6}(\/ja)?|POST \/api\/public\/uzivo\/\d{6}\/prijava)$/,
  });

  for (const ekran of ['unos', 'tacan'] as const) {
    test(`ekran "${ekran}": kratka formula bez trake, široka se skroluje u sebi, bez smanjivanja`, async ({ page }) => {
      let ime = '';
      await lazniBroker(page, 'api/public/ws', o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? snimak(ime, ekran === 'tacan') : undefined));
      await page.goto(`uzivo/${KOD}`);
      ime = 'Mina';
      await page.getByLabel('Tvoje ime').fill(ime);
      const udji = page.getByRole('button', { name: 'Uđi' });
      await expect(udji).toBeEnabled();
      await udji.click();
      // unos: tekst (duga + kratka) i dve opcije; tačan odgovor: samo opcija sa kratkom formulom
      await expect(page.locator('.uz-formula--spremna .ML__latex')).toHaveCount(ekran === 'unos' ? 4 : 1);
      await page.waitForLoadState('networkidle');

      const m = await mere(page);
      for (const f of m) {
        expect(f.k, `${f.latex}: telefon se ne smanjuje`).toBe('');
        expect(f.uEkranu, `${f.latex}: u ekranu`).toBe(true);
      }
      const kratke = m.filter(f => f.latex === '13');
      expect(kratke.length).toBe(ekran === 'unos' ? 2 : 1);
      for (const f of kratke) {
        expect(f.traka, 'kratka formula: traka za skrol (px)').toBe(0);
        expect(f.preliv, 'kratka formula: scrollWidth - clientWidth').toBeLessThanOrEqual(0);
      }
      for (const f of m.filter(x => x.latex !== '13')) {
        expect(f.preliv, 'široka formula se skroluje u sebi').toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        'horizontalni preliv dokumenta (px)').toBe(0);
    });
  }
});
