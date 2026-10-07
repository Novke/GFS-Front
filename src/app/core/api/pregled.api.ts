import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';


/**
 * Deo odgovora `GET pregled/kontrolna-tabla` koji koriste brojači u navigaciji.
 * Pun tip (`sledece`, `uToku`, `nedelja`, tipovi stavki) dolazi sa kontrolnom tablom (Task 25).
 */
export interface KontrolnaTablaInfo {
  ceka: {
    /** Liste su ograničene na 10 stavki; ukupni brojevi su u `broj*`. */
    testovi: readonly unknown[];
    domaci: readonly unknown[];
    prijave: readonly unknown[];
    nezavrsena: readonly unknown[];
    brojTestova: number;
    brojDomacih: number;
    /** Zbir prijava na čekanju po svim otvorenim sesijama. */
    brojPrijava: number;
    brojNezavrsenih: number;
  };
}

@Injectable({ providedIn: 'root' })
export class PregledApi {
  private readonly http = inject(HttpClient);

  /** `tiho`: greška ne ide u snackbar (`LOCAL_ERRORS`), npr. za brojače koji se osvežavaju u pozadini. */
  kontrolnaTabla(opcije: { tiho?: boolean } = {}): Observable<KontrolnaTablaInfo> {
    return this.http.get<KontrolnaTablaInfo>(`${API_URL}/pregled/kontrolna-tabla`, {
      context: new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false),
    });
  }
}
