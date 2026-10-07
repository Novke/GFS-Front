import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  GetOceneCmd,
  GrupaInfo,
  KoeficijentiInfo,
  PredmetInfo,
  RezultatiStudentaInfo,
  SaveKoeficijentiCmd,
  TipTestaInfo
} from '../models/model';
import { API_URL } from '../core/api/api-url';

@Injectable({
  providedIn: 'root'
})
export class OcenjivanjeService {
  private http = inject(HttpClient);


  private apiUrl = API_URL;

  getGrupe(): Observable<GrupaInfo[]> {
    return this.http.get<GrupaInfo[]>(`${this.apiUrl}/grupe`);
  }

  getPredmeti(): Observable<PredmetInfo[]> {
    return this.http.get<PredmetInfo[]>(`${this.apiUrl}/predmeti`);
  }

  getTipoviTesta(predmetId: number): Observable<TipTestaInfo[]> {
    return this.http.get<TipTestaInfo[]>(`${this.apiUrl}/predmeti/${predmetId}/tipovi`);
  }

  getKoeficijenti(predmetId: number): Observable<KoeficijentiInfo> {
    return this.http.get<KoeficijentiInfo>(`${this.apiUrl}/ocenjivanje/predmet/${predmetId}/koeficijenti`);
  }

  saveKoeficijenti(predmetId: number, cmd: SaveKoeficijentiCmd): Observable<KoeficijentiInfo> {
    return this.http.post<KoeficijentiInfo>(`${this.apiUrl}/ocenjivanje/predmet/${predmetId}/koeficijenti`, cmd);
  }

  getRezultati(predmetId: number, cmd: GetOceneCmd): Observable<RezultatiStudentaInfo[]> {
    return this.http.post<RezultatiStudentaInfo[]>(`${this.apiUrl}/ocenjivanje/predmet/${predmetId}/rezultati`, cmd);
  }
}
