import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';
import { PromenaTerminaOdgovor, RasporedCmd, RasporedDetails, RasporedInfo, TerminCmd, TerminInfo } from './raspored.models';

const tiho = new HttpContext().set(LOCAL_ERRORS, true);
const kontekst = (o?: OpcijeZahteva) => (o?.tiho ? tiho : undefined);

/**
 * Raspored časova i termini (`api/rasporedi*`, ADMIN: samo uz sesiju nastavnika, nikad pod `api/public`). Imena i razlozi
 * najava dolaze samo ovuda.
 */
@Injectable({ providedIn: 'root' })
export class RasporedApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/rasporedi`;

  lista(opcije?: OpcijeZahteva): Observable<RasporedInfo[]> {
    return this.http.get<RasporedInfo[]>(this.url, { context: kontekst(opcije) });
  }

  detalj(id: number, opcije?: OpcijeZahteva): Observable<RasporedDetails> {
    return this.http.get<RasporedDetails>(`${this.url}/${id}`, { context: kontekst(opcije) });
  }

  /** 201; 400 sa porukom servera (npr. „Termin 2: početak mora biti pre kraja.“). */
  kreiraj(cmd: RasporedCmd, opcije?: OpcijeZahteva): Observable<RasporedDetails> {
    return this.http.post<RasporedDetails>(this.url, cmd, { context: kontekst(opcije) });
  }

  izmeni(id: number, cmd: RasporedCmd, opcije?: OpcijeZahteva): Observable<RasporedDetails> {
    return this.http.put<RasporedDetails>(`${this.url}/${id}`, cmd, { context: kontekst(opcije) });
  }

  obrisi(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`, { context: kontekst(opcije) });
  }

  /** Termini svih perioda od `od` (null = danas na serveru) narednih `dana` dana. */
  termini(od: string | null, dana: number, opcije?: OpcijeZahteva): Observable<TerminInfo[]> {
    let params = new HttpParams().set('dana', dana);
    if (od) {
      params = params.set('od', od);
    }
    return this.http.get<TerminInfo[]>(`${this.url}/termini`, { params, context: kontekst(opcije) });
  }

  /** Otkazuje termin i javlja studentima mejlom; ponovljeno menja samo napomenu. 409 kad je počeo. */
  otkazi(cmd: TerminCmd, opcije?: OpcijeZahteva): Observable<PromenaTerminaOdgovor> {
    return this.http.post<PromenaTerminaOdgovor>(`${this.url}/termini/otkazi`, cmd, { context: kontekst(opcije) });
  }

  /** Vraća otkazan termin („čas se ipak održava“, mejl studentima). */
  vrati(cmd: TerminCmd, opcije?: OpcijeZahteva): Observable<PromenaTerminaOdgovor> {
    return this.http.post<PromenaTerminaOdgovor>(`${this.url}/termini/vrati`, cmd, { context: kontekst(opcije) });
  }
}
