import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { NgTemplateOutlet } from '@angular/common';
import { Observable } from 'rxjs';

import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { CvorBankeTesta, IzvorStavke } from '../data-access/online.models';

interface IzvorCfg { predmetId: number; izabrani: readonly number[] }

/**
 * Izbor izvora stavke šablona (spec 7.2): stablo banke namene TEST izabranog predmeta; čvor može biti tip (list) ili tema
 * (unutrašnji, unija svih listova ispod). Najviše 10 izvora po stavci. Isključene teme su označene (ne izvlače se).
 */
@Component({
  selector: 'app-izvor-dialog',
  imports: [MatButton, MatCheckbox, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Izvori iz banke (namena test)</h2>
    <mat-dialog-content>
      @if (stablo(); as s) {
        @if (s.length === 0) {
          <p>Banka ovog predmeta nema zadatke namene test.</p>
        }
        <ng-template #cvorovi let-lista let-putanja="putanja">
          <ul class="stablo">
            @for (c of lista; track c.id) {
              <li>
                <mat-checkbox [checked]="izabrano().has(c.id)" (change)="prebaci(c)"
                              [disabled]="!izabrano().has(c.id) && izabrano().size >= 10" [attr.data-cvor]="c.id">
                  {{ c.naziv }} <span class="tiho">· {{ c.brojAktivnih }} aktivnih@if (c.iskljucena) { · isključena }</span>
                </mat-checkbox>
                @if (c.deca.length) {
                  <ng-container *ngTemplateOutlet="cvorovi; context: { $implicit: c.deca, putanja: putanja.concat(c.naziv) }" />
                }
              </li>
            }
          </ul>
        </ng-template>
        <ng-container *ngTemplateOutlet="cvorovi; context: { $implicit: s, putanja: [] }" />
      } @else {
        <p>Učitavanje banke…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <span class="broj">Izabrano {{ izabrano().size }} / 10</span>
      <button matButton [mat-dialog-close]="undefined">Odustani</button>
      <button matButton="filled" (click)="potvrdi()" data-potvrdi-izvore>Izaberi</button>
    </mat-dialog-actions>
  `,
  styles: `
    .stablo { margin: 0; padding-left: 18px; list-style: none; }
    .stablo .stablo { padding-left: 24px; }
    .tiho { color: var(--ink-2); }
    .broj { margin-right: auto; color: var(--ink-2); }
  `,
})
export class IzvorDialog {
  private readonly cfg = inject<IzvorCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<IzvorDialog, IzvorStavke[]>>(MatDialogRef);
  protected readonly stablo = signal<CvorBankeTesta[] | null>(null);
  protected readonly izabrano = signal<ReadonlySet<number>>(new Set(this.cfg.izabrani));
  private readonly podaci = new Map<number, IzvorStavke>();

  constructor() {
    inject(OnlineTestoviApi).stabloTesta(this.cfg.predmetId).subscribe(s => {
      const obidji = (l: CvorBankeTesta[], p: string[]) =>
        l.forEach(c => {
          this.podaci.set(c.id, { grupaId: c.id, naziv: c.naziv, putanja: p, obrisan: false });
          obidji(c.deca, [...p, c.naziv]);
        });
      obidji(s, []);
      this.stablo.set(s);
    });
  }

  protected prebaci(c: CvorBankeTesta): void {
    const s = new Set(this.izabrano());
    if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
    this.izabrano.set(s);
  }

  protected potvrdi(): void {
    this.ref.close([...this.izabrano()].map(id => this.podaci.get(id) ?? { grupaId: id, naziv: `#${id}`, putanja: [], obrisan: false }));
  }

  static otvori(dialog: MatDialog, cfg: IzvorCfg): Observable<IzvorStavke[] | undefined> {
    return dialog.open<IzvorDialog, IzvorCfg, IzvorStavke[]>(IzvorDialog, { data: cfg, width: '40rem', maxWidth: '96vw', autoFocus: false })
      .afterClosed();
  }
}
