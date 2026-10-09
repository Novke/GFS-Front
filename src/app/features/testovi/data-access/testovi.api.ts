import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { TipTestaInfo } from '../../../core/api/reference.api';
import { Strana } from '../../../shared/models/strana';
import { ListQuery, toHttpParams } from '../../../shared/store/list-params';
import {
  CreateTestCmd,
  CreateTipTestaCmd,
  EvidentirajPolaganjeCmd,
  PragProlazaCmd,
  TestDetails,
  TestInfo,
  TestListItem,
  TestoviFilteri,
  UpdateTestCmd,
} from './testovi.models';

/** Opcije zahteva: `tiho` = greška ne ide u snackbar (`LOCAL_ERRORS`), pozivalac je prikazuje sam. */
export interface OpcijeZahteva {
  tiho?: boolean;
}

/** `status` liste u parametar `pregledan`; nepoznata vrednost (ručno izmenjen URL) znači bez filtera. */
export function pregledanZaStatus(status: TestoviFilteri['status'] | string | null | undefined): boolean | null {
  return status === 'evidentiran' ? true : status === 'za-evidentiranje' ? false : null;
}

/** Testovi (`TestRest`). Sve putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class TestoviApi {
  private readonly http = inject(HttpClient);

  private kontekst(opcije: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false);
  }

  /**
   * `GET test/pretraga`: `predmet` -> `predmetId`, `grupa` -> `grupaId`, `tip` -> `tipTestaId`, `status` -> `pregledan`;
   * `godina`, `od`, `do` pod svojim imenom.
   */
  pretraga(q: ListQuery<TestoviFilteri>, opcije: OpcijeZahteva = {}): Observable<Strana<TestListItem>> {
    const { status, ...ostali } = q.filteri;
    const params = toHttpParams({ ...q, filteri: { ...ostali, pregledan: pregledanZaStatus(status) } }, {
      predmet: 'predmetId',
      grupa: 'grupaId',
      tip: 'tipTestaId',
    });
    return this.http.get<Strana<TestListItem>>(`${API_URL}/test/pretraga`, { params, context: this.kontekst(opcije) });
  }

  /** `GET test/{id}`: jedini odgovor sa `statistika`. */
  get(id: number, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.get<TestDetails>(`${API_URL}/test/${id}`, { context: this.kontekst(opcije) });
  }

  create(cmd: CreateTestCmd, opcije: OpcijeZahteva = {}): Observable<TestInfo> {
    return this.http.post<TestInfo>(`${API_URL}/test`, cmd, { context: this.kontekst(opcije) });
  }

  update(id: number, cmd: UpdateTestCmd, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.put<TestDetails>(`${API_URL}/test/${id}`, cmd, { context: this.kontekst(opcije) });
  }

  /** `POST test/{id}/polaganje` sa telom `IdCmd` (`{ id: studentId }`); student iz iste ili starije grupe. */
  dodajPolaganje(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.post<TestDetails>(`${API_URL}/test/${id}/polaganje`, { id: studentId }, { context: this.kontekst(opcije) });
  }

  ukloniPolaganje(id: number, studentId: number, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.delete<TestDetails>(`${API_URL}/test/${id}/polaganje/${studentId}`, { context: this.kontekst(opcije) });
  }

  /** `PATCH test/{id}/polaganje`: upisuje varijantu, poene, prepisivanje i napomenu dodatog ispitanika. */
  evidentiraj(id: number, cmd: EvidentirajPolaganjeCmd, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.patch<TestDetails>(`${API_URL}/test/${id}/polaganje`, cmd, { context: this.kontekst(opcije) });
  }

  /** `PATCH test/{id}`: završava evidentiranje (svi ispitanici moraju imati poene). */
  zavrsi(id: number, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    return this.http.patch<TestDetails>(`${API_URL}/test/${id}`, null, { context: this.kontekst(opcije) });
  }

  /** `PATCH test/{id}/prag-prolaza`: postavlja ili (`null`) briše prag prolaza, i na evidentiranom testu. */
  pragProlaza(id: number, pragProlaza: number | null, opcije: OpcijeZahteva = {}): Observable<TestDetails> {
    const cmd: PragProlazaCmd = { pragProlaza };
    return this.http.patch<TestDetails>(`${API_URL}/test/${id}/prag-prolaza`, cmd, { context: this.kontekst(opcije) });
  }

  /** `DELETE test/{id}`: briše test i njegova polaganja (204). */
  obrisi(id: number, opcije: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/test/${id}`, { context: this.kontekst(opcije) });
  }

  /** `POST test/tip`: nov (aktivan) tip testa predmeta. */
  noviTip(cmd: CreateTipTestaCmd, opcije: OpcijeZahteva = {}): Observable<TipTestaInfo> {
    return this.http.post<TipTestaInfo>(`${API_URL}/test/tip`, cmd, { context: this.kontekst(opcije) });
  }
}
