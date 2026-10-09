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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-snackbar-host />
  `,
})
export class AppComponent {}
