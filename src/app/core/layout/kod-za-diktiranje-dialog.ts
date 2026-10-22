import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle,
} from '@angular/material/dialog';

import { KodZaDiktiranjeInfo } from '../api/kod-za-diktiranje.api';

let broj = 0;

/** `2026-10-22T14:35:00` -> `14:35` (vreme servera je lokalno, kao i nastavnikov sat). */
export function vremeIsteka(istice: string): string {
  const m = /T(\d{2}:\d{2})/u.exec(istice ?? '');
  return m ? m[1] : istice;
}

/** `123456` -> `123 456` (lakše se diktira). */
export function kodZaCitanje(kod: string): string {
  return /^\d{6}$/u.test(kod) ? `${kod.slice(0, 3)} ${kod.slice(3)}` : kod;
}

/**
 * Kod za diktiranje, prikazan jednom (plan C): veliki kod, do kada važi i šta student upisuje na `/nalog` ("Imam kod od
 * nastavnika", pa indeks i godina). Posle zatvaranja kod se više ne može videti: novi kod poništava ovaj.
 */
@Component({
  selector: 'app-kod-za-diktiranje-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Kod za diktiranje</h2>
    <mat-dialog-content [id]="opisId">
      <p class="kod" data-kod [attr.aria-label]="'Kod ' + k.kod.split('').join(' ')">{{ citanje }}</p>
      <p class="istice">Važi do <strong>{{ istice }}</strong> (10 minuta) i samo jednom.</p>
      <ol class="koraci">
        <li>Student otvara stranicu <strong>/nalog</strong> i bira „Imam kod od nastavnika“.</li>
        <li>Upisuje indeks <strong class="mono" data-indeks>{{ k.indeks }}</strong> i godinu upisa
          <strong class="mono" data-godina>{{ k.godina }}</strong>.</li>
        <li>Upisuje ovaj kod.</li>
      </ol>
      @if (k.upozorenje) {
        <p class="upozorenje" role="note" data-upozorenje>{{ k.upozorenje }}</p>
      }
      <p class="napomena">Kod se ne šalje mejlom i prikazuje se samo sada. Kod sa mejla, ako ga student ima, i dalje važi.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" data-zatvori mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
  styles: `
    .kod {
      margin: 4px 0 12px;
      padding: 12px 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm, 8px);
      background: var(--surface-2);
      color: var(--ink);
      font-family: var(--font-mono);
      font-size: 40px;
      font-weight: 700;
      letter-spacing: .12em;
      text-align: center;
      user-select: all;
    }
    .istice, .napomena { margin: 0 0 8px; }
    .napomena { color: var(--muted); font-size: 13px; }
    .koraci { margin: 0 0 8px; padding-left: 1.25rem; }
    .koraci li { margin-bottom: 2px; }
    .mono { font-family: var(--font-mono); }
    .upozorenje { margin: 0 0 8px; padding: 8px 12px; border-radius: var(--radius-sm, 8px); background: var(--warn-soft); color: var(--ink); }
  `,
})
export class KodZaDiktiranjeDialog {
  protected readonly k = inject<KodZaDiktiranjeInfo>(MAT_DIALOG_DATA);
  protected readonly citanje = kodZaCitanje(this.k.kod);
  protected readonly istice = vremeIsteka(this.k.istice);
  protected readonly opisId = `${inject(MatDialogRef).id}-opis`;

  static otvori(dialog: MatDialog, k: KodZaDiktiranjeInfo): MatDialogRef<KodZaDiktiranjeDialog> {
    const id = `kod-za-diktiranje-${++broj}`;
    return dialog.open(KodZaDiktiranjeDialog, {
      id, data: k, ariaDescribedBy: `${id}-opis`, autoFocus: 'first-heading', width: '28rem', maxWidth: '92vw',
    });
  }
}
