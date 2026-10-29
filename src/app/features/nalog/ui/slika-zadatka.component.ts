import { ChangeDetectionStrategy, Component, ElementRef, effect, input, signal, viewChild } from '@angular/core';

import { medijUrl } from '../data-access/portal.pravila';

/**
 * Slika zadatka ili rešenja (SVG iz `api/public/mediji`) na telefonu: zum prstima i "Uvećaj" preko celog ekrana (kao na
 * času); Escape i "Zatvori" vraćaju fokus na dugme. SVG je crn tekst bez pozadine, pa je podloga uvek bela. Bez HTTP-a osim
 * same slike.
 */
@Component({
  selector: 'app-slika-zadatka',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'zatvori()' },
  template: `
    <div class="slika"><img [src]="url(svgId())" [alt]="naziv()" [attr.data-svg]="oznaka()"></div>
    <button type="button" class="uvecaj" aria-haspopup="dialog" (click)="otvori()">Uvećaj{{ naziv() === 'Zadatak' ? '' : ' ' + naziv().toLowerCase() }}</button>
    @if (uvecano()) {
      <div class="uvecano" role="dialog" aria-modal="true" [attr.aria-label]="naziv()">
        <div class="vrh"><button #zatvoriDugme type="button" class="uvecaj" (click)="zatvori()">Zatvori</button></div>
        <div class="uvecano-slika"><img [src]="url(svgId())" [alt]="naziv()"></div>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .slika {
      overflow: auto; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: #fff;
      touch-action: pan-x pan-y pinch-zoom;
    }
    .slika img { display: block; width: 100%; height: auto; }
    .uvecaj {
      align-self: flex-end; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px;
      background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer;
    }
    .uvecaj:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .uvecano { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; background: #fff; color: var(--ink); }
    .vrh { display: flex; justify-content: flex-end; padding: 8px; border-bottom: 1px solid var(--line); }
    .uvecano-slika { flex: 1; min-height: 0; overflow: auto; touch-action: pan-x pan-y pinch-zoom; }
    .uvecano-slika img { display: block; width: auto; max-width: none; min-width: 100%; height: auto; }
  `,
})
export class SlikaZadatka {
  readonly svgId = input.required<string>();
  /** "Zadatak" ili "Rešenje": alt slike i naziv dijaloga. */
  readonly naziv = input('Zadatak');
  /** `data-svg` za testove (`zadatak` / `resenje`). */
  readonly oznaka = input<string | null>(null);

  protected readonly url = medijUrl;
  protected readonly uvecano = signal(false);
  private readonly zatvoriDugme = viewChild<ElementRef<HTMLButtonElement>>('zatvoriDugme');
  private vratiFokus: HTMLElement | null = null;

  constructor() {
    effect(() => this.zatvoriDugme()?.nativeElement.focus());
  }

  protected otvori(): void {
    this.vratiFokus = document.activeElement as HTMLElement | null;
    this.uvecano.set(true);
  }

  protected zatvori(): void {
    if (!this.uvecano()) {
      return;
    }
    this.uvecano.set(false);
    this.vratiFokus?.focus();
    this.vratiFokus = null;
  }
}
