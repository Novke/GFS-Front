import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { IzdanjeTraka } from './core/izdanje/izdanje-traka';
import { SnackbarHost } from './core/layout/snackbar-host';

/**
 * Koren: samo outlet, snackbar i traka novog izdanja. Ljuska, javni i projektorski layout su rute (`app.routes.ts`), pa se na javnoj
 * ruti `/upis` ljuska (i sve što zove zaključan `/api/*`) uopšte ne pravi.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SnackbarHost, IzdanjeTraka],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-snackbar-host />
    <app-izdanje-traka />
  `,
})
export class AppComponent {}
