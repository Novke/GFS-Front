import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

import { NotificationStore, Poruka } from '../state/notification.store';

const TRAJANJE_USPEH_MS = 3000;
const TRAJANJE_INFO_MS = 4000;

function podesavanje(p: Poruka): MatSnackBarConfig {
  switch (p.tip) {
    case 'greska':
      // Bez auto-zatvaranja; assertive da čitač ekrana odmah pročita grešku.
      return { politeness: 'assertive', panelClass: 'snackbar-greska' };
    case 'uspeh':
      return { duration: TRAJANJE_USPEH_MS, politeness: 'polite', panelClass: 'snackbar-uspeh' };
    case 'info':
      return { duration: TRAJANJE_INFO_MS, politeness: 'polite', panelClass: 'snackbar-info' };
  }
}

/** Prikazuje poruke iz `NotificationStore` kroz `MatSnackBar`. Postavlja se jednom, u `AppComponent`. */
@Component({
  selector: 'app-snackbar-host',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnackbarHost {
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    inject(NotificationStore).poruke$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(p => this.prikazi(p));
  }

  private prikazi(p: Poruka): void {
    const labela = p.akcija?.label ?? (p.tip === 'greska' ? 'Zatvori' : undefined);
    const ref = this.snackBar.open(p.tekst, labela, podesavanje(p));
    const run = p.akcija?.run;
    if (run) {
      ref.onAction().subscribe(() => run());
    }
  }
}
