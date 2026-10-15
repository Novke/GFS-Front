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

/*
 * F2 fix 4 (re-recenzija 3, Critical 1): širina markupa MathLive-a nije linearna u k, pa je ranije pravilo osciliralo
 * (~60 upisa stila u sekundi, konzola na 1366 i 1920 px, publika 900-1104 px). Sada se k računa samo na promenu ulaza
 * (širina bloka, veličina fonta, fontovi), uz najviše dve korekcije nadole: posle promene veličine prozora i kratkog
 * smirivanja, 1 s mirovanja ne sme imati nijedan upis stila formule. Pločice i rezultati, više formula odjednom
 * (proba recenzenta, `gfs-tmp/f2-rereview/proba-oscilacija.spec.ts`).
 */
test.describe('uživo: smanjivanje formule se smiruje (bez oscilacije k)', () => {
  const OPCIJE = ['$\\sqrt{x^2+y^2}+\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}$', '$1011_2+0110_2=10001_2$',
    '$x_1^2+x_2^2+x_3^2+x_4^2+x_5^2+x_6^2$', '$\\frac{a_1+a_2+a_3}{b_1+b_2}=x_1+x_2+x_3+x_4$'];
  /** Širine na kojima je fix 3 oscilovao (publika 900-1104, konzola i 1366/1920), plus par između. */
  const SIRINE = [900, 936, 972, 1008, 1044, 1080, 1104, 1200, 1366, 1440, 1500, 1920];

  for (const stranica of ['publika', 'konzola'] as const) {
    test(`${stranica}: posle promene veličine 0 upisa stila za 1 s mirovanja (pločice i rezultati)`, async ({ page, mock }) => {
      test.setTimeout(120_000);
      mock.izvodjenje.izmeniSlajd(2, {
        pitanje: {
          id: 51, tip: 'JEDAN_TACAN', tekst: 'Koja je tačna? $\\frac{1}{2}+\\frac{1}{3}$', slika: null, vremeSekunde: null,
          opcije: OPCIJE.map((t, i) => ({ id: i + 1, rb: i + 1, tekst: t, tacna: i === 1 })),
          brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
          prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
        },
      });
      for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3) -> slajd 2 (3) -> slajd 3
      mock.izvodjenje.primeni('OTVORI_ZATVORI');
      const oscilacije: string[] = [];
      for (const rezultati of [false, true]) {
        if (rezultati) mock.izvodjenje.primeni('REZULTATI');
        await nastavnickiBroker(page, mock);
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(`izvodjenja/7/${stranica}`);
        const okvir = rezultati ? '.uz-rez-opcija' : '.uz-plocica';
        await expect(page.locator(`${okvir} .uz-formula--spremna .ML__latex`).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await page.evaluate(() => {
          const w = window as unknown as { upisa: number };
          w.upisa = 0;
          new MutationObserver((l) => {
            for (const z of l) if ((z.target as Element).classList.contains('uz-formula--spremna')) w.upisa++;
          }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
        });
        const upisa = () => page.evaluate(() => (window as unknown as { upisa: number }).upisa);
        for (const sirina of SIRINE) {
          await page.setViewportSize({ width: sirina, height: Math.round((sirina * 9) / 16) });
          // smirivanje: nov ulaz (jedan proračun) i najviše dve korekcije stižu u par kadrova
          await page.waitForTimeout(300);
          const pre = await upisa();
          await page.waitForTimeout(1000); // mirovanje: meri se broj upisa, ne čeka se uslov
          const razlika = (await upisa()) - pre;
          if (razlika !== 0) oscilacije.push(`${rezultati ? 'rezultati' : 'pločice'} @${sirina}px: ${razlika}`);
        }
        // pri tome smanjivanje i dalje radi: nijedna formula nema traku za skrol
        const trake = await page.locator('.uz-formula--spremna').evaluateAll(f =>
          f.filter(e => (e as HTMLElement).offsetHeight - e.clientHeight !== 0).length);
        expect(trake, 'formule sa trakom za skrol').toBe(0);
      }
      expect(oscilacije, 'upisi stila formule tokom 1 s mirovanja').toEqual([]);
    });
  }
});

/*
 * Talas ispravki 5a (završna recenzija B, Important 1): kad nastavnik prikaže tačan odgovor dok su rezultati (ili pločice) na
 * ekranu, uz formulu tačne opcije uživo stiže značka "✓ tačno". Formula je ranije delila blok sa značkom, pa se pomerala
 * udesno bez ponovnog merenja (širina bloka ista, nijedan signal promenjen) i ostajala odsečena (7-188 px). Sada blok formule
 * ima sopstvenu širinu: značka ga sužava, `ResizeObserver` to vidi i k se računa iznova (pravilo fix-a 4). Proba recenzenta:
 * `gfs-tmp/final-5a-B/repo/e2e/proba-b.spec.ts` (B1, B2).
 */
test.describe('uživo: tačan odgovor stiže uživo, formula ostaje cela (rezultati i pločice)', () => {
  /** Malo šira od ćelije rezultata, pa pri prvom crtanju dobija k ~0,65-0,70 i staje (proba recenzenta B1). */
  const OPCIJE_REZ = [
    '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6}{b_1+b_2+b_3}=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9+x_{10}+x_{11}+x_{12}+x_{13}+x_{14}$',
    'Brzina je $v=\\frac{s}{t}$ izražena u metrima po sekundi kada je kretanje ravnomerno',
    '$1011_2+0110_2=10001_2$',
    'Vat',
  ];
  /**
   * Pločica je uža od ćelije rezultata, a značka pločice šira (~30 % pločice): ova staje i pre i posle značke (k ~0,8 pa
   * ~0,6); šira bi posle značke pala na 0,5 i bila odsečena po pravilu, nezavisno od ove ispravke.
   */
  const OPCIJE_PLOC = [
    '$\\frac{a_1+a_2+a_3}{b_1+b_2}=x_1+x_2+x_3$',
    'Brzina je $v=\\frac{s}{t}$',
    '$1011_2+0110_2=10001_2$',
    'Vat',
  ];
  /** Tačne su prva i treća (mok ne proverava tip; ispituje se samo raspored). */
  const TACNE = [0, 2];

  /** Svaka nacrtana formula prema svojoj ćeliji (`.uz-rez-opcija-tekst` ili pločica): preliv levo/desno i preliv skrola. */
  const mere = (page: import('@playwright/test').Page, celija: string) => page.evaluate((sel) =>
    [...document.querySelectorAll<HTMLElement>(`.uz-slajd ${sel} .uz-formula--spremna`)].map(f => {
      const c = f.closest(sel)!.getBoundingClientRect();
      const ml = f.querySelector('.ML__latex')!.getBoundingClientRect();
      return {
        latex: (f.getAttribute('aria-label') ?? '').slice(0, 14),
        k: Number(getComputedStyle(f).getPropertyValue('--uz-formula-k') || 1),
        desno: Math.round((ml.right - c.right) * 10) / 10,
        levo: Math.round((c.left - ml.left) * 10) / 10,
        skrol: f.scrollWidth - f.clientWidth,
      };
    }), celija);

  const brojiUpise = (page: import('@playwright/test').Page) => page.evaluate(() => {
    const w = window as unknown as { upisa: number };
    w.upisa = 0;
    new MutationObserver((l) => {
      for (const z of l) if ((z.target as Element).classList.contains('uz-formula--spremna')) w.upisa++;
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  const upisa = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { upisa: number }).upisa);

  for (const prikaz of ['rezultati', 'pločice'] as const) {
    for (const stranica of ['publika', 'konzola'] as const) {
      for (const sirina of [1366, 1920]) {
        test(`${prikaz}, ${stranica} ${sirina}: posle TACAN uživo svaka formula cela u ćeliji, 0 upisa u mirovanju`, async ({ page, mock }) => {
          const opcije = prikaz === 'rezultati' ? OPCIJE_REZ : OPCIJE_PLOC;
          mock.izvodjenje.izmeniSlajd(2, {
            pitanje: {
              id: 51, tip: 'JEDAN_TACAN', tekst: 'Koja je tačna? $\\frac{1}{2}+\\frac{1}{3}$', slika: null, vremeSekunde: null,
              opcije: opcije.map((t, i) => ({ id: i + 1, rb: i + 1, tekst: t, tacna: TACNE.includes(i) })),
              brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
              prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
            },
          });
          for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3) -> slajd 2 (3) -> slajd 3
          mock.izvodjenje.primeni('OTVORI_ZATVORI');
          mock.izvodjenje.primeni('OTVORI_ZATVORI');
          if (prikaz === 'rezultati') mock.izvodjenje.primeni('REZULTATI');
          const broker = await nastavnickiBroker(page, mock);
          await page.setViewportSize({ width: sirina, height: Math.round((sirina * 9) / 16) });
          await page.goto(`izvodjenja/7/${stranica}`);
          const celija = prikaz === 'rezultati' ? '.uz-rez-opcija-tekst' : '.uz-plocica-tekst';
          const okvir = prikaz === 'rezultati' ? '.uz-rez-opcija' : '.uz-plocica';
          await expect(page.locator(`.uz-slajd ${okvir} .uz-formula--spremna .ML__latex`)).toHaveCount(3);
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await expect(page.locator('.uz-slajd .uz-tacno-znak, .uz-slajd .uz-plocica-tacno')).toHaveCount(0);
          const pre = await mere(page, celija);
          test.info().annotations.push({ type: 'k pre', description: JSON.stringify(pre) });
          for (const f of pre) expect(f.desno, `${f.latex} (k=${f.k}): pre TACAN, preliv desno`).toBeLessThanOrEqual(0.5);

          // tačan odgovor uživo (broker, bez ponovnog učitavanja)
          broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.primeni('TACAN').telo);
          const znak = prikaz === 'rezultati' ? '.uz-slajd .uz-tacno-znak' : '.uz-slajd .uz-plocica-tacno';
          await expect(page.locator(znak)).toHaveCount(TACNE.length);
          // smirivanje (nov ulaz, najviše dve korekcije), pa 1 s mirovanja bez upisa
          await page.waitForTimeout(300);
          await brojiUpise(page);
          await page.waitForTimeout(1000); // mirovanje: meri se broj upisa, ne čeka se uslov
          expect(await upisa(page), 'upisi stila formule tokom 1 s mirovanja').toBe(0);

          const m = await mere(page, celija);
          test.info().annotations.push({ type: 'k posle', description: JSON.stringify(m) });
          expect(m.length, 'formule u opcijama (četvrta je bez formule)').toBe(3);
          for (const f of m) {
            expect(f.desno, `${f.latex} (k=${f.k}): preliv desno van ćelije`).toBeLessThanOrEqual(0.5);
            expect(f.levo, `${f.latex} (k=${f.k}): preliv levo van ćelije`).toBeLessThanOrEqual(0.5);
            expect(f.skrol, `${f.latex}: formula nije skrol kontejner`).toBeLessThanOrEqual(1);
            expect(f.k, `${f.latex}: najmanje 0,5`).toBeGreaterThanOrEqual(0.5);
          }
        });
      }
    }
  }

  // tajmer se pojavi pored teksta pitanja kad se pitanje sa vremenom otvori uživo: tekst pitanja (`flex: 1`) se suzi
  for (const stranica of ['publika', 'konzola'] as const) {
    test(`tekst pitanja, ${stranica} 1366: tajmer stigne uživo (OTVORI), formula ostaje cela, 0 upisa u mirovanju`, async ({ page, mock }) => {
      mock.izvodjenje.izmeniSlajd(2, {
        pitanje: {
          id: 51, tip: 'JEDAN_TACAN', tekst: `Izračunaj ${OPCIJE_REZ[0]} ako je $x_1=1$.`, slika: null, vremeSekunde: 60,
          opcije: [{ id: 1, rb: 1, tekst: 'Da', tacna: true }, { id: 2, rb: 2, tekst: 'Ne', tacna: false }],
          brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
          prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
        },
      });
      for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI');
      const broker = await nastavnickiBroker(page, mock);
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(`izvodjenja/7/${stranica}`);
      await expect(page.locator('.uz-slajd .uz-pitanje-tekst .uz-formula--spremna .ML__latex')).toHaveCount(2);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(page.locator('.uz-slajd .uz-slajd-tajmer')).toHaveCount(0);
      // mok otvara rundu bez roka; rok od 60 s kao server za pitanje sa `vremeSekunde`
      const telo = mock.izvodjenje.primeni('OTVORI_ZATVORI').telo as { runda: { rokMs: number | null; preostaloMs: number | null; tajmerRadi: boolean } };
      Object.assign(telo.runda, { rokMs: Date.now() + 60_000, preostaloMs: 60_000, tajmerRadi: true });
      broker.posalji('/topic/izvodjenja/7/nastavnik', telo);
      await expect(page.locator('.uz-slajd .uz-slajd-tajmer').first()).toBeVisible();
      await page.waitForTimeout(300);
      await brojiUpise(page);
      await page.waitForTimeout(1000); // mirovanje: meri se broj upisa, ne čeka se uslov
      expect(await upisa(page), 'upisi stila formule tokom 1 s mirovanja').toBe(0);
      const m = await mere(page, '.uz-pitanje-tekst');
      test.info().annotations.push({ type: 'k posle', description: JSON.stringify(m) });
      expect(m.length).toBe(2);
      for (const f of m) {
        expect(f.desno, `${f.latex} (k=${f.k}): preliv desno van teksta pitanja`).toBeLessThanOrEqual(0.5);
        expect(f.k, `${f.latex}: najmanje 0,5`).toBeGreaterThanOrEqual(0.5);
      }
      expect(m.some(f => f.k < 1), 'široka formula je smanjena').toBe(true);
    });
  }
});
