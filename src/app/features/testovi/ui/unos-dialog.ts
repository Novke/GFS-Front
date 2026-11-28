import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Observable } from 'rxjs';

export interface UnosDialogCfg {
  naslov: string;
  tekst: string;
  labela: string;
  potvrdi: string;
  pocetno?: string;
  pomoc?: string;
  /** Prazan unos je dozvoljen (podrazumevano nije). */
  mozePrazno?: boolean;
  destruktivno?: boolean;
  /** Provera pre zatvaranja: poruka greške ili `null`. */
  proveri?: (v: string) => string | null;
}

/**
 * Potvrda sa jednim tekstualnim poljem (umesto `prompt()`): napomena poništenja, minuti produženja, ispravka ključa.
 * Esc i „Odustani“ daju `null`.
 */
@Component({
  selector: 'app-unos-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatFormField, MatHint, MatInput, MatLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.naslov }}</h2>
    <form (submit)="$event.preventDefault(); potvrdi()">
      <mat-dialog-content>
        <p>{{ cfg.tekst }}</p>
        <mat-form-field appearance="outline" class="polje">
          <mat-label>{{ cfg.labela }}</mat-label>
          <input matInput [value]="vrednost()" (input)="vrednost.set($any($event.target).value); greska.set(null)" autocomplete="off" data-unos />
          @if (greska(); as g) { <mat-hint class="greska" role="alert">{{ g }}</mat-hint> }
          @else if (cfg.pomoc) { <mat-hint>{{ cfg.pomoc }}</mat-hint> }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="null" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [class.destruktivno]="cfg.destruktivno" data-potvrdi>{{ cfg.potvrdi }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .polje { width: 100%; }
    .greska { color: var(--danger); }
    .destruktivno {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class UnosDialog {
  protected readonly cfg = inject<UnosDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UnosDialog, string | null>>(MatDialogRef);
  protected readonly vrednost = signal(this.cfg.pocetno ?? '');
  protected readonly greska = signal<string | null>(null);

  protected potvrdi(): void {
    const v = this.vrednost().trim();
    if (!v && !this.cfg.mozePrazno) {
      this.greska.set('Polje ne sme biti prazno.');
      return;
    }
    const g = this.cfg.proveri?.(v) ?? null;
    if (g) {
      this.greska.set(g);
      return;
    }
    this.ref.close(v);
  }

  static otvori(dialog: MatDialog, cfg: UnosDialogCfg): Observable<string | null | undefined> {
    return dialog.open<UnosDialog, UnosDialogCfg, string | null>(UnosDialog, { data: cfg, width: '30rem', maxWidth: '92vw', autoFocus: 'input' })
      .afterClosed();
  }
}
