// Sanitizer markup-a MathLive-a (odluka 5c, sloj c: jedina garancija za formulu iz nepouzdanog izvora). Bez uvoza:
// koristi ga statički prikaz (`formula-markup`, sa `mathlive/ssr`) i dijalog formule editora (upis u `math-field` samo
// za formulu čiji markup sanitizer ne menja), a editor ne sme da uvuče `mathlive/ssr`.

const ELEMENTI = new Set(['span', 'svg', 'path', 'line', 'polygon']);
/** Elementi koji se brišu zajedno sa sadržajem (ostali nepoznati se razvijaju: ostaje sadržaj). */
const BRISU_SE = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'link', 'img', 'image', 'use']);

/**
 * Klase koje MathLive 0.111.1 (`mathlive-ssr.min.mjs`) emituje, izmereno iz izvora (svi `ML__*` nizovi) i iz izlaza nad
 * ~170 formula (klase bez prefiksa). Svaki token klase mora biti ovde: klasa aplikacije (npr. `uz-pub`, `position: fixed`
 * preko celog prozora) ne sme da stigne u formulu ni kad se sloj (a) zaobiđe. Izostavljene su klase stanja uređivača
 * (`ML__caret`, `ML__selected`, `ML__suggestion`, ...); `ML__tooltip-content` (oblačić `\mathtip`, `position: fixed` u
 * `mathlive-static.css`) se briše sa sadržajem.
 */
const KLASE_ML = new Set([
  'accent-body', 'accent-combining-char', 'align_environment', 'ams', 'arraycolsep', 'base', 'bb', 'bg', 'bold', 'box', 'cal',
  'center', 'center_environment', 'close', 'cmr', 'composition', 'correct-color', 'correctPromptBox', 'delim-mult',
  'delim-size1', 'delim-size2', 'delim-size3', 'delim-size4', 'editablePromptBox', 'emph', 'empty-line-anchor', 'enspace',
  'eqnarray_environment', 'error', 'fix', 'focusedPromptBox', 'frac-line', 'frak', 'gather_environment', 'incorrect-color',
  'incorrectPromptBox', 'inner', 'it', 'label_padding', 'large-op', 'latex', 'left', 'left-right', 'llap', 'lockedPromptBox',
  'mathbf', 'mathbfit', 'mathit', 'mediumspace', 'mfrac', 'mspace', 'msubsup', 'mtable', 'multiline_environment',
  'negativethinspace', 'notation', 'nulldelimiter', 'open', 'op-group', 'op-symbol', 'placeholder', 'prompt', 'prompt-atom',
  'pstrut', 'qquad', 'quad', 'raw-latex', 'right', 'rlap', 'rule', 'sans', 'script', 'series_c', 'series_eb', 'series_ec',
  'series_el', 'series_ex', 'series_l', 'series_sb', 'series_sc', 'series_sl', 'series_sx', 'series_ub', 'series_uc',
  'series_ul', 'series_ux', 'series_x', 'shape_ol', 'shape_sc', 'shape_sl', 'small-delim', 'small-op', 'smart-fence__close',
  'sqrt-index', 'sqrt-line', 'sqrt-sign', 'stretchy', 'strut', 'strut--bottom', 'text', 'thickspace', 'thinspace',
  'tooltip-container', 'tt', 'vertical-separator', 'vlist', 'vlist-r', 'vlist-s', 'vlist-t', 'vlist-t2',
].map(k => `ML__${k}`));
/** Klase bez prefiksa `ML__` (izvor: `col-align-${align}`, `delim-size1|4`, `slice-i-of-n`, `lcGreek`, `style-wrap`). */
const KLASE_OSTALE = /^(?:col-align-[lcrm]|delim-size[1-4]|slice-[1-3]-of-[1-3]|(?:over|under)line(?:-line)?|lcGreek|style-wrap)$/;
const KLASA_OBLACICA = 'ML__tooltip-content';

