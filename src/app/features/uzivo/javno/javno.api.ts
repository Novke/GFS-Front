import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { JavnoIzvodjenjeInfo, UcesnikInfo } from '../data-access/uzivo.models';

/**
 * Jedini HTTP klijent studentskih (javnih) stranica: sme da zove samo `api/public/uzivo/*`.
 * Isti origin kao aplikacija, pa kolačić `gfs_uzivo` ide sam (nema `withCredentials`).
 */
@Injectable({ providedIn: 'root' })
export class JavnoApi {
  private readonly http = inject(HttpClient);
  private readonly osnova = 'api/public/uzivo';

  /** Naziv izvođenja; 404 za nepoznat ili završen kod. */
  info(kod: string): Observable<JavnoIzvodjenjeInfo> {
    return this.http.get<JavnoIzvodjenjeInfo>(`${this.osnova}/${encodeURIComponent(kod)}`);
  }

  /** Ko sam ja za ovaj kod (po kolačiću); 404 ako nisam prijavljen ili sam izbačen. */
  ja(kod: string): Observable<UcesnikInfo> {
    return this.http.get<UcesnikInfo>(`${this.osnova}/${encodeURIComponent(kod)}/ja`);
  }

  /** Prijava imenom (1-40 znakova); postavlja kolačić. 409 kad je izvođenje puno. */
  prijava(kod: string, ime: string): Observable<UcesnikInfo> {
    return this.http.post<UcesnikInfo>(`${this.osnova}/${encodeURIComponent(kod)}/prijava`, { ime });
  }
}
