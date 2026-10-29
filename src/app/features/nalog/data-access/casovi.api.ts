import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { NajavaCmd, NaredniCasovi, StudentskiTermin } from './casovi.models';

/**
 * Naredni časovi i najava odsustva (javna ruta `/nalog`): samo `api/public/nalog/casovi*`, sve uz kolačić studenta.
 * Greške prikazuje kartica (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class CasoviApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog/casovi`;

  /** Naredna 4 termina svakog časa iz rasporeda studenta; 401 bez sesije. */
  naredni(): Observable<NaredniCasovi> {
    return this.http.get<NaredniCasovi>(this.koren, { context: this.lokalneGreske });
  }

  /** "Neću doći" (ponovljeno menja razlog). 404 tuđ čas, 409 otkazan ili počeo, 400 predug razlog. */
  najavi(cmd: NajavaCmd): Observable<StudentskiTermin> {
    return this.http.post<StudentskiTermin>(`${this.koren}/najavi`, cmd, { context: this.lokalneGreske });
  }

  /** "Ipak dolazim"; iste greške kao najava. */
  povuci(cmd: NajavaCmd): Observable<StudentskiTermin> {
    return this.http.post<StudentskiTermin>(`${this.koren}/povuci`, cmd, { context: this.lokalneGreske });
  }
}
