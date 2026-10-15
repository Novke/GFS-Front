import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, afterRenderEffect, computed, effect, inject, input,
  signal,
} from '@angular/core';
import { PUTANJA_STILA_FORMULA, UCITAJ_FORMULE, upozoriFormuleNisuUcitane, type ModulFormule } from './formula-ucitavanje';
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

/**
 * Smanjivanje formule da stane u svoj blok (`ui/mera-formule.ts`, `meriFormule`): samo nastavnički prikazi (projektor,
 * konzola, pregled u editoru, pregled izvođenja) ga daju kroz `providers`, pa kod merenja ne ulazi u javnu stranicu. Telefon
 * ga nema (podrazumevano `null`): tamo se šira formula skroluje u sebi (`uzivo-javno.css`).
 * Poziva se u konstruktoru komponente (kontekst ubrizgavanja), sa domaćinom i signalom "ima nacrtanih formula".
 */
export type MeraFormule = (host: HTMLElement, spremno: () => boolean) => void;
export const MERA_FORMULE = new InjectionToken<MeraFormule | null>('MERA_FORMULE', { providedIn: 'root', factory: () => null });

let stilTeksta: Promise<void> | null = null;

/**
 * Lakši stil za formule u tekstu (telefon): isti `assets/mathlive/mathlive-static.css` kao faza 4, pa samo dva fonta
 * (najviše 3 + 3 s). **Greška stila odbija** i ne pamti se (završna recenzija 5a, A M4): markup bez CSS-a (bez rasporeda
 * `ML__vlist`, razlomci i indeksi izmešani) je lošiji od izvora `$...$`, pa komponenta ostavlja izvor, a sledeći prikaz
 * teksta pokušava iznova (sopstveni `<link>` se uklanja). Istek (3 s bez odgovora) ne odbija: formula se crta, stil stiže
 * kasnije. Kad link faze 4 (`link[data-gfs="mathlive"]`, `ucitajStilFormula`: projektor i konzola posle
 * `preducitajFormule`) već postoji, drugi se ne dodaje: to je isti fajl (`PUTANJA_STILA_FORMULA`), pa bi se ista pravila samo
 * primenila dvaput; čeka se njegov `load` (slušalac, ne `onload`, koji pripada fazi 4), ili ništa ako je već učitan (`sheet`).
 */
export function ucitajStilFormulaUTekstu(): Promise<void> {
  stilTeksta ??= new Promise<void>((razresi, odbij) => {
    // link faze 4 čija je greška već viđena (`data-greska`) se ne čeka ponovo: tada ide sopstveni pokušaj
    const postojeci = document.head.querySelector<HTMLLinkElement>('link[data-gfs="mathlive"]:not([data-greska])');
    if (postojeci?.sheet) {
      razresi();
      return;
    }
    const tajmer = setTimeout(razresi, NAJDUZE_MS);
    const gotovo = () => {
      clearTimeout(tajmer);
      razresi();
    };
    const greska = () => {
      clearTimeout(tajmer);
      link?.remove();
      if (postojeci) {
        postojeci.dataset['greska'] = '';
      }
      stilTeksta = null;
      odbij(new Error(`Stil formula nije učitan (${PUTANJA_STILA_FORMULA}).`));
    };
    let link: HTMLLinkElement | null = null;
    if (postojeci) {
      postojeci.addEventListener('load', gotovo, { once: true });
      postojeci.addEventListener('error', greska, { once: true });
      return;
    }
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = PUTANJA_STILA_FORMULA; // relativno, kao faza 4 (radi pod svakim <base href>)
    link.dataset['gfs'] = 'mathlive-tekst';
    link.onload = gotovo;
    link.onerror = greska;
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
  private ucitavanje = false;
  /** Samo telefon (bez `MERA_FORMULE`): posmatra nacrtane formule, da široka (skrol u sebi) dobije tab stop. */
  private skrol: ResizeObserver | null = null;
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
          // projektor i telefon ne prikazuju grešku: ostaje izvor `$...$`; nov pokušaj tek sa novim tekstom (nema petlje)
          this.ucitavanje = false;
          upozoriFormuleNisuUcitane(e);
        },
      );
    });
    // Posle svakog upisa HTML-a (Angular postavlja `innerHTML` domaćina pre ovoga) mesta bez klase dobijaju markup.
    afterRenderEffect({
      write: () => {
        const m = this.modul();
        this.skrol?.disconnect();
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
        // telefon: nikad u dugmetu opcije (`aria-hidden`, ime dugmeta iz `tekstZaCitac`; fokusabilno dete bi bilo
        // `nested-interactive`)
        if (this.skrol && !this.host.closest('button, [aria-hidden="true"]')) {
          this.host.querySelectorAll(`.${KLASA_FORMULE}--spremna`).forEach((el) => this.skrol!.observe(el));
        }
      },
    });
    const mera = inject(MERA_FORMULE);
    if (mera) {
      mera(this.host, () => !!this.modul() && this.pripremljen().formula);
    } else if (typeof ResizeObserver !== 'undefined') {
      // Telefon: šira formula je skrol region (`uzivo-javno.css`), pa mora biti dostupna tastaturi (axe
      // `scrollable-region-focusable`). Tab stop dobija samo formula koja stvarno prelazi; ime je već tu (`role="img"`,
      // `aria-label` = LaTeX, deca su prezentaciona, pa se sadržaj ne čita dvaput). Prelaz preko širine uvek menja veličinu
      // kutije (`max-width: 100%`), pa `ResizeObserver` na formulama hvata i okretanje telefona i kasne fontove.
      const skrol = (this.skrol = new ResizeObserver((z) => z.forEach(({ target: f }) =>
        f.scrollWidth > f.clientWidth ? f.setAttribute('tabindex', '0') : f.removeAttribute('tabindex'))));
      inject(DestroyRef).onDestroy(() => skrol.disconnect());
    }
  }
}
