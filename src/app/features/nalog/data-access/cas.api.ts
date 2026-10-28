import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { CasStanje, SkeniranjeOdgovor } from './cas.models';

/**
 * Čekiranje studenta (`/nalog/cas`, javna ruta): samo `api/public/nalog/cas*`. Greške prikazuje stranica (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class CasApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog/cas`;

  /** Token iz QR-a. 410 "QR je istekao..." / "Čekiranje za ovaj čas je završeno."; 403 tuđa grupa; 409 nastavnik. */
  skeniraj(token: string): Observable<SkeniranjeOdgovor> {
    return this.http.post<SkeniranjeOdgovor>(`${this.koren}/skeniraj`, { token }, { context: this.lokalneGreske });
  }

  /** Ključ čekanja posle prijave: 200 stanje; 410 "Čekiranje je isteklo. Skeniraj QR ponovo."; 401 bez sesije studenta. */
  potvrdi(kljuc: string): Observable<CasStanje> {
    return this.http.post<CasStanje>(`${this.koren}/potvrdi`, { kljuc }, { context: this.lokalneGreske });
  }

  /** Stanje časa prijavljenog studenta; 401 bez sesije. */
  stanje(): Observable<CasStanje> {
    return this.http.get<CasStanje>(this.koren, { context: this.lokalneGreske });
  }
}
