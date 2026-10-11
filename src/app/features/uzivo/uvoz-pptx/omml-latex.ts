// OMML (Office Math, ECMA-376 deo 1, §22.1) -> LaTeX za formule uvezenog PPTX-a (podskup iz spec-a 11, bez Angular-a).
// Ugnežđavanje i dužina su ograničeni: fajl je tuđ, pa ni dubok ni ogroman OMML ne sme da obori stek ili traje kvadratno.
import { deca, dete, NS } from './xml';

export interface RezultatLatexa { latex: string; zaProveru: boolean; }

/** Najveća dubina rekurzije po elementima; dublje se uzima samo tekst podstabla (i `zaProveru`). */
const MAX_DUBINA = 64;
/** Budžet obrade: znakovi teksta plus `CENA_ELEMENTA` po elementu; preko njega -> `\text{formula}`. */
const MAX_BUDZETA = 20_000;
const CENA_ELEMENTA = 4;
/** `latexOkvira`: duže od ovoga -> `\text{formula}` + `zaProveru`. */
const MAX_LATEX_OKVIRA = 5000;
const PREDUGO = '\\text{formula}';

interface Stanje { zaProveru: boolean; budzet: number; prekid: boolean; }

const novoStanje = (): Stanje => ({ zaProveru: false, budzet: MAX_BUDZETA, prekid: false });

