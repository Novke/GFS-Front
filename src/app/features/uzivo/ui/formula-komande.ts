// Jedini spisak komandi LaTeX-a koje se ne crtaju i ne čuvaju (odluka 5a). Bez uvoza: koriste ga i statički prikaz
// (`formula-markup`, sa `mathlive/ssr`) i editor (dijalog i pravila formule, F16), a editor ne sme da uvuče `mathlive/ssr`.

/** Komande koje prave atribute, stil ili link iz LaTeX-a (`\csname htmlStyle\endcsname` sastavlja komandu iz teksta). */
export const KOMANDE_ZABRANJENE: readonly string[] = ['href', 'url', 'style', 'class', 'cssId', 'csname'];
/** Cele porodice: `\html…` (`\htmlClass` je alias za `\class`, `\htmlStyle`, `\htmlId`, `\htmlData`, i buduće). */
export const PORODICE_ZABRANJENE: readonly string[] = ['html'];

/**
 * Komande sa spiskova gore, i zapis `^^` (TeX: `^^5c` je `\`; `\ce` i `\pu` (mhchem) ponovo parsiraju svoj argument, pa
 * bi `\ce{^^5chtmlClass{…}{…}}` sastavio zabranjenu komandu bez nje u izvoru; u ispravnoj formuli `^^` nema smisla).
 * Bez zastavice `g`: `.test` se zove više puta nad istim objektom (sa `g` bi pamtio `lastIndex`).
 * Ovo je samo prvo sito (i poruka korisniku); jedina garancija je sanitizer markup-a (`formula-sanitizer.ts`, sloj c).
 */
export const ZABRANJENE_KOMANDE = new RegExp(
  String.raw`\\(?:${[...PORODICE_ZABRANJENE.map((p) => `${p}[A-Za-z]*`), ...KOMANDE_ZABRANJENE].join('|')})(?![A-Za-z])|\^\^`,
);

/** Spisak za poruku korisniku (dijalog formule), građen iz istih spiskova: `\href, …, \csname, \html…`. */
export const OPIS_ZABRANJENIH_KOMANDI = [
  ...KOMANDE_ZABRANJENE.map((k) => `\\${k}`), ...PORODICE_ZABRANJENE.map((p) => `\\${p}…`),
].join(', ');




/*
 * Strukturni trošak formule (F15 fix 3 i 4), pre MathLive-a. MathLive ugnježdava kroz zagrade (`{…}`, `\bgroup…\egroup`,
 * `\left…\right`, `\begin…\end`), ali i bez njih: argument komande može biti jedan token (`\sqrt\sqrt…x`,
 * `\frac1\frac1…x`) ili opcioni argument u `[…]` (`\xrightarrow[\xrightarrow[…]]{}`), a `validateLatex` takve lance NE
 * odbija. Zato se dubina računa po strukturi: svaka komanda koja gradi strukturu (spisak i broj argumenata iz definicija
 * MathLive 0.111.1, `defineFunction`; `^` i `_` sa jednim argumentom) otvara nivo dok ne pročita svoje argumente, a
 * argument u zagradama ne dodaje još jedan nivo (`\sqrt{x}` je jedan nivo, kao `\sqrt x`). Izmereno u jsdom-u
 * (`latexUMarkup`): lanac korena raste kvadratno (50: 265 ms, 100: 1,3 s), lanac razlomaka takođe (200: 608 ms), a
 * mešavine se sabiraju (32 korena oko 64 razlomka: 444 ms), pa je glavna granica jedna, nad ukupnom dubinom: 32.
 * Rastegljive konstrukcije (koren, `\left…\right`, `pmatrix`/`cases`...) crtaju zagradu ili znak korena visine celog
 * sadržaja, pa jedna u drugoj rastu kvadratno (31 `pmatrix` jedna u drugoj: 309 ms, 32 korena: ~170 ms): njih najviše
 * 16 jedna u drugoj, a redova (`\\`) najviše 100 (16 `\left(` oko matrice od 1500 redova: 14 MB markup-a i 0,65 s same
 * konverzije, pre bilo kakve provere veličine). Uz to, ukupno najviše 32 korena i 200 strukturnih komandi (dugi plitki
 * nizovi, npr. zbir 200 razlomaka). Formula iz nastave ima dubinu do ~6, par desetina takvih komandi i do ~30 redova.
 */
export const MAX_DUBINA_FORMULE = 32;
/** Rastegljive konstrukcije (koren, `\left…\right`, matrica sa zagradama) jedna u drugoj: crtež raste sa visinom sadržaja. */
export const MAX_RASTEGLJIVIH_FORMULE = 16;
export const MAX_KORENA_FORMULE = 32;
/** Redovi (`\\`, `\cr`) u celoj formuli: rastegljiva zagrada ili koren oko visoke matrice crta se visine svih redova. */
export const MAX_REDOVA_FORMULE = 100;
export const MAX_STRUKTURE_FORMULE = 200;

