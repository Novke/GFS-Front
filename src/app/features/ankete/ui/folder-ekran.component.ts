import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { sabloniFoldera } from '../data-access/ankete.pravila';
import { NazivFolderaComponent } from './naziv-foldera.component';
import { SabloniListaComponent } from './sabloni-lista.component';

/** Folder sačuvanih pitanja (`null` = bez foldera): pitanja, novo pitanje u folderu, preimenovanje i brisanje foldera. */
@Component({
  selector: 'app-anketa-folder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, NazivFolderaComponent, SabloniListaComponent],
  template: `
    <div class="fe-zaglavlje">
      <h3 id="anketa-levo-naslov" class="fe-naslov">{{ folder()?.naziv ?? 'Bez foldera' }}</h3>
      @if (folder(); as f) {
        <button mat-icon-button type="button" [matMenuTriggerFor]="meni" aria-label="Radnje foldera" data-folder-meni>
          <mat-icon svgIcon="more_vert" />
        </button>
        <mat-menu #meni="matMenu">
          <button mat-menu-item type="button" (click)="preimenovanje.set(true)"><mat-icon svgIcon="edit" />Preimenuj</button>
          <button mat-menu-item type="button" (click)="obrisi(f.id, f.naziv)"><mat-icon svgIcon="delete" />Obriši folder</button>
        </mat-menu>
      }
    </div>
    @if (preimenovanje() && folder(); as f) {
      <app-anketa-naziv-foldera [pocetno]="f.naziv" (sacuvaj)="store.preimenujFolder(f.id, $event); preimenovanje.set(false)"
                                (otkazi)="preimenovanje.set(false)" />
    }
    <app-anketa-sabloni-lista [sabloni]="sabloni()" prazno="U ovom folderu još nema pitanja." />
    <div class="fe-dno">
      <button mat-stroked-button type="button" (click)="store.novSablon({ folderId: folderId(), precica: false })" data-anketa-novo-pitanje>
        <mat-icon svgIcon="add" />Novo pitanje
      </button>
    </div>
  `,
  styles: `
    .fe-zaglavlje { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .fe-naslov { margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
    .fe-dno { display: flex; justify-content: flex-end; margin-top: 12px; }
  `,
})
export class FolderEkranComponent {
  readonly folderId = input.required<number | null>();

  protected readonly store = inject(AnketePanelStore);
  private readonly dialog = inject(MatDialog);
  protected readonly preimenovanje = signal(false);
  protected readonly folder = computed(() => this.store.folderi().find(f => f.id === this.folderId()) ?? null);
  protected readonly sabloni = computed(() => sabloniFoldera(this.store.info(), this.folderId()));

  protected obrisi(id: number, naziv: string): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati folder?', tekst: `„${naziv}“. Pitanja iz njega ostaju, bez foldera.`, potvrdi: 'Obriši folder', destruktivno: true,
    }).subscribe(da => {
      if (da) {
        this.store.obrisiFolder(id);
      }
    });
  }
}
