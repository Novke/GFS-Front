import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../core/api/api-error';
import { API_URL } from '../../core/api/api-url';

/** `GET api/public/upis/{token}` (`JavniUpisInfo` na serveru). */
export interface JavniUpisInfo {
  grupaNaziv: string;
  godinaUpisa: number;
  otvorena: boolean;
  istice: string;
}

/** Telo `POST api/public/upis/{token}` (`PodnesiPrijavuCmd`). */
export interface PodnesiPrijavuCmd {
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string;
  brojTelefona: string;
  datumRodjenja: string | null;
  opstina: string | null;
}

export interface PodnetaPrijavaInfo {
  id: number;
}

/**
 * Jedini API javne rute `/upis/:token`: samo `GET` i `POST` na `api/public/upis/{token}`. Svaki drugi `/api/*` je
 * zaključan (401 otvara studentu dijalog za lozinku), zato ovde nema ničeg drugog. Greške prikazuje sama forma
 * (`LOCAL_ERRORS`), nikad nastavnički snackbar. Token je već proveren (`TOKEN` u pravilima) kad stigne ovde.
 */
@Injectable({ providedIn: 'root' })
export class UpisApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);

  info(token: string): Observable<JavniUpisInfo> {
    return this.http.get<JavniUpisInfo>(`${API_URL}/public/upis/${token}`, { context: this.lokalneGreske });
  }

  podnesi(token: string, cmd: PodnesiPrijavuCmd): Observable<PodnetaPrijavaInfo> {
    return this.http.post<PodnetaPrijavaInfo>(`${API_URL}/public/upis/${token}`, cmd, { context: this.lokalneGreske });
  }
}
