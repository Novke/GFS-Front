import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, afterRenderEffect, computed, effect, inject, input,
  signal,
} from '@angular/core';
import { PUTANJA_STILA_FORMULA, UCITAJ_FORMULE, type ModulFormule } from './formula-ucitavanje';
import { markdownSaFormulama } from './markdown';
import { KLASA_FORMULE, tekstSaFormulama } from './tekst-formule';

/** Fontovi koje formula u tekstu čeka pre prikaza (odluka 5); ostale KaTeX porodice stižu kad zatrebaju. */
export const FONTOVI_TEKSTA_FORMULE = ['400 1em KaTeX_Main', 'italic 400 1em KaTeX_Math'] as const;
const NAJDUZE_MS = 3000;
/**
 * Najviše formula koje jedan tekst crta MathLive-om; ostale ostaju izvor. Tekst pitanja (2000 znakova) može nositi oko
 * 500 formula (`$a$ $b$ ...`), a 500 malih je oko 0,45 s u jsdom-u na serveru (na telefonu više), dok `KesFormula` čuva
 * 300. Pitanje ili opcija sa više od 50 formula nije realno, pa granica samo čuva glavnu nit telefona.
 */
export const MAX_FORMULA_U_TEKSTU = 50;

/** Obećanje koje se razrešava kad `p` završi (uspeh ili greška) ili posle `ms`; tajmer se uvek čisti. */
function najvise(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((razresi) => {
    const tajmer = setTimeout(razresi, ms);
    const kraj = () => {
      clearTimeout(tajmer);
      razresi();
    };
    p.then(kraj, kraj);
  });
}

/** Najmanji koeficijent veličine formule: nastavnički prikazi (ispod se seče na ivici okvira) i telefon (ispod: skrol). */
export const MIN_K_FORMULE = 0.5;
export const MIN_K_FORMULE_TELEFON = 0.75;
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

let stilTeksta: Promise<void> | null = null;

/**
 * Lakši stil za formule u tekstu (telefon): isti `assets/mathlive/mathlive-static.css` kao faza 4, pa samo dva fonta
 * (najviše 3 + 3 s). Ne odbija (greška ili istek -> formula se ipak crta, fontovi stižu kasnije). Kad link faze 4
 * (`link[data-gfs="mathlive"]`, `ucitajStilFormula`: projektor i konzola posle `preducitajFormule`) već postoji, drugi se
 * ne dodaje: to je isti fajl (`PUTANJA_STILA_FORMULA`), pa bi se ista pravila samo primenila dvaput; čeka se njegov `load`
 * (slušalac, ne `onload`, koji pripada fazi 4), ili ništa ako je već učitan (`sheet`).
 */
export function ucitajStilFormulaUTekstu(): Promise<void> {
  stilTeksta ??= new Promise<void>((razresi) => {
    const postojeci = document.head.querySelector<HTMLLinkElement>('link[data-gfs="mathlive"]');
    if (postojeci?.sheet) {
      razresi();
      return;
    }
    const tajmer = setTimeout(razresi, NAJDUZE_MS);
    const gotovo = () => {
      clearTimeout(tajmer);
      razresi();
    };
    if (postojeci) {
      postojeci.addEventListener('load', gotovo, { once: true });
      postojeci.addEventListener('error', gotovo, { once: true });
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = PUTANJA_STILA_FORMULA; // relativno, kao faza 4 (radi pod svakim <base href>)
    link.dataset['gfs'] = 'mathlive-tekst';
    link.onload = link.onerror = gotovo;
    document.head.appendChild(link);
  }).then(() => {
    const fonts = (document as Document & { fonts?: { load(f: string, t?: string): Promise<unknown> } }).fonts;
    if (typeof fonts?.load !== 'function') {
      return undefined;
    }
    return najvise(Promise.all(FONTOVI_TEKSTA_FORMULE.map((f) => fonts.load(f, 'x2'))), NAJDUZE_MS);
  });
  return stilTeksta;
}

/** Samo za testove: zaboravlja keširano obećanje stila (keš inače traje koliko i prozor). */
export function resetujStilTekstaFormule(): void {
  stilTeksta = null;
}

export const UCITAJ_STIL_TEKSTA_FORMULE = new InjectionToken<() => Promise<void>>('UCITAJ_STIL_TEKSTA_FORMULE', {
  providedIn: 'root',
  factory: () => ucitajStilFormulaUTekstu,
});

/**
 * Tekst pitanja (`markdown`) ili opcije sa formulama `$...$` (spec 16.1). Bez formule: samo tekst, ništa se ne učitava.
 * Sa formulom: `mathlive/ssr` (faza 4, lenjo, token `UCITAJ_FORMULE`) i njegov stil; dok se ne učitaju, i kad formula
 * nije ispravna, vidi se izvor `$...$`. Host je kontejner (`[innerHTML]`, Angularov sanitizer, nikad
 * `bypassSecurityTrustHtml`: on je jedina odbrana od `[x](javascript:...)` u Markdown-u), pa klase roditelja (`uz-md`,
 * `uz-pitanje-tekst`) važe kao do sada. Markup formule ide samo kroz `latexUMarkup` (zabranjene komande, `trosakFormule`,
 * MathLive u `try/catch`, sanitizer po dozvoljenoj listi) i `replaceChildren`. Jedini ulaz javnog dela u formule
 * (odluka 4): ne uvozi ništa iz editora ni nastavničkog API-ja.
 */
@Component({
  selector: 'app-tekst-formule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[innerHTML]': 'pripremljen().html', '[style.display]': "markdown() ? 'block' : null" },
  template: '',
})
export class TekstFormuleComponent {
  readonly tekst = input<string | null | undefined>(null);
  /** Tekst pitanja je Markdown; tekst opcije je običan tekst. */
  readonly markdown = input(false);

