import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';

export type KontekstPrecica = 'publika' | 'konzola';

interface Red { tasteri: string[]; opis: string; }

/** Tabela prečica iz spec-a 6.4 (ista u publici i konzoli; razlikuju se samo R i P). */
export function precice(kontekst: KontekstPrecica): Red[] {
  return [
    { tasteri: ['→', 'PageDown', 'Enter'], opis: 'Dalje: sledeća stavka, otvori ili zatvori pitanje, sledeći slajd' },
    { tasteri: ['←', 'PageUp'], opis: 'Nazad' },
    { tasteri: ['Home'], opis: 'Prijava (QR i kod)' },
    { tasteri: ['End'], opis: 'Poslednji slajd' },
    { tasteri: ['G', 'broj', 'Enter'], opis: 'Idi na slajd sa tim brojem (G 0 Enter: prijava)' },
    { tasteri: ['O'], opis: 'Otvori ili zatvori pitanje' },
    { tasteri: ['Space'], opis: 'Rezultati' },
    { tasteri: ['C'], opis: 'Tačan odgovor' },
    { tasteri: ['L'], opis: 'Rang-lista (takmičenje)' },
    { tasteri: ['R'], opis: kontekst === 'publika' ? 'Ponovi pitanje (pritisni R dvaput)' : 'Ponovi pitanje (uz potvrdu)' },
    { tasteri: ['T'], opis: 'Tajmer: pokreni 30 s, pauziraj, nastavi' },
    { tasteri: ['+', '-'], opis: 'Tajmer ±10 s' },
    { tasteri: ['M'], opis: 'Telefon: samo dugmad ili celo pitanje' },
    { tasteri: ['D'], opis: 'Dozvoli ili zabrani „Detalje“ na telefonu' },
    { tasteri: ['Q'], opis: 'QR preko celog ekrana' },
    { tasteri: ['B', '.'], opis: 'Crn ekran' },
    { tasteri: ['W'], opis: 'Beo ekran' },
    { tasteri: ['F'], opis: 'Ceo ekran (samo ovaj prozor)' },
    { tasteri: ['P'], opis: kontekst === 'publika' ? 'Otvori konzolu' : 'Otvori prikaz za publiku' },
    { tasteri: ['?'], opis: 'Ova pomoć' },
  ];
}

/** Pomoć sa prečicama (`?`). */
@Component({
  selector: 'app-pomoc-precice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Prečice</h2>
    <mat-dialog-content>
      <table class="uz-pomoc">
        <tbody>
          @for (r of redovi; track r.opis) {
            <tr>
              <th scope="row">
                @for (t of r.tasteri; track t; let poslednji = $last) {
                  @if (t === 'broj') { <span>broj</span> } @else { <kbd class="uz-kbd">{{ t }}</kbd> }
                  @if (!poslednji) { <span class="uz-pomoc-razmak"> </span> }
                }
              </th>
              <td>{{ r.opis }}</td>
            </tr>
          }
        </tbody>
      </table>
      <p class="uz-pomoc-napomena">Prečice ne rade dok kucaš u polje. Daljinski za prezentacije šalje PageDown i PageUp.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Zatvori</button>
    </mat-dialog-actions>
  `,
})
export class PomocPreciceDialog {
  protected readonly redovi = precice(inject<KontekstPrecica>(MAT_DIALOG_DATA));
}

export function otvoriPomoc(dialog: MatDialog, kontekst: KontekstPrecica): void {
  if (dialog.openDialogs.length) return;
  dialog.open(PomocPreciceDialog, { data: kontekst, maxWidth: '95vw', width: '560px' });
}
