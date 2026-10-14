// Nasleđivanje u PPTX-u: placeholder slajda -> layout -> master (položaj, bodyPr) i lanac stilova teksta
// (lstStyle oblika, layouta i mastera, txStyles mastera, defaultTextStyle prezentacije). Bez Angular-a.
import type { KontekstSlajda, Kutija } from './tipovi';
import { brojAtr, dete, NS } from './xml';

/** `tip` bez atributa `type` je `obj`; `idx` je niz iz XML-a (bez atributa `null`). */
export interface Placeholder { tip: string; idx: string | null; }

/** `p:ph` iz `p:nv*Pr/p:nvPr` oblika (`p:sp`, `p:pic`, `p:graphicFrame`, `p:cxnSp`, `p:grpSp`), ili `null`. */
function phElement(oblik: Element): Element | null {
  for (const nv of Array.from(oblik.children)) {
    if (nv.namespaceURI !== NS.p || !nv.localName.startsWith('nv')) continue;
    const nvPr = dete(nv, NS.p, 'nvPr');
    return nvPr ? dete(nvPr, NS.p, 'ph') : null;
  }
  return null;
}

export function placeholderOblika(sp: Element): Placeholder | null {
  const ph = phElement(sp);
  if (!ph) return null;
  const tip = ph.getAttribute('type')?.trim() || 'obj';
  const idx = ph.getAttribute('idx')?.trim();
  return { tip, idx: idx ? idx : null };
}

/** Placeholderi `p:cSld` dela (layout ili master), redom dokumenta. */
function placeholderi(doc: Document | null): { el: Element; ph: Placeholder }[] {
  const cSld = doc?.documentElement ? dete(doc.documentElement, NS.p, 'cSld') : null;
  if (!cSld) return [];
  const rezultat: { el: Element; ph: Placeholder }[] = [];
  for (const ph of Array.from(cSld.getElementsByTagNameNS(NS.p, 'ph'))) {
    const oblik = ph.parentElement?.parentElement?.parentElement;
    if (!oblik || phElement(oblik) !== ph) continue;
    const p = placeholderOblika(oblik);
    if (p) rezultat.push({ el: oblik, ph: p });
  }
  return rezultat;
}

/** Klasa za poklapanje sa layoutom: `ctrTitle` = `title`, `body` = `obj`. */
const klasaLayouta = (tip: string) => (tip === 'ctrTitle' ? 'title' : tip === 'body' ? 'obj' : tip);

/** Placeholder mastera za tip: naslovi -> `title`; datum, podnožje, broj i zaglavlje -> isti; ostalo -> `body`. */
function klasaMastera(tip: string): string {
  if (tip === 'title' || tip === 'ctrTitle') return 'title';
  if (tip === 'dt' || tip === 'ftr' || tip === 'sldNum' || tip === 'hdr') return tip;
  return 'body';
}

/**
 * Generički placeholder sadržaja sa `idx` (npr. `<p:ph idx="7"/>`) se vezuje samo po `idx`: layout obično ima više
 * placeholdera sadržaja, pa bi "isti tip" bio pogađanje. Bez para ostaje "siroče" (položaj samo iz sopstvenog xfrm-a).
 */
const samoPoIdx = (ph: Placeholder) => ph.idx !== null && klasaMastera(ph.tip) === 'body';

/** Placeholder layouta: prvo isti `idx` (kad ga slajd ima), pa isti tip (`ctrTitle`~`title`, `obj`~`body`). */
export function nadjiULayoutu(ph: Placeholder, layout: Document | null): Element | null {
  const kandidati = placeholderi(layout);
  if (ph.idx !== null) {
    const poIdx = kandidati.find((k) => k.ph.idx === ph.idx);
    if (poIdx) return poIdx.el;
    if (samoPoIdx(ph)) return null;
  }
  const klasa = klasaLayouta(ph.tip);
  return kandidati.find((k) => klasaLayouta(k.ph.tip) === klasa)?.el ?? null;
}

