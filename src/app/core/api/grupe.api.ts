import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import {
  CreateGrupaCmd,
  CreateStudentCmd,
  GrupaInfo,
  GrupaPregledInfo,
  PrisustvoMatricaInfo,
  StudentInfo,
  UpdateGrupaCmd,
  UpdateStudentCmd,
} from './grupe.models';

/** `tiho` = greška ne ide u snackbar (`LOCAL_ERRORS`), pozivalac je prikazuje sam (panel, traka forme). */
export interface OpcijeGrupa {
  tiho?: boolean;
}

/** Grupe (`GrupaRest`) i dodavanje/izmena studenata grupe (`StudentRest`). Putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class GrupeApi {
  private readonly http = inject(HttpClient);

  private kontekst(o: OpcijeGrupa): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false);
  }

  /** `GET grupe`: sve grupe sa brojem studenata. */
  sve(o: OpcijeGrupa = {}): Observable<GrupaInfo[]> {
    return this.http.get<GrupaInfo[]>(`${API_URL}/grupe`, { context: this.kontekst(o) });
  }

  /** `GET grupe/{id}` (`GrupaDetails` sa studentima; ovde je dovoljno zaglavlje). */
  get(id: number, o: OpcijeGrupa = {}): Observable<GrupaInfo> {
    return this.http.get<GrupaInfo>(`${API_URL}/grupe/${id}`, { context: this.kontekst(o) });
  }

  create(cmd: CreateGrupaCmd, o: OpcijeGrupa = {}): Observable<GrupaInfo> {
    return this.http.post<GrupaInfo>(`${API_URL}/grupe`, cmd, { context: this.kontekst(o) });
  }

  update(id: number, cmd: UpdateGrupaCmd, o: OpcijeGrupa = {}): Observable<GrupaInfo> {
    return this.http.put<GrupaInfo>(`${API_URL}/grupe/${id}`, cmd, { context: this.kontekst(o) });
  }

  /** `GET grupe/{id}/pregled[?predmetId]`: G1 + G2; bez predmeta preko svih predmeta. */
  pregled(id: number, predmetId?: number | null, o: OpcijeGrupa = {}): Observable<GrupaPregledInfo> {
    let params = new HttpParams();
    if (predmetId) {
      params = params.set('predmetId', String(predmetId));
    }
    return this.http.get<GrupaPregledInfo>(`${API_URL}/grupe/${id}/pregled`, { params, context: this.kontekst(o) });
  }

  /**
   * `GET grupe/{id}/prisustvo?predmetId&godina`: G3. Bez godine server vraća sva predavanja (neograničeno), zato ekran
   * uvek šalje školsku godinu.
   */
  prisustvo(id: number, predmetId: number, godina?: number | null, o: OpcijeGrupa = {}): Observable<PrisustvoMatricaInfo> {
    let params = new HttpParams().set('predmetId', String(predmetId));
    if (godina !== null && godina !== undefined) {
      params = params.set('godina', String(godina));
    }
    return this.http.get<PrisustvoMatricaInfo>(`${API_URL}/grupe/${id}/prisustvo`, { params, context: this.kontekst(o) });
  }

  /** `POST studenti`. */
  dodajStudenta(cmd: CreateStudentCmd, o: OpcijeGrupa = {}): Observable<StudentInfo> {
    return this.http.post<StudentInfo>(`${API_URL}/studenti`, cmd, { context: this.kontekst(o) });
  }

  /** `PUT studenti/{id}`: izmena i premeštanje (`grupaId`). */
  izmeniStudenta(id: number, cmd: UpdateStudentCmd, o: OpcijeGrupa = {}): Observable<StudentInfo> {
    return this.http.put<StudentInfo>(`${API_URL}/studenti/${id}`, cmd, { context: this.kontekst(o) });
  }
}
