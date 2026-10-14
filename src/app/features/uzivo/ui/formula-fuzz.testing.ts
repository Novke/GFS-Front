// Generator nasumičnih formula za proveru strukturnog troška (F15 fix 4): kombinacije konstrukcija koje grade strukturu,
// sa zagradama i bez njih (argument od jednog tokena), ugnježdene, u lancima i nizovima, do 5000 znakova. Fiksan seed:
// isti niz formula u svakom pokretanju. Koriste ga `formula-markup.spec.ts` (mali uzorak, CI) i lokalna proba (veći).

/** Mulberry32: mali deterministički generator u [0, 1). */
export function slucajni(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATOMI = ['x', '1', 'a+b', '\\alpha', '2', 'y', '\\pi', 'n'];

/** Konstrukcije; `X` i `Y` su mesta za podformulu (sa zagradama ili kao jedan token, kako ih konstrukcija piše). */
const KONSTRUKCIJE: readonly string[] = [
  '\\sqrt{X}', '\\sqrt X', '\\sqrt[3]{X}', '\\sqrt\\bgroup X\\egroup',
  '\\frac{X}{Y}', '\\frac1X', '\\dfrac{X}{Y}', '\\tfrac XY', '\\cfrac{X}{Y}', '\\binom{X}{Y}', '\\binom1X',
  '{X\\over Y}', '{X\\atop Y}', '{X\\choose Y}', '\\genfrac(){0pt}{0}{X}{Y}',
  'X^{Y}', 'X_{Y}', '{X}^{Y}_{Y}', 'X^2', 'X_1',
  '\\left(X\\right)', '\\left[X\\middle|Y\\right]', '\\begin{pmatrix}X&Y\\\\Y&X\\end{pmatrix}', '\\begin{cases}X&Y\\end{cases}',
  '\\overline{X}', '\\overline X', '\\underline{X}', '\\hat X', '\\vec{X}', '\\widehat{X}', '\\tilde X',
  '\\overbrace{X}^{Y}', '\\underbrace X_Y', '\\overset{X}{Y}', '\\underset XY', '\\stackrel XY',
  '\\overrightarrow{X}', '\\xrightarrow[X]{Y}', '\\xleftarrow X',
  '\\enclose{circle}{X}', '\\enclose{updiagonalarrow}{X}', '\\boxed{X}', '\\boxed X', '\\cancel X', '\\phantom X',
  '\\bgroup X\\egroup', '{X}', '\\mathbf{X}', '\\text{a}X', '\\operatorname{f}X', '\\not X', '\\ce{H2O}X',
];

function podformula(rnd: () => number, dubina: number): string {
  if (dubina <= 0 || rnd() < 0.15) return ATOMI[Math.floor(rnd() * ATOMI.length)];
  const k = KONSTRUKCIJE[Math.floor(rnd() * KONSTRUKCIJE.length)];
  return k.replace(/[XY]/g, () => podformula(rnd, dubina - 1));
}

const OKRUZENJA = ['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'cases'];

/** Široka ili visoka matrica (F15 rr4 a): do 30 redova i 2500 kolona, ćelije su atomi ili male podformule. */
function sirokaMatrica(rnd: () => number): string {
  const okruzenje = OKRUZENJA[Math.floor(rnd() * OKRUZENJA.length)];
  const redova = 1 + Math.floor(rnd() * 30);
  const kolona = 1 + Math.floor(rnd() ** 2 * 2500);
  const celija = () => (rnd() < 0.8 ? ATOMI[Math.floor(rnd() * ATOMI.length)] : podformula(rnd, 2));
  let l = `\\begin{${okruzenje}}`;
  for (let r = 0; r < redova && l.length < 4900; r++) {
    if (r) l += '\\\\';
    for (let k = 0; k < kolona && l.length < 4900; k++) l += (k ? '&' : '') + celija();
  }
  return l + `\\end{${okruzenje}}`;
}

/**
 * Jedna formula: mešani lanac do ~34 nivoa (najteže što prolazi proveru), lanac iste konstrukcije do 400 puta (najgori
 * slučaj ugnježdavanja), nasumično stablo zadate dubine, zbir više stabala (dugo, ali plitko) ili široka matrica (do 2500
 * kolona). Uvek <= 5000 znakova.
 */
export function nasumicnaFormula(rnd: () => number): string {
  const nacin = rnd();
  let l: string;
  if (nacin < 0.15) {
    l = sirokaMatrica(rnd);
  } else if (nacin < 0.35) {
    // mešani lanac do granice dubine: najteži oblik koji prolazi proveru
    const n = 1 + Math.floor(rnd() * 34);
    l = 'x';
    for (let i = 0; i < n && l.length < 5000; i++) {
      const k = KONSTRUKCIJE[Math.floor(rnd() * KONSTRUKCIJE.length)];
      const prvi = k.search(/[XY]/);
      l = k.replace(/[XY]/g, (_, j: number) => (j === prvi ? l : ATOMI[Math.floor(rnd() * ATOMI.length)]));
    }
  } else if (nacin < 0.55) {
    const k = KONSTRUKCIJE[Math.floor(rnd() * KONSTRUKCIJE.length)];
    const n = 1 + Math.floor(rnd() * 400);
    l = 'x';
    for (let i = 0; i < n && l.length < 5000; i++) l = k.replace(/[XY]/g, (_, j: number) => (j === k.search(/[XY]/) ? l : 'x'));
  } else if (nacin < 0.8) {
    l = podformula(rnd, 2 + Math.floor(rnd() * 30));
  } else {
    l = '';
    const n = 1 + Math.floor(rnd() * 200);
    for (let i = 0; i < n && l.length < 5000; i++) l += (i ? '+' : '') + podformula(rnd, 1 + Math.floor(rnd() * 6));
  }
  return l.length > 5000 ? l.slice(0, 5000) : l;
}

/** `n` formula iz istog seed-a. */
export function nasumicneFormule(seed: number, n: number): string[] {
  const rnd = slucajni(seed);
  return Array.from({ length: n }, () => nasumicnaFormula(rnd));
}
