// Oblici PPTX-a (p:sp sa prstGeom, p:cxnSp) u OBLIK slojeve platna: geometrija, linije i strelice, popuna, ivica i senka.
// popunaIz/ivicaIz/senkaIz koriste i slike, tekst i tabele. Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { Crtica, Ivica, OblikSloj, Senka, Tacka, VrstaOblika } from '../data-access/platno.models';
import type { KodUpozorenja } from './izvestaj';
import { senkaIzEfekta } from './tekst';
import { bojaIz, pomesaj, type Boja, type KontekstBoja } from './tema';
import { EMU_PO_PT, uSloj, zaokruzi, type KontekstSlajda, type Kutija } from './tipovi';
import { brojAtr, dete, NS } from './xml';

/** Granice iz `PlatnoPP` (server odbija dokument van njih). */
const MIN_DEBLJINA = 0.25;
const MAX_DEBLJINA = 20;
/** `a:ln` bez `w`: 9525 EMU = 0,75 pt (ECMA-376). */
const PODRAZUMEVANA_DEBLJINA_EMU = 9525;
const MAX_NAZIV = 60;

/** `prstGeom@prst` -> vrsta oblika platna. Ostale geometrije i `custGeom` nisu podržane (`pretvoriOblik` -> `null`). */
export const GEOMETRIJE: Readonly<Record<string, VrstaOblika>> = Object.freeze({
  rect: 'PRAVOUGAONIK',
  roundRect: 'ZAOBLJENI_PRAVOUGAONIK',
  ellipse: 'ELIPSA',
  triangle: 'TROUGAO',
  line: 'LINIJA',
  straightConnector1: 'LINIJA',
  bentConnector2: 'LINIJA', bentConnector3: 'LINIJA', bentConnector4: 'LINIJA', bentConnector5: 'LINIJA',
  curvedConnector2: 'LINIJA', curvedConnector3: 'LINIJA', curvedConnector4: 'LINIJA', curvedConnector5: 'LINIJA',
  rightArrow: 'STRELICA', leftArrow: 'STRELICA', upArrow: 'STRELICA', downArrow: 'STRELICA',
  leftRightArrow: 'DVOSTRUKA_STRELICA', upDownArrow: 'DVOSTRUKA_STRELICA',
});

const IZLOMLJENI = /^(bent|curved)Connector[2-5]$/;
const BLOK_STRELICE = new Set(['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow']);

const ISPREKIDANE = new Set(['dash', 'lgDash', 'sysDash', 'dashDot', 'lgDashDot', 'lgDashDotDot', 'sysDashDot', 'sysDashDotDot']);
const TACKASTE = new Set(['dot', 'sysDot']);

const POPUNE = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']);
const NEPRENESENI_EFEKTI = ['glow', 'softEdge', 'reflection', 'innerShdw', 'prstShdw'];

const ogranici = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** Poruke već prijavljene po slajdu (jednom po slajdu za istu pojavu, kroz sve oblike i slike). */
const prijavljeno = new WeakMap<KontekstSlajda, Set<string>>();

/** Upozorenje koje se za isti slajd prijavljuje samo jednom (ista poruka). */
export function upozoriJednom(ctx: KontekstSlajda, kod: KodUpozorenja, poruka: string): void {
  let skup = prijavljeno.get(ctx);
  if (!skup) prijavljeno.set(ctx, (skup = new Set()));
  const kljuc = `${kod}|${poruka}`;
  if (skup.has(kljuc)) return;
  skup.add(kljuc);
  ctx.upozori(kod, poruka);
}

const kb = (ctx: KontekstSlajda): KontekstBoja => ({ tema: ctx.tema, mapaBoja: ctx.mapaBoja });

/** `tx1` preko mape boja (podrazumevana boja linije bez ivice). */
export function bojaTx1(ctx: KontekstSlajda): string {
  return ctx.tema.boje[ctx.mapaBoja['tx1'] ?? 'dk1'] ?? '#000000';
}

/** `cNvPr@name` oblika (`p:nv*Pr/p:cNvPr`), najviše 60 znakova; prazno -> `null`. */
export function nazivOblika(el: Element): string | null {
  for (const nv of Array.from(el.children)) {
    if (nv.namespaceURI !== NS.p || !nv.localName.startsWith('nv')) continue;
    const ime = dete(nv, NS.p, 'cNvPr')?.getAttribute('name')?.trim() ?? '';
    return ime === '' ? null : Array.from(ime).slice(0, MAX_NAZIV).join('');
  }
  return null;
}

