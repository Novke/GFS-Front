// Učitavanje celog MathLive-a (`<math-field>`, ~830 kB) samo za dijalog formule (odluka 5 i 7): jedini dinamički
// `import('mathlive')` u aplikaciji, pa biblioteka ide u sopstveni chunk koji se vuče tek kad se dijalog otvori.
// Fontovi su lokalni (`assets/mathlive/fonts/`, F15 ih kopira), zvukovi isključeni, a `\href` u polju ne otvara ništa.
import { InjectionToken } from '@angular/core';

export type MathLive = typeof import('mathlive');

let obecanje: Promise<MathLive> | null = null;

/** Jednom po prozoru: uvoz `mathlive`, lokalni fontovi, bez zvukova; odbijeno se ne kešira (sledeći poziv pokušava ponovo). */
export function ucitajMathLive(uvezi: () => Promise<MathLive> = () => import('mathlive')): Promise<MathLive> {
  obecanje ??= uvezi().then((m) => {
    const mf = m.MathfieldElement;
    // apsolutan URL: MathLive tada ne pita sopstvenu adresu (HEAD) i ne traži fontove sa CDN-a
    mf.fontsDirectory = new URL('assets/mathlive/fonts/', document.baseURI).href;
    mf.soundsDirectory = null;
    mf.keypressSound = null;
    mf.plonkSound = null;
    // LaTeX može biti iz uvezenog PPTX-a: link u polju ne sme da otvori stranu (dijalog ga ionako ne dozvoljava sačuvati)
    mf.openUrl = () => undefined;
    return m;
  }).catch((e: unknown) => {
    obecanje = null;
    throw e;
  });
  return obecanje;
}

/** Samo za testove: zaboravlja keširano obećanje. */
export function resetujMathLive(): void {
  obecanje = null;
}

export const UCITAJ_MATHLIVE = new InjectionToken<() => Promise<MathLive>>('UCITAJ_MATHLIVE', {
  providedIn: 'root',
  factory: () => ucitajMathLive,
});
