import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarConfig, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';

import { NotificationStore, Poruka } from '../state/notification.store';

const TRAJANJE_USPEH_MS = 3000;
const TRAJANJE_INFO_MS = 4000;
// Poruka sa akcijom ("Poništi") traje duže, da se akcija stigne stisnuti.
const TRAJANJE_AKCIJA_MS = 6000;

function podesavanje(p: Poruka): MatSnackBarConfig {
  switch (p.tip) {
    case 'greska':
      // Bez auto-zatvaranja; assertive da čitač ekrana odmah pročita grešku.
      return { politeness: 'assertive', panelClass: 'snackbar-greska' };
    case 'uspeh':
      return { duration: p.akcija ? TRAJANJE_AKCIJA_MS : TRAJANJE_USPEH_MS, politeness: 'polite', panelClass: 'snackbar-uspeh' };
    case 'info':
      return { duration: p.akcija ? TRAJANJE_AKCIJA_MS : TRAJANJE_INFO_MS, politeness: 'polite', panelClass: 'snackbar-info' };
  }
}

/**
 * Prikazuje poruke iz `NotificationStore` kroz `MatSnackBar`, jednu po jednu: sledeća tek kad se prethodna
 * zatvori (`MatSnackBar.open` bi inače zamenio otvorenu, pa bi uspeh sakrio grešku koja mora da ostane do zatvaranja).
 * Poruka sa `grupa` zamenjuje ranije poruke iste grupe (iz reda, a otvorenu zatvara), osim grešaka.
 * Postavlja se jednom, u `AppComponent`.
 */
@Component({
  selector: 'app-snackbar-host',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnackbarHost {
  private readonly snackBar = inject(MatSnackBar);
  private readonly red: Poruka[] = [];
  private otvorena = false;
  private tekuca: { poruka: Poruka; ref: MatSnackBarRef<TextOnlySnackBar> } | null = null;

  constructor() {
    inject(NotificationStore).poruke$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(p => this.primi(p));
  }

  private primi(p: Poruka): void {
    const zamenjiva = (q: Poruka) => p.grupa !== undefined && q.grupa === p.grupa && q.tip !== 'greska';
    if (p.grupa !== undefined && p.tip !== 'greska') {
      for (let i = this.red.length - 1; i >= 0; i--) {
        if (zamenjiva(this.red[i])) {
          this.red.splice(i, 1);
        }
      }
    }
    this.red.push(p);
    if (p.tip !== 'greska' && this.tekuca && zamenjiva(this.tekuca.poruka)) {
      this.tekuca.ref.dismiss(); // afterDismissed prikazuje sledeću
      return;
    }
    this.sledeca();
  }

  private sledeca(): void {
    const p = this.otvorena ? undefined : this.red.shift();
    if (!p) {
      return;
    }
    this.otvorena = true;
    const labela = p.akcija?.label ?? (p.tip === 'greska' ? 'Zatvori' : undefined);
    const ref = this.snackBar.open(p.tekst, labela, podesavanje(p));
    this.tekuca = { poruka: p, ref };
    const run = p.akcija?.run;
    if (run) {
      ref.onAction().subscribe(() => run());
    }
    ref.afterDismissed().subscribe(() => {
      this.otvorena = false;
      this.tekuca = null;
      this.sledeca();
    });
  }
}
