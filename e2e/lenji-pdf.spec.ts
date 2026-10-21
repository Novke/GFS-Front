import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: proverava pravi produkcioni build (faza 5d, odluke 15, 16 i 19), pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import {
  dinamickiUvozi, fajlSa, jsFajlovi, potpunoZatvorenje, skripteIndeksa, sopstvenoZatvorenje, statickiUvozi, tekst, zatvorenje, zbir,
  zbirGzip,
} from './chunkovi';
import { NIZ_STUDENTA } from './nizovi-editora';
import { NIZ_FFLATE, NIZ_PDFJS, NIZ_PDFJS_RADNIK, NIZ_UVOZA, NIZ_UVOZA_PDF, nizoviPdf, nizoviUvoza } from './nizovi-uvoza';

/** Granice plana (odluka 15): biblioteka pdf.js (legacy build) i njen radnik, svaki kao jedan fajl. */
const BUDZET_PDFJS = 520_000;
const BUDZET_RADNIK = 1_300_000;
/** Niz koji postoji samo u šablonu stranice editora prezentacije (zaglavlje); isti kao u `lenji-editor.spec.ts`. */
const NIZ_STRANICE = 'uz-ed-zaglavlje';
/** Ime radnika: Angular web worker (odluka 16), heširan kao ostali chunk-ovi, pa ga pokriva dugi keš nginx-a. */
const IME_RADNIKA = /^worker-[A-Za-z0-9_-]{8}\.js$/;

const izvor = (...deo: string[]): string => readFileSync(join(__dirname, '..', ...deo), 'utf8');

/** Izmerena vrednost ide u izveštaj testa (i u opis PR-a). */
function zapisi(opis: string, bajtova: number, gzip?: number): void {
  const vrednost = gzip === undefined ? `${bajtova} B` : `${bajtova} B (${gzip} B gzip)`;
  test.info().annotations.push({ type: 'velicina', description: `${opis}: ${vrednost}` });
}

