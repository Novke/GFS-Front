import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: proverava pravi produkcioni build, pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import { NIZ_FFLATE, NIZ_UVOZA, nizoviUvoza } from './nizovi-uvoza';

const KOREN = join(__dirname, '..', 'dist', 'gfs-front', 'browser');
const tekst = (f: string) => readFileSync(join(KOREN, f), 'utf8');

/** Statički uvozi JS fajla (`import ... from "./x.js"`, `import "./x.js"`), bez dinamičkog `import("./x.js")`. */
function statickiUvozi(sadrzaj: string): string[] {
  return [...sadrzaj.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)].map(m => m[1]);
}

/** Dinamički uvozi (`import("./x.js")`; esbuild piše i `import(\`./x.js\`)`). */
function dinamickiUvozi(sadrzaj: string): string[] {
  return [...sadrzaj.matchAll(/\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)].map(m => m[1]);
}

/** Skripte koje `index.html` učitava odmah (`<script src>`, `modulepreload`). */
function skripteIndeksa(): string[] {
  const html = tekst('index.html');
  return [
    ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map(m => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g)].map(m => m[1]),
  ];
}

/** Svi fajlovi do kojih se iz `pocetak` stiže statičkim uvozima (ono što pregledač mora da učita pre pokretanja). */
function zatvorenje(pocetak: readonly string[]): Set<string> {
  const vidjeno = new Set<string>();
  const red = [...pocetak];
  while (red.length) {
    const f = red.pop()!;
    if (vidjeno.has(f)) continue;
    vidjeno.add(f);
    red.push(...statickiUvozi(tekst(f)));
  }
  return vidjeno;
}

test.describe('fflate i kod uvoza PPTX-a samo u lenjom chunk-u (produkcioni build)', () => {
  const js = readdirSync(KOREN).filter(f => f.endsWith('.js'));

  test('nizovi provere su pravi: OZNAKA_UVOZA dijaloga i poruka greške fflate-a', () => {
    const dijalog = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'uvoz-pptx', 'uvoz-pptx.dialog.ts'), 'utf8');
    expect(dijalog).toContain(`export const OZNAKA_UVOZA = '${NIZ_UVOZA}';`);
    expect(readFileSync(join(__dirname, '..', 'node_modules', 'fflate', 'esm', 'browser.js'), 'utf8')).toContain(NIZ_FFLATE);
  });

  test('skripte iz index.html i sve što one statički uvoze nemaju ni fflate ni kod uvoza', () => {
    const pocetne = skripteIndeksa();
    expect(pocetne.some(f => /^main-[A-Za-z0-9_-]+\.js$/.test(f)), 'main-*.js u index.html').toBe(true);
    // modulepreload je samo nagoveštaj: potpun spisak je zatvorenje statičkih uvoza
    const pocetak = zatvorenje(pocetne);
    const sporni = [...pocetak].map(f => ({ f, nizovi: nizoviUvoza(tekst(f)) })).filter(x => x.nizovi.length);
    expect(sporni).toEqual([]);
  });

  test('provera nije prazna: bar jedan lenji chunk sadrži oba niza; fflate postoji samo uz kod dijaloga uvoza', () => {
    const saNizovima = js.map(f => ({ f, nizovi: nizoviUvoza(tekst(f)) })).filter(x => x.nizovi.length);
    expect(saNizovima.some(x => x.nizovi.length === 2), JSON.stringify(saNizovima)).toBe(true);

    const dijalog = new Set(saNizovima.filter(x => x.nizovi.includes(NIZ_UVOZA)).map(x => x.f));
    for (const { f } of saNizovima.filter(x => x.nizovi.includes(NIZ_FFLATE) && !x.nizovi.includes(NIZ_UVOZA))) {
      // esbuild je izdvojio fflate u zaseban chunk: sme da ga uvozi (statički) samo chunk dijaloga uvoza
      const uvoznici = js.filter(u => statickiUvozi(tekst(u)).includes(f));
      expect(uvoznici.length, `${f}: niko ga ne uvozi`).toBeGreaterThan(0);
      expect(uvoznici.filter(u => !dijalog.has(u)), `${f} uvoze i chunk-ovi van dijaloga uvoza`).toEqual([]);
    }
  });

  test('chunk dijaloga uvoza se učitava samo dinamičkim import()-om (niko ga ne uvozi statički)', () => {
    const dijalog = js.filter(f => tekst(f).includes(NIZ_UVOZA));
    expect(dijalog.length).toBeGreaterThan(0);
    for (const d of dijalog) {
      expect(js.filter(u => statickiUvozi(tekst(u)).includes(d)), d).toEqual([]);
      expect(js.some(u => dinamickiUvozi(tekst(u)).includes(d)), `${d}: nema dinamičkog import()-a`).toBe(true);
    }
  });
});
