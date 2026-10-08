import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

export interface ChipOpcija<T> {
  vrednost: T;
  labela: string;
}

/**
 * Filter liste kao chip (spec 4, Lista): neaktivan "Labela ▾", aktivan "Labela: Vrednost" sa ✕ koji emituje `null`.
 * Kontrolisana komponenta: emituje `vrednostChange`, a prikazuje ono što dobije kroz `vrednost` (lista menja URL, URL
 * menja `vrednost`). `zakljucano`: filter određen rutom (hub predmeta, detalj grupe) se samo prikazuje.
 * Vrednost koje nema među opcijama (obrisana grupa iz starog linka) prikazuje se kao `—`.
 */
@Component({
  selector: 'app-chip-select',
  imports: [MatIcon, MatMenu, MatMenuItem, MatMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (zakljucano()) {
      <span class="chip zakljucan">{{ labela() }}: {{ labelaVrednosti() ?? '—' }}</span>
    } @else {
      <span class="chip" [class.aktivan]="aktivan()">
        <button type="button" data-otvori [matMenuTriggerFor]="meni" aria-haspopup="menu">
          @if (aktivan()) {
            {{ labela() }}: {{ labelaVrednosti() ?? '—' }}
          } @else {
            {{ labela() }}
            <mat-icon svgIcon="expand_more" aria-hidden="true" />
          }
        </button>
        @if (aktivan()) {
          <button type="button" class="chip-x" data-ukloni [attr.aria-label]="'Ukloni filter ' + labela()" (click)="izaberi(null)">
            <mat-icon svgIcon="close" aria-hidden="true" />
          </button>
        }
      </span>
      <mat-menu #meni="matMenu" class="chip-meni">
        @for (o of opcije(); track $index) {
          <button mat-menu-item type="button" role="menuitemradio" [attr.aria-checked]="o.vrednost === vrednost()"
            (click)="izaberi(o.vrednost)">
            @if (o.vrednost === vrednost()) {
              <mat-icon svgIcon="check" aria-hidden="true" />
            } @else {
              <span class="bez-ikone" aria-hidden="true"></span>
            }
            <span>{{ o.labela }}</span>
          </button>
        } @empty {
          <p class="prazno">Nema opcija.</p>
        }
      </mat-menu>
    }
  `,
  styles: `
    :host { display: inline-flex; max-width: 100%; }
    .bez-ikone { display: inline-block; width: 24px; margin-right: 16px; }
    .prazno { margin: 0; padding: 8px 16px; color: var(--muted); }
  `,
})
export class ChipSelect<T> {
  readonly labela = input.required<string>();
  readonly opcije = input<readonly ChipOpcija<T>[]>([]);
  readonly vrednost = input<T | null | undefined>(null);
  readonly zakljucano = input(false, { transform: booleanAttribute });
  readonly vrednostChange = output<T | null>();

  protected readonly aktivan = computed(() => this.vrednost() !== null && this.vrednost() !== undefined);
  protected readonly labelaVrednosti = computed(() => this.opcije().find(o => o.vrednost === this.vrednost())?.labela ?? null);

  protected izaberi(v: T | null): void {
    if (v !== (this.vrednost() ?? null)) {
      this.vrednostChange.emit(v);
    }
  }
}
