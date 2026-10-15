import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { SmerPrelaza, TipPrelaza } from '../data-access/uzivo.models';
import { NAZIVI_PRELAZA, NAZIVI_SMERA_PRELAZA } from '../ui/prelaz-slajda';

/** Kontrole prelaza u formi slajda (`SlajdFormaComponent`); 'NEMA' = bez prelaza. */
export interface KontrolePrelaza {
  prelazEfekat: FormControl<TipPrelaza | 'NEMA'>;
  prelazSmer: FormControl<SmerPrelaza>;
  prelazSekunde: FormControl<number>;
}

const izbor = <K extends string>(nazivi: Record<K, string>) =>
  (Object.keys(nazivi) as K[]).map(vrednost => ({ vrednost, naziv: nazivi[vrednost] }));

/**
 * Polja "Prelaz na ovaj slajd" (faza 5, odluka 11) za svaki tip slajda. Lenji chunk forme (`@defer` u `SlajdFormaComponent`):
 * stranica editora ne raste. Kontrole pripadaju formi slajda, pa svaka izmena ide kroz njen `valueChanges`; `efekat` je
 * vrednost kontrole efekta (signal forme), jer OnPush šablon ne vidi promenu kontrole sam.
 */
@Component({
  selector: 'app-prelaz-polja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    @let k = kontrole();
    <fieldset class="uz-ed-opcije uz-ed-prelaz">
      <legend>Prelaz na ovaj slajd</legend>
      <div class="uz-ed-red">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Efekat</mat-label>
          <mat-select [formControl]="k.prelazEfekat">
            <mat-option value="NEMA">Bez prelaza</mat-option>
            @for (e of efekti; track e.vrednost) { <mat-option [value]="e.vrednost">{{ e.naziv }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (efekat() === 'GURANJE' || efekat() === 'BRISANJE') {
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Smer</mat-label>
            <mat-select [formControl]="k.prelazSmer">
              @for (s of smerovi; track s.vrednost) { <mat-option [value]="s.vrednost">{{ s.naziv }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        @if (efekat() !== 'NEMA') {
          <mat-form-field class="uz-ed-polje-kratko" subscriptSizing="dynamic">
            <mat-label>Trajanje (s)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0.1" max="5" step="0.1" [formControl]="k.prelazSekunde">
          </mat-form-field>
          <button mat-stroked-button type="button" (click)="pregled.emit()">Pregledaj prelaz</button>
        }
      </div>
    </fieldset>
  `,
})
export class PrelazPoljaComponent {
  readonly kontrole = input.required<KontrolePrelaza>();
  readonly efekat = input.required<TipPrelaza | 'NEMA'>();
  readonly pregled = output<void>();

  protected readonly efekti = izbor(NAZIVI_PRELAZA);
  protected readonly smerovi = izbor(NAZIVI_SMERA_PRELAZA);
}
