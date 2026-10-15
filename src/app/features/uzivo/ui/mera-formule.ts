import { DestroyRef, afterRenderEffect, inject, signal } from '@angular/core';
import { KLASA_FORMULE } from './tekst-formule';
import type { MeraFormule } from './tekst-formule.component';

/*
 * Smanjivanje formule u tekstu da stane u svoj blok, samo za nastavničke prikaze (projektor, konzola, pregled u editoru,
 * pregled izvođenja): tamo niko ne skroluje, a klasična traka od 15 px bi i kratkoj formuli podigla red. Daju ga
 * `slajd-prikaz`, `rezultat-prikaz` i `izvodjenje-pregled` kroz `providers` (`MERA_FORMULE`); javni deo ovaj fajl ne
 * uvozi, pa telefon nema ni kod ni smanjivanje (tamo se šira formula skroluje u sebi, `uzivo-javno.css`).
 */

/** Najmanji koeficijent veličine formule; ispod toga je seče ivica domaćina (`overflow-x: clip`), bez trake. */
export const MIN_K_FORMULE = 0.5;
/** Rezerva u em teksta oko formule: prepust MathLive-a (~2 px van `.ML__latex`) i `padding-inline-end` formule (0,15em). */
const REZERVA_EM = 0.3;

/**
 * Koeficijent veličine formule (`--uz-formula-k`, `font-size: k * 1em`) da prirodna širina (pri k = 1) stane u raspoloživu:
 * `clamp(min, raspolozivo / prirodna, 1)`; bez merenja (0, NaN) 1. Markup MathLive-a je u `em`, pa se širina menja linearno.
 */
export function koeficijentFormule(prirodna: number, raspolozivo: number, min: number): number {
  if (!(prirodna > 0) || !(raspolozivo > 0)) {
    return 1;
  }
  return Math.min(1, Math.max(min, raspolozivo / prirodna));
}

/**
 * Novi k iz jednog merenja. Smanjuje se **samo kad formula zaista prelazi** desnu ivicu sadržaja bloka; inače k sme samo
 * da raste (veći okvir). Zato okvir koji se skuplja na sadržaj (flex stavka široka koliko formula) ne pravi spiralu: tamo
 * formula nikad ne prelazi, a raspoloživo je uvek manje od prirodne širine, pa k ostaje.
 */
export function noviKoeficijent(stari: number, prirodna: number, raspolozivo: number, prelazi: boolean, min = MIN_K_FORMULE): number {
  const cilj = koeficijentFormule(prirodna, raspolozivo, min);
  return prelazi ? Math.min(stari, cilj) : Math.max(stari, cilj);
}

/** Najbliži predak koji nije u redu (`inline*`, `contents`): njegova širina sadržaja je mesto formule. */
function blokRoditelja(el: HTMLElement): HTMLElement | null {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const d = getComputedStyle(e).display;
    if (d !== 'contents' && !d.startsWith('inline')) {
      return e;
    }
  }
  return null;
}

/**
 * Posle crtanja (faza `mixedReadWrite`, posle upisa markupa): prvo sva čitanja za sve formule domaćina, pa svi upisi.
 * Ponovo meri kad se promeni veličina bloka neke formule (`ResizeObserver`; posmatra samo trenutne blokove) ili stignu
 * fontovi (`document.fonts` `loadingdone`). Isti k ne upisuje ništa, pa nema petlje.
 */
export const meriFormule: MeraFormule = (host, spremno) => {
  const preracun = signal(0);
  const zakazi = () => preracun.update((n) => n + 1);
  let posmatrac: ResizeObserver | null = null;
  let posmatrani: Element[] = [];

  const posmatraj = (blokovi: Element[]) => {
    if (typeof ResizeObserver === 'undefined'
      || (blokovi.length === posmatrani.length && blokovi.every((b, i) => b === posmatrani[i]))) {
      return;
    }
    posmatrac ??= new ResizeObserver(zakazi);
    posmatrac.disconnect();
    blokovi.forEach((b) => posmatrac!.observe(b));
    posmatrani = blokovi;
  };

  afterRenderEffect({
    mixedReadWrite: () => {
      preracun();
      if (!spremno()) {
        return;
      }
      const mere = Array.from(host.querySelectorAll<HTMLElement>(`span.${KLASA_FORMULE}--spremna`)).map((el) => {
        const ml = el.firstElementChild;
        const blok = blokRoditelja(el);
        if (!ml || !blok) {
          return null;
        }
        const stari = Number(el.style.getPropertyValue('--uz-formula-k')) || 1;
        const sb = getComputedStyle(blok);
        const levo = blok.getBoundingClientRect().left + blok.clientLeft + (parseFloat(sb.paddingLeft) || 0);
        const sirina = blok.clientWidth - (parseFloat(sb.paddingLeft) || 0) - (parseFloat(sb.paddingRight) || 0);
        const r = ml.getBoundingClientRect();
        // u redu bez preloma (ćelija rezultata) formula ne prelazi u novi red: mesto je od njenog početka do ivice
        const raspolozivo = sb.whiteSpace === 'nowrap' || sb.whiteSpace === 'pre'
          ? levo + sirina - el.getBoundingClientRect().left : sirina;
        const fs = parseFloat(getComputedStyle(el.parentElement ?? blok).fontSize) || 16;
        const k = noviKoeficijent(stari, r.width / stari, raspolozivo - REZERVA_EM * fs, r.right > levo + sirina + 0.5);
        return { el, blok, stari, k };
      });
      posmatraj([...new Set(mere.flatMap((m) => (m ? [m.blok] : [])))]);
      for (const m of mere) {
        if (m && Math.abs(m.k - m.stari) > 0.005) {
          if (m.k === 1) {
            m.el.style.removeProperty('--uz-formula-k');
          } else {
            m.el.style.setProperty('--uz-formula-k', m.k.toFixed(3));
          }
        }
      }
    },
  });

  const fonts = (document as Document & { fonts?: EventTarget }).fonts;
  fonts?.addEventListener?.('loadingdone', zakazi);
  inject(DestroyRef).onDestroy(() => {
    fonts?.removeEventListener?.('loadingdone', zakazi);
    posmatrac?.disconnect();
  });
};