const BROJ = /^-?\d*\.?\d+(?:e-?\d+)?$/;
/** Dužina ili calc() sa brojevima i jedinicama; nijedna druga zagrada (image-set, url, var, attr, ...). */
const DUZINA = /^(?:-?\d*\.?\d+(?:em|ex|px|pt|%)?|calc\(\s*[-+*/.\d\s]*(?:(?:em|ex|px|pt|%)[-+*/.\d\s]*)*\))$/;
const BOJA = /^(?:#[0-9a-fA-F]{3,8}|transparent|currentcolor)$/i;
const BOJA_SVG = /^(?:none|currentcolor|#[0-9a-fA-F]{3,8})$/i;

/** Atributi i forma njihove vrednosti (izmereno nad izlazom MathLive-a); `class` i `style` se čiste posebno. */
const ATRIBUTI: Record<string, RegExp | null> = {
  class: null,
  style: null,
  width: DUZINA,
  height: DUZINA,
  'stroke-width': DUZINA,
  viewbox: /^-?\d*\.?\d+(?:[\s,]+-?\d*\.?\d+){3}$/,
  preserveaspectratio: /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: (?:meet|slice))?$/,
  fill: BOJA_SVG,
  stroke: BOJA_SVG,
  // samo komande putanje i brojevi: nikad url(, # ni slova van komandi
  d: /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s-]*$/,
  points: /^(?:-?\d*\.?\d+(?:e-?\d+)?[\s,]*)*$/,
  'stroke-linecap': /^(?:butt|round|square)$/,
  'vector-effect': /^(?:none|non-scaling-stroke)$/,
  'aria-hidden': /^(?:true|false)$/,
  // koordinate linija (`\cancel`, `\xcancel`, `\enclose{...strike}`): MathLive piše npr. 0.6805599999999998
  x1: BROJ,
  y1: BROJ,
  x2: BROJ,
  y2: BROJ,
};

const DUZINSKA = new Set([
  'height', 'top', 'left', 'width', 'min-width', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding-left', 'padding-right', 'font-size', 'line-height', 'border-right-width', 'border-top-width',
  'border-left-width', 'border-bottom-width', 'border-radius',
]);
/**
 * `\enclose` piše `border:solid currentColor` (bez debljine) i imenovanu boju iz opcija (`[2px dashed red]`), `\boxed`
 * `border:0.04em solid #000000`, kolona `array{c|c}` `border-right:0.04em solid currentColor`, `\enclose{top}` ...
 * `border-top:solid currentColor`. Imenovana boja su samo slova (nikad zagrada ni `url`).
 */
