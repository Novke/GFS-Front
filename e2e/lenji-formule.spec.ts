import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: meri pravi produkcioni build (odluka 25 plana faze 5), pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import {
  dinamickiUvozi, fajlSa, jsFajlovi, skripteIndeksa, sopstvenoZatvorenje, statickiUvozi, tekst, zatvorenje, zbir, zbirGzip,
} from './chunkovi';
import {
  NIZ_MATHLIVE, NIZ_MATHLIVE_CEO, NIZ_STUDENTA, NIZ_ZADATKA_STUDENTA, NIZOVI_CRTEZA, nizoviEditora,
} from './nizovi-editora';

/**
 * Studentska stranica (`javno/uzivo-student.page`, statičko zatvorenje bez početnog bundle-a). Osnova je izmerena
 * 2026-10-14 nad buildom 3aebfb8 (vrh 4b, pre 5a; skripta F1 Step 0); faza 5a sme da doda najviše 8 000 B (odluka 25:
 * `app-tekst-formule`, parser `$...$` i lakši učitavač stila). Izmereno 113 568 B posle F2 fix 3 (telefon bez
 * `mera-formule`), 114 515 B posle talasa ispravki završne recenzije (2026-10-15: tab stop široke formule, maska formula za
 * naglašavanje, stil koji ne pamti grešku, jedno upozorenje po prozoru) i 114 615 B posle kruga 2 (tabindex -1 u dugmetu,
 * granica dužine teksta sa formulama).
 *
 * Zadatak slajd na telefonu (projekat B, FE-5) dodaje statički samo stanja zadatka u store-u i stranici, prijavu studenta
 * i ulaz u lenji blok (`@defer`); sama komponenta zadatka je lenji chunk (ispod). Na početku FE-5 rezerva je bila 729 B
 * (115 489 B), pa FE-5 dobija svoj deo: izmereno 2026-10-20 +3 397 B (118 886 B).
 */
const OSNOVA_STUDENTA = 108_218;
const RAST_ZADATKA = 3_600;
const BUDZET_STUDENTA = OSNOVA_STUDENTA + 8_000 + RAST_ZADATKA;
/**
 * `app-zadatak-unos` (slika svoje varijante, polja, ishod, rešenje; stilovi u komponenti, ne u globalnom CSS-u početnog
 * paketa): samo dinamički uvoz iz studentske stranice, telefon ga vuče tek na Zadatak slajdu. Izmereno 2026-10-20 (FE-5):
 * 11 293 B; granica + 10 %.
 */
const IZMERENO_ZADATAK = 11_293;
const BUDZET_ZADATKA = Math.floor(IZMERENO_ZADATAK * 1.1);
/**
 * `mathlive/ssr` (formula u tekstu na telefonu, lenji chunk) kao sopstveno zatvorenje posle početnog i studentske stranice.
 * Izmereno 2026-10-14 (e13cfdd): 348 195 B / 102 932 B gzip. Granica: izmereno + 5 % i nikad iznad 380 000 B (granica
 * faze 4), gzip <= 105 000 B (odluka 5).
 */
const IZMERENO_SSR = 348_195;
const BUDZET_SSR = Math.min(Math.floor(IZMERENO_SSR * 1.05), 380_000);
const BUDZET_SSR_GZIP = 105_000;
/**
 * Nizovi koda koji telefon ne sme da vuče (F3: `formula-ucitavanje` je jednom statički uvozio `preducitavanje`, pa su
 * teme i fontovi platna stigli na telefon; lint gleda samo direktne uvoze, pa je ovo jedini čuvar tranzitivnog grafa).
 * `--uz-formula-k` je samo u `ui/mera-formule` (smanjivanje formule na nastavničkim prikazima, token `MERA_FORMULE`):
 * telefon nema ni kod merenja (~2,4 kB, manje od rezerve budžeta, pa ga granica bajtova ne bi uhvatila); u CSS-u niz
 * postoji, ali se ovde gleda samo JS. `NIZOVI_CRTEZA` (5b): crtež kao vektor i zahtev poteza su samo kod projektora i konzole.
 */
const NIZOVI_PLATNA = ['tabelaZaglavlje', 'Carlito', '--uz-formula-k', ...NIZOVI_CRTEZA] as const;

const UI = join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'ui');
/** Uvoz paketa `mathlive` (i podputanja) u izvoru: statički, dinamički ili samo radi efekta. */
const UVOZ_MATHLIVE = /from\s+['"]mathlive|import\(\s*['"]mathlive|import\s+['"]mathlive/;

function zapisi(opis: string, bajtova: number, gzip?: number): void {
  const vrednost = gzip === undefined ? `${bajtova} B` : `${bajtova} B (${gzip} B gzip)`;
  test.info().annotations.push({ type: 'velicina', description: `${opis}: ${vrednost}` });
}

