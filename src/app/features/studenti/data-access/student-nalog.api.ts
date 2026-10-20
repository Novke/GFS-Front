import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';

/** Uređaj studenta (`UredjajInfo` backenda): `KOD` = prijava kodom sa mejla, `LTI` = ulaz iz Moodle-a. */
export interface StudentUredjajInfo {
  id: number;
  opis: string;
  nacin: 'KOD' | 'LTI';
  prviUlaz: string;
  poslednjiUlaz: string;
  /** Na kartici studenta nema "ovog uređaja"; polje stiže od servera i ovde se ne koristi. */
  trenutni?: boolean;
}

/** `GET api/studenti/{id}/nalog` (spec prijave, 5.3). */
export interface StudentNalogInfo {
  /** Bez mejla student ne može da dobije kod. */
  imaMejl: boolean;
  uredjaji: StudentUredjajInfo[];
  moodle: { povezan: boolean; poslednjiUlaz: string | null };
  poslednjaPrijava: string | null;
}

const tiho = new HttpContext().set(LOCAL_ERRORS, true);
const kontekst = (o?: OpcijeZahteva) => (o?.tiho ? tiho : undefined);

/**
 * Nalog studenta za nastavnika (`api/studenti/{id}/nalog`, backend `StudentNalogRest`, samo uz sesiju nastavnika).
 * Mejl studenta se i dalje menja postojećim `PUT api/studenti/{id}`.
 */
@Injectable({ providedIn: 'root' })
export class StudentNalogApi {
  private readonly http = inject(HttpClient);

  private url(id: number): string {
    return `${API_URL}/studenti/${id}/nalog`;
  }

  nalog(id: number, opcije?: OpcijeZahteva): Observable<StudentNalogInfo> {
    return this.http.get<StudentNalogInfo>(this.url(id), { context: kontekst(opcije) });
  }

  /** Kod na studentov mejl; 204. 409 `Student nema mejl.`, 429 `Previše pokušaja. Pokušaj ponovo kasnije.` */
  posaljiKod(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.post<void>(`${this.url(id)}/posalji-kod`, null, { context: kontekst(opcije) });
  }

  opozoviUredjaje(id: number, opcije?: OpcijeZahteva): Observable<{ opozvano: number }> {
    return this.http.post<{ opozvano: number }>(`${this.url(id)}/opozovi-uredjaje`, null, { context: kontekst(opcije) });
  }

  raskiniMoodle(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.delete<void>(`${this.url(id)}/moodle`, { context: kontekst(opcije) });
  }
}
