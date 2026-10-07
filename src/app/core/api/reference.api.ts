import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_URL } from './api-url';

/** Ogledaju backend DTO-e `PredmetInfo`, `GrupaInfo`, `TipTestaInfo`. */
export interface PredmetInfo {
  id: number;
  naziv: string;
}

export interface GrupaInfo {
  id: number;
  naziv: string;
  godinaUpisa: number | null;
  brojStudenata: number | null;
}

export interface TipTestaInfo {
  id: number;
  naziv: string;
  aktivan?: boolean | null;
}

/** Referentni podaci koje koristi više ekrana (padajuće liste, filteri, nazivi). Koristi ga samo ReferenceStore. */
@Injectable({ providedIn: 'root' })
export class ReferenceApi {
  private readonly http = inject(HttpClient);

  predmeti(): Observable<PredmetInfo[]> {
    return this.http.get<PredmetInfo[]>(`${API_URL}/predmeti`);
  }

  grupe(): Observable<GrupaInfo[]> {
    return this.http.get<GrupaInfo[]>(`${API_URL}/grupe`);
  }

  tipoviTesta(predmetId: number): Observable<TipTestaInfo[]> {
    return this.http.get<TipTestaInfo[]>(`${API_URL}/predmeti/${predmetId}/tipovi`);
  }
}
