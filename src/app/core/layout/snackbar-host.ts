import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

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

  constructor() {
    inject(NotificationStore).poruke$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(p => {
        this.red.push(p);
        this.sledeca();
      });
  }

  private sledeca(): void {
    const p = this.otvorena ? undefined : this.red.shift();
    if (!p) {
      return;
    }
    this.otvorena = true;
    const labela = p.akcija?.label ?? (p.tip === 'greska' ? 'Zatvori' : undefined);
    const ref = this.snackBar.open(p.tekst, labela, podesavanje(p));
    const run = p.akcija?.run;
    if (run) {
      ref.onAction().subscribe(() => run());
    }
    ref.afterDismissed().subscribe(() => {
      this.otvorena = false;
      this.sledeca();
    });
  }
}
