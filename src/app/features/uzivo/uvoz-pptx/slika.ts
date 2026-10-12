// Slike PPTX-a (p:pic) u SLIKA slojeve platna i pozadina slajda (slajd -> layout -> master). Čiste funkcije bez
// Angular-a (lokalna provera ih pokreće u Node-u).
import type { SlikaSloj } from '../data-access/platno.models';
import { bojaPopune, elementPopune, ivicaIz, nazivOblika, okrenut, rotacijaSloja, senkaIz, upozoriJednom } from './oblik';
import { bojaIz, pomesaj } from './tema';
import { uSloj, type KontekstSlajda, type Kutija } from './tipovi';
import { brojAtr, dete, NS } from './xml';

/**
 * Formati koje pregledač ne ume da dekodira (pa ni `slike.ts` da pretvori u PNG/JPEG): vektorski Office formati i TIFF/
 * JPEG XR. Takva slika se preskače umesto da obori slanje celog uvoza.
 */
export const NEPODRZANI_FORMATI = /\.(emf|wmf|emz|wmz|tif|tiff|wdp|jxr)$/i;
const BELA = '#FFFFFF';

type IshodMedija = { medijId: string } | { razlog: string };

/** Deo paketa (slajd, layout ili master) iz kog je element, da bi se `r:embed` razrešio vezama tog dela. */
export function deoElementa(el: Element, ctx: KontekstSlajda): string {
  const doc = el.ownerDocument;
  if (ctx.layout && doc === ctx.layout.doc) return ctx.layout.putanja;
  if (ctx.master && doc === ctx.master.doc) return ctx.master.putanja;
  return ctx.slajd.putanja;
}

/** Registruje sliku iz `a:blip` (`r:embed` u vezama dela `deo`) ili kaže zašto ne može. */
function medijIzBlipa(blip: Element | null, deo: string, ctx: KontekstSlajda): IshodMedija {
  const rId = blip?.getAttributeNS(NS.r, 'embed')?.trim() ?? '';
  if (rId === '') {
    return { razlog: blip?.getAttributeNS(NS.r, 'link') ? 'slika je spoljna veza (nije u fajlu)' : 'nema sliku' };
  }
  const veza = ctx.paket.veza(deo, rId);
  if (veza?.spoljna) return { razlog: 'slika je spoljna veza (nije u fajlu)' };
  const format = veza && NEPODRZANI_FORMATI.exec(veza.cilj);
  if (format) return { razlog: `format ${format[1].toUpperCase()} nije podržan` };
  const medijId = veza ? ctx.medijIzVeze(deo, rId) : null;
  return medijId ? { medijId } : { razlog: 'slika nije pronađena u fajlu' };
}

/**
 * Udeo iz 1/1000 % (`val / 100000`) na 2 decimale kao na serveru (`PlatnoPP.r`: `BigDecimal` HALF_UP), u celim stotim
 * delovima pa bez greške binarnog zapisa na `.5` (49500 -> 0,50; `Math.round(0.495 * 100)` bi dao 0,49). Negativno -> 0.
 * Server zaokružuje pre provere `levo + desno < 1`, pa i klijent proverava zbir tek zaokruženih vrednosti.
 */
function udeo(el: Element | null, ime: string, podr = 0): number {
  const v = brojAtr(el, ime, podr);
  return v > 0 ? Math.floor(v / 1000 + 0.5) / 100 : 0;
}

/** Video ili zvuk u `p:nvPr` slike: PowerPoint ih čuva kao `p:pic` sa sličicom (poster). */
function vrstaMedija(pic: Element): 'video' | 'zvuk' | null {
  const nv = dete(pic, NS.p, 'nvPicPr');
  const nvPr = nv && dete(nv, NS.p, 'nvPr');
  if (!nvPr) return null;
  if (dete(nvPr, NS.a, 'audioFile') || dete(nvPr, NS.a, 'audioCd') || dete(nvPr, NS.a, 'wavAudioFile')) return 'zvuk';
  if (dete(nvPr, NS.a, 'videoFile') || dete(nvPr, NS.a, 'quickTimeFile')) return 'video';
  return nvPr.getElementsByTagNameNS(NS.p14, 'media').length > 0 ? 'video' : null;
}

/**
 * `p:pic` -> SLIKA sloj. `a:blip r:embed` -> `ctx.medijIzVeze` (veze dela iz kog je slika: slajd, layout ili master;
 * `svgBlip` iz `extLst` se zanemaruje, koristi se PNG iz `r:embed`). Spoljna slika, deo koji ne postoji, EMF/WMF (i drugi
 * formati koje pregledač ne dekodira) i slika nulte veličine -> `null` + `OBJEKAT_PRESKOCEN`. `srcRect` -> `isecak`
 * (neispravan -> bez isečka + `OBLIK_PRIBLIZAN`), `alphaModFix` -> `providnost`; flip, oblik isečka i ivica slike se ne
 * prenose (`OBLIK_PRIBLIZAN`); video/zvuk -> sličica + `OBJEKAT_PRESKOCEN`.
 */
