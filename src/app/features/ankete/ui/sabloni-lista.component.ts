import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { SablonAnkete } from '../data-access/ankete.models';
import { MAX_PRECICA, opisPrecice } from '../data-access/ankete.pravila';

/**
 * Sačuvana pitanja (folder, pretraga): dodir pokreće kao prečica (odmah ili provera), a meni nudi izmenu, prečicu,
 * premeštanje u folder i brisanje uz potvrdu.
 */
@Component({
  selector: 'app-anketa-sabloni-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <ul class="sl" aria-label="Sačuvana pitanja">
      @for (s of sabloni(); track s.id) {
        <li class="sl-red" data-sablon>
          <button type="button" class="sl-glavno" [disabled]="store.radi()" (click)="store.dodir(s)">
            <span class="sl-pitanje">@if (s.ikonica) { <span aria-hidden="true">{{ s.ikonica }} </span> }{{ s.pitanje }}</span>
            <span class="sl-opis">{{ opis(s) }}</span>
          </button>
          <button mat-icon-button type="button" [matMenuTriggerFor]="meni" [matMenuTriggerData]="{ s }"
                  [attr.aria-label]="'Radnje: ' + s.pitanje" data-sablon-meni>
            <mat-icon svgIcon="more_vert" />
          </button>
        </li>
      } @empty {
        <li class="sl-prazno">{{ prazno() }}</li>
      }
    </ul>
    <mat-menu #meni="matMenu">
      <ng-template matMenuContent let-s="s">
        <button mat-menu-item type="button" (click)="store.izmeniSablon(s)"><mat-icon svgIcon="edit" />Izmeni</button>
        @if (s.precica) {
          <button mat-menu-item type="button" (click)="store.ukloniSaPrecica(s)"><mat-icon svgIcon="star" />Ukloni sa prečica</button>
        } @else {
          <button mat-menu-item type="button" [disabled]="store.precice().length >= maxPrecica" (click)="store.dodajNaPrecice(s)">
            <mat-icon svgIcon="star" />Dodaj na prečice
          </button>
        }
        <button mat-menu-item type="button" [matMenuTriggerFor]="premesti" [matMenuTriggerData]="{ s }">
          <mat-icon svgIcon="folder" />Premesti u…
        </button>
        <button mat-menu-item type="button" (click)="obrisi(s)"><mat-icon svgIcon="delete" />Obriši</button>
      </ng-template>
    </mat-menu>
    <mat-menu #premesti="matMenu">
      <ng-template matMenuContent let-s="s">
        @if (s.folderId !== null) {
          <button mat-menu-item type="button" (click)="store.premestiSablon(s, null)">Bez foldera</button>
        }
        @for (f of store.folderi(); track f.id) {
          @if (f.id !== s.folderId) {
            <button mat-menu-item type="button" (click)="store.premestiSablon(s, f.id)">{{ f.naziv }}</button>
          }
        }
      </ng-template>
    </mat-menu>
  `,
  styles: `
    .sl { list-style: none; margin: 0; padding: 0; }
    .sl-red { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); }
    .sl-glavno {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; border: 0; background: none;
      font: inherit; color: var(--ink); text-align: left; cursor: pointer; border-radius: var(--radius-sm);
    }
    .sl-glavno:hover:not(:disabled) { background: var(--surface-2); }
    .sl-glavno:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .sl-pitanje { font-weight: 600; overflow-wrap: anywhere; }
    .sl-opis { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
    .sl-prazno { padding: 12px 4px; color: var(--muted); }
  `,
})
export class SabloniListaComponent {
  readonly sabloni = input.required<readonly SablonAnkete[]>();
  readonly prazno = input('Nema sačuvanih pitanja.');

  protected readonly store = inject(AnketePanelStore);
  private readonly dialog = inject(MatDialog);
  protected readonly maxPrecica = MAX_PRECICA;

  protected opis(s: SablonAnkete): string {
    return [
      opisPrecice(s), s.precica ? 'prečica' : null, s.pokreniOdmah ? 'pokreće odmah' : null,
      s.brojPokretanja ? `pokrenuto ${s.brojPokretanja}×` : null,
    ].filter(Boolean).join(' · ');
  }

  protected obrisi(s: SablonAnkete): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati sačuvano pitanje?', tekst: `„${s.pitanje}“. Pokrenute ankete ostaju u istoriji.`, potvrdi: 'Obriši', destruktivno: true,
    }).subscribe(da => {
      if (da) {
        this.store.obrisiSablon(s);
      }
    });
  }
}
