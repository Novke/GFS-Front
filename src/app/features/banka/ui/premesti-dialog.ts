import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { Observable } from 'rxjs';

import { GrupaCvor, nadjiCvor, putanjaDo } from '../data-access/banka.models';
import { MAX_DUBINA_STABLA } from './stablo-grupa.component';

export interface PremestiDialogPodaci {
  stablo: readonly GrupaCvor[];
  /** Grupa koja se premešta. */
  id: number;
}

/** Mesto u izboru: koren (`id` 0) ili grupa sa uvlakom; `razlog` je zašto ne može (ili `null`). */
export interface Odrediste {
  id: number;
  naziv: string;
  dubina: number;
  razlog: string | null;
}

/** Ključ korena u radio grupi (id-jevi grupa su pozitivni). */
const KOREN = 0;

function visina(c: GrupaCvor): number {
  return 1 + Math.max(0, ...c.deca.map(visina));
}

/**
 * Mesta na koja grupa `id` sme da pređe: koren i sve grupe osim nje same i njenog podstabla. Onemogućeno (sa razlogom):
 * sadašnji roditelj, list sa varijantama (ne prima podgrupe) i mesto gde bi podstablo prešlo najveću dubinu.
 */
export function odredista(stablo: readonly GrupaCvor[], id: number): Odrediste[] {
  const premestana = nadjiCvor(stablo, id);
  if (!premestana) {
    return [];
  }
  const roditeljId = putanjaDo(stablo, id).at(-2)?.id ?? KOREN;
  const potrebno = visina(premestana);
  const razlog = (mestoId: number, dubina: number, c: GrupaCvor | null): string | null => {
    if (mestoId === roditeljId) {
      return 'sada je ovde';
    }
    if (c && c.list && c.brojVarijanti > 0) {
      return 'ima varijante';
    }
    return dubina + potrebno > MAX_DUBINA_STABLA ? 'stablo bi bilo preduboko' : null;
  };
  const lista: Odrediste[] = [{ id: KOREN, naziv: 'Koren (vrh stabla)', dubina: 0, razlog: razlog(KOREN, 0, null) }];
  const obidji = (cvorovi: readonly GrupaCvor[], dubina: number) => {
    for (const c of cvorovi) {
      if (c.id === id) {
        continue;
      }
      lista.push({ id: c.id, naziv: c.naziv, dubina, razlog: razlog(c.id, dubina, c) });
      obidji(c.deca, dubina + 1);
    }
  };
  obidji(stablo, 1);
  return lista;
}

/**
 * "Premesti u…": izbor nove nadgrupe (radio lista stabla bez podstabla grupe koja se premešta, sa korenom na vrhu). Grupa
 * ide na kraj braće. Vraća id nove nadgrupe, `null` za koren ili `undefined` (Odustani).
 */
@Component({
  selector: 'app-premesti-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatRadioButton, MatRadioGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Premesti grupu „{{ naziv }}“</h2>
    <mat-dialog-content>
      <p id="bk-premesti-opis" class="bk-dijalog-opis">Izaberi novu nadgrupu. Grupa prelazi sa svim podgrupama i varijantama i ide na kraj liste.</p>
      <mat-radio-group class="bk-odredista" aria-labelledby="bk-premesti-opis" [value]="izbor()" (change)="izbor.set($event.value)">
        @for (o of mesta; track o.id) {
          <mat-radio-button [value]="o.id" [disabled]="o.razlog !== null" [style.--bk-dubina]="o.dubina" [attr.data-odrediste]="o.id">
            {{ o.naziv }}@if (o.razlog) {<span class="bk-razlog"> ({{ o.razlog }})</span>}
          </mat-radio-button>
        }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="undefined">Odustani</button>
      <button matButton="filled" type="button" [disabled]="!moze()" (click)="premesti()" data-premesti>Premesti</button>
    </mat-dialog-actions>
  `,
  styles: `
    .bk-dijalog-opis { margin: 0 0 12px; color: var(--ink-2); }
    .bk-odredista { display: flex; flex-direction: column; }
    .bk-odredista .mat-mdc-radio-button { padding-left: calc(var(--bk-dubina, 0) * 20px); }
    .bk-razlog { color: var(--muted); font-size: 13px; }
  `,
})
export class PremestiDialog {
  private readonly d = inject<PremestiDialogPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PremestiDialog, number | null>>(MatDialogRef);

  protected readonly naziv = nadjiCvor(this.d.stablo, this.d.id)?.naziv ?? '';
  protected readonly mesta = odredista(this.d.stablo, this.d.id);
  protected readonly izbor = signal<number | null>(null);
  protected readonly moze = computed(() => {
    const id = this.izbor();
    return this.mesta.some(o => o.id === id && o.razlog === null);
  });

  static otvori(dialog: MatDialog, podaci: PremestiDialogPodaci): Observable<number | null | undefined> {
    return dialog
      .open<PremestiDialog, PremestiDialogPodaci, number | null>(PremestiDialog, { data: podaci, width: '32rem', maxWidth: '96vw' })
      .afterClosed();
  }

  protected premesti(): void {
    const id = this.izbor();
    if (this.moze() && id !== null) {
      this.ref.close(id === KOREN ? null : id);
    }
  }
}