/** Broj obaveznih argumenata strukturnih komandi; `*` iza imena = prima i opcioni argument `[…]`. */
const ARGUMENATA: Record<string, string> = {
  1: 'sqrt* smash* bbox* middle cancel bcancel xcancel ' +
    'boxed phantom vphantom hphantom rlap llap mathrlap mathllap not mathop mathbin mathrel mathopen mathclose mathpunct ' +
    'mathord mathinner operatorname ce pu ang overline underline overbrace underbrace acute grave dot ddot dddot ddddot ' +
    'mathring tilde bar breve check hat vec widehat widecheck widetilde overarc overparen wideparen underarc underparen ' +
    'utilde overrightarrow overleftarrow Overrightarrow overleftharpoon overrightharpoon overleftrightarrow ' +
    'overlinesegment overgroup underrightarrow underleftarrow underleftrightarrow underlinesegment undergroup',
  2: 'frac dfrac tfrac binom dbinom tbinom pdiff cfrac* enclose* stackrel* stackbin* colorbox raisebox raise lower overset ' +
    'underset mathtip texttip overwithdelims atopwithdelims',
  3: 'fcolorbox overunderset',
  4: 'mathchoice',
  6: 'genfrac',
};
const STRUKTURA = new Map<string, { n: number; opcioni: boolean }>();
for (const [n, imena] of Object.entries(ARGUMENATA)) {
  for (const ime of imena.split(' ')) {
    STRUKTURA.set(ime.replace('*', ''), { n: Number(n), opcioni: ime.endsWith('*') });
  }
}
/**
 * Strelice sa natpisom (`\xrightarrow[ispod]{iznad}`, `\xmapsto`, `\longrightarrow` iz mhchem-a, ...): jedan obavezan i
 * opcioni argument. Pravilo umesto 30 imena (sva imena te porodice u MathLive-u mu odgovaraju; `\xi` ne).
 */
const STRELICA_SA_NATPISOM = /^(?:x|long)[A-Za-z]*(?:arrows?|harpoons?(?:up|down)?|equal|mapsto|tofrom)$/;
/** Akcenti teksta bez slova (`\^{a}`, `` \`{a} ``, `\'{a}`, `\.{a}`, `\={a}`, `\~{a}`). */
const AKCENTI_ZNAKOM = '^`\'.=~';

export interface TrosakFormule { dubina: number; rastegljive: number; koreni: number; struktura: number; redovi: number; }

/** Okruženja sa rastegljivim zagradama oko sadržaja. */
const RASTEGLJIVA_OKRUZENJA = new Set('pmatrix bmatrix Bmatrix vmatrix Vmatrix cases dcases rcases'.split(' ').flatMap(
  (o) => [o, `${o}*`],
));

interface Okvir {
  /** `k` = komanda čeka argumente; `g` = grupa `{…}`/`\bgroup` ili `\left…\right`/`\begin…\end`; `o` = opcioni `[…]`. */
  tip: 'k' | 'g' | 'o';
  /** Koliko obaveznih argumenata komanda još čeka. */
  ostalo: number;
  opcioni: boolean;
  /** Čime se grupa zatvara: `}` (i `\egroup`), `right`, `end`. */
  zatvara: string;
  /** Doprinos dubini (argument u zagradama ne dodaje nivo preko svoje komande). */
  nivo: number;
  /** 1 = rastegljiva konstrukcija (broji se i u `rastegljive`). */
  rast: number;
}

/**
 * Trošak LaTeX-a bez MathLive-a (jedan linearan prolaz, bez regexa; staje čim dubina pređe granicu): najveća dubina
 * strukture (zagrade, `\left…\right`, `\begin…\end` i komande koje čekaju argument), broj korena i ukupan broj
 * strukturnih komandi. `\{`, `\}` i `\\` su znakovi; višak zatvaranja se zanemaruje.
 */