  private readonly ucitaj = inject(UCITAJ_FORMULE);
  private readonly ucitajStil = inject(UCITAJ_STIL_TEKSTA_FORMULE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly modul = signal<ModulFormule | null>(null);
  /** Raste kad se promeni veličina okvira (`ResizeObserver`) ili stignu fontovi: formula se ponovo meri. */
  private readonly preracun = signal(0);
  private posmatrac: ResizeObserver | null = null;
  private readonly posmatrani = new WeakSet<Element>();
  private ucitavanje = false;
  protected readonly pripremljen = computed(() =>
    this.markdown() ? markdownSaFormulama(this.tekst()) : tekstSaFormulama(this.tekst()));

  constructor() {
    effect(() => {
      if (!this.pripremljen().formula || this.modul() || this.ucitavanje) {
        return;
      }
      this.ucitavanje = true;
      Promise.all([this.ucitaj(), this.ucitajStil()]).then(
        ([m]) => this.modul.set(m),
        (e: unknown) => {
          this.ucitavanje = false;
          // projektor i telefon ne prikazuju grešku: ostaje izvor `$...$`
          console.warn('Formule nisu učitane; prikazuje se izvor.', e);
        },
      );
    });
    // Posle svakog upisa HTML-a (Angular postavlja `innerHTML` domaćina pre ovoga) mesta bez klase dobijaju markup.
    afterRenderEffect({
      write: () => {
        const m = this.modul();
        if (!m || !this.pripremljen().formula) {
          return;
        }
        const mesta = Array.from(this.host.querySelectorAll<HTMLElement>(`span.${KLASA_FORMULE}`));
        mesta.forEach((el, i) => {
          if (el.classList.contains(`${KLASA_FORMULE}--spremna`) || el.classList.contains(`${KLASA_FORMULE}--izvor`)) {
            return;
          }
          const latex = (el.textContent ?? '').slice(1, -1);
          // isti put kao faza 4: zabranjene komande, trošak, validateLatex, konvertuj (try/catch), ocistiMarkup/ocistiStil
          const fragment = i < MAX_FORMULA_U_TEKSTU ? m.latexUMarkup(`\\textstyle ${latex}`) : null;
          if (!fragment) {
            el.classList.add(`${KLASA_FORMULE}--izvor`);
            return;
          }
          el.replaceChildren(fragment);
          el.classList.add(`${KLASA_FORMULE}--spremna`);
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', latex);
        });
      },
      // Formula se smanjuje da stane u svoj blok (projektor i konzola ne skroluju; telefon tek ispod MIN_K_FORMULE_TELEFON,
      // `.uz-st`): prvo sva čitanja, pa svi upisi, bez naizmeničnog rasporeda.
      mixedReadWrite: () => {
        this.preracun();
        if (!this.modul() || !this.pripremljen().formula) {
          return;
        }
        const min = this.host.closest('.uz-st') ? MIN_K_FORMULE_TELEFON : MIN_K_FORMULE;
        const mere = Array.from(this.host.querySelectorAll<HTMLElement>(`span.${KLASA_FORMULE}--spremna`)).map((el) => {
          const ml = el.firstElementChild;
          const blok = blokRoditelja(el);
          if (!ml || !blok) {
            return null;
          }
          const stari = Number(el.style.getPropertyValue('--uz-formula-k')) || 1;
          const sb = getComputedStyle(blok);
          const levo = blok.getBoundingClientRect().left + blok.clientLeft + parseFloat(sb.paddingLeft || '0');
          let raspolozivo = blok.clientWidth - parseFloat(sb.paddingLeft || '0') - parseFloat(sb.paddingRight || '0');
          // u redu bez preloma (ćelija rezultata) formula ne prelazi u novi red: mesto je od njenog početka do ivice
          if (sb.whiteSpace === 'nowrap' || sb.whiteSpace === 'pre') {
            raspolozivo -= el.getBoundingClientRect().left - levo;
          }
          const fs = parseFloat(getComputedStyle(el.parentElement ?? blok).fontSize) || 16;
          const prirodna = ml.getBoundingClientRect().width / stari;
          return { el, blok, stari, k: koeficijentFormule(prirodna, raspolozivo - REZERVA_EM * fs, min) };
        });
        for (const m of mere) {
          if (!m) {
            continue;
          }
          this.posmatraj(m.blok);
          if (Math.abs(m.k - m.stari) > 0.01) {
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
    const kadFontovi = () => this.preracun.update((n) => n + 1);
    fonts?.addEventListener?.('loadingdone', kadFontovi);
    inject(DestroyRef).onDestroy(() => {
      fonts?.removeEventListener?.('loadingdone', kadFontovi);
      this.posmatrac?.disconnect();
    });
  }

  /** Promena veličine bloka formule (prozor, umanjen prikaz konzole, `cqw`) -> novo merenje; isti k ne menja ništa. */
  private posmatraj(blok: Element): void {
    if (typeof ResizeObserver === 'undefined' || this.posmatrani.has(blok)) {
      return;
    }
    this.posmatrac ??= new ResizeObserver(() => this.preracun.update((n) => n + 1));
    this.posmatrac.observe(blok);
    this.posmatrani.add(blok);
  }
}
