import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { QrKodComponent } from '../ui/qr-kod.component';

export interface TelefonLinkovi {
  daljinski: string;
  konzola: string;
}

/**
 * QR za telefon: daljinski (podrazumevano) ili cela konzola (spec 1.7). Stilovi su u komponenti, ne u globalnom CSS-u:
 * početni paket je na granici budžeta.
 */
@Component({
  selector: 'app-telefon-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, QrKodComponent],
  styles: `
    .uz-kon-telefon { text-align: center; }
    .uz-kon-telefon-qr { width: min(280px, 70vw); margin: 0 auto; }
    .uz-kon-telefon-link { overflow-wrap: anywhere; color: var(--muted); font-size: 13px; }
    .uz-kon-telefon-napomena { color: var(--muted); font-size: 13px; }
    .uz-kon-telefon-izbor { display: flex; justify-content: center; gap: 8px; margin-bottom: 12px; }
    /* Izabrana opcija: tokeni dugmeta plus veća specifičnost od \`.mat-mdc-outlined-button:not(:disabled)\`. */
    .uz-kon-telefon-izbor .mat-mdc-outlined-button.mat-mdc-button-base[aria-pressed='true'] {
      --mat-button-outlined-label-text-color: var(--primary-ink);
      --mat-button-outlined-outline-color: var(--primary);
      background-color: var(--primary);
      color: var(--primary-ink);
    }
  `,
  template: `
    <h2 mat-dialog-title>Telefon</h2>
    <mat-dialog-content class="uz-kon-telefon">
      <div class="uz-kon-telefon-izbor" role="group" aria-label="Šta se otvara na telefonu">
        <button mat-stroked-button type="button" [attr.aria-pressed]="izbor() === 'daljinski'" (click)="izbor.set('daljinski')">Daljinski</button>
        <button mat-stroked-button type="button" [attr.aria-pressed]="izbor() === 'konzola'" (click)="izbor.set('konzola')">Cela konzola</button>
      </div>
      <p>{{ izbor() === 'daljinski' ? 'Skeniraj QR kod: telefon postaje daljinski (Nazad, Napred, beleške; ekran se ne gasi).'
                                    : 'Skeniraj QR kod: cela konzola na telefonu (rezultati, učesnici, sve komande).' }}</p>
      <app-qr-kod class="uz-kon-telefon-qr" [tekst]="link()" [velicina]="480" />
      <p class="uz-kon-telefon-link">{{ link() }}</p>
      <p class="uz-kon-telefon-napomena">Telefon jednom traži korisničko ime i lozinku sajta (kao laptop).</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Zatvori</button>
    </mat-dialog-actions>
  `,
})
export class TelefonDialog {
  private readonly linkovi = inject<TelefonLinkovi>(MAT_DIALOG_DATA);
  protected readonly izbor = signal<'daljinski' | 'konzola'>('daljinski');
  protected readonly link = computed(() => this.linkovi[this.izbor()]);
}