const IVICA = /^(?:\d*\.?\d+(?:em|px) )?(?:solid|dashed|dotted)(?: (?:#[0-9a-fA-F]{3,8}|[A-Za-z]+))?$/;
const DOZVOLJENE_VREDNOSTI: Record<string, RegExp> = {
  'vertical-align': new RegExp(`${DUZINA.source}|^(?:baseline|top|middle|bottom)$`),
  display: /^(?:inline-block|inline|block)$/,
  position: /^(?:relative|absolute)$/, // nikad fixed/sticky: formula ne sme da izađe iz svog sloja
  'z-index': /^-?\d{1,2}$/,
  overflow: /^(?:visible|hidden)$/,
  'box-sizing': /^(?:border-box|content-box)$/,
  opacity: /^(?:0|1|0?\.\d+)$/,
  border: IVICA,
  'border-top': IVICA,
  'border-right': IVICA,
  'border-bottom': IVICA,
  'border-left': IVICA,
  color: BOJA,
  'background-color': BOJA,
  '--bg-color': BOJA,
};

/** Deklaracije stila koje MathLive emituje (izmereno, odluka 5), sa proverenom vrednošću; ostalo se izbacuje. */
export function ocistiStil(stil: string): string {
  return ocistiStilSaIzmenom(stil).stil;
}

/** `ocistiStil` plus da li je ijedna (neprazna) deklaracija izbačena (preformatiranje nije izmena). */
function ocistiStilSaIzmenom(stil: string): { stil: string; izmena: boolean } {
  let izmena = false;
  const cist = stil.split(';').flatMap(d => {
    if (!d.trim()) return [];
    const i = d.indexOf(':');
    if (i < 0) {
      izmena = true;
      return [];
    }
    const ime = d.slice(0, i).trim().toLowerCase();
    const vrednost = d.slice(i + 1).trim();
    // CSS komentar (npr. unutar calc() bi "pojeo" sledeće deklaracije istog stila
    if (vrednost.includes('/*') || vrednost.includes('*/')) {
      izmena = true;
      return [];
    }
    // `Object.hasOwn`: ime kao `constructor` ili `toString` ne sme da pogodi prototip
    const ok = DUZINSKA.has(ime) ? DUZINA.test(vrednost)
      : Object.hasOwn(DOZVOLJENE_VREDNOSTI, ime) && DOZVOLJENE_VREDNOSTI[ime].test(vrednost);
    if (!ok) izmena = true;
    return ok ? [`${ime}:${vrednost}`] : [];
  }).join(';');
  return { stil: cist, izmena };
}

/**
 * Čisti markup po dozvoljenoj listi (odluka 5c): nepoznat element se razvija (ostaje sadržaj, npr. `<a>` iz `\href`),
 * `script`/`style`/`foreignObject`/`img`/... i oblačić `\mathtip` se brišu sa sadržajem, atributi van liste (`href`, `id`,
 * `data-*`, `on*`) i vrednosti van forme (npr. `fill="url(...)"`) se brišu, `style` prolazi `ocistiStil`, a od `class`
 * ostaju samo izmereni tokeni MathLive-a (sloj c je jedina garancija; sloj a je samo prvo sito). `<template>` ne izvršava ništa i ne učitava slike dok se parsira.
 */
export function ocistiMarkup(html: string): DocumentFragment {
  return ocisti(html).fragment;
}

/**
 * Da li sanitizer ostavlja markup netaknut (ništa ne briše ni ne razvija; preformatiranje stila se ne računa). Dijalog
 * formule upisuje LaTeX u `math-field` (koji crta MathLive sam, mimo sanitizera) samo kad je ovo tačno za izlaz
 * `convertLatexToMarkup` iste formule.
 */
export function markupNepromenjen(html: string): boolean {
  return !ocisti(html).izmena;
}

function ocisti(html: string): { fragment: DocumentFragment; izmena: boolean } {
  let izmena = false;
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const el of [...t.content.querySelectorAll('*')]) {
    if (!t.content.contains(el)) continue; // već obrisan zajedno sa roditeljem
    const ime = el.localName.toLowerCase();
    if (!ELEMENTI.has(ime)) {
      izmena = true;
      if (BRISU_SE.has(ime)) el.remove();
      else el.replaceWith(...el.childNodes);
      continue;
    }
    const klase = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (klase.includes(KLASA_OBLACICA)) {
      izmena = true;
      el.remove();
      continue;
    }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      const forma = Object.hasOwn(ATRIBUTI, n) ? ATRIBUTI[n] : undefined;
      if (forma === undefined || (forma !== null && !forma.test(a.value))) {
        izmena = true;
        el.removeAttribute(a.name);
        continue;
      }
      let cist = a.value;
      if (n === 'style') {
        const r = ocistiStilSaIzmenom(a.value);
        cist = r.stil;
        izmena ||= r.izmena;
      } else if (n === 'class') {
        const ostaju = klase.filter(k => KLASE_ML.has(k) || KLASE_OSTALE.test(k));
        izmena ||= ostaju.length !== klase.length;
        cist = ostaju.join(' ');
      }
      if (!cist) el.removeAttribute(a.name);
      else if (cist !== a.value) el.setAttribute(a.name, cist);
    }
  }
  return { fragment: t.content, izmena };
}