/** Rotacija u (-360, 360) (server prima [-360, 360]), bez `-0`. */
export function rotacijaSloja(r: number): number {
  return zaokruzi(r % 360) || 0;
}

/** `a:xfrm` oblika iz sopstvenog `spPr` (flip se čita samo odatle). */
function xfrmOblika(el: Element): Element | null {
  const spPr = dete(el, NS.p, 'spPr');
  return spPr && dete(spPr, NS.a, 'xfrm');
}

const daLi = (v: string | null | undefined) => v === '1' || v === 'true';

/** `flipH`/`flipV` sa `a:xfrm` oblika. */
export function okrenut(el: Element): { h: boolean; v: boolean } {
  const x = xfrmOblika(el);
  return { h: daLi(x?.getAttribute('flipH')), v: daLi(x?.getAttribute('flipV')) };
}

/** Prvi element popune (`noFill|solidFill|gradFill|blipFill|pattFill|grpFill`) među decom, ili `null`. */
export function elementPopune(el: Element | null): Element | null {
  if (!el) return null;
  return Array.from(el.children).find((d) => d.namespaceURI === NS.a && POPUNE.has(d.localName)) ?? null;
}

/**
 * Boja elementa popune (bez mešanja sa pozadinom): `solidFill` -> boja, `gradFill` -> prvi `a:gs`, `pattFill` -> `fgClr`
 * (oba uz `OBLIK_PRIBLIZAN`), `blipFill` -> `null` uz `OBLIK_PRIBLIZAN`, ostalo -> `null`. `gde` = "u popuni oblika", ...
 */
export function bojaPopune(f: Element, ctx: KontekstSlajda, gde: string): Boja | null {
  switch (f.localName) {
    case 'solidFill':
      return bojaIz(f, kb(ctx));
    case 'gradFill': {
      upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', `Prelaz boja ${gde} je zamenjen prvom bojom prelaza.`);
      const lista = dete(f, NS.a, 'gsLst');
      return bojaIz(lista && dete(lista, NS.a, 'gs'), kb(ctx));
    }
    case 'pattFill':
      upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', `Šara ${gde} je zamenjena bojom šare.`);
      return bojaIz(dete(f, NS.a, 'fgClr'), kb(ctx));
    case 'blipFill':
      upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', `Popuna slikom ${gde} nije podržana i izostavljena je.`);
      return null;
    default:
      return null;
  }
}

/** `a:fillRef`/`a:lnRef` stila oblika sa `idx > 0`, ili `null` (`idx="0"` = bez popune odnosno linije). */
function referenca(stil: Element | null | undefined, ime: 'fillRef' | 'lnRef'): Element | null {
  const r = stil ? dete(stil, NS.a, ime) : null;
  return r && brojAtr(r, 'idx', 0) > 0 ? r : null;
}

/**
 * Popuna oblika kao `#RRGGBB` (alfa pomešana sa pozadinom slajda) ili `null` (bez popune). Sopstvena popuna iz `spPr`
 * je jača od stila; bez nje `p:style/a:fillRef` sa `idx > 0` daje boju deteta (`phClr` teme = ta boja). `grpFill` ->
 * `ctx.popunaGrupe`. `stil` = `p:style` oblika.
 */
export function popunaIz(spPr: Element | null, ctx: KontekstSlajda, stil?: Element | null): string | null {
  const f = elementPopune(spPr);
  if (f) {
    if (f.localName === 'grpFill') return ctx.popunaGrupe ?? null;
    const b = bojaPopune(f, ctx, 'u popuni oblika');
    return b ? pomesaj(b, ctx.pozadina) : null;
  }
  const ref = referenca(stil, 'fillRef');
  const b = ref ? bojaIz(ref, kb(ctx)) : null;
  return b ? pomesaj(b, ctx.pozadina) : null;
}

function crticaIz(ln: Element | null): Crtica {
  if (!ln) return 'PUNA';
  if (dete(ln, NS.a, 'custDash')) return 'ISPREKIDANA';
  const v = dete(ln, NS.a, 'prstDash')?.getAttribute('val') ?? '';
  return ISPREKIDANE.has(v) ? 'ISPREKIDANA' : TACKASTE.has(v) ? 'TACKASTA' : 'PUNA';
}

