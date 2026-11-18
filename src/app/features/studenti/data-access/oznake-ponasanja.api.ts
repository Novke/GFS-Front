import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';

/** Vrsta oznake ponašanja (backend `VrstaOznake`, moderacija uživo, V25). */
export type VrstaOznake = 'SAKRIVEN_ODGOVOR' | 'UTISAN_PITALICE' | 'UTISAN_SVE' | 'IZBACEN' | 'IZBACEN_PREDAVANJE';

/** `OznakaPonasanjaInfo`: id-jevi predmeta, predavanja i izvođenja postaju `null` kad se obrišu; naziv prezentacije ostaje. */
export interface OznakaPonasanja {
  id: number;
  vrsta: VrstaOznake;
  /** Sakriveni odgovor (samo `SAKRIVEN_ODGOVOR`). */
  tekst: string | null;
  kreirano: string;
  predmet: { id: number; naziv: string } | null;
  predavanjeId: number | null;
  izvodjenjeId: number | null;
  prezentacija: string | null;
}

export const OPIS_OZNAKE: Record<VrstaOznake, string> = {
  SAKRIVEN_ODGOVOR: 'Sakriven odgovor',
  UTISAN_PITALICE: 'Utišan: pitalice',
  UTISAN_SVE: 'Utišan: pitalice i zadaci',
  IZBACEN: 'Izbačen iz prezentacije',
  IZBACEN_PREDAVANJE: 'Izbačen do kraja predavanja',
};

const tiho = new HttpContext().set(LOCAL_ERRORS, true);

/** Oznake ponašanja na kartonu studenta (`api/studenti/{id}/oznake-ponasanja`, `api/oznake-ponasanja/{id}`; samo nastavnik). */
@Injectable({ providedIn: 'root' })
export class OznakePonasanjaApi {
  private readonly http = inject(HttpClient);

  lista(studentId: number): Observable<OznakaPonasanja[]> {
    return this.http.get<OznakaPonasanja[]>(`${API_URL}/studenti/${studentId}/oznake-ponasanja`, { context: tiho });
  }

  /** 204; brisanje oznake "izbačen do kraja predavanja" skida i tu zabranu. */
  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/oznake-ponasanja/${id}`, { context: tiho });
  }
}
