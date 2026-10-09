import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

/** Oblik `assets/env.json` (pravi ga Dockerfile; lokalni `ng serve` ga nema). */
interface EnvJson {
  env?: string;
}

/**
 * Okruženje iz `assets/env.json` (`staging` | `prod`), učitano jednom pri prvoj upotrebi.
 * Koriste ga ljuska i oba layouta (i javni: `assets/env.json` je jedini dozvoljeni poziv van `api/public/upis`).
 * Bez fajla ili sa greškom: nije staging (bez oznake).
 */
@Injectable({ providedIn: 'root' })
export class Okruzenje {
  private readonly _staging = signal(false);
  readonly jeStaging = this._staging.asReadonly();

  constructor() {
    inject(HttpClient)
      .get<EnvJson>('assets/env.json')
      .pipe(catchError(() => of(null)))
      .subscribe(cfg => this._staging.set(cfg?.env === 'staging'));
  }
}
