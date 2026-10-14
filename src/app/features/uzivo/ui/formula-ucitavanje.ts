import { InjectionToken } from '@angular/core';
import { sacekajFontove } from './cekanje-fontova';

/*
 * Lenjo učitavanje statičkog prikaza formula (odluka 6 i 7): jedini dinamički `import()` modula `formula-markup` (u njemu
 * je `mathlive/ssr`, ~350 kB, sopstveni chunk), plus lokalni CSS MathLive-a i KaTeX fontovi iz `assets/mathlive/`
 * (`angular.json`). Projektor, konzola i editor ga traže tek kad slajd ima formulu bez slike izvora.
 */

export type ModulFormule = typeof import('./formula-markup');

let modul: Promise<ModulFormule> | null = null;

/** Modul `formula-markup`, jednom po prozoru (keš obećanja; odbijeno se ne kešira, sledeći poziv pokušava ponovo). */
export function ucitajFormule(uvezi: () => Promise<ModulFormule> = () => import('./formula-markup')): Promise<ModulFormule> {
  modul ??= uvezi().catch((e: unknown) => {
    modul = null;
    throw e;
  });
  return modul;
}

/** Relativno: radi pod svakim `<base href>`; CSS sam nalazi fontove (`url(fonts/...)` relativno prema sebi). */
export const PUTANJA_STILA_FORMULA = 'assets/mathlive/mathlive-static.css';
/** KaTeX fontovi koje skoro svaka formula koristi (ostali, npr. Fraktur, učitaju se pri prvom crtanju). */
export const FONTOVI_FORMULA: readonly string[] = [
  'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4',
];
const MAX_MS = 3000;

let stil: Promise<void> | null = null;

/**
 * Jedan `<link>` u `<head>` (čeka `load` ili `error`, najviše 3000 ms), pa KaTeX fontovi (`sacekajFontove`, najviše
 * 3000 ms; spec 5: fontovi pre prikaza; `font-display` CSS-a je `"swap"` pod navodnicima, što pregledač odbacuje).
 * Nikad ne odbija: bez stila se crta izvor ili markup sa rezervnim fontom.
 */
export function ucitajStilFormula(): Promise<void> {
  stil ??= new Promise<void>(razresi => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = PUTANJA_STILA_FORMULA;
    link.dataset['gfs'] = 'mathlive';
    const tajmer = setTimeout(razresi, MAX_MS);
    link.onload = link.onerror = () => {
      clearTimeout(tajmer);
      razresi();
    };
    document.head.appendChild(link);
  }).then(() => sacekajFontove(FONTOVI_FORMULA, MAX_MS));
  return stil;
}

/** Samo za testove: zaboravlja keširana obećanja (keš inače traje koliko i prozor). */
export function resetujUcitavanjeFormula(): void {
  modul = null;
  stil = null;
}

export const UCITAJ_FORMULE = new InjectionToken<() => Promise<ModulFormule>>('UCITAJ_FORMULE', {
  providedIn: 'root',
  factory: () => ucitajFormule,
});

export const UCITAJ_STIL_FORMULA = new InjectionToken<() => Promise<void>>('UCITAJ_STIL_FORMULA', {
  providedIn: 'root',
  factory: () => ucitajStilFormula,
});