export function pretvoriSliku(pic: Element, k: Kutija, ctx: KontekstSlajda, id: string): SlikaSloj | null {
  const naziv = nazivOblika(pic);
  const opis = naziv ? `Slika '${naziv}'` : 'Slika';
  const blipFill = dete(pic, NS.p, 'blipFill');
  const blip = blipFill && dete(blipFill, NS.a, 'blip');
  const s = uSloj(k, ctx.t);
  if (!(s.sirina > 0 && s.visina > 0)) {
    ctx.upozori('OBJEKAT_PRESKOCEN', `${opis} nije uvezena: nema veličinu.`);
    return null;
  }
  const ishod = medijIzBlipa(blip, deoElementa(pic, ctx), ctx);
  if ('razlog' in ishod) {
    ctx.upozori('OBJEKAT_PRESKOCEN', `${opis} nije uvezena: ${ishod.razlog}.`);
    return null;
  }

  const medij = vrstaMedija(pic);
  if (medij) {
    ctx.upozori('OBJEKAT_PRESKOCEN', `${opis}: ${medij === 'video' ? 'video' : 'zvuk'} nije podržan, uvezena je sličica.`);
  }

  const src = blipFill && dete(blipFill, NS.a, 'srcRect');
  let isecak = { levo: udeo(src, 'l'), gore: udeo(src, 't'), desno: udeo(src, 'r'), dole: udeo(src, 'b') };
  if (isecak.levo + isecak.desno >= 1 || isecak.gore + isecak.dole >= 1) {
    upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Neispravan isečak slike je zanemaren (prikazana je cela slika).');
    isecak = { levo: 0, gore: 0, desno: 0, dole: 0 };
  }

  const alfa = blip && dete(blip, NS.a, 'alphaModFix');
  const providnost = Math.min(1, udeo(alfa, 'amt', 100000));

  const flip = okrenut(pic);
  if (flip.h || flip.v) upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Okrenuta (preslikana) slika je prikazana neokrenuta.');
  const spPr = dete(pic, NS.p, 'spPr');
  const geom = spPr && (dete(spPr, NS.a, 'prstGeom')?.getAttribute('prst') ?? (dete(spPr, NS.a, 'custGeom') ? 'custGeom' : 'rect'));
  if (geom && geom !== 'rect') upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Slika isečena u oblik je prikazana kao pravougaonik.');
  if (spPr && ivicaIz(dete(spPr, NS.a, 'ln'), ctx, dete(pic, NS.p, 'style'))) {
    upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Ivica slike nije prenesena.');
  }

  return {
    id, tip: 'SLIKA', naziv, x: s.x, y: s.y, sirina: s.sirina, visina: s.visina, rotacija: rotacijaSloja(s.rotacija),
    providnost, zakljucan: false, senka: senkaIz(spPr, ctx), medijId: ishod.medijId, isecak,
  };
}

/**
 * Pozadina slajda: prvi `p:cSld/p:bg` od slajda ka layoutu pa masteru. `bgPr` sa `solidFill` -> boja, `gradFill` -> prvi
 * `gs`, `pattFill` -> `fgClr` (oba uz `OBLIK_PRIBLIZAN`), `blipFill` -> `medijId` (veza iz dela koji nosi `p:bg`) i boja
 * `#FFFFFF`, `noFill` -> `#FFFFFF`; `bgRef` -> boja deteta (`phClr` = ta boja). Nigde -> `bg1` preko mape boja. Ne menja
 * `ctx.pozadina` (to radi pozivalac, F12).
 */
export function pozadinaSlajda(ctx: KontekstSlajda): { boja: string; medijId: string | null } {
  const kb = { tema: ctx.tema, mapaBoja: ctx.mapaBoja };
  for (const deo of [ctx.slajd, ctx.layout, ctx.master]) {
    if (!deo) continue;
    const cSld = dete(deo.doc.documentElement, NS.p, 'cSld');
    const bg = cSld && dete(cSld, NS.p, 'bg');
    if (!bg) continue;

    const bgPr = dete(bg, NS.p, 'bgPr');
    const f = elementPopune(bgPr);
    if (f?.localName === 'blipFill') {
      const ishod = medijIzBlipa(dete(f, NS.a, 'blip'), deo.putanja, ctx);
      if ('medijId' in ishod) return { boja: BELA, medijId: ishod.medijId };
      ctx.upozori('OBJEKAT_PRESKOCEN', `Slika pozadine nije uvezena: ${ishod.razlog}.`);
      return { boja: BELA, medijId: null };
    }
    if (f?.localName === 'noFill') return { boja: BELA, medijId: null };
    const b = f ? bojaPopune(f, ctx, 'u pozadini slajda') : bojaIz(dete(bg, NS.p, 'bgRef'), kb);
    if (b) return { boja: pomesaj(b, BELA), medijId: null };
    break;
  }
  return { boja: ctx.tema.boje[ctx.mapaBoja['bg1'] ?? 'lt1'] ?? BELA, medijId: null };
}
