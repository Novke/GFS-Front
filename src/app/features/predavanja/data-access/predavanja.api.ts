import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { Strana } from '../../../shared/models/strana';
import { ListQuery, toHttpParams } from '../../../shared/store/list-params';
import {
  PredavanjaFilteri,
  PredavanjeAktivnostInfo,
  PredavanjeDetails,
  PredavanjeListItem,
  StartPredavanjeCmd,
  UpdatePredavanjeCmd,
} from './predavanja.models';

/** Opcije zahteva: `tiho` = greška ne ide u snackbar (`LOCAL_ERRORS`), pozivalac je prikazuje sam. */
export interface OpcijeZahteva {
  tiho?: boolean;
}

/** `status` liste u parametar `zavrseno`; nepoznata vrednost (ručno izmenjen URL) znači bez filtera. */
export function zavrsenoZaStatus(status: PredavanjaFilteri['status'] | string | null | undefined): boolean | null {
  return status === 'zavrseno' ? true : status === 'u-toku' ? false : null;
}

/** Predavanja (`PredavanjeRest`). Sve putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class PredavanjaApi {
  private readonly http = inject(HttpClient);

  private kontekst(opcije: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false);
  }

  /** `GET predavanja/pretraga`: filteri su opcioni; `predmet` -> `predmetId`, `grupa` -> `grupaId`, `status` -> `zavrseno`. */
  pretraga(q: ListQuery<PredavanjaFilteri>, opcije: OpcijeZahteva = {}): Observable<Strana<PredavanjeListItem>> {
    const { status, ...ostali } = q.filteri;
    const params = toHttpParams({ ...q, filteri: { ...ostali, zavrseno: zavrsenoZaStatus(status) } }, {
      predmet: 'predmetId',
      grupa: 'grupaId',
    });
    return this.http.get<Strana<PredavanjeListItem>>(`${API_URL}/predavanja/pretraga`, { params, context: this.kontekst(opcije) });
  }

  get(id: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.get<PredavanjeDetails>(`${API_URL}/predavanja/${id}`, { context: this.kontekst(opcije) });
  }

  start(cmd: StartPredavanjeCmd, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.post<PredavanjeDetails>(`${API_URL}/predavanja/start`, cmd, { context: this.kontekst(opcije) });
  }

  update(id: number, cmd: UpdatePredavanjeCmd, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.put<PredavanjeDetails>(`${API_URL}/predavanja/${id}`, cmd, { context: this.kontekst(opcije) });
  }

  /** Posećenost = broj aktivnosti (računa server). */
  posecenost(id: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.put<PredavanjeDetails>(`${API_URL}/predavanja/${id}/posecenost`, null, { context: this.kontekst(opcije) });
  }

  prisustvo(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.patch<PredavanjeDetails>(`${API_URL}/predavanja/${id}/prisustvo`, { id: studentId }, { context: this.kontekst(opcije) });
  }

  ukloniPrisustvo(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${API_URL}/predavanja/${id}/prisustvo/${studentId}`, { context: this.kontekst(opcije) });
  }

  zadatak(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.patch<PredavanjeDetails>(`${API_URL}/predavanja/${id}/zadatak`, { id: studentId }, { context: this.kontekst(opcije) });
  }

  ukloniZadatak(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${API_URL}/predavanja/${id}/zadatak/${studentId}`, { context: this.kontekst(opcije) });
  }

  zvezdica(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.patch<PredavanjeDetails>(`${API_URL}/predavanja/${id}/zvezdica`, { id: studentId }, { context: this.kontekst(opcije) });
  }

  /** `PUT predavanja/aktivnost/{aktivnostId}`: napomena uz jednu aktivnost studenta. */
  napomena(aktivnostId: number, napomene: string, opcije: OpcijeZahteva = {}): Observable<PredavanjeAktivnostInfo> {
    return this.http.put<PredavanjeAktivnostInfo>(`${API_URL}/predavanja/aktivnost/${aktivnostId}`, { napomene }, { context: this.kontekst(opcije) });
  }

  /** `PATCH predavanja/{id}`: završava predavanje. */
  zavrsi(id: number, opcije: OpcijeZahteva = {}): Observable<PredavanjeDetails> {
    return this.http.patch<PredavanjeDetails>(`${API_URL}/predavanja/${id}`, null, { context: this.kontekst(opcije) });
  }

  /** `DELETE predavanja/{id}`: briše predavanje i njegove aktivnosti (204). */
  obrisi(id: number, opcije: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/predavanja/${id}`, { context: this.kontekst(opcije) });
  }

  /**
   * Predavanje sa najvećim `rb` (prazna strana kad predavanja nema): jedan zahtev `pretraga` sa `size=1&sort=rb,desc`,
   * bez filtera. Server novom predavanju dodeljuje `max(rb) + 1` preko svih predavanja (`findPoslednjiRB`, ne po paru
   * predmet + grupa), pa je to i predlog rednog broja. Greška je tiha, pozivalac je prikazuje sam.
   */
  poslednjiRb(): Observable<Strana<PredavanjeListItem>> {
    return this.pretraga(
      {
        filteri: { predmet: null, grupa: null, godina: null, status: null, q: null, od: null, do: null },
        sort: 'rb,desc',
        strana: 1,
        velicina: 1,
      },
      { tiho: true },
    );
  }
}
