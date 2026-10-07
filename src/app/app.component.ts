import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SnackbarHost } from './core/layout/snackbar-host';

/**
 * Koren: samo outlet i snackbar. Ljuska, javni i projektorski layout su rute (`app.routes.ts`), pa se na javnoj
 * ruti `/upis` ljuska (i sve što zove zaključan `/api/*`) uopšte ne pravi.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SnackbarHost],
  // PRIVREMENO (do Task 27): stari ekrani u outletu ne javljaju promene (bez signala/markForCheck); ispod OnPush
  // roditelja ne bi se nikad osvežili. Kad nestanu, vraća se OnPush.
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <router-outlet />
    <app-snackbar-host />
  `,
})
export class AppComponent {}