/** Zajedničko za `ivicaIz` i linije: `podrazumevanaBoja` se koristi kad ni `a:ln` ni `lnRef` ne daju boju. */
function ivica(ln: Element | null, ctx: KontekstSlajda, stil: Element | null | undefined, podrazumevanaBoja: string | null): Ivica | null {
  const ref = referenca(stil, 'lnRef');
  const f = elementPopune(ln);
  if (f?.localName === 'noFill') return null;
  if (!ln && !ref && !podrazumevanaBoja) return null;

  let b = f ? bojaPopune(f, ctx, 'u liniji oblika') : null;
  if (!b && ref) b = bojaIz(ref, kb(ctx));
  const boja = b ? pomesaj(b, ctx.pozadina) : podrazumevanaBoja;
  if (!boja) return null;

  const w = brojAtr(ln, 'w', NaN);
  const izStila = ref ? ctx.tema.debljineLinija[brojAtr(ref, 'idx', 0) - 1] : undefined;
  const pt = Number.isFinite(w) ? w / EMU_PO_PT : izStila ?? PODRAZUMEVANA_DEBLJINA_EMU / EMU_PO_PT;
  return { boja, debljina: ogranici(zaokruzi(pt * ctx.t.s), MIN_DEBLJINA, MAX_DEBLJINA), crtica: crticaIz(ln) };
}

/**
 * Ivica iz `a:ln` (i `p:style/a:lnRef`): `noFill` -> `null`; debljina `w` (EMU, podrazumevano 9525, ili
 * `tema.debljineLinija[idx-1]` iz `lnRef`) u pt puta `t.s`, 0,25..20; boja iz popune linije, inače iz `lnRef`.
 * Nema `a:ln` ni `lnRef` -> `null`; `a:ln` bez boje i bez `lnRef` -> `null` (PowerPoint takvu liniju ne crta).
 */
export function ivicaIz(ln: Element | null, ctx: KontekstSlajda, stil?: Element | null): Ivica | null {
  return ivica(ln, ctx, stil, null);
}

/**
 * Senka iz `spPr/a:effectLst/a:outerShdw` (`senkaIzEfekta`, boja pomešana sa pozadinom slajda). Sjaj, meke ivice,
 * odraz, unutrašnja i preset senka se ne prenose: `SENKA` jednom po slajdu.
 */
export function senkaIz(spPr: Element | null, ctx: KontekstSlajda): Senka | null {
  const efekti = spPr && dete(spPr, NS.a, 'effectLst');
  if (!efekti) return null;
  if (NEPRENESENI_EFEKTI.some((ime) => dete(efekti, NS.a, ime))) {
    upozoriJednom(ctx, 'SENKA', 'Sjaj, meke ivice, odraz i unutrašnja senka oblika nisu preneseni.');
  }
  const spoljna = dete(efekti, NS.a, 'outerShdw');
  return spoljna ? senkaIzEfekta(spoljna, ctx) : null;
}

/** Kraj linije sa vrhom (`headEnd`/`tailEnd` sa `type` različitim od `none`). */
function imaVrh(ln: Element | null, ime: 'headEnd' | 'tailEnd'): boolean {
  const e = ln && dete(ln, NS.a, ime);
  return !!e && (e.getAttribute('type') ?? 'none') !== 'none';
}

/** Strana manja od 1 jedinice postaje 1, centrirano oko prvobitne (pomeraj sloja `-d`, tačaka `+d`). */
function bar1(poz: number, vel: number): { poz: number; vel: number; d: number } {
  if (vel >= 1) return { poz, vel, d: 0 };
  const d = (1 - Math.max(0, vel)) / 2;
  return { poz: zaokruzi(poz - d), vel: 1, d };
}

/** Početak i kraj blok strelice u okviru `w x h` (bez flip-a). */
function osaBlokStrelice(prst: string, w: number, h: number): [Tacka, Tacka] {
  switch (prst) {
    case 'leftArrow': return [{ x: w, y: h / 2 }, { x: 0, y: h / 2 }];
    case 'upArrow': return [{ x: w / 2, y: h }, { x: w / 2, y: 0 }];
    case 'downArrow':
    case 'upDownArrow': return [{ x: w / 2, y: 0 }, { x: w / 2, y: h }];
    default: return [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }];
  }
}

