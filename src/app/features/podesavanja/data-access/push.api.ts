import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { PushApi, PushPretplataCmd, StanjePushServera } from '../../../core/pwa/push-uredjaj';

/** `GET|PUT api/push/podesavanja`: vrste nastavničkih obaveštenja (redom kao `VrstaObavestenja` na serveru). */
export interface VrstaPushaNastavnika {
  vrsta: string;
  naziv: string;
  ukljuceno: boolean;
}

/**
 * Push na nastavnikovim uređajima (spec „Aplikacija i obaveštenja“ 6.6; ugovor u planu): `api/push` (ADMIN, sesija
 * `gfs_nastavnik`, uređaj iz sesije). Greške prikazuje stranica (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class NastavnikPushApi implements PushApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/push`;

  stanje(): Observable<StanjePushServera> {
    return this.http.get<StanjePushServera>(this.koren, { context: this.lokalneGreske });
  }

  pretplati(cmd: PushPretplataCmd): Observable<void> {
    return this.http.put(this.koren, cmd, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }

  odjavi(): Observable<void> {
    return this.http.delete(this.koren, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }

  proba(): Observable<void> {
    return this.http.post(`${this.koren}/proba`, null, { context: this.lokalneGreske }).pipe(map(() => undefined));
  }

  vrste(): Observable<VrstaPushaNastavnika[]> {
    return this.http.get<{ vrste: VrstaPushaNastavnika[] }>(`${this.koren}/podesavanja`, { context: this.lokalneGreske })
      .pipe(map(o => o?.vrste ?? []));
  }

  promeniVrstu(vrsta: string, ukljuceno: boolean): Observable<VrstaPushaNastavnika[]> {
    return this.http.put<{ vrste: VrstaPushaNastavnika[] }>(`${this.koren}/podesavanja`, { vrsta, ukljuceno }, { context: this.lokalneGreske })
      .pipe(map(o => o?.vrste ?? []));
  }
}
