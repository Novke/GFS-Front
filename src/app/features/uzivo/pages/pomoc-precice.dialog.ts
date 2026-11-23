import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';

export type KontekstPrecica = 'publika' | 'konzola';

interface Red { tasteri: string[]; opis: string; }

/**
 * Tabela prečica iz spec-a 6.4, `Shift+R` za rešenje zadatka i `Shift+L` za rang predavanja (ista u publici i konzoli;
 * razlikuju se samo P i crtanje `D`, koje postoji samo u konzoli). `R` se pritiska dvaput u oba prozora, a `Shift+M` i
 * `Shift+D` su zamenili `M` i `D` (plan crtanja, dopune).
 */
export function precice(kontekst: KontekstPrecica): Red[] {
  const crtanje: Red[] = kontekst === 'konzola'
    ? [{ tasteri: ['D'], opis: 'Crtanje preko slajda: uključi ili završi (u crtanju 1–7 alat, Ctrl+Z poništi, Ctrl+Y vrati, Esc završi)' }]
    : [];
  return [
    { tasteri: ['→', 'PageDown', 'Enter'], opis: 'Dalje: sledeća stavka, otvori ili zatvori pitanje, sledeći slajd' },
    { tasteri: ['←', 'PageUp'], opis: 'Nazad' },
    { tasteri: ['Home'], opis: 'Prijava (QR i kod)' },
    { tasteri: ['End'], opis: 'Poslednji slajd' },
    { tasteri: ['G', 'broj', 'Enter'], opis: 'Idi na slajd sa tim brojem (G 0 Enter: prijava)' },
    { tasteri: ['O'], opis: 'Otvori ili zatvori pitanje' },
    { tasteri: ['Space'], opis: 'Rezultati' },
    { tasteri: ['C'], opis: 'Tačan odgovor' },
    { tasteri: ['L'], opis: 'Rang-lista prezentacije (★, pa brzina; u takmičenju poeni)' },
    { tasteri: ['Shift', 'L'], opis: 'Rang-lista celog predavanja (sve prezentacije)' },
    { tasteri: ['R'], opis: 'Ponovi pitanje (pritisni R dvaput)' },
    { tasteri: ['Shift', 'R'], opis: 'Rešenje zadatka (posle zatvaranja)' },
    { tasteri: ['T'], opis: 'Tajmer: pokreni 30 s, pauziraj, nastavi' },
    { tasteri: ['+', '-'], opis: 'Tajmer ±10 s' },
    { tasteri: ['Shift', 'M'], opis: 'Telefon: samo dugmad ili celo pitanje' },
    { tasteri: ['Shift', 'D'], opis: 'Dozvoli ili zabrani „Detalje“ na telefonu' },
    { tasteri: ['Q'], opis: 'QR preko celog ekrana' },
    { tasteri: ['K'], opis: 'Link za fajlove na tabli (do sledećeg slajda)' },
    { tasteri: ['B', '.'], opis: 'Crn ekran' },
    { tasteri: ['W'], opis: 'Beo ekran / bela tabla (crtež bele pozadine)' },
    ...crtanje,
    { tasteri: ['F'], opis: 'Ceo ekran (samo ovaj prozor)' },
    { tasteri: ['P'], opis: kontekst === 'publika' ? 'Otvori konzolu' : 'Otvori prikaz za publiku' },
    { tasteri: ['?'], opis: 'Ova pomoć' },
  ];
}

/** Pomoć sa prečicama (`?`). Stilovi su ovde, ne u globalnom CSS-u: početni paket je na granici budžeta. */
@Component({
  selector: 'app-pomoc-precice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  styles: `
    .uz-pomoc { width: 100%; border-collapse: collapse; }
    .uz-pomoc :is(th, td) { padding: 5px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    .uz-pomoc th { white-space: nowrap; font-weight: 400; }
    .uz-pomoc-napomena { margin-top: 12px; color: var(--muted); }
  `,
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
