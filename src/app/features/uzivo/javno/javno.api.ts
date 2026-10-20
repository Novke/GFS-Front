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

  /**
   * Naziv izvođenja, `prijavaObavezna` (bodovan run) i `prijavljenStudent` (kolačić prijave studenta); 404 za nepoznat ili
   * završen kod.
   */
  info(kod: string): Observable<JavnoIzvodjenjeInfo> {
    return this.http.get<JavnoIzvodjenjeInfo>(`${this.osnova}/${encodeURIComponent(kod)}`);
  }

  /** Ko sam ja za ovaj kod (po kolačiću); 404 ako nisam prijavljen ili sam izbačen. */
  ja(kod: string): Observable<UcesnikInfo> {
    return this.http.get<UcesnikInfo>(`${this.osnova}/${encodeURIComponent(kod)}/ja`);
  }

  /**
   * Prijava imenom (1-40 znakova); postavlja kolačić. Prijavljen student šalje prazno ime (server uzima "Ime Prezime" iz baze).
   * 409 kad je izvođenje puno, 403 kad bodovan run traži prijavu studenta.
   */
  prijava(kod: string, ime: string): Observable<UcesnikInfo> {
    return this.http.post<UcesnikInfo>(`${this.osnova}/${encodeURIComponent(kod)}/prijava`, { ime });
  }
}
