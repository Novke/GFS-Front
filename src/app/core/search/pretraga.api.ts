import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { PredavanjeListItem } from '../../features/predavanja/data-access/predavanja.models';
import type { TestListItem } from '../../features/testovi/data-access/testovi.models';
import { LOCAL_ERRORS } from '../api/api-error';
import { API_URL } from '../api/api-url';
import type { GrupaInfo } from '../api/reference.api';
import type { StudentListItem } from '../api/studenti.api';

/** Ogleda `dto/pregled/PretragaRezultatInfo`: do 5 stavki po grupi; upit kraći od 2 znaka daje prazne nizove. */
export interface PretragaRezultat {
  studenti: StudentListItem[];
  predavanja: PredavanjeListItem[];
  testovi: TestListItem[];
  grupe: GrupaInfo[];
}

/** `GET pretraga?q` (globalna pretraga, Ctrl+K). Greška je lokalna: dijalog je prikazuje sam, bez snackbara. */
@Injectable({ providedIn: 'root' })
export class PretragaApi {
  private readonly http = inject(HttpClient);

  trazi(q: string): Observable<PretragaRezultat> {
    return this.http.get<PretragaRezultat>(`${API_URL}/pretraga`, {
      params: new HttpParams().set('q', q),
      context: new HttpContext().set(LOCAL_ERRORS, true),
    });
  }
}
