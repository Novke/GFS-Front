import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PRELAZ, trajanjeIzSekundi } from '../data-access/slajd-pravila';
import type { SmerPrelaza, TipPrelaza } from '../data-access/uzivo.models';
import { NAZIVI_PRELAZA, NAZIVI_SMERA_PRELAZA } from '../ui/prelaz-slajda';

/** Kontrole prelaza u formi slajda (`SlajdFormaComponent`); 'NEMA' = bez prelaza. */
export interface KontrolePrelaza {
  prelazEfekat: FormControl<TipPrelaza | 'NEMA'>;
  prelazSmer: FormControl<SmerPrelaza>;
  /** Tekst polja "Trajanje (s)": decimalni zarez ili tačka (`trajanjeIzSekundi`). */
  prelazSekunde: FormControl<string>;
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
            <input matInput inputmode="decimal" autocomplete="off" spellcheck="false" [formControl]="k.prelazSekunde"
                   [errorStateMatcher]="greskaTrajanja">
            <mat-error>Unesi od 0,1 do 5 (npr. 0,8).</mat-error>
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
  /**
   * Greška na samom polju (`mat-error`, `aria-invalid`) čim je trajanje van 0,1-5 s; ista provera kao `greskeSlajda` (poruka
   * ostaje i u zbirnoj listi forme). Matcher, ne validator: kontrola pripada formi slajda, a pravilo važi i pre ovog chunk-a.
   */
  protected readonly greskaTrajanja: ErrorStateMatcher = {
    isErrorState: (c: AbstractControl | null) => {
      const ms = trajanjeIzSekundi(String(c?.value ?? ''));
      return ms < PRELAZ.min || ms > PRELAZ.max;
    },
  };
}
