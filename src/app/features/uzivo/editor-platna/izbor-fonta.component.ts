// Izbor fonta panela teksta (F13): `mat-select` sa katalogom fontova platna (`FONTOVI_PLATNA`, isti spisak kao server);
// svaka opcija i izabrana vrednost su u svom fontu (`cssFonta`). Mešani fontovi (null) daju vidljiv natpis "Različiti".
// Fokus posle izbora (mišem: nazad u tekst uređivanja) rešava panel teksta.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FONTOVI_PLATNA, cssFonta } from '../ui/platno-fontovi';

@Component({
  selector: 'app-izbor-fonta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <!-- mešano: labela pluta i bez fokusa, pa je natpis "Različiti" vidljiv (inače MDC skriva placeholder) -->
    <mat-form-field subscriptSizing="dynamic" [floatLabel]="vrednost() === null ? 'always' : 'auto'">
      <mat-label>Font</mat-label>
      <mat-select [value]="vrednost()" [disabled]="onemoguceno()" placeholder="Različiti" [style.font-family]="css()"
                  (selectionChange)="izbor.emit($event.value)">
        @for (f of fontovi; track f.naziv) {
          <mat-option [value]="f.naziv" [style.font-family]="f.css">{{ f.naziv }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    mat-form-field { width: 100%; }
  `,
})
export class IzborFontaComponent {
  /** Naziv iz kataloga; null = mešano. */
  readonly vrednost = input<string | null>(null);
  readonly onemoguceno = input(false);
  readonly izbor = output<string>();

  protected readonly fontovi = FONTOVI_PLATNA.map((f) => ({ naziv: f.naziv, css: cssFonta(f.naziv) }));
  protected readonly css = computed(() => {
    const v = this.vrednost();
    return v === null ? null : cssFonta(v);
  });
}
