import { DestroyRef, afterRenderEffect, inject, signal } from '@angular/core';
import { KLASA_FORMULE } from './tekst-formule';
import type { MeraFormule } from './tekst-formule.component';

/*
 * Smanjivanje formule u tekstu da stane u svoj blok, samo za nastavničke prikaze (projektor, konzola, pregled u editoru,
 * pregled izvođenja): tamo niko ne skroluje, a klasična traka od 15 px bi i kratkoj formuli podigla red. Daju ga
 * `slajd-prikaz`, `pitanje-plocice`, `rezultat-prikaz` i `izvodjenje-pregled` kroz `providers` (`MERA_FORMULE`); javni deo
 * ovaj fajl ne uvozi, pa telefon nema ni kod ni smanjivanje (tamo se šira formula skroluje u sebi, `uzivo-javno.css`).
 *
 * Gasi se po konstrukciji (re-recenzija 3, Critical 1: širina markupa MathLive-a nije linearna u k, pa je pravilo "raste dok
 * ne prelazi, pada kad prelazi" sa `ResizeObserver`-om osciliralo ~60 puta u sekundi). Za svaku formulu se pamti **ulaz**:
 * širina sadržaja bloka, `font-size` teksta i epoha fontova. Samo promena ulaza (>= 0,5 px, novi fontovi) računa k iznova,
 * od mere pri k = 1 (simetrično, raste ili pada), uz najviše `MAX_KOREKCIJA` koraka nadole dok formula zaista prelazi
 * ivicu. Isti ulaz (npr. `ResizeObserver` posle sopstvenog upisa) ne upisuje ništa, osim tih koraka nadole.
 * Blok mora imati širinu koja ne zavisi od formule (provereno: tekst pitanja `flex: 1`, pločica `flex: 1` u
 * `minmax(0, 1fr)`, blok teksta rezultata `flex: 1 1 0` posle značke u ćeliji `minmax(0, 1fr)`, pregled izvođenja blok); i
 * kad ne bi, formula koja pri k = 1 ne prelazi ostaje na k = 1, pa okvir koji se skuplja na sadržaj ne pravi spiralu.
 * Ono što se uz formulu pojavi uživo (značka "✓ tačno", tajmer pored teksta pitanja) mora biti van njenog bloka: tada
 * menja širinu bloka i `ResizeObserver` je vidi; u istom bloku bi samo pomerilo formulu, a to ništa ne javlja.
 */

/** Najmanji koeficijent veličine formule; ispod toga je seče ivica domaćina (`overflow-x: clip`), bez trake. */
export const MIN_K_FORMULE = 0.5;
/** Najviše koraka nadole posle jednog računanja (nelinearna širina markupa); posle toga se ništa ne upisuje. */
export const MAX_KOREKCIJA = 2;
/** Rezerva u em teksta oko formule: prepust MathLive-a (~2 px van `.ML__latex`) i `padding-inline-end` formule (0,15em). */
const REZERVA_EM = 0.3;
/** Promena ulaza manja od ovoga (px) se ne računa (podpikseli). */
const PRAG_ULAZA = 0.5;

/**
 * Koeficijent veličine formule (`--uz-formula-k`, `font-size: k * 1em`) iz mere pri k = 1:
 * `clamp(min, raspolozivo / prirodna, 1)`; bez merenja (0, NaN) 1.
 */
export function koeficijentFormule(prirodna: number, raspolozivo: number, min: number): number {
  if (!(prirodna > 0) || !(raspolozivo > 0)) {
    return 1;
  }
  return Math.min(1, Math.max(min, raspolozivo / prirodna));
}

/** Korak nadole kad formula pri k = `stari` (širina `sirina`) prelazi raspoloživo: srazmerno, bar 0,005, najmanje `min`. */
export function korakNadole(stari: number, sirina: number, raspolozivo: number, min: number): number {
  const srazmerno = sirina > 0 && raspolozivo > 0 ? (stari * raspolozivo) / sirina : min;
  return Math.max(min, Math.min(srazmerno, stari - 0.005));
}

interface Ulaz { sirina: number; fs: number; fontovi: number; }
interface Stanje extends Ulaz { korekcija: number; }

const istiUlaz = (a: Ulaz, b: Ulaz) =>
  Math.abs(a.sirina - b.sirina) < PRAG_ULAZA && Math.abs(a.fs - b.fs) < PRAG_ULAZA && a.fontovi === b.fontovi;

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

interface Mera {
  el: HTMLElement;
  ml: Element;
  blok: HTMLElement;
  /** širina sadržaja bloka (ulaz) */
  sirina: number;
  /** mesto formule: širina sadržaja, ili od početka formule do ivice u redu bez preloma */
  raspolozivo: number;
  fs: number;
  sirinaMarkupa: number;
  prelazi: boolean;
}

