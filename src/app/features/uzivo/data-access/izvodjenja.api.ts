import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import {
  IzvodjenjeInfo, IzvodjenjeRezultati, KomandaCmd, NastavnickoStanje, PokreniCmd, StatusIzvodjenja,
} from './uzivo.models';

/** REST za nastavnika (pokretanje i vođenje izvođenja). Stanje uživo stiže kroz STOMP, ovo je za start i povratak.
 * Svaki pozivalac u uživo prikazuje grešku sam (u formi, traci ili sopstvenoj poruci), pa svi zahtevi idu sa
 * `LOCAL_ERRORS` (bez globalnog snackbara, bez dvostruke poruke) i klijent ne prima `OpcijeZahteva`.
 */
@Injectable({ providedIn: 'root' })
export class IzvodjenjaApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  pokreni(prezentacijaId: number, cmd: PokreniCmd): Observable<IzvodjenjeInfo> {
    return this.http.post<IzvodjenjeInfo>(`${this.api}/prezentacije/${prezentacijaId}/izvodjenja`, cmd, { context: this.context });
  }

  lista(prezentacijaId?: number | null, status?: StatusIzvodjenja | null): Observable<IzvodjenjeInfo[]> {
    let params = new HttpParams();
    if (prezentacijaId != null) params = params.set('prezentacijaId', prezentacijaId);
    if (status) params = params.set('status', status);
    return this.http.get<IzvodjenjeInfo[]>(`${this.api}/izvodjenja`, { params, context: this.context });
  }

  stanje(id: number): Observable<NastavnickoStanje> {
    return this.http.get<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/stanje`, { context: this.context });
  }

  komanda(id: number, cmd: KomandaCmd): Observable<NastavnickoStanje> {
    return this.http.post<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/komande`, cmd, { context: this.context });
  }

  preimenuj(id: number, ucesnikId: number, ime: string): Observable<NastavnickoStanje> {
    return this.http.put<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/ucesnici/${ucesnikId}`, { ime }, { context: this.context });
  }

  izbaci(id: number, ucesnikId: number): Observable<NastavnickoStanje> {
    return this.http.delete<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/ucesnici/${ucesnikId}`, { context: this.context });
  }

  /** `kljuc` je normalizovan tekst odgovora (`RezultatTekst.kljuc`). */
  sakrij(id: number, rundaId: number, kljuc: string, sakriven: boolean): Observable<NastavnickoStanje> {
    return this.http.put<NastavnickoStanje>(`${this.api}/izvodjenja/${id}/runde/${rundaId}/sakrij`, { kljuc, sakriven }, { context: this.context });
  }

  rezultati(id: number): Observable<IzvodjenjeRezultati> {
    return this.http.get<IzvodjenjeRezultati>(`${this.api}/izvodjenja/${id}/rezultati`, { context: this.context });
  }

  /** Samo završeno izvođenje (inače 409). */
  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/izvodjenja/${id}`, { context: this.context });
  }
}
