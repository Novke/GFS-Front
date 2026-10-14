import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, signal,
  untracked, viewChild,
} from '@angular/core';
import { UCITAJ_FORMULE, UCITAJ_STIL_FORMULA } from './formula-ucitavanje';
import { Stil } from './platno-tekst';

/**
 * FORMULA bez slike izvora (projektor, konzola, editor; odluka 6): markup MathLive-a (`mathlive/ssr`, lenjo) kad su
 * modul, CSS i KaTeX fontovi spremni, a do tada (ili kad LaTeX nije ispravan, ima zabranjenu komandu ili učitavanje ne
 * uspe) LaTeX izvor kao u fazi 1. Markup je već očišćen (`formula-markup`), pa ide u DOM kroz `replaceChildren`
 * (Angular-ov `[innerHTML]` bi obrisao `style`, od kog raspored MathLive-a zavisi).
 */
@Component({
  selector: 'app-formula-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (markup(); as m) {
      <span #markup class="uz-pl-formula-markup" role="img" [attr.aria-label]="'Formula: ' + m.latex"
            [style]="stilMarkupa()"></span>
    } @else {
      <span class="uz-pl-formula-izvor" [style]="stil()">{{ latex() }}</span>
    }
  `,
})
export class FormulaPrikazComponent {
  readonly latex = input.required<string>();
  readonly stil = input.required<Stil>();

  private readonly ucitajFormule = inject(UCITAJ_FORMULE);
  private readonly ucitajStil = inject(UCITAJ_STIL_FORMULA);
  /** Očišćen markup poslednjeg zahteva (sa LaTeX-om za koji je napravljen); null = crta se izvor. */
  protected readonly markup = signal<{ latex: string; fragment: DocumentFragment } | null>(null);
  /** Boja, veličina i poravnanje formule; bez `font-family`, jer MathLive bira KaTeX fontove. */
  protected readonly stilMarkupa = computed<Stil>(() => {
    const s = { ...this.stil() };
    delete s['font-family'];
    return s;
  });
  private readonly mesto = viewChild<ElementRef<HTMLElement>>('markup');
  /** Brojač zahteva: zakasneli rezultat starog `latex` se odbacuje. */
  private zahtev = 0;
  private unisten = false;
  private upozoreno = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.unisten = true; });
    effect(() => {
      const latex = this.latex();
      untracked(() => this.ucitaj(latex));
    });
    // Fragment se kopira: isti markup se ponovo upisuje kad Angular napravi nov element (npr. posle izvora).
    afterRenderEffect({
      write: () => {
        const m = this.markup();
        const el = this.mesto()?.nativeElement;
        if (m && el) el.replaceChildren(m.fragment.cloneNode(true));
      },
    });
  }

  private ucitaj(latex: string): void {
    const broj = ++this.zahtev;
    this.markup.set(null);
    Promise.all([this.ucitajFormule(), this.ucitajStil()]).then(([modul]) => {
      if (this.unisten || broj !== this.zahtev) return;
      const fragment = modul.latexUMarkup(latex);
      this.markup.set(fragment ? { latex, fragment } : null);
    }, (e: unknown) => {
      if (this.unisten || this.upozoreno) return;
      this.upozoreno = true;
      // projektor ne prikazuje grešku: ostaje LaTeX izvor
      console.warn('Formula se crta kao LaTeX izvor: prikaz formula nije učitan.', e);
    });
  }
}
