import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { routes } from './app.routing';
import { registrujIkone } from './core/layout/icons';
import { PreferencesStore } from './core/state/preferences.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptorsFromDi()),
    provideAppInitializer(() => {
      registrujIkone(inject(MatIconRegistry), inject(DomSanitizer));
      // Store odmah preuzima data-mode od inline skripte iz index.html i prati promenu sistemske teme.
      inject(PreferencesStore);
    }),
  ],
};