/** Placeholder mastera po tipu: `title`/`ctrTitle` -> `title`; `body`, `obj`, `subTitle`, ... -> `body`; `dt`/`ftr`/`sldNum` -> isti. */
export function nadjiUMasteru(ph: Placeholder, master: Document | null): Element | null {
  const klasa = klasaMastera(ph.tip);
  const kandidati = placeholderi(master);
  return (kandidati.find((k) => k.ph.tip === klasa) ?? kandidati.find((k) => klasaMastera(k.ph.tip) === klasa))?.el ?? null;
}

/**
 * Lanac nasleđivanja oblika, najjači prvi: `[sp, placeholder layouta, placeholder mastera]` bez `null`-ova. Master se
 * traži po placeholderu layouta; kad para u layoutu nema, po placeholderu slajda (osim "siročeta" sadržaja sa `idx`).
 * Oblik koji nije placeholder -> `[sp]`.
 */
export function lanacPlaceholdera(sp: Element, ctx: KontekstSlajda): Element[] {
  const ph = placeholderOblika(sp);
  if (!ph) return [sp];
  const lanac = [sp];
  const uLayoutu = nadjiULayoutu(ph, ctx.layout?.doc ?? null);
  if (uLayoutu) lanac.push(uLayoutu);
  const zaMaster = uLayoutu ? placeholderOblika(uLayoutu) : samoPoIdx(ph) ? null : ph;
  const uMasteru = zaMaster ? nadjiUMasteru(zaMaster, ctx.master?.doc ?? null) : null;
  if (uMasteru) lanac.push(uMasteru);
  return lanac;
}

/** `a:xfrm` iz `p:spPr`/`p:grpSpPr`, ili `p:xfrm` okvira (`p:graphicFrame`). */
function xfrmOblika(el: Element): Element | null {
  const spPr = dete(el, NS.p, 'spPr') ?? dete(el, NS.p, 'grpSpPr');
  return (spPr && dete(spPr, NS.a, 'xfrm')) ?? dete(el, NS.p, 'xfrm');
}

/** Prvi `xfrm` sa `a:ext` u lancu (EMU, `rot` u stepenima); nema ga -> `null` (pozivalac preskače uz upozorenje). */
export function kutijaIzLanca(lanac: Element[]): Kutija | null {
  for (const el of lanac) {
    const xfrm = xfrmOblika(el);
    const ext = xfrm && dete(xfrm, NS.a, 'ext');
    if (!xfrm || !ext) continue;
    const off = dete(xfrm, NS.a, 'off');
    return {
      x: brojAtr(off, 'x', 0), y: brojAtr(off, 'y', 0),
      w: brojAtr(ext, 'cx', 0), h: brojAtr(ext, 'cy', 0),
      rot: brojAtr(xfrm, 'rot', 0) / 60000,
    };
  }
  return null;
}

export type VrstaTeksta = 'naslov' | 'telo' | 'ostalo';

/** `title`/`ctrTitle` -> naslov; ostali placeholderi -> telo; oblik koji nije placeholder (i ćelija tabele) -> ostalo. */
export function vrstaTeksta(ph: Placeholder | null): VrstaTeksta {
  if (!ph) return 'ostalo';
  return ph.tip === 'title' || ph.tip === 'ctrTitle' ? 'naslov' : 'telo';
}

/** `a:lstStyle` iz `p:txBody`/`a:txBody` elementa (ili samog `txBody`). */
function lstStyle(el: Element): Element | null {
  const tx = el.localName === 'txBody' ? el : dete(el, NS.p, 'txBody') ?? dete(el, NS.a, 'txBody');
  return tx && dete(tx, NS.a, 'lstStyle');
}

function bodyPr(el: Element): Element | null {
  const tx = el.localName === 'txBody' ? el : dete(el, NS.p, 'txBody') ?? dete(el, NS.a, 'txBody');
  return tx && dete(tx, NS.a, 'bodyPr');
}

