import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { AnketaStudentu } from './ankete-studenta.models';

/** Brza anketa studenta (javna ruta): samo `api/public/nalog/ankete*`; greške prikazuje list (`LOCAL_ERRORS`). */
@Injectable({ providedIn: 'root' })
export class AnketeStudentaApi {
  private readonly http = inject(HttpClient);
  private readonly tiho = { context: new HttpContext().set(LOCAL_ERRORS, true) };
  private readonly koren = `${API_URL}/public/nalog/ankete`;

  /** Isti skup kao `ankete` u stanju časa (telefon u prezentaciji); 401 bez sesije studenta. */
  ankete(): Observable<AnketaStudentu[]> {
    return this.http.get<AnketaStudentu[]>(this.koren, this.tiho);
  }

  /** Glas ili promena glasa; 403 "Ova anketa nije za tebe.", 409 "Anketa je zatvorena.", 400 neispravan izbor. */
  glasaj(id: number, opcije: number[]): Observable<AnketaStudentu> {
    return this.http.post<AnketaStudentu>(`${this.koren}/${id}/glas`, { opcije }, this.tiho);
  }
}