/** Troši budžet; `false` kad je potrošen (tada je obrada prekinuta). */
function potrosi(s: Stanje, n: number): boolean {
  if (s.prekid) return false;
  s.budzet -= n;
  if (s.budzet < 0) {
    s.prekid = true;
    s.zaProveru = true;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- spajanje i izbegavanje

const jeSlovo = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Da li se niz završava kontrolnom reči (`\ime`, a ne `\\ime`). */
function krajKomande(t: string): boolean {
  let i = t.length - 1;
  while (i >= 0 && jeSlovo(t.charCodeAt(i))) i--;
  if (i === t.length - 1) return false;
  let kose = 0;
  while (i >= 0 && t.charCodeAt(i) === 92) {
    kose++;
    i--;
  }
  return kose % 2 === 1;
}

/** Spaja delove bez razmaka; posle kontrolne reči ispred slova ide jedan razmak (`\sim x`, ali `\sim(`). */
function spoji(delovi: readonly string[]): string {
  const izlaz: string[] = [];
  let prethodni = '';
  for (const d of delovi) {
    if (!d) continue;
    if (prethodni && jeSlovo(d.charCodeAt(0)) && krajKomande(prethodni)) izlaz.push(' ');
    izlaz.push(d);
    prethodni = d;
  }
  return izlaz.join('');
}

/** Nevidljivi operatori (U+2061-U+2064) i znaci nulte širine: u LaTeX-u nemaju značenje, a prikaz ih crta kao kvadratiće. */
const NEVIDLJIVI = /[\u200B-\u200D\u2061-\u2064\uFEFF]/;

/** Tekst u matematičkom režimu: posebni znaci LaTeX-a izbegnuti, razmak je `\ `, unikod simboli ostaju. */
function matTekst(t: string, s: Stanje): string {
  const delovi: string[] = [];
  for (const z of t) {
    if (NEVIDLJIVI.test(z)) continue;
    switch (z) {
      case '\\': delovi.push('\\backslash'); break;
      case '{': case '}': case '#': case '$': case '%': case '&': case '_': delovi.push('\\' + z); break;
      case '^':
        delovi.push('\\hat{}');
        s.zaProveru = true;
        break;
      case '~': delovi.push('\\sim'); break;
      default: delovi.push(/\s/.test(z) ? '\\ ' : z);
    }
  }
  return spoji(delovi);
}

/** Tekst za `\text{…}` (tekstualni režim). */
function tekstTekst(t: string): string {
  const delovi: string[] = [];
  for (const z of t) {
    if (NEVIDLJIVI.test(z)) continue;
    switch (z) {
      case '\\': delovi.push('\\textbackslash{}'); break;
      case '{': case '}': case '#': case '$': case '%': case '&': case '_': delovi.push('\\' + z); break;
      case '^': delovi.push('\\textasciicircum{}'); break;
      case '~': delovi.push('\\textasciitilde{}'); break;
      default: delovi.push(z);
    }
  }
  return delovi.join('');
}

// ---------------------------------------------------------------- svojstva OMML-a

/** `m:val` (sa imenskim prostorom ili bez njega), `null` kad ga nema. */
function val(el: Element | null): string | null {
  if (!el) return null;
  if (el.hasAttributeNS(NS.m, 'val')) return el.getAttributeNS(NS.m, 'val');
  return el.getAttribute('val');
}

/** `CT_OnOff`: element bez `m:val` znači uključeno; nema elementa -> isključeno. */
function ukljuceno(el: Element | null): boolean {
  if (!el) return false;
  const v = val(el);
  return v == null || !['0', 'off', 'false'].includes(v.trim().toLowerCase());
}

/** Element svojstva `<m:{ime}Pr><m:{svojstvo}/>`. */
const svojstvo = (el: Element, pr: string, ime: string): Element | null => {
  const p = dete(el, NS.m, pr);
  return p && dete(p, NS.m, ime);
};

/** Znak iz `CT_Char` svojstva: nema elementa ili atributa -> podrazumevani, `m:val=""` -> prazan. */
function znak(el: Element, pr: string, ime: string, podr: string): string {
  return val(svojstvo(el, pr, ime)) ?? podr;
}

// ---------------------------------------------------------------- tabele preslikavanja

const STILOVI = new Map([['b', '\\mathbf'], ['bi', '\\boldsymbol'], ['p', '\\mathrm']]);
const PISMA = new Map([['double-struck', '\\mathbb'], ['fraktur', '\\mathfrak'], ['script', '\\mathcal']]);

const NARNI = new Map([
  ['∑', '\\sum'], ['∏', '\\prod'], ['∐', '\\coprod'], ['∫', '\\int'], ['∬', '\\iint'], ['∭', '\\iiint'], ['∮', '\\oint'],
  ['⋃', '\\bigcup'], ['⋂', '\\bigcap'], ['⋁', '\\bigvee'], ['⋀', '\\bigwedge'],
]);

const ZAGRADE = new Map([
  ['{', '\\{'], ['}', '\\}'], ['⟨', '\\langle'], ['⟩', '\\rangle'], ['〈', '\\langle'], ['〉', '\\rangle'], ['‖', '\\|'],
  ['⌊', '\\lfloor'], ['⌋', '\\rfloor'], ['⌈', '\\lceil'], ['⌉', '\\rceil'], ['\\', '\\backslash'],
  ['(', '('], [')', ')'], ['[', '['], [']', ']'], ['|', '|'], ['/', '/'], ['', '.'],
]);

const AKCENTI = new Map([
  ['\u0302', '\\hat'], ['\u0303', '\\tilde'], ['\u0307', '\\dot'], ['\u0308', '\\ddot'], ['\u0304', '\\bar'], ['\u0305', '\\bar'],
  ['\u20D7', '\\vec'], ['\u0301', '\\acute'], ['\u0300', '\\grave'], ['\u0306', '\\breve'], ['\u030C', '\\check'],
]);

const FUNKCIJE = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log',
  'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'dim', 'ker', 'Pr', 'hom']);

/** Elementi koji su samo kontejneri argumenata (sadržaj redom). */
const KONTEJNERI = new Set(['oMath', 'e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName', 'box']);

// ---------------------------------------------------------------- obilazak

/** Deca OMML-a koja nose sadržaj: samo `m:*`, bez `*Pr` (uključujući `m:ctrlPr`). */
const sadrzajnaDeca = (el: Element) => Array.from(el.children).filter((d) => d.namespaceURI === NS.m && !d.localName.endsWith('Pr'));

/** Sadržaj kontejnera: deca redom. */
function sadrzaj(el: Element | null, d: number, s: Stanje): string {
  if (!el) return '';
  const delovi: string[] = [];
  for (const c of sadrzajnaDeca(el)) {
    if (s.prekid) break;
    delovi.push(cvor(c, d + 1, s));
  }
  return spoji(delovi);
}

/** Argument (`m:e`, `m:sub`, …) po imenu. */
const arg = (el: Element, ime: string, d: number, s: Stanje) => sadrzaj(dete(el, NS.m, ime), d, s);

/** Samo tekst `m:t` podstabla, iterativno (bez rekurzije), u granicama budžeta. */
function tekstPodstabla(el: Element, s: Stanje): string {
  const delovi: string[] = [];
  const stek: Element[] = [el];
  while (stek.length > 0 && potrosi(s, CENA_ELEMENTA)) {
    const e = stek.pop() as Element;
    if (e.namespaceURI === NS.m && e.localName === 't') {
      const t = e.textContent ?? '';
      if (!potrosi(s, t.length)) break;
      delovi.push(matTekst(t, s));
      continue;
    }
    if (e.namespaceURI === NS.m && e.localName.endsWith('Pr')) continue;
    for (let i = e.children.length - 1; i >= 0; i--) stek.push(e.children[i]);
  }
  return spoji(delovi);
}

/** Osnova indeksa/stepena: tačno jedan znak ostaje, ostalo (i prazno) ide u `{}`. */
function osnova(l: string): string {
  return l.length <= 2 && [...l].length === 1 ? l : `{${l}}`;
}

function cvor(el: Element, d: number, s: Stanje): string {
  if (!potrosi(s, CENA_ELEMENTA)) return '';
  if (d > MAX_DUBINA) {
    s.zaProveru = true;
    return tekstPodstabla(el, s);
  }
  const ime = el.localName;
  if (KONTEJNERI.has(ime)) return sadrzaj(el, d, s);
  switch (ime) {
    case 'r': return deo(el, s);
    case 'f': return razlomak(el, d, s);
    case 'sSub': return `${osnova(arg(el, 'e', d, s))}_{${arg(el, 'sub', d, s)}}`;
    case 'sSup': return `${osnova(arg(el, 'e', d, s))}^{${arg(el, 'sup', d, s)}}`;
    case 'sSubSup': return `${osnova(arg(el, 'e', d, s))}_{${arg(el, 'sub', d, s)}}^{${arg(el, 'sup', d, s)}}`;
    case 'sPre': return spoji([`{}_{${arg(el, 'sub', d, s)}}^{${arg(el, 'sup', d, s)}}`, arg(el, 'e', d, s)]);
    case 'rad': return koren(el, d, s);
    case 'nary': return narni(el, d, s);
    case 'd': return zagrade(el, d, s);
    case 'm': {
      const redovi = deca(el, NS.m, 'mr').map((r) => deca(r, NS.m, 'e').map((c) => sadrzaj(c, d + 1, s)).join('&'));
      return `\\begin{matrix}${redovi.join('\\\\')}\\end{matrix}`;
    }
    case 'eqArr': return `\\begin{aligned}${deca(el, NS.m, 'e').map((c) => sadrzaj(c, d + 1, s)).join('\\\\')}\\end{aligned}`;
    case 'acc': {
      const chr = znak(el, 'accPr', 'chr', '\u0302');
      const k = AKCENTI.get(chr);
      if (!k) s.zaProveru = true;
      return `${k ?? '\\hat'}{${arg(el, 'e', d, s)}}`;
    }
    case 'bar': return `${val(svojstvo(el, 'barPr', 'pos')) === 'top' ? '\\overline' : '\\underline'}{${arg(el, 'e', d, s)}}`;
    case 'func': return funkcija(el, d, s);
    case 'limLow': return `\\underset{${arg(el, 'lim', d, s)}}{${arg(el, 'e', d, s)}}`;
    case 'limUpp': return `\\overset{${arg(el, 'lim', d, s)}}{${arg(el, 'e', d, s)}}`;
    case 'groupChr': return grupniZnak(el, d, s);
    case 'borderBox': return `\\boxed{${arg(el, 'e', d, s)}}`;
    case 'oMathPara': {
      const redovi = deca(el, NS.m, 'oMath').map((o) => cvor(o, d + 1, s)).filter((l) => l !== '');
      return redovi.length > 1 ? `\\begin{gathered}${redovi.join('\\\\')}\\end{gathered}` : (redovi[0] ?? '');
    }
    default:
      s.zaProveru = true;
      return sadrzaj(el, d, s);
  }
}

/** `m:r`: `m:t` sa stilom iz `m:rPr` (`nor` -> `\text`, inače pismo pa stil). Ostala deca (npr. `a:rPr`) se preskaču. */
function deo(el: Element, s: Stanje): string {
  const t = deca(el, NS.m, 't').map((x) => x.textContent ?? '').join('');
  if (!potrosi(s, t.length) || t === '') return '';
  const rPr = dete(el, NS.m, 'rPr');
  if (rPr && ukljuceno(dete(rPr, NS.m, 'nor'))) return `\\text{${tekstTekst(t)}}`;
  const mat = matTekst(t, s);
  if (!mat || !rPr) return mat;
  const omot = PISMA.get(val(dete(rPr, NS.m, 'scr')) ?? '') ?? STILOVI.get(val(dete(rPr, NS.m, 'sty')) ?? '');
  return omot ? `${omot}{${mat}}` : mat;
}

function razlomak(el: Element, d: number, s: Stanje): string {
  const a = arg(el, 'num', d, s);
  const b = arg(el, 'den', d, s);
  switch (val(svojstvo(el, 'fPr', 'type'))) {
    case 'lin': return spoji([a, '/', b]);
    case 'noBar': return `\\genfrac{}{}{0pt}{}{${a}}{${b}}`;
    default: return `\\frac{${a}}{${b}}`;   // bar (podrazumevano) i skw
  }
}

function koren(el: Element, d: number, s: Stanje): string {
  const e = arg(el, 'e', d, s);
  const stepen = ukljuceno(svojstvo(el, 'radPr', 'degHide')) ? '' : arg(el, 'deg', d, s);
  if (!stepen) return `\\sqrt{${e}}`;
  return `\\sqrt[${stepen.includes(']') ? `{${stepen}}` : stepen}]{${e}}`;
}

function narni(el: Element, d: number, s: Stanje): string {
  const chr = znak(el, 'naryPr', 'chr', '∫');
  let op = NARNI.get(chr);
  if (!op) {
    s.zaProveru = true;
    op = `\\mathop{${matTekst(chr, s)}}`;
  }
  const dole = ukljuceno(svojstvo(el, 'naryPr', 'subHide')) ? '' : arg(el, 'sub', d, s);
  const gore = ukljuceno(svojstvo(el, 'naryPr', 'supHide')) ? '' : arg(el, 'sup', d, s);
  return `${op}${dole ? `_{${dole}}` : ''}${gore ? `^{${gore}}` : ''}{${arg(el, 'e', d, s)}}`;
}

function zagrade(el: Element, d: number, s: Stanje): string {
  const beg = znak(el, 'dPr', 'begChr', '(');
  const end = znak(el, 'dPr', 'endChr', ')');
  const sep = znak(el, 'dPr', 'sepChr', '|');
  const sepL = ZAGRADE.get(sep) ?? matTekst(sep, s);
  const unutra: string[] = [];
  deca(el, NS.m, 'e').forEach((c, i) => {
    if (i > 0) unutra.push(sepL);
    unutra.push(sadrzaj(c, d + 1, s));
  });
  // Znak koji LaTeX ne prima kao graničnik: nevidljiva zagrada, a znak ide kao običan simbol pored nje.
  const levo = ZAGRADE.get(beg);
  const desno = ZAGRADE.get(end);
  if (levo === undefined || desno === undefined) s.zaProveru = true;
  return spoji([
    levo === undefined ? matTekst(beg, s) : '', '\\left', levo ?? '.', spoji(unutra),
    '\\right', desno ?? '.', desno === undefined ? matTekst(end, s) : '',
  ]);
}

/** Ime funkcije iz `m:fName` kad je samo tekst jednog od poznatih imena, inače `null`. */
function imeFunkcije(el: Element | null): string | null {
  if (!el) return null;
  const delovi = sadrzajnaDeca(el);
  if (delovi.length === 0 || delovi.some((c) => c.localName !== 'r')) return null;
  const ime = delovi.map((r) => deca(r, NS.m, 't').map((t) => t.textContent ?? '').join('')).join('').trim();
  return FUNKCIJE.has(ime) ? ime : null;
}

function funkcija(el: Element, d: number, s: Stanje): string {
  const fName = dete(el, NS.m, 'fName');
  const e = arg(el, 'e', d, s);
  const ime = imeFunkcije(fName);
  if (ime) return `\\${ime}{${e}}`;
  const deo0 = fName ? sadrzajnaDeca(fName) : [];
  if (deo0.length === 1 && deo0[0].localName === 'limLow') {
    const imeLim = imeFunkcije(dete(deo0[0], NS.m, 'e'));
    if (imeLim) return `\\${imeLim}_{${arg(deo0[0], 'lim', d + 1, s)}}{${e}}`;
  }
  return `\\operatorname{${sadrzaj(fName, d, s)}}{${e}}`;
}

function grupniZnak(el: Element, d: number, s: Stanje): string {
  const chr = znak(el, 'groupChrPr', 'chr', '\u23DF');
  const gore = val(svojstvo(el, 'groupChrPr', 'pos')) === 'top';
  const e = arg(el, 'e', d, s);
  if (chr === '\u23DF' || chr === '\u23DE') return `${chr === '\u23DE' || gore ? '\\overbrace' : '\\underbrace'}{${e}}`;
  return `${gore ? '\\overset' : '\\underset'}{${matTekst(chr, s)}}{${e}}`;
}

// ---------------------------------------------------------------- javne funkcije

/** OMML element (`m:oMath`, `m:oMathPara` ili bilo koji `m:*`) -> LaTeX. */
export function ommlULatex(el: Element): RezultatLatexa {
  const s = novoStanje();
  const latex = cvor(el, 0, s);
  return s.prekid ? { latex: PREDUGO, zaProveru: true } : { latex, zaProveru: s.zaProveru };
}

/**
 * Ceo okvir formule: pasusi (a:p) sa a14:m i/ili a:r; tekst ide u \text{}, više pasusa u gathered.
 * `a:br` i svaki sledeći `m:oMath` iz istog `m:oMathPara` počinju nov red; prazni redovi se izostavljaju.
 */
export function latexOkvira(pasusi: readonly Element[]): RezultatLatexa {
  const s = novoStanje();
  const redovi: string[] = [];
  let red: string[] = [];
  let tekst: string[] = [];
  let sadrzajan = false;
  const zatvoriTekst = () => {
    if (tekst.length === 0) return;
    const t = tekst.join('');
    if (t.trim() !== '') sadrzajan = true;
    red.push(`\\text{${tekstTekst(t)}}`);
    tekst = [];
  };
  const zatvoriRed = () => {
    zatvoriTekst();
    if (sadrzajan) redovi.push(spoji(red));
    red = [];
    sadrzajan = false;
  };
  const formula = (m: Element) => {
    zatvoriTekst();
    const l = cvor(m, 1, s);
    if (l !== '') {
      red.push(l);
      sadrzajan = true;
    }
  };

  for (const p of pasusi) {
    for (const c of Array.from(p.children)) {
      if (!potrosi(s, CENA_ELEMENTA)) break;
      if (c.namespaceURI === NS.a && (c.localName === 'r' || c.localName === 'fld')) {
        const t = dete(c, NS.a, 't')?.textContent ?? '';
        if (potrosi(s, t.length)) tekst.push(t);
      } else if (c.namespaceURI === NS.a && c.localName === 'br') {
        zatvoriRed();
      } else if (c.namespaceURI === NS.a14 && c.localName === 'm') {
        for (const f of Array.from(c.children)) {
          if (f.namespaceURI !== NS.m) continue;
          if (f.localName === 'oMathPara') {
            deca(f, NS.m, 'oMath').forEach((o, i) => {
              if (i > 0) zatvoriRed();
              formula(o);
            });
          } else {
            formula(f);
          }
        }
      }
    }
    zatvoriRed();
  }

  if (s.prekid) return { latex: PREDUGO, zaProveru: true };
  if (redovi.length === 0) return { latex: '\\text{ }', zaProveru: true };
  const latex = redovi.length === 1 ? redovi[0] : `\\begin{gathered}${redovi.join('\\\\')}\\end{gathered}`;
  if (latex.length > MAX_LATEX_OKVIRA) return { latex: PREDUGO, zaProveru: true };
  return { latex, zaProveru: s.zaProveru };
}