/**
 * `p:sp` sa podržanom `prstGeom` ili `p:cxnSp` -> OBLIK sloj (bez teksta: tekst oblika pravi pozivalac, F12). Druga
 * geometrija, `custGeom` ili nevidljiva linija/strelica -> `null` (pozivalac odlučuje o tekstu i upozorenju).
 * Linije: `od`/`do` u okviru sloja od gornjeg levog ka donjem desnom uglu, `flipH`/`flipV` ih ogledaju; strana 0 postaje
 * 1 jedinica, linija ide njenom sredinom; `tailEnd` -> STRELICA, samo `headEnd` -> STRELICA sa zamenjenim krajevima, oba
 * -> DVOSTRUKA_STRELICA; bez ivice -> `tx1`, 0,75, PUNA. Izlomljen/zakrivljen konektor -> prava linija od početka do kraja
 * i blok strelica -> linija debljine pola kraće strane (najviše 20) bojom popune, obe uz `OBLIK_PRIBLIZAN`.
 */
export function pretvoriOblik(el: Element, k: Kutija, ctx: KontekstSlajda, id: string): OblikSloj | null {
  const spPr = dete(el, NS.p, 'spPr');
  const stil = dete(el, NS.p, 'style');
  const geom = spPr && dete(spPr, NS.a, 'prstGeom');
  const prst = geom?.getAttribute('prst') ?? '';
  if (!geom || !Object.hasOwn(GEOMETRIJE, prst)) return null;
  const vrsta = GEOMETRIJE[prst];
  const ln = spPr && dete(spPr, NS.a, 'ln');

  const s = uSloj(k, ctx.t);
  const x = bar1(s.x, s.sirina);
  const y = bar1(s.y, s.visina);
  const osnova = {
    id, tip: 'OBLIK' as const, naziv: nazivOblika(el), x: x.poz, y: y.poz, sirina: x.vel, visina: y.vel,
    rotacija: rotacijaSloja(s.rotacija), providnost: 1, zakljucan: false, senka: senkaIz(spPr, ctx),
  };

  const linija = vrsta === 'LINIJA' || BLOK_STRELICE.has(prst);
  if (!linija) {
    return { ...osnova, oblik: vrsta, popuna: popunaIz(spPr, ctx, stil), ivica: ivicaIz(ln, ctx, stil), od: null, do: null };
  }

  const w = Math.max(0, s.sirina);
  const h = Math.max(0, s.visina);
  let oblik: VrstaOblika;
  let iv: Ivica | null;
  let [od, ka]: [Tacka, Tacka] = [{ x: 0, y: 0 }, { x: w, y: h }];
  if (BLOK_STRELICE.has(prst)) {
    const boja = popunaIz(spPr, ctx, stil) ?? ivicaIz(ln, ctx, stil)?.boja ?? null;
    if (!boja) return null;
    upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Blok strelica je prikazana kao linija sa strelicom.');
    oblik = vrsta;
    iv = { boja, debljina: ogranici(zaokruzi(Math.min(w, h) / 2), MIN_DEBLJINA, MAX_DEBLJINA), crtica: 'PUNA' };
    [od, ka] = osaBlokStrelice(prst, w, h);
  } else {
    iv = ivica(ln, ctx, stil, bojaTx1(ctx));
    if (!iv) return null;
    if (IZLOMLJENI.test(prst)) {
      upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Izlomljen ili zakrivljen konektor je prikazan kao prava linija od početka do kraja.');
    }
    const glava = imaVrh(ln, 'headEnd');
    const rep = imaVrh(ln, 'tailEnd');
    oblik = glava && rep ? 'DVOSTRUKA_STRELICA' : glava || rep ? 'STRELICA' : 'LINIJA';
    if (glava && !rep) [od, ka] = [ka, od];
  }

  const flip = okrenut(el);
  const tacka = (t: Tacka): Tacka => ({
    x: zaokruzi((flip.h ? w - t.x : t.x) + x.d) || 0,
    y: zaokruzi((flip.v ? h - t.y : t.y) + y.d) || 0,
  });
  return { ...osnova, oblik, popuna: null, ivica: iv, od: tacka(od), do: tacka(ka) };
}
