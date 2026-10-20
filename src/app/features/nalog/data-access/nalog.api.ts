import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { KodOdgovor, OdjavaSvudaOdgovor, PomocOdgovor, StanjeNaloga, StudentJa } from './nalog.models';

/**
 * Jedini API javne rute `/nalog` (student na telefonu, bez sesije nastavnika): samo `api/public/nalog/*`. Svaki drugi
 * `/api/*` je zaključan (401 bi studentu otvorio dijalog za lozinku), zato ovde nema ničeg drugog. Greške prikazuje sama
 * stranica (`LOCAL_ERRORS`), nikad nastavnički snackbar.
 */
@Injectable({ providedIn: 'root' })
export class NalogApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog`;

  /** Kod na mejl studenta; isti odgovor i za nepostojeći indeks. 429 i 503 nose tekst servera. */
  posaljiKod(indeks: string): Observable<KodOdgovor> {
    return this.http.post<KodOdgovor>(`${this.koren}/kod`, { indeks }, { context: this.lokalneGreske });
  }

  /** 204 + kolačić `gfs_student` (365 dana); 401 "Kod nije ispravan ili je istekao.", 429. */
  prijavi(indeks: string, kod: string): Observable<void> {
    return this.http.post<void>(`${this.koren}/prijava`, { indeks, kod }, { context: this.lokalneGreske });
  }

  stanje(): Observable<StanjeNaloga> {
    return this.http.get<StanjeNaloga>(`${this.koren}/stanje`, { context: this.lokalneGreske });
  }

  ja(): Observable<StudentJa> {
    return this.http.get<StudentJa>(`${this.koren}/ja`, { context: this.lokalneGreske });
  }

  /** Odjava ovog uređaja. */
  odjavi(): Observable<void> {
    return this.http.post<void>(`${this.koren}/odjava`, null, { context: this.lokalneGreske });
  }

  /** Odjava svih uređaja studenta (i ovog). */
  odjaviSvuda(): Observable<OdjavaSvudaOdgovor> {
    return this.http.post<OdjavaSvudaOdgovor>(`${this.koren}/odjava-svuda`, null, { context: this.lokalneGreske });
  }

  /** "Ne stiže mi kod": obaveštenje nastavniku. */
  pomoc(indeks: string): Observable<PomocOdgovor> {
    return this.http.post<PomocOdgovor>(`${this.koren}/pomoc`, { indeks }, { context: this.lokalneGreske });
  }
}
