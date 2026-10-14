import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';

/** Traka iznad forme za grešku sa servera (`reason`). Čim se pojavi (ili promeni), dobija fokus. */
@Component({
  selector: 'app-form-error-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (poruka(); as tekst) {
      <div #traka class="traka" role="alert" tabindex="-1">{{ tekst }}</div>
    }
  `,
  styles: `
    .traka {
      padding: 12px 16px;
      margin-bottom: 16px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border: 1px solid var(--mat-sys-error);
    }
  `,
})
export class FormErrorBanner {
  /** Tekst greške; `null` ili prazno sakriva traku. Za istu poruku dvaput zaredom prvo postavi `null`. */
  readonly poruka = input<string | null | undefined>(null);
  private readonly traka = viewChild<ElementRef<HTMLElement>>('traka');

  constructor() {
    afterRenderEffect(() => {
      this.poruka();
      this.traka()?.nativeElement.focus();
    });
  }
}
