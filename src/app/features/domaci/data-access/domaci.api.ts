import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { Strana } from '../../../shared/models/strana';
import { ListQuery, toHttpParams } from '../../../shared/store/list-params';
import type { OpcijeZahteva } from '../../predavanja/data-access/predavanja.api';
import {
  CreateUradjenDomaciCmd,
  DodajDomaciCmd,
  DomaciDetails,
  DomaciFilteri,
  DomaciId,
  DomaciListItem,
  UpdateDomaciCmd,
} from './domaci.models';

/** `status` liste u parametar `pregledan`; nepoznata vrednost (ručno izmenjen URL) znači bez filtera. */
export function pregledanZaStatus(status: DomaciFilteri['status'] | string | null | undefined): boolean | null {
  return status === 'pregledan' ? true : status === 'za-pregled' ? false : null;
}

/** Domaći (`DomaciRest`). Sve putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class DomaciApi {
  private readonly http = inject(HttpClient);

  private kontekst(opcije: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false);
  }

  /** `GET domaci/pretraga`: `predmet` -> `predmetId`, `grupa` -> `grupaId`, `status` -> `pregledan`. */
  pretraga(q: ListQuery<DomaciFilteri>, opcije: OpcijeZahteva = {}): Observable<Strana<DomaciListItem>> {
    const { status, ...ostali } = q.filteri;
    const params = toHttpParams({ ...q, filteri: { ...ostali, pregledan: pregledanZaStatus(status) } }, {
      predmet: 'predmetId',
      grupa: 'grupaId',
    });
    return this.http.get<Strana<DomaciListItem>>(`${API_URL}/domaci/pretraga`, { params, context: this.kontekst(opcije) });
  }

  get(id: number, opcije: OpcijeZahteva = {}): Observable<DomaciDetails> {
    return this.http.get<DomaciDetails>(`${API_URL}/domaci/${id}`, { context: this.kontekst(opcije) });
  }

  dodaj(cmd: DodajDomaciCmd, opcije: OpcijeZahteva = {}): Observable<DomaciId> {
    return this.http.post<DomaciId>(`${API_URL}/domaci`, cmd, { context: this.kontekst(opcije) });
  }

  update(id: number, cmd: UpdateDomaciCmd, opcije: OpcijeZahteva = {}): Observable<DomaciDetails> {
    return this.http.put<DomaciDetails>(`${API_URL}/domaci/${id}`, cmd, { context: this.kontekst(opcije) });
  }

  /** `POST domaci/evidentiraj`: upisuje ili menja urađeni domaći jednog studenta; odgovor je ceo domaći. */
  evidentiraj(cmd: CreateUradjenDomaciCmd, opcije: OpcijeZahteva = {}): Observable<DomaciDetails> {
    return this.http.post<DomaciDetails>(`${API_URL}/domaci/evidentiraj`, cmd, { context: this.kontekst(opcije) });
  }

  /** `POST domaci/{id}/oslobodi`: oslobađa studente koji su bili aktivni (zadatak ili zvezdica) na predavanju. */
  oslobodi(id: number, opcije: OpcijeZahteva = {}): Observable<DomaciDetails> {
    return this.http.post<DomaciDetails>(`${API_URL}/domaci/${id}/oslobodi`, null, { context: this.kontekst(opcije) });
  }

  /** `PATCH domaci/{id}`: završava pregled (`pregledan = true`); nema tela u odgovoru. */
  zavrsi(id: number, opcije: OpcijeZahteva = {}): Observable<void> {
    return this.http.patch<void>(`${API_URL}/domaci/${id}`, null, { context: this.kontekst(opcije) });
  }

  /** `DELETE domaci/{id}`: briše domaći i njegove urađene domaće (204). */
  obrisi(id: number, opcije: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/domaci/${id}`, { context: this.kontekst(opcije) });
  }
}