/** Sva čitanja jedne formule (bez upisa). */
function izmeri(el: HTMLElement): Mera | null {
  const ml = el.firstElementChild;
  const blok = blokRoditelja(el);
  if (!ml || !blok) {
    return null;
  }
  const sb = getComputedStyle(blok);
  const pl = parseFloat(sb.paddingLeft) || 0;
  const sirina = blok.clientWidth - pl - (parseFloat(sb.paddingRight) || 0);
  const levo = blok.getBoundingClientRect().left + blok.clientLeft + pl;
  const r = ml.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(el.parentElement ?? blok).fontSize) || 16;
  const bezPreloma = sb.whiteSpace === 'nowrap' || sb.whiteSpace === 'pre';
  const raspolozivo = (bezPreloma ? levo + sirina - el.getBoundingClientRect().left : sirina) - REZERVA_EM * fs;
  return { el, ml, blok, sirina, raspolozivo, fs, sirinaMarkupa: r.width, prelazi: r.right > levo + sirina + 0.5 };
}

const trenutniK = (el: HTMLElement) => Number(el.style.getPropertyValue('--uz-formula-k')) || 1;

function upisi(el: HTMLElement, k: number): void {
  if (Math.abs(k - trenutniK(el)) < 0.0005) {
    return;
  }
  if (k >= 1) {
    el.style.removeProperty('--uz-formula-k');
  } else {
    el.style.setProperty('--uz-formula-k', k.toFixed(3));
  }
}

/**
 * Posle crtanja (faza `mixedReadWrite`, posle upisa markupa). Jedan prolaz: (1) čitanja za sve formule; (2) formule sa
 * novim ulazom se vraćaju na k = 1; (3) njihova čitanja pri k = 1; (4) svi upisi. Najviše dva prinudna rasporeda po prolazu,
 * nikad naizmenično po formuli. Ponovo meri na `ResizeObserver` trenutnih blokova i na `document.fonts` `loadingdone`.
 */
export const meriFormule: MeraFormule = (host, spremno) => {
  const preracun = signal(0);
  const zakazi = () => preracun.update((n) => n + 1);
  const stanja = new WeakMap<HTMLElement, Stanje>();
  let fontovi = 0;
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
      // (1) čitanja; sakriven okvir (širina 0) se posmatra (prikaz javlja `ResizeObserver`), ali se ne meri ni ne pamti
      const sve = Array.from(host.querySelectorAll<HTMLElement>(`span.${KLASA_FORMULE}--spremna`))
        .map(izmeri)
        .filter((m): m is Mera => !!m);
      posmatraj([...new Set(sve.map((m) => m.blok))]);
      const mere = sve.filter((m) => m.sirina > 0);
      const nove = mere.filter((m) => {
        const s = stanja.get(m.el);
        return !s || !istiUlaz(s, { sirina: m.sirina, fs: m.fs, fontovi });
      });
      const iste = mere.filter((m) => !nove.includes(m));
      // (2) + (3) nov ulaz: mera pri k = 1
      nove.forEach((m) => m.el.style.removeProperty('--uz-formula-k'));
      const pri1 = nove.map((m) => izmeri(m.el) ?? m);
      // (4) upisi
      for (const m of pri1) {
        // formula koja pri k = 1 ne prelazi ostaje cela (i u okviru koji se skuplja na sadržaj: bez spirale)
        const k = m.prelazi ? koeficijentFormule(m.sirinaMarkupa, m.raspolozivo, MIN_K_FORMULE) : 1;
        stanja.set(m.el, { sirina: m.sirina, fs: m.fs, fontovi, korekcija: 0 });
        upisi(m.el, k);
      }
      for (const m of iste) {
        const s = stanja.get(m.el)!;
        const stari = trenutniK(m.el);
        if (m.prelazi && s.korekcija < MAX_KOREKCIJA && stari > MIN_K_FORMULE) {
          s.korekcija++;
          upisi(m.el, korakNadole(stari, m.sirinaMarkupa, m.raspolozivo, MIN_K_FORMULE));
        }
      }
    },
  });

  const fonts = (document as Document & { fonts?: EventTarget }).fonts;
  const kadFontovi = () => {
    fontovi++;
    zakazi();
  };
  fonts?.addEventListener?.('loadingdone', kadFontovi);
  inject(DestroyRef).onDestroy(() => {
    fonts?.removeEventListener?.('loadingdone', kadFontovi);
    posmatrac?.disconnect();
  });
};
