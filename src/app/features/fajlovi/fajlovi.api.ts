import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../core/api/api-error';
import { API_URL } from '../../core/api/api-url';
import { FajloviCasa } from '../../shared/util/fajlovi';

/**
 * Jedini API javne rute `/f/:kod` (student na računaru u učionici, bez prijave): `GET api/public/fajlovi/<kod>`.
 * Svaki drugi `/api/*` je zaključan (401 otvara dijalog za lozinku), zato ovde nema ničeg drugog. Preuzimanje je običan
 * link (`urlFajlaCasa` iz `shared/util/fajlovi`), ne HTTP poziv. Greške prikazuje sama stranica (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class FajloviCasaApi {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  /** Fajlovi koda sa table; 404 = kod ne važi, 429 = previše pogrešnih pokušaja (poruka u `reason`). */
  casa(kod: string): Observable<FajloviCasa> {
    return this.http.get<FajloviCasa>(`${API_URL}/public/fajlovi/${encodeURIComponent(kod)}`, { context: this.context });
  }
}
