import { convertLatexToMarkup, validateLatex } from 'mathlive/ssr';
import { ZABRANJENE_KOMANDE } from './formula-komande';

/*
 * Statički prikaz formule (odluka 5 i 6 plana editora): LaTeX -> markup MathLive-a, očišćen po dozvoljenoj listi. LaTeX
 * dolazi iz dokumenta (uvezen PPTX ili otkucan), pa je nepouzdan ulaz: MathLive za `\href`, `\htmlStyle`, `\cssId`,
 * `\htmlData`, ... piše `href`, spoljni `url(...)` u stilu, `id`, `data-*`. Tri sloja: (a) formula sa komandom koja pravi
 * atribute ili stil se ne pretvara (crta se izvor), (b) izuzetak MathLive-a = izvor, (c) markup prolazi sanitizer sa
 * dozvoljenom listom elemenata, atributa i deklaracija stila. Ovaj modul učitava SAMO `formula-ucitavanje.ts`, dinamički.
 */

// spisak zabranjenih komandi (odluka 5a) je u `formula-komande.ts`: deli ga i editor (dijalog formule, F16) bez mathlive/ssr
export { ZABRANJENE_KOMANDE } from './formula-komande';

const ELEMENTI = new Set(['span', 'svg', 'path', 'line']);
/** Elementi koji se brišu zajedno sa sadržajem (ostali nepoznati se razvijaju: ostaje sadržaj). */
const BRISU_SE = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'link', 'img', 'image', 'use']);
const ATRIBUTI = new Set([
  'class', 'style', 'width', 'height', 'viewbox', 'preserveaspectratio', 'fill', 'd', 'stroke', 'stroke-width',
  'stroke-linecap', 'vector-effect', 'aria-hidden', 'x1', 'y1', 'x2', 'y2',
]);
/** Koordinate linija (`\cancel`, `\xcancel`, `\enclose{...strike}`): samo broj (MathLive piše npr. 0.6805599999999998). */
const KOORDINATE = new Set(['x1', 'y1', 'x2', 'y2']);
const BROJ = /^-?\d*\.?\d+(?:e-?\d+)?$/;
const KLASA = /^[A-Za-z0-9_\- ]*$/;
/** Dužina ili calc() sa brojevima i jedinicama; nijedna druga zagrada (image-set, url, var, attr, ...). */
const DUZINA = /^(?:-?\d*\.?\d+(?:em|ex|px|pt|%)?|calc\(\s*[-+*/.\d\s]*(?:(?:em|ex|px|pt|%)[-+*/.\d\s]*)*\))$/;
const BOJA = /^(?:#[0-9a-fA-F]{3,8}|transparent|currentcolor)$/i;
const DUZINSKA = new Set([
  'height', 'top', 'left', 'width', 'min-width', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding-left', 'padding-right', 'font-size', 'line-height', 'border-right-width', 'border-top-width',
  'border-left-width', 'border-bottom-width', 'border-radius',
]);
const DOZVOLJENE_VREDNOSTI: Record<string, RegExp> = {
  'vertical-align': new RegExp(`${DUZINA.source}|^(?:baseline|top|middle|bottom)$`),
  display: /^(?:inline-block|inline|block)$/,
  position: /^(?:relative|absolute)$/, // nikad fixed/sticky: formula ne sme da izađe iz svog sloja
  'z-index': /^-?\d{1,2}$/,
  overflow: /^(?:visible|hidden)$/,
  'box-sizing': /^(?:border-box|content-box)$/,
  opacity: /^(?:0|1|0?\.\d+)$/,
  // `\enclose` piše `border:solid currentColor` (bez debljine), `\boxed` `border:0.04em solid #000000`
  border: /^(?:\d*\.?\d+(?:em|px) )?(?:solid|dashed|dotted)(?: (?:#[0-9a-fA-F]{3,8}|currentcolor))?$/i,
  color: BOJA,
  'background-color': BOJA,
  '--bg-color': BOJA,
};

/** Deklaracije stila koje MathLive emituje (izmereno, odluka 5), sa proverenom vrednošću; ostalo se izbacuje. */
export function ocistiStil(stil: string): string {
  return stil.split(';').flatMap(d => {
    const i = d.indexOf(':');
    if (i < 0) return [];
    const ime = d.slice(0, i).trim().toLowerCase();
    const vrednost = d.slice(i + 1).trim();
    const ok = DUZINSKA.has(ime) ? DUZINA.test(vrednost) : DOZVOLJENE_VREDNOSTI[ime]?.test(vrednost) ?? false;
    return ok ? [`${ime}:${vrednost}`] : [];
  }).join(';');
}

/**
 * Čisti markup po dozvoljenoj listi (odluka 5c): nepoznat element se razvija (ostaje sadržaj, npr. `<a>` iz `\href`),
 * `script`/`style`/`foreignObject`/`img`/... se brišu sa sadržajem, atributi van liste (`href`, `id`, `data-*`, `on*`) se
 * brišu, `style` prolazi `ocistiStil`. `<template>` ne izvršava ništa i ne učitava slike dok se parsira.
 */
export function ocistiMarkup(html: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const el of [...t.content.querySelectorAll('*')]) {
    if (!t.content.contains(el)) continue; // već obrisan zajedno sa roditeljem
    const ime = el.localName.toLowerCase();
    if (!ELEMENTI.has(ime)) {
      if (BRISU_SE.has(ime)) el.remove();
      else el.replaceWith(...el.childNodes);
      continue;
    }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (!ATRIBUTI.has(n) || (n === 'class' && !KLASA.test(a.value)) || (KOORDINATE.has(n) && !BROJ.test(a.value))) {
        el.removeAttribute(a.name);
        continue;
      }
      if (n === 'style') {
        const cist = ocistiStil(a.value);
        if (cist) el.setAttribute('style', cist);
        else el.removeAttribute('style');
      }
    }
  }
  return t.content;
}

/** `convertLatexToMarkup` u try/catch (izuzetak -> null), pa `ocistiMarkup`; `f` je zamenljiv radi testa grane catch. */
export function konvertuj(latex: string, f: typeof convertLatexToMarkup = convertLatexToMarkup): DocumentFragment | null {
  try {
    return ocistiMarkup(f(latex, { defaultMode: 'math' }));
  } catch {
    // npr. \href{javascript:...} baca iz MathLive-a; projektor (afterRenderEffect) ne sme da padne (Review Focus 5)
    return null;
  }
}

/** Markup za LaTeX (prikaz "math"), očišćen; null kad LaTeX nije ispravan, ima zabranjenu komandu ili konverzija baci. */
export function latexUMarkup(latex: string): DocumentFragment | null {
  if (!latex.trim() || ZABRANJENE_KOMANDE.test(latex)) return null;
  try {
    if (validateLatex(latex).length > 0) return null;
  } catch {
    return null;
  }
  return konvertuj(latex);
}
