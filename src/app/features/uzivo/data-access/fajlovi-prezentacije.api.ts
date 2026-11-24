import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { FajlPrezentacijeCmd, FajlPrezentacijeInfo } from '../../../shared/util/fajlovi';

/** Putanja za preuzimanje fajla prezentacije (nastavnik; relativno, kao `API_URL`). */
export function urlFajlaPrezentacije(id: number): string {
  return `${API_URL}/fajlovi-prezentacije/${id}/sadrzaj`;
}

/**
 * REST za nastavnika: fajlovi uz prezentaciju (spec 2026-11-20, odeljak 5). Sve iza prijave nastavnika, nikad pod
 * `api/public/*`. Greške prikazuje pozivalac sam (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class FajloviPrezentacijeApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  lista(prezentacijaId: number): Observable<FajlPrezentacijeInfo[]> {
    return this.http.get<FajlPrezentacijeInfo[]>(`${this.api}/prezentacije/${prezentacijaId}/fajlovi`, { context: this.context });
  }

  /** Multipart: deo `fajl` i, kad fajl ide uz jedan slajd, `slajdId` (bez njega = uz celu prezentaciju). */
  dodaj(prezentacijaId: number, fajl: File, slajdId: number | null): Observable<FajlPrezentacijeInfo> {
    const telo = new FormData();
    telo.append('fajl', fajl, fajl.name);
    if (slajdId !== null) telo.append('slajdId', String(slajdId));
    return this.http.post<FajlPrezentacijeInfo>(`${this.api}/prezentacije/${prezentacijaId}/fajlovi`, telo, { context: this.context });
  }

  izmeni(id: number, cmd: FajlPrezentacijeCmd): Observable<FajlPrezentacijeInfo> {
    return this.http.put<FajlPrezentacijeInfo>(`${this.api}/fajlovi-prezentacije/${id}`, cmd, { context: this.context });
  }

  /** Svi fajlovi prezentacije, tačno jednom, u novom redosledu; odgovor je lista po novom redosledu. */
  redosled(prezentacijaId: number, ids: number[]): Observable<FajlPrezentacijeInfo[]> {
    return this.http.put<FajlPrezentacijeInfo[]>(`${this.api}/prezentacije/${prezentacijaId}/fajlovi/redosled`, { ids }, { context: this.context });
  }

  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/fajlovi-prezentacije/${id}`, { context: this.context });
  }
}
