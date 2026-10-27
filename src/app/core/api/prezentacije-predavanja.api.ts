import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';

/** Prezentacija predmeta kao stavka izbora (`GET prezentacije?predmetId`); `aktivnoIzvodjenjeId` = izvođenje u toku, ako ga ima. */
export interface PrezentacijaZaIzbor {
  id: number;
  naziv: string;
  brojSlajdova: number;
  brojPitanja: number;
  izmenjeno: string;
  aktivnoIzvodjenjeId: number | null;
}

/** Izvođenje (jedno prikazivanje prezentacije) vezano za predavanje (`GET izvodjenja?predavanjeId`), najnovije prvo. */
export interface IzvodjenjeNaPredavanju {
  id: number;
  prezentacija: { id: number; naziv: string };
  status: 'AKTIVNO' | 'ZAVRSENO';
  /** `LocalDateTime` bez zone. */
  pocetak: string;
  kraj: string | null;
  brojUcesnika: number;
  brojPitanja: number;
  cuvanje: boolean;
}

/**
 * Prezentacije (uživo) na ekranu predavanja: izbor prezentacije predmeta, pokretanje izvođenja vezanog za predavanje i
 * izvođenja koja su već vezana za njega. Uživo ima svoj klijent (`features/uzivo/data-access`), koji ovde ne sme da se
 * uvozi; ovo je samo ono što predavanje koristi. Greške prikazuje pozivalac (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class PrezentacijePredavanjaApi {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  prezentacije(predmetId: number): Observable<PrezentacijaZaIzbor[]> {
    const params = new HttpParams().set('predmetId', predmetId);
    return this.http.get<PrezentacijaZaIzbor[]>(`${API_URL}/prezentacije`, { params, context: this.context });
  }

  izvodjenja(predavanjeId: number): Observable<IzvodjenjeNaPredavanju[]> {
    const params = new HttpParams().set('predavanjeId', predavanjeId);
    return this.http.get<IzvodjenjeNaPredavanju[]>(`${API_URL}/izvodjenja`, { params, context: this.context });
  }

  /** Izvođenje sa čuvanjem, vezano za predavanje (i kad prezentacija nema pitanja: svaka prikazana prezentacija ostaje zabeležena). */
  pokreni(prezentacijaId: number, predavanjeId: number): Observable<IzvodjenjeNaPredavanju> {
    const telo = { cuvanje: true, grupaId: null, predavanjeId, boduje: false };
    return this.http.post<IzvodjenjeNaPredavanju>(`${API_URL}/prezentacije/${prezentacijaId}/izvodjenja`, telo, { context: this.context });
  }
}
