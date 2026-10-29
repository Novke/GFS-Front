import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { PushApi, PushPretplataCmd, StanjePushServera } from '../../../core/pwa/push-uredjaj';
import { Zvono } from './obavestenja.models';

/**
 * Zvono i push studenta (spec „Aplikacija i obaveštenja“ 5.4 i 6.8; ugovor u planu): samo `api/public/nalog/*`. Student i
 * uređaj su iz kolačića `gfs_student` (401 bez njega). Greške prikazuje komponenta (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class ObavestenjaApi implements PushApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog`;

  zvono(): Observable<Zvono> {
    return this.http.get<Zvono>(`${this.koren}/obavestenja`, { context: this.lokalneGreske });
  }

  /** Student je otvorio zvono: tačka se gasi na svim njegovim uređajima. */
  otvoreno(): Observable<void> {
    return this.http.post<void>(`${this.koren}/obavestenja/otvoreno`, null, { context: this.lokalneGreske });
  }

  stanje(): Observable<StanjePushServera> {
    return this.http.get<StanjePushServera>(`${this.koren}/push`, { context: this.lokalneGreske });
  }

  pretplati(cmd: PushPretplataCmd): Observable<void> {
    return this.http.put(`${this.koren}/push`, cmd, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }

  odjavi(): Observable<void> {
    return this.http.delete(`${this.koren}/push`, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }

  proba(): Observable<void> {
    return this.http.post(`${this.koren}/push/proba`, null, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }
}
