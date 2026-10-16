// Čitanje produkcionog builda (`dist/gfs-front/browser`) bez pregledača: uvozi među JS fajlovima, zatvorenja i veličine.
// Koriste ga `lenji-uvoz.spec.ts` (fflate i uvoz PPTX-a) i `lenji-editor.spec.ts` (editor platna i budžeti, odluka 7).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const KOREN = join(__dirname, '..', 'dist', 'gfs-front', 'browser');
export const tekst = (f: string): string => readFileSync(join(KOREN, f), 'utf8');
/** Svi JS fajlovi builda (koren, bez podfoldera). */
export const jsFajlovi = (): string[] => readdirSync(KOREN).filter(f => f.endsWith('.js'));

/** Statički uvozi JS fajla (`import ... from "./x.js"`, `import "./x.js"`), bez dinamičkog `import("./x.js")`. */
export function statickiUvozi(sadrzaj: string): string[] {
  return [...sadrzaj.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)].map(m => m[1]);
}

/** Dinamički uvozi (`import("./x.js")`; esbuild piše i `import(\`./x.js\`)`). */
export function dinamickiUvozi(sadrzaj: string): string[] {
  return [...sadrzaj.matchAll(/\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)].map(m => m[1]);
}

/** Skripte koje `index.html` učitava odmah (`<script src>`, `modulepreload`). */
export function skripteIndeksa(): string[] {
  const html = tekst('index.html');
  return [
    ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map(m => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g)].map(m => m[1]),
  ];
}

/**
 * Stilovi koje `index.html` učitava odmah (`<link rel="stylesheet">`), svaki jednom: uz ugrađen kritični CSS isti fajl
 * stoji dva puta (`media="print"` sa zamenom i `<noscript>`).
 */
export function stiloviIndeksa(): string[] {
  const html = tekst('index.html');
  return [...new Set([...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+\.css)"/g)].map(m => m[1]))];
}

/** Svi fajlovi do kojih se iz `pocetak` stiže statičkim uvozima (ono što pregledač mora da učita pre pokretanja). */
export function zatvorenje(pocetak: readonly string[]): Set<string> {
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

export const velicina = (f: string): number => statSync(join(KOREN, f)).size;
export const zbir = (fajlovi: Iterable<string>): number => [...fajlovi].reduce((n, f) => n + velicina(f), 0);
export const zbirGzip = (fajlovi: Iterable<string>): number =>
  [...fajlovi].reduce((n, f) => n + gzipSync(readFileSync(join(KOREN, f)), { level: 9 }).length, 0);

/** Ono što pregledač učitava za `pocetak` kad su `vecUcitano` već tu (odluka 7: "sopstveno zatvorenje"). */
export function sopstvenoZatvorenje(pocetak: readonly string[], vecUcitano: ReadonlySet<string>): Set<string> {
  return new Set([...zatvorenje(pocetak)].filter(f => !vecUcitano.has(f)));
}

/** Jedini JS fajl koji sadrži niz (greška ako ih je 0 ili više: provera ne sme da bude prazna ni dvosmislena). */
export function fajlSa(niz: string, js: readonly string[]): string {
  const nadjeni = js.filter(f => tekst(f).includes(niz));
  if (nadjeni.length !== 1) throw new Error(`Niz ${niz}: očekivan tačno jedan JS fajl, nađeno ${nadjeni.length}.`);
  return nadjeni[0];
}
