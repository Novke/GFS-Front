// Traka iznad platna (F4b: poništi/ponovi, z-osa, brisanje). Meniji ubacivanja (F7 oblik i slika, F12 tekst, F14 tabela,
// F16 formula) idu ovde, sa `[matMenuTriggerRestoreFocus]="false"` i kroz `ubaci`, pa fokus posle ubacivanja prelazi na
// okvir platna (odluka 12). Dugmad su `disabledInteractive`: onemogućeno dugme zadržava fokus (npr. Poništi posle
// poslednjeg koraka), umesto da ga pregledač baci na body.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Platno, Sloj } from '../data-access/platno.models';
import { FokusPlatna } from './fokus-platna';
import { PlatnoEditorStore } from './platno-editor.store';

@Component({
  selector: 'app-traka-alata',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="uz-ep-traka" role="group" aria-label="Alati platna">
      <button mat-icon-button type="button" aria-label="Poništi" title="Poništi (Ctrl+Z)" disabledInteractive
              [disabled]="!store.mozeNazad()" (click)="store.ponisti()"><mat-icon svgIcon="undo" /></button>
      <button mat-icon-button type="button" aria-label="Ponovi" title="Ponovi (Ctrl+Y)" disabledInteractive
              [disabled]="!store.mozeNapred()" (click)="store.ponovi()"><mat-icon svgIcon="redo" /></button>
      <span class="uz-ep-traka-razmak" aria-hidden="true"></span>
      <button mat-icon-button type="button" aria-label="Napred" title="Napred (Ctrl+])" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.zOsaIzabranih('NAPRED')"><mat-icon svgIcon="flip_to_front" /></button>
      <button mat-icon-button type="button" aria-label="Nazad" title="Nazad (Ctrl+[)" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.zOsaIzabranih('NAZAD')"><mat-icon svgIcon="flip_to_back" /></button>
      <button mat-icon-button type="button" aria-label="Obriši" title="Obriši (Delete)" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.obrisiIzabrane()"><mat-icon svgIcon="delete" /></button>
    </div>
  `,
  styles: `
    .uz-ep-traka { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 2px 0 6px; }
    .uz-ep-traka-razmak { width: 1px; height: 24px; margin-inline: 6px; background: var(--line); }
  `,
})
export class TrakaAlataComponent {
  protected readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);

  protected imaIzbor(): boolean {
    return this.store.izbor().length > 0;
  }

  /** Ubacivanje iz menija trake (F7 i dalje): nov sloj je izabran, a fokus prelazi na okvir platna (odluka 12). */
  protected ubaci(napravi: (id: string, p: Platno) => Sloj): void {
    if (this.store.ubaci(napravi) !== null) this.fokusPlatna.fokus();
  }
}
