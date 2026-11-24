import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { MAX_NAZIV_FOLDERA } from '../data-access/ankete.pravila';

/** Naziv foldera u redu (nov folder, preimenovanje): Enter ili "Sačuvaj", Esc ili "Otkaži". Prazan naziv se ne šalje. */
@Component({
  selector: 'app-anketa-naziv-foldera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <form class="nf" (submit)="$event.preventDefault(); posalji()">
      <mat-form-field class="nf-polje" subscriptSizing="dynamic">
        <mat-label>Naziv foldera</mat-label>
        <input #polje matInput [attr.maxlength]="max" [value]="pocetno()" (input)="tekst.set($any($event.target).value)"
               (keydown.escape)="$event.stopPropagation(); otkazi.emit()" data-naziv-foldera>
      </mat-form-field>
      <button mat-flat-button type="submit" [disabled]="!tekst().trim()">Sačuvaj</button>
      <button mat-button type="button" (click)="otkazi.emit()">Otkaži</button>
    </form>
  `,
  styles: `
    .nf { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 12px; }
    .nf-polje { flex: 1 1 180px; }
  `,
})
export class NazivFolderaComponent {
  readonly pocetno = input('');
  readonly sacuvaj = output<string>();
  readonly otkazi = output<void>();

  protected readonly max = MAX_NAZIV_FOLDERA;
  protected readonly tekst = signal('');
  private readonly polje = viewChild.required<ElementRef<HTMLInputElement>>('polje');

  constructor() {
    afterNextRender(() => {
      this.tekst.set(this.pocetno());
      this.polje().nativeElement.focus();
    });
  }

  protected posalji(): void {
    const naziv = this.tekst().trim();
    if (naziv) {
      this.sacuvaj.emit(naziv);
    }
  }
}