test.describe('uvoz PDF-a i pdf.js samo u lenjim chunk-ovima, budžeti (produkcioni build)', () => {
  const js = jsFajlovi();
  const pocetno = zatvorenje(skripteIndeksa());
  const stranica = fajlSa(NIZ_STRANICE, js);
  /** Ono što je učitano kad je editor otvoren, a dugme "PDF" još nije kliknuto. */
  const preKlika = new Set([...pocetno, ...zatvorenje([stranica])]);
  const dijalozi = js.filter(f => tekst(f).includes(NIZ_UVOZA_PDF));

  test('nizovi provere su pravi: OZNAKA_UVOZA_PDF dijaloga, niz samo biblioteke i niz samo radnika pdf.js-a', () => {
    expect(izvor('src', 'app', 'features', 'uzivo', 'uvoz-pdf', 'uvoz-pdf.dialog.ts')).toContain(`export const OZNAKA_UVOZA_PDF = '${NIZ_UVOZA_PDF}';`);
    const biblioteka = izvor('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
    const radnik = izvor('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    expect(biblioteka).toContain(NIZ_PDFJS);
    expect(biblioteka).not.toContain(NIZ_PDFJS_RADNIK);
    expect(radnik).toContain(NIZ_PDFJS_RADNIK);
    expect(radnik).not.toContain(NIZ_PDFJS);
  });

  test('početno zatvorenje i statičko zatvorenje stranice editora nemaju ništa od uvoza PDF-a', () => {
    expect([...pocetno].some(f => /^main-[A-Za-z0-9_-]+\.js$/.test(f)), 'main-*.js u index.html').toBe(true);
    const sporni = [...preKlika].map(f => ({ f, nizovi: nizoviPdf(tekst(f)) })).filter(x => x.nizovi.length);
    expect(sporni).toEqual([]);
  });

  test('chunk dijaloga PDF-a: samo dinamički uvoz, a njegovo statičko zatvorenje nema fflate, uvoz PPTX-a ni pdf.js (odluka 19)', () => {
    expect(dijalozi.length, 'chunk sa OZNAKA_UVOZA_PDF').toBeGreaterThan(0);
    for (const d of dijalozi) {
      // statički ga sme uvoziti samo ono što se i samo učitava tek iz dijaloga (`pdf-ucitavanje` uzima `spremanRadnik`
      // iz `pdf-crtac`, koji je u chunk-u dijaloga): pre klika ga ne učitava niko
      const staticki = js.filter(u => statickiUvozi(tekst(u)).includes(d));
      expect(staticki.filter(u => preKlika.has(u) || !potpunoZatvorenje(dijalozi, preKlika).has(u)), `${d}: statički uvoz van dijaloga`).toEqual([]);
      // `pages/uvoz-pdf-otvarac.ts` (dinamički `import()`) je u zatvorenju stranice editora
      const uvoznici = js.filter(u => dinamickiUvozi(tekst(u)).includes(d));
      expect(uvoznici.length, `${d}: nema dinamičkog import()-a`).toBeGreaterThan(0);
      expect(uvoznici.filter(u => !preKlika.has(u)), `${d}: uvoznici van stranice editora`).toEqual([]);
    }
    const zatvorenjeDijaloga = zatvorenje(dijalozi);
    const sporni = [...zatvorenjeDijaloga]
      .map(f => ({ f, nizovi: [...nizoviUvoza(tekst(f)), ...nizoviPdf(tekst(f)).filter(n => n !== NIZ_UVOZA_PDF)] }))
      .filter(x => x.nizovi.length);
    expect(sporni, `bez ${NIZ_FFLATE}, ${NIZ_UVOZA}, ${NIZ_PDFJS} i ${NIZ_PDFJS_RADNIK}`).toEqual([]);
    zapisi('fajl chunk-a dijaloga PDF-a', zbir(dijalozi));
    const sopstveno = sopstvenoZatvorenje(dijalozi, preKlika);
    zapisi('dijalog PDF-a (sopstveno zatvorenje posle stranice editora)', zbir(sopstveno), zbirGzip(sopstveno));
  });

  test(`pdf.js: jedan fajl <= ${BUDZET_PDFJS} B, samo dinamički uvoz, van zatvorenja dijaloga (učitava se tek za izabran fajl)`, () => {
    const pdfjs = fajlSa(NIZ_PDFJS, js);
    zapisi('pdf.js (fajl)', zbir([pdfjs]), zbirGzip([pdfjs]));
    expect(zbir([pdfjs])).toBeLessThanOrEqual(BUDZET_PDFJS);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(pdfjs)), `${pdfjs}: statički uvoz`).toEqual([]);
    const uvoznici = js.filter(u => dinamickiUvozi(tekst(u)).includes(pdfjs));
    expect(uvoznici.length, `${pdfjs}: nema dinamičkog import()-a`).toBeGreaterThan(0);
    const zatvorenjeDijaloga = zatvorenje(dijalozi);
    expect(preKlika.has(pdfjs) || zatvorenjeDijaloga.has(pdfjs), `${pdfjs}: učitan pre izbora fajla`).toBe(false);
    // ko ga uvozi (`pdf-ucitavanje`) je i sam lenj: stiže se do njega samo iz dijaloga, ne pre klika
    for (const u of uvoznici) {
      expect(preKlika.has(u), `${u}: u početnom zatvorenju ili zatvorenju stranice`).toBe(false);
      expect(potpunoZatvorenje(dijalozi, preKlika).has(u), `${u}: nije dostižan iz dijaloga`).toBe(true);
    }
  });

  test(`radnik pdf.js-a: worker-*.js <= ${BUDZET_RADNIK} B, nijedan JS ga ne uvozi, pravi ga samo lenji učitavač`, () => {
    const radnik = fajlSa(NIZ_PDFJS_RADNIK, js);
    zapisi(`radnik pdf.js-a (${radnik})`, zbir([radnik]), zbirGzip([radnik]));
    expect(radnik).toMatch(IME_RADNIKA);
    expect(zbir([radnik])).toBeLessThanOrEqual(BUDZET_RADNIK);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(radnik) || dinamickiUvozi(tekst(u)).includes(radnik)), `${radnik}: import`).toEqual([]);
    // `new Worker(new URL("worker-X.js", import.meta.url), { type: "module" })` u tačno jednom fajlu, van svega što je učitano
    // pre klika i van statičkog zatvorenja dijaloga
    const pravi = js.filter(u => u !== radnik && tekst(u).includes(radnik));
    expect(pravi, `${radnik}: ko ga pominje`).toHaveLength(1);
    expect(tekst(pravi[0])).toMatch(new RegExp(`new Worker\\(new URL\\(["'\`](\\./)?${radnik.replace(/[.-]/g, '\\$&')}["'\`]`));
    expect(preKlika.has(pravi[0]) || zatvorenje(dijalozi).has(pravi[0]), `${pravi[0]}: učitan pre izbora fajla`).toBe(false);
  });

  test('studentska stranica (telefon) ni statički ni dinamički ne stiže do uvoza PDF-a', () => {
    const student = fajlSa(NIZ_STUDENTA, js);
    const dostizno = potpunoZatvorenje([student], pocetno);
    const sporni = [...dostizno].map(f => ({ f, nizovi: nizoviPdf(tekst(f)) })).filter(x => x.nizovi.length);
    expect(sporni).toEqual([]);
  });
});
