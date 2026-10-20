import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';
import { LtiRegistracijaCmd, LtiRegistracijaInfo, LtiVrednostiZaMoodle } from './lti.models';

const tiho = new HttpContext().set(LOCAL_ERRORS, true);
const kontekst = (o?: OpcijeZahteva) => (o?.tiho ? tiho : undefined);

/**
 * Registracije alata na Moodle-u (Podešavanja -> Moodle; `api/lti/registracije`, ADMIN: samo uz sesiju nastavnika, nikad pod
 * `api/public`). Greške bez `tiho` idu u snackbar kao kod ostalih nastavničkih klijenata.
 */
@Injectable({ providedIn: 'root' })
export class LtiApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/lti/registracije`;

  lista(opcije?: OpcijeZahteva): Observable<LtiRegistracijaInfo[]> {
    return this.http.get<LtiRegistracijaInfo[]>(this.url, { context: kontekst(opcije) });
  }

  /** Tool URL, Initiate login URL, Redirection URI i Public keyset URL (host je adresa GFS-a na serveru). */
  vrednosti(opcije?: OpcijeZahteva): Observable<LtiVrednostiZaMoodle> {
    return this.http.get<LtiVrednostiZaMoodle>(`${this.url}/vrednosti`, { context: kontekst(opcije) });
  }

  /** 201 sa sačuvanom; 400 (adresa nije `https://`, predugačko), 409 (ista trojka issuer, Client ID, Deployment ID). */
  dodaj(cmd: LtiRegistracijaCmd, opcije?: OpcijeZahteva): Observable<LtiRegistracijaInfo> {
    return this.http.post<LtiRegistracijaInfo>(this.url, cmd, { context: kontekst(opcije) });
  }

  izmeni(id: number, cmd: LtiRegistracijaCmd, opcije?: OpcijeZahteva): Observable<LtiRegistracijaInfo> {
    return this.http.put<LtiRegistracijaInfo>(`${this.url}/${id}`, cmd, { context: kontekst(opcije) });
  }

  obrisi(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`, { context: kontekst(opcije) });
  }
}
