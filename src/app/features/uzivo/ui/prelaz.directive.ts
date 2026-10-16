import { DestroyRef, Directive, ElementRef, effect, inject, input, output } from '@angular/core';

/** Jedan prelaz omotača: nov `kljuc` pušta `kadrovi` (WAAPI), isti ključ (nov objekat) ne pušta ponovo. */
export interface PokretPrelaza { kljuc: number; kadrovi: Keyframe[]; trajanjeMs: number; }

/**
 * Prelaz slajda na omotaču (faza 5, odluka 12): jedna WAAPI animacija celog omotača (`transform`, `opacity` ili
 * `clip-path`), pa raspored unutra ostaje isti. Posle kraja animacija se prekida (`cancel`), pa na elementu ne ostaje ni
 * upisan stil ni animacija; `appPrelazZadrzi` (odlazni slajd) zadržava krajnji kadar do uklanjanja omotača. `null` ili
 * nov ključ prekida tekuću animaciju; prekinuta animacija ne javlja kraj. Bez `Element.animate` ili sa trajanjem 0 kraj
 * se javlja odmah.
 */
// Ugovor 1 faze 5 je imao `[uzPrelaz]`; prefiks je `app` kao za svaku direktivu projekta (recenzija F17, Minor 4), bez
// gašenja pravila `@angular-eslint/directive-selector`.
@Directive({ selector: '[appPrelaz]' })
export class PrelazDirective {
  readonly appPrelaz = input<PokretPrelaza | null>(null);
  /** Odlazni slajd zadržava krajnji kadar (inače bi se na kadar vratio na mesto pre nego što nestane). */
  readonly appPrelazZadrzi = input(false);
  /** Ključ prelaza koji se upravo završio (ne javlja se za prekinut). */
  readonly appPrelazKraj = output<number>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private tekuca: Animation | null = null;
  private poslednji: number | null = null;

  constructor() {
    effect(() => {
      const p = this.appPrelaz();
      const zadrzi = this.appPrelazZadrzi();
      if ((p?.kljuc ?? null) === this.poslednji) return;
      this.tekuca?.cancel();
      this.tekuca = null;
      this.poslednji = p?.kljuc ?? null;
      if (!p) return;
      if (typeof this.el.animate !== 'function' || p.trajanjeMs <= 0) {
        this.appPrelazKraj.emit(p.kljuc);
        return;
      }
      const a = this.el.animate(p.kadrovi, { duration: p.trajanjeMs, easing: 'ease-in-out', fill: 'both' });
      this.tekuca = a;
      a.finished.then(() => {
        if (this.tekuca !== a) return;
        if (!zadrzi) {
          a.cancel();
          this.tekuca = null;
        }
        this.appPrelazKraj.emit(p.kljuc);
      }, () => undefined); // prekinuta animacija (cancel) odbija `finished`: nije greška
    });
    inject(DestroyRef).onDestroy(() => this.tekuca?.cancel());
  }
}