/**
 * Stilovi nivoa `nivo` (= `lvl`, 0..8; koristi se `a:lvl{nivo+1}pPr`), najjači prvi. Naslov i telo: `lstStyle` svakog
 * člana lanca, `p:titleStyle`/`p:bodyStyle` mastera, `defaultTextStyle`. Ostalo: `lstStyle` oblika, `defaultTextStyle`
 * (odluka 8: `otherStyle` mastera se ne koristi). Izvori bez tog nivoa se preskaču.
 */
export function stiloviNivoa(lanac: Element[], vrsta: VrstaTeksta, ctx: KontekstSlajda, nivo: number): Element[] {
  const n = Number.isFinite(nivo) ? Math.min(8, Math.max(0, Math.trunc(nivo))) + 1 : 1;
  const izvori: (Element | null)[] = [];
  if (vrsta === 'ostalo') {
    izvori.push(lanac.length > 0 ? lstStyle(lanac[0]) : null);
  } else {
    for (const el of lanac) izvori.push(lstStyle(el));
    const koren = ctx.master?.doc.documentElement;
    const txStyles = koren ? dete(koren, NS.p, 'txStyles') : null;
    izvori.push(txStyles && dete(txStyles, NS.p, vrsta === 'naslov' ? 'titleStyle' : 'bodyStyle'));
  }
  izvori.push(ctx.defaultTextStyle);
  const nivoi: Element[] = [];
  for (const izvor of izvori) {
    const lvl = izvor && dete(izvor, NS.a, `lvl${n}pPr`);
    if (lvl) nivoi.push(lvl);
  }
  return nivoi;
}

type Razmak = { pct: number } | { pts: number };

export interface RazresenPPr {
  /** `null` = levo. */
  algn: string | null;
  marL: number;
  indent: number;
  defTabSz: number;
  lnSpc: Razmak | null;
  spcBef: Razmak | null;
  spcAft: Razmak | null;
  /** `font` `null` = kao tekst (`buFontTx` ili nema); `boja` je `a:buClr` (roditelj elementa boje), `null` = kao tekst. */
  bu: { vrsta: 'nema' }
    | { vrsta: 'znak'; znak: string; font: string | null; boja: Element | null }
    | { vrsta: 'broj'; sema: string; pocetak: number; boja: Element | null };
  /** `poz` u EMU, `algn` `l`/`ctr`/`r`/`dec`. */
  tabovi: { poz: number; algn: string }[];
  /** Veličina znaka liste: `buSzPct` (1/1000 %) ili `buSzPts` (stotinke pt); `null` = kao tekst (`buSzTx` ili nema). */
  velicinaZnaka: { pct: number } | { pts: number } | null;
}

export interface RazresenRPr {
  sz: number | null;
  b: boolean;
  i: boolean;
  u: boolean;
  strike: boolean;
  /** U 1/1000 %. */
  baseline: number;
  cap: 'none' | 'all' | 'small';
  latin: string | null;
  /** Roditelj elementa boje: `a:solidFill`, `a:gs` (prvi u `a:gradFill`) ili `a:fgClr` (`a:pattFill`). */
  boja: Element | null;
  /** `a:noFill`: tekst se ne vidi. */
  bezBoje: boolean;
  /** `a:effectLst/a:outerShdw`. */
  senka: Element | null;
}

export interface RazresenBodyPr {
  lIns: number; tIns: number; rIns: number; bIns: number;
  anchor: string; wrap: boolean; vert: string; numCol: number;
  fontScale: number; lnSpcReduction: number;
}

const neNull = <T>(x: T | null | undefined): x is T => x != null;

/** Prva neprazna vrednost atributa u izvorima. */
function atribut(izvori: Element[], ime: string): string | null {
  for (const e of izvori) {
    const v = e.getAttribute(ime)?.trim();
    if (v) return v;
  }
  return null;
}