export function trosakFormule(latex: string): TrosakFormule {
  const t: TrosakFormule = { dubina: 0, rastegljive: 0, koreni: 0, struktura: 0, redovi: 0 };
  const stek: Okvir[] = [];
  let d = 0;
  let r = 0;
  let preskociToken = false; // graničnik posle `\left`, `\right`, `\middle` je deo te konstrukcije
  const vrh = () => stek[stek.length - 1] as Okvir | undefined;
  const stavi = (o: Omit<Okvir, 'nivo' | 'rast'>, nivo: number, rast = 0) => {
    stek.push({ ...o, nivo, rast });
    d += nivo;
    r += rast;
    if (d > t.dubina) t.dubina = d;
    if (r > t.rastegljive) t.rastegljive = r;
  };
  const skini = () => {
    const o = stek.pop()!;
    d -= o.nivo;
    r -= o.rast;
  };
  // završen token (znak, obična komanda, zatvorena grupa ili komanda sa svim argumentima) je argument komande na vrhu
  const token = () => {
    if (preskociToken) {
      preskociToken = false;
      return;
    }
    for (let v = vrh(); v?.tip === 'k'; v = vrh()) {
      if (--v.ostalo > 0) return;
      skini();
    }
  };
  const zatvori = (zatvara: string) => {
    let i = stek.length - 1;
    while (i >= 0 && !(stek[i].tip === 'g' && stek[i].zatvara === zatvara)) i--;
    if (i < 0) return false;
    while (stek.length > i) skini();
    return true;
  };
  const grupa = (zatvara: string, rast = 0) =>
    stavi({ tip: 'g', ostalo: 0, opcioni: false, zatvara }, vrh()?.tip === 'k' ? 0 : 1, rast);
  const komanda = (n: number, opcioni: boolean, rast = 0) => {
    t.struktura++;
    stavi({ tip: 'k', ostalo: n, opcioni, zatvara: '' }, 1, rast);
  };
  /** Preskače `{ime}` posle `\begin`/`\end` (ime okruženja nije argument); vraća kraj i ime. */
  const preskociIme = (i: number): [number, string] => {
    let j = i;
    while (j < latex.length && latex[j] === ' ') j++;
    if (latex[j] !== '{') return [i, ''];
    const k = latex.indexOf('}', j);
    return k < 0 ? [latex.length, ''] : [k + 1, latex.slice(j + 1, k).trim()];
  };

  for (let i = 0; i < latex.length && t.dubina <= MAX_DUBINA_FORMULE && t.rastegljive <= MAX_RASTEGLJIVIH_FORMULE; i++) {
    const z = latex[i];
    if (z === ' ' || z === '\n' || z === '\t') continue;
    if (z === '{') {
      grupa('}');
    } else if (z === '}') {
      if (zatvori('}')) token();
    } else if (z === '[' && vrh()?.tip === 'k' && vrh()!.opcioni) {
      stavi({ tip: 'o', ostalo: 0, opcioni: false, zatvara: ']' }, 0);
    } else if (z === ']' && vrh()?.tip === 'o') {
      skini();
    } else if (z === '^' || z === '_') {
      komanda(1, false);
    } else if (z === '\\') {
      let j = i + 1;
      while (j < latex.length && slovo(latex.charCodeAt(j))) j++;
      if (j === i + 1) {
        // `\{`, `\}`, `\\`, `\,` ...: jedan znak; akcent znakom (`\^{a}`) je komanda sa jednim argumentom
        if (AKCENTI_ZNAKOM.includes(latex[i + 1] ?? ' ')) komanda(1, false);
        else {
          if (latex[i + 1] === '\\') t.redovi++;
          token();
        }
        i++;
        continue;
      }
      const k = latex.slice(i + 1, j);
      i = j - 1;
      const s = STRUKTURA.get(k) ?? (STRELICA_SA_NATPISOM.test(k) ? { n: 1, opcioni: true } : undefined);
      if (s) {
        if (k === 'sqrt') t.koreni++;
        if (k === 'middle') {
          t.struktura++;
          preskociToken = true;
        } else komanda(s.n, s.opcioni, k === 'sqrt' ? 1 : 0);
      } else if (k === 'bgroup') {
        grupa('}');
      } else if (k === 'egroup') {
        if (zatvori('}')) token();
      } else if (k === 'left') {
        t.struktura++;
        grupa('right', 1);
        preskociToken = true;
      } else if (k === 'right') {
        if (zatvori('right')) {
          preskociToken = false;
          token();
        }
        preskociToken = true;
      } else if (k === 'begin') {
        t.struktura++;
        const [kraj, ime] = preskociIme(j);
        i = kraj - 1;
        grupa('end', RASTEGLJIVA_OKRUZENJA.has(ime) ? 1 : 0);
      } else if (k === 'end') {
        i = preskociIme(j)[0] - 1;
        if (zatvori('end')) token();
      } else if (k === 'cr') {
        t.redovi++;
      } else if (k === 'over' || k === 'atop' || k === 'choose') {
        t.struktura++; // infiks: deli grupu u kojoj je, ne otvara nivo
      } else {
        token();
      }
    } else {
      token();
    }
  }
  return t;
}

const slovo = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Formula preko neke granice troška: ne crta se (izvor), dijalog je ne čuva. */
export function preTeskaFormula(latex: string): boolean {
  const t = trosakFormule(latex);
  return t.dubina > MAX_DUBINA_FORMULE || t.rastegljive > MAX_RASTEGLJIVIH_FORMULE || t.koreni > MAX_KORENA_FORMULE
    || t.struktura > MAX_STRUKTURE_FORMULE || t.redovi > MAX_REDOVA_FORMULE;
}
