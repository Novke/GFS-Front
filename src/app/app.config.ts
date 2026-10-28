import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import localeSrLatn from '@angular/common/locales/sr-Latn';
import { ApplicationConfig, ErrorHandler, inject, LOCALE_ID, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { errorInterceptor } from './core/api/error.interceptor';
import { sesijaInterceptor } from './core/auth/sesija.interceptor';
import { Izdanje } from './core/izdanje/izdanje';
import { GfsErrorHandler, izdanjeInterceptor } from './core/izdanje/izdanje-greske';
import { registrujIkone } from './core/layout/icons';
import { GfsTitleStrategy } from './core/title-strategy';
import { PreferencesStore } from './core/state/preferences.store';

registerLocaleData(localeSrLatn, 'sr-Latn');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: GfsTitleStrategy },
    { provide: ErrorHandler, useClass: GfsErrorHandler },
    { provide: LOCALE_ID, useValue: 'sr-Latn' },
    { provide: MAT_DATE_LOCALE, useValue: 'sr-Latn' },
    provideNativeDateAdapter(),
    provideHttpClient(withXhr(), withInterceptors([izdanjeInterceptor, sesijaInterceptor, errorInterceptor]), withInterceptorsFromDi()),
    provideAppInitializer(() => {
      registrujIkone(inject(MatIconRegistry), inject(DomSanitizer));
      // Store odmah preuzima data-mode od inline skripte iz index.html i prati promenu sistemske teme.
      inject(PreferencesStore);
      // Praćenje izdanja (zastarela kartica posle deploy-a); bez meta oznake u index.html ne radi ništa.
      inject(Izdanje);
    }),
  ],
};
