import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { OpcijeZahteva } from './opcije-zahteva';

/**
 * `POST api/studenti/{id}/nalog/kod-za-diktiranje` (plan C): kod koji nastavnik izdiktira studentu. Server ga vraća samo
 * ovaj put (`Cache-Control: no-store`), ne šalje mejl i rešava otvorena obaveštenja studenta.
 */
export interface KodZaDiktiranjeInfo {
  /** Šest cifara. */
  kod: string;
  /** Lokalno vreme isteka (`yyyy-MM-ddTHH:mm:ss`), deset minuta od izdavanja. */
  istice: string;
  /** Indeks kako ga student upisuje (`GD5`) i godina upisa. */
  indeks: string;
  godina: number;
  /** Npr. indeks nije oblika GD + broj, pa ga student ne može upisati u formu; `null` kad je sve u redu. */
  upozorenje: string | null;
}

const tiho = new HttpContext().set(LOCAL_ERRORS, true);

/** Deli ga kartica studenta (sekcija "Nalog") i lista obaveštenja: zato je u `core`, ne u feature-u. */
@Injectable({ providedIn: 'root' })
export class KodZaDiktiranjeApi {
  private readonly http = inject(HttpClient);

  /** 200 sa kodom; 404 `Ne postoji.`, 429 `Previše pokušaja. Pokušaj ponovo kasnije.` */
  izdaj(studentId: number, opcije?: OpcijeZahteva): Observable<KodZaDiktiranjeInfo> {
    return this.http.post<KodZaDiktiranjeInfo>(`${API_URL}/studenti/${studentId}/nalog/kod-za-diktiranje`, null, {
      context: opcije?.tiho ? tiho : undefined,
    });
  }
}
