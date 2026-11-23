import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { AnketaInfo } from '../data-access/ankete.models';
import { kratkoVreme } from '../data-access/ankete.pravila';

/** Ishod reda istorije: otvorena, pobednik ili nerešeno, sa brojem glasalih. */
export function ishodAnkete(a: Pick<AnketaInfo, 'otvorena' | 'pobednik' | 'brojGlasalo' | 'brojMogucih'>): string {
  const broj = `${a.brojGlasalo} / ${a.brojMogucih} glasalo`;
  if (a.otvorena) {
    return `otvorena · ${broj}`;
  }
  if (a.brojGlasalo === 0) {
    return 'bez glasova';
  }
  return `${a.pobednik ?? 'nerešeno'} · ${broj}`;
}

/** Istorija pokrenutih anketa (najnovije prvo, "Još"): klik otvara rezultate, meni "Pokreni ponovo" i brisanje uz potvrdu. */
@Component({
  selector: 'app-anketa-istorija',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <h3 id="anketa-levo-naslov" class="ie-naslov">Istorija</h3>
    <ul class="ie" aria-label="Pokrenute ankete">
      @for (a of store.istorija(); track a.id) {
        <li class="ie-red" data-istorija-red>
          <button type="button" class="ie-glavno" [disabled]="store.radi()" (click)="store.otvoriAnketu(a.id)">
            <span class="ie-pitanje">{{ a.pitanje }}</span>
            <span class="ie-meta">{{ meta(a) }}</span>
            <span class="ie-ishod" [class.ie-ishod--otvorena]="a.otvorena">{{ ishod(a) }}</span>
          </button>
          <button mat-icon-button type="button" [matMenuTriggerFor]="meni" [matMenuTriggerData]="{ a }" [attr.aria-label]="'Radnje: ' + a.pitanje">
            <mat-icon svgIcon="more_vert" />
          </button>
        </li>
      } @empty {
        @if (!store.istorijaUcitava()) { <li class="ie-prazno">Još nema pokrenutih anketa.</li> }
      }
    </ul>
    @if (store.istorijaUcitava()) { <p class="ie-prazno" role="status">Učitavanje…</p> }
    @if (store.istorijaIma()) {
      <div class="ie-jos">
        <button mat-stroked-button type="button" [disabled]="store.istorijaUcitava()" (click)="store.ucitajIstoriju(true)" data-istorija-jos>Još</button>
      </div>
    }
    <mat-menu #meni="matMenu">
      <ng-template matMenuContent let-a="a">
        <button mat-menu-item type="button" (click)="store.pokreniPonovoIzIstorije(a.id)"><mat-icon svgIcon="replay" />Pokreni ponovo</button>
        <button mat-menu-item type="button" (click)="obrisi(a)"><mat-icon svgIcon="delete" />Obriši iz istorije</button>
      </ng-template>
    </mat-menu>
  `,
  styles: `
    .ie-naslov { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
    .ie { list-style: none; margin: 0; padding: 0; }
    .ie-red { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); }
    .ie-glavno {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; border: 0; background: none;
      color: var(--ink); font: inherit; text-align: left; cursor: pointer; border-radius: var(--radius-sm);
    }
    .ie-glavno:hover:not(:disabled) { background: var(--surface-2); }
    .ie-glavno:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .ie-pitanje { font-weight: 600; overflow-wrap: anywhere; }
    .ie-meta { font-size: 12px; color: var(--muted); }
    .ie-ishod { font-size: 13px; color: var(--ink-2); overflow-wrap: anywhere; }
    .ie-ishod--otvorena { color: var(--ok); font-weight: 600; }
    .ie-prazno { color: var(--muted); padding: 12px 4px; }
    .ie-jos { display: flex; justify-content: center; margin-top: 12px; }
  `,
})
export class IstorijaEkranComponent {
  protected readonly store = inject(AnketePanelStore);
  private readonly dialog = inject(MatDialog);

  protected meta(a: AnketaInfo): string {
    return [a.publika === 'NA_CASU' ? 'na času' : 'cela grupa', a.predmetNaziv, a.grupaNaziv, kratkoVreme(a.otvoreno)]
      .filter(Boolean).join(' · ');
  }

  protected ishod(a: AnketaInfo): string {
    return ishodAnkete(a);
  }

  protected obrisi(a: AnketaInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati anketu iz istorije?', tekst: `„${a.pitanje}“ i njeni glasovi se brišu.`, potvrdi: 'Obriši', destruktivno: true,
    }).subscribe(da => {
      if (da) {
        this.store.obrisiIzIstorije(a.id);
      }
    });
  }
}