test.describe('formule na javnoj ruti: telefon bez formule ne plaća ništa, mathlive/ssr samo lenjo (produkcioni build)', () => {
  const js = jsFajlovi();
  const pocetno = zatvorenje(skripteIndeksa());
  const student = fajlSa(NIZ_STUDENTA, js);
  const zatvorenjeStudenta = sopstvenoZatvorenje([student], pocetno);
  /** `mathlive/ssr`: `ML__latex` bez celog mathlive-a (`<math-field>`, virtuelna tastatura). */
  const ssrFajlovi = js.filter(f => tekst(f).includes(NIZ_MATHLIVE) && !tekst(f).includes(NIZ_MATHLIVE_CEO));

  test('nizovi provere su pravi: NIZ_STUDENTA u studentskoj stranici, NIZ_MATHLIVE_CEO samo u celom mathlive-u', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'javno', 'uzivo-student.page.ts'), 'utf8');
    expect(src).toContain(NIZ_STUDENTA);
    const zadatak = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'javno', 'zadatak-unos.component.ts'), 'utf8');
    expect(zadatak).toContain(NIZ_ZADATKA_STUDENTA);
    // ceo mathlive (dijalog formule editora) ima niz, a ssr ne: bez toga bi filter `ssrFajlovi` bio prazan ili pogrešan
    expect(js.filter(f => tekst(f).includes(NIZ_MATHLIVE_CEO) && tekst(f).includes(NIZ_MATHLIVE)).length, 'ceo mathlive').toBe(1);
    expect(ssrFajlovi.length, 'tačno jedan chunk sa mathlive/ssr').toBe(1);
    // nizovi platna postoje u buildu (u kodu projektora), pa njihovo odsustvo na telefonu nešto znači
    for (const n of NIZOVI_PLATNA) expect(js.some(f => tekst(f).includes(n)), n).toBe(true);
  });

  test('studentska stranica: zatvorenje u budžetu (osnova + 8 000 B + rast zadatka), bez MathLive-a, editora i koda platna', () => {
    expect(pocetno.has(student), 'studentska stranica nije u početnom zatvorenju').toBe(false);
    zapisi('studentska stranica (sopstveno zatvorenje)', zbir(zatvorenjeStudenta), zbirGzip(zatvorenjeStudenta));
    zapisi('studentska stranica: rast od osnove', zbir(zatvorenjeStudenta) - OSNOVA_STUDENTA);
    expect(zbir(zatvorenjeStudenta)).toBeLessThanOrEqual(BUDZET_STUDENTA);
    const sporni = [...zatvorenjeStudenta, ...pocetno]
      .map(f => ({ f, nizovi: [...nizoviEditora(tekst(f)), ...NIZOVI_PLATNA.filter(n => tekst(f).includes(n))] }))
      .filter(x => x.nizovi.length);
    expect(sporni, 'MathLive, kod editora ili platna u početnom zatvorenju ili zatvorenju studentske stranice').toEqual([]);
  });

  test('zadatak na telefonu (FE-5): samo dinamički uvoz iz studentske stranice, van njenog zatvorenja, u budžetu, bez editora', () => {
    const zadatak = fajlSa(NIZ_ZADATKA_STUDENTA, js);
    const ucitano = new Set([...pocetno, ...zatvorenjeStudenta]);
    expect(ucitano.has(zadatak), 'zadatak u početnom zatvorenju ili zatvorenju studentske stranice').toBe(false);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(zadatak)), 'statički uvoz zadatka').toEqual([]);
    expect(dinamickiUvozi(tekst(student)), 'dinamički uvoz iz studentske stranice').toContain(zadatak);
    const sopstveno = sopstvenoZatvorenje([zadatak], ucitano);
    zapisi('zadatak na telefonu (sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_ZADATKA);
    const sporni = [...sopstveno]
      .map(f => ({ f, nizovi: [...nizoviEditora(tekst(f)), ...NIZOVI_PLATNA.filter(n => tekst(f).includes(n))] }))
      .filter(x => x.nizovi.length);
    expect(sporni, 'MathLive, kod editora ili platna u chunk-u zadatka').toEqual([]);
  });

  test('mathlive/ssr: samo dinamički uvoz, van početnog i studentskog zatvorenja, sopstveno zatvorenje u budžetu', () => {
    const ucitano = new Set([...pocetno, ...zatvorenjeStudenta]);
    for (const ssr of ssrFajlovi) {
      expect(ucitano.has(ssr), `${ssr}: u početnom zatvorenju ili zatvorenju studentske stranice`).toBe(false);
      expect(js.filter(u => statickiUvozi(tekst(u)).includes(ssr)), `${ssr}: statički uvoz`).toEqual([]);
      expect(js.some(u => dinamickiUvozi(tekst(u)).includes(ssr)), `${ssr}: nema dinamičkog import()-a`).toBe(true);
      // telefon ga dohvata iz zatvorenja studentske stranice (`app-tekst-formule` -> `UCITAJ_FORMULE`)
      expect([...zatvorenjeStudenta].some(u => dinamickiUvozi(tekst(u)).includes(ssr)), `${ssr}: uvoz iz studentske stranice`)
        .toBe(true);
      const sopstveno = sopstvenoZatvorenje([ssr], ucitano);
      zapisi('mathlive/ssr posle studentske stranice (sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
      expect([...sopstveno].filter(f => tekst(f).includes(NIZ_MATHLIVE_CEO)), 'ceo mathlive').toEqual([]);
      expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_SSR);
      expect(zbirGzip(sopstveno)).toBeLessThanOrEqual(BUDZET_SSR_GZIP);
    }
  });

  test('izvori formula u tekstu ne uvoze mathlive i nemaju niz ML__latex (formula ide samo kroz formula-ucitavanje)', () => {
    for (const f of ['tekst-formule.ts', 'tekst-formule.component.ts']) {
      const src = readFileSync(join(UI, f), 'utf8');
      expect(UVOZ_MATHLIVE.test(src), `${f}: uvoz paketa mathlive`).toBe(false);
      expect(src.includes(NIZ_MATHLIVE), `${f}: niz ML__latex`).toBe(false);
    }
  });
});