/** Prvi ispravan broj iz atributa u izvorima. */
function brojIz(izvori: Element[], ime: string, podr: number): number {
  for (const e of izvori) {
    const n = brojAtr(e, ime, Number.NaN);
    if (Number.isFinite(n)) return n;
  }
  return podr;
}

function razmak(izvori: Element[], ime: string): Razmak | null {
  for (const e of izvori) {
    const r = dete(e, NS.a, ime);
    if (!r) continue;
    const pct = dete(r, NS.a, 'spcPct');
    if (pct) return { pct: brojAtr(pct, 'val', 100000) };
    const pts = dete(r, NS.a, 'spcPts');
    if (pts) return { pts: brojAtr(pts, 'val', 0) };
  }
  return null;
}

/** Prvi izvor koji ima neko od dece `imena`: vraća to dete (ili `null` kad ga nema nigde). */
function prvoDete(izvori: Element[], imena: readonly string[]): Element | null {
  for (const e of izvori) {
    for (const d of Array.from(e.children)) {
      if (d.namespaceURI === NS.a && imena.includes(d.localName)) return d;
    }
  }
  return null;
}

/**
 * Svojstva pasusa: svaki atribut i dete prvo iz `pPr` pasusa, pa redom iz `nivoi` (`stiloviNivoa`). Lista: `buNone`
 * prekida, `buChar`/`buAutoNum` (prvi koji se nađe; `buBlip` kao znak `•`); `buFont`/`buClr` se traže nezavisno istim
 * lancem (`buFontTx`/`buClrTx` = kao tekst).
 */
export function razresiPPr(pPr: Element | null, nivoi: Element[]): RazresenPPr {
  const izvori = [pPr, ...nivoi].filter(neNull);

  const font = prvoDete(izvori, ['buFont', 'buFontTx']);
  const bojaListe = prvoDete(izvori, ['buClr', 'buClrTx']);
  const fontListe = font?.localName === 'buFont' ? font.getAttribute('typeface')?.trim() || null : null;
  const boja = bojaListe?.localName === 'buClr' ? bojaListe : null;

  let bu: RazresenPPr['bu'] = { vrsta: 'nema' };
  const vrstaListe = prvoDete(izvori, ['buNone', 'buChar', 'buAutoNum', 'buBlip']);
  if (vrstaListe?.localName === 'buChar') {
    bu = { vrsta: 'znak', znak: vrstaListe.getAttribute('char') || '•', font: fontListe, boja };
  } else if (vrstaListe?.localName === 'buBlip') {
    bu = { vrsta: 'znak', znak: '•', font: null, boja };
  } else if (vrstaListe?.localName === 'buAutoNum') {
    bu = {
      vrsta: 'broj', sema: vrstaListe.getAttribute('type')?.trim() || 'arabicPeriod',
      pocetak: Math.max(1, Math.trunc(brojAtr(vrstaListe, 'startAt', 1))), boja,
    };
  }

  const buSz = prvoDete(izvori, ['buSzPct', 'buSzPts', 'buSzTx']);
  const velicinaZnaka = buSz?.localName === 'buSzPct' ? { pct: brojAtr(buSz, 'val', 100000) }
    : buSz?.localName === 'buSzPts' ? { pts: brojAtr(buSz, 'val', 0) } : null;

  const tabLst = prvoDete(izvori, ['tabLst']);
  const tabovi = tabLst
    ? Array.from(tabLst.children)
      .filter((t) => t.namespaceURI === NS.a && t.localName === 'tab')
      .map((t) => ({ poz: brojAtr(t, 'pos', 0), algn: t.getAttribute('algn')?.trim() || 'l' }))
    : [];

  return {
    algn: atribut(izvori, 'algn'),
    marL: brojIz(izvori, 'marL', 0),
    indent: brojIz(izvori, 'indent', 0),
    defTabSz: brojIz(izvori, 'defTabSz', 457200),
    lnSpc: razmak(izvori, 'lnSpc'),
    spcBef: razmak(izvori, 'spcBef'),
    spcAft: razmak(izvori, 'spcAft'),
    bu,
    tabovi,
    velicinaZnaka,
  };
}

