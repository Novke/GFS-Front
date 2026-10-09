import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../../../core/api/api-url';
import {
  IzvodjenjeInfo, IzvodjenjeRezultati, KomandaCmd, NastavnickoStanje, PokreniCmd, StatusIzvodjenja,
} from './uzivo.models';

/** REST za nastavnika (pokretanje i vođenje izvođenja). Stanje uživo stiže kroz STOMP, ovo je za start i povratak. */
@Injectable({ providedIn: 'root' })
export class IzvodjenjaApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;

  pokreni(prezentacijaId: number, cmd: PokreniCmd): Observable<IzvodjenjeInfo> {
    return this.http.post<IzvodjenjeInfo>(`${this.api}/prezentacije/${prezentacijaId}/izvodjenja`, cmd);
  }

  lista(prezentacijaId?: number | null, status?: StatusIzvodjenja | null): Observable<IzvodjenjeInfo[]> {
    let params = new HttpParams();
    if (prezentacijaId != null) params = params.set('prezentacijaId', prezentacijaId);
    if (status) params = params.set('status', status);
    return this.http.get<IzvodjenjeInfo[]>(`${this.api}/izvodjenja`, { params });
  }

  stanje(id: number): Observable<NastavnickoStanje> {
    return this.http.get<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/stanje`);
  }

  komanda(id: number, cmd: KomandaCmd): Observable<NastavnickoStanje> {
    return this.http.post<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/komande`, cmd);
  }

  preimenuj(id: number, ucesnikId: number, ime: string): Observable<NastavnickoStanje> {
    return this.http.put<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/ucesnici/${ucesnikId}`, { ime });
  }

  izbaci(id: number, ucesnikId: number): Observable<NastavnickoStanje> {
    return this.http.delete<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/ucesnici/${ucesnikId}`);
  }

  /** `kljuc` je normalizovan tekst odgovora (`RezultatTekst.kljuc`). */
  sakrij(id: number, rundaId: number, kljuc: string, sakriven: boolean): Observable<NastavnickoStanje> {
    return this.http.put<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/runde/${rundaId}/sakrij`, { kljuc, sakriven });
  }

  rezultati(id: number): Observable<IzvodjenjeRezultati> {
    return this.http.get<IzvodjenjeRezultati>(`${this.api}/izvodjenja/${id}/rezultati`);
  }

  /** Samo završeno izvođenje (inače 409). */
  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/izvodjenja/${id}`);
  }
}
