import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import { KoeficijentiInfo, RezultatiStudentaInfo, SaveKoeficijentiCmd } from './ocene.models';
import type { OpcijeZahteva } from './opcije-zahteva';

/** Predlog ocena i koeficijenti ocenjivanja (`OcenjivanjeRest`). Putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class OceneApi {
  private readonly http = inject(HttpClient);

  private kontekst(o: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false);
  }

  /** `GET ocenjivanje/predmet/{id}/koeficijenti`; predmet bez koeficijenata dobija podrazumevane (pravi ih server). */
  koeficijenti(predmetId: number, o: OpcijeZahteva = {}): Observable<KoeficijentiInfo> {
    return this.http.get<KoeficijentiInfo>(`${API_URL}/ocenjivanje/predmet/${predmetId}/koeficijenti`, { context: this.kontekst(o) });
  }

  /** `POST ocenjivanje/predmet/{id}/koeficijenti`. */
  sacuvajKoeficijente(predmetId: number, cmd: SaveKoeficijentiCmd, o: OpcijeZahteva = {}): Observable<KoeficijentiInfo> {
    return this.http.post<KoeficijentiInfo>(`${API_URL}/ocenjivanje/predmet/${predmetId}/koeficijenti`, cmd, { context: this.kontekst(o) });
  }

  /** `POST ocenjivanje/predmet/{id}/rezultati` sa `{grupaId}`: predlog ocena za svakog studenta grupe. */
  rezultati(predmetId: number, grupaId: number, o: OpcijeZahteva = {}): Observable<RezultatiStudentaInfo[]> {
    return this.http.post<RezultatiStudentaInfo[]>(`${API_URL}/ocenjivanje/predmet/${predmetId}/rezultati`, { grupaId }, {
      context: this.kontekst(o),
    });
  }
}