const istina = (v: string | null) => v === '1' || v === 'true';
const POPUNE = ['solidFill', 'gradFill', 'noFill', 'pattFill'] as const;

/**
 * Svojstva dela teksta: `rPr` dela -> `pPr/a:defRPr` -> `a:defRPr` iz `nivoi`. Boja: prva popuna u lancu (`solidFill`,
 * `gradFill` -> prvi `gs`, `pattFill` -> `fgClr`, `noFill` -> `bezBoje`); `blipFill`/`grpFill` se preskaču.
 */
export function razresiRPr(rPr: Element | null, pPrDefRPr: Element | null, nivoi: Element[]): RazresenRPr {
  const izvori = [rPr, pPrDefRPr, ...nivoi.map((n) => dete(n, NS.a, 'defRPr'))].filter(neNull);

  const popuna = prvoDete(izvori, POPUNE);
  let boja: Element | null = null;
  if (popuna?.localName === 'solidFill') boja = popuna;
  else if (popuna?.localName === 'gradFill') {
    const gsLst = dete(popuna, NS.a, 'gsLst');
    boja = gsLst && dete(gsLst, NS.a, 'gs');
  } else if (popuna?.localName === 'pattFill') boja = dete(popuna, NS.a, 'fgClr');

  let latin: string | null = null;
  for (const e of izvori) {
    const t = dete(e, NS.a, 'latin')?.getAttribute('typeface')?.trim();
    if (t) {
      latin = t;
      break;
    }
  }

  const efekti = prvoDete(izvori, ['effectLst']);
  const u = atribut(izvori, 'u');
  const strike = atribut(izvori, 'strike');
  const cap = atribut(izvori, 'cap');
  const sz = brojIz(izvori, 'sz', Number.NaN);
  return {
    sz: Number.isFinite(sz) ? sz : null,
    b: istina(atribut(izvori, 'b')),
    i: istina(atribut(izvori, 'i')),
    u: u !== null && u !== 'none',
    strike: strike !== null && strike !== 'noStrike',
    baseline: brojIz(izvori, 'baseline', 0),
    cap: cap === 'all' || cap === 'small' ? cap : 'none',
    latin,
    boja,
    bezBoje: popuna?.localName === 'noFill',
    senka: efekti ? dete(efekti, NS.a, 'outerShdw') : null,
  };
}

/**
 * Svojstva okvira teksta: svaki atribut od `bodyPr` oblika ka placeholderu layouta i mastera; `normAutofit@fontScale`
 * i `@lnSpcReduction` samo iz sopstvenog `bodyPr` (PowerPoint ih računa za sadržaj tog oblika).
 */
export function razresiBodyPr(lanac: Element[]): RazresenBodyPr {
  const izvori = lanac.map(bodyPr).filter(neNull);
  const sopstveni = lanac.length > 0 ? bodyPr(lanac[0]) : null;
  const autofit = sopstveni && dete(sopstveni, NS.a, 'normAutofit');
  return {
    lIns: brojIz(izvori, 'lIns', 91440),
    tIns: brojIz(izvori, 'tIns', 45720),
    rIns: brojIz(izvori, 'rIns', 91440),
    bIns: brojIz(izvori, 'bIns', 45720),
    anchor: atribut(izvori, 'anchor') ?? 't',
    wrap: atribut(izvori, 'wrap') !== 'none',
    vert: atribut(izvori, 'vert') ?? 'horz',
    numCol: Math.max(1, Math.trunc(brojIz(izvori, 'numCol', 1))),
    fontScale: brojAtr(autofit, 'fontScale', 100000),
    lnSpcReduction: brojAtr(autofit, 'lnSpcReduction', 0),
  };
}
