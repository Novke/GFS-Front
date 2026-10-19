import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../api/api-error';
import { API_URL } from '../api/api-url';
import { OpcijeZahteva } from '../api/opcije-zahteva';

/** `GET api/auth/ja` (nastavnička sesija, kolačić `gfs_nastavnik`). */
export interface NastavnikJa {
  uloga: 'NASTAVNIK';
  korisnik: string;
}

/** Jedna prijavljena sesija nastavnika (uređaj), `GET api/auth/sesije`. */
export interface SesijaInfo {
  id: number;
  /** Opis uređaja (pregledač, sistem), kako ga server sastavi. */
  opis: string;
  kreirano: string;
  poslednjiUlaz: string;
  /** Sesija ovog pregledača. */
  trenutna: boolean;
}

const tiho = new HttpContext().set(LOCAL_ERRORS, true);
const kontekst = (o?: OpcijeZahteva) => (o?.tiho ? tiho : undefined);

/**
 * Sesija nastavnika (`api/auth/*`, backend `AuthRest`). `ja`, `prijavi` i `odjavi` su uvek tihi: čuvar ruta, stranica
 * `/prijava` i `SesijaStore` sami obrađuju greške (401 nije greška za snackbar). `api/auth/prijava` i `api/auth/ja` su
 * jedini nastavnički API-ji koje server pušta bez sesije (ANONIMNO u `PristupMatrica`).
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/auth`;

  ja(): Observable<NastavnikJa> {
    return this.http.get<NastavnikJa>(`${this.url}/ja`, { context: tiho });
  }

  prijavi(korisnik: string, lozinka: string): Observable<void> {
    return this.http.post<void>(`${this.url}/prijava`, { korisnik, lozinka }, { context: tiho });
  }

  odjavi(): Observable<void> {
    return this.http.post<void>(`${this.url}/odjava`, null, { context: tiho });
  }

  sesije(opcije?: OpcijeZahteva): Observable<SesijaInfo[]> {
    return this.http.get<SesijaInfo[]>(`${this.url}/sesije`, { context: kontekst(opcije) });
  }

  opozovi(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.delete<void>(`${this.url}/sesije/${id}`, { context: kontekst(opcije) });
  }

  /** Odjavljuje sve sesije osim ove; vraća koliko ih je odjavljeno. */
  odjaviSveOstale(opcije?: OpcijeZahteva): Observable<{ odjavljeno: number }> {
    return this.http.post<{ odjavljeno: number }>(`${this.url}/sesije/odjavi-sve`, null, { context: kontekst(opcije) });
  }
}
