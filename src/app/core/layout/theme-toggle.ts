import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

import { PreferencesStore, Rezim } from '../state/preferences.store';
import { NazivIkone } from './icons';

interface Opcija {
  rezim: Rezim;
  label: string;
  ikona: NazivIkone;
}

export const OPCIJE_REZIMA: readonly Opcija[] = [
  { rezim: 'sistem', label: 'Sistem', ikona: 'brightness_auto' },
  { rezim: 'dan', label: 'Dan', ikona: 'light_mode' },
  { rezim: 'noc', label: 'Noć', ikona: 'dark_mode' },
];

/** Prekidač režima (Sistem / Dan / Noć) u dnu bočne navigacije; izbor čuva `PreferencesStore`. */
@Component({
  selector: 'app-theme-toggle',
  imports: [MatButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-button type="button" class="rezim-dugme" [matMenuTriggerFor]="meni"
            [attr.aria-label]="'Režim prikaza: ' + izabrana().label">
      <mat-icon [svgIcon]="izabrana().ikona" aria-hidden="true" />
      <span>{{ izabrana().label }}</span>
    </button>
    <mat-menu #meni="matMenu" yPosition="above">
      @for (o of opcije; track o.rezim) {
        <button mat-menu-item type="button" role="menuitemradio" [attr.aria-checked]="o.rezim === rezim()"
                (click)="prefs.postaviRezim(o.rezim)">
          <mat-icon [svgIcon]="o.ikona" aria-hidden="true" />
          <span>{{ o.label }}</span>
          @if (o.rezim === rezim()) {
            <mat-icon svgIcon="check" class="izabrano" aria-hidden="true" />
          }
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .rezim-dugme {
      --mat-button-text-label-text-color: var(--side-ink);
      --mat-button-text-state-layer-color: var(--side-ink);
      min-height: 44px;
    }
    .izabrano { margin-left: auto; margin-right: 0; }
  `,
})
export class ThemeToggle {
  protected readonly prefs = inject(PreferencesStore);
  protected readonly opcije = OPCIJE_REZIMA;
  protected readonly rezim = this.prefs.rezim;
  protected readonly izabrana = computed(() => OPCIJE_REZIMA.find(o => o.rezim === this.rezim()) ?? OPCIJE_REZIMA[0]);
}
