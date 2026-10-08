import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Strana } from '../../shared/models/strana';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import { GrupaInfo } from './reference.api';

/**
 * Red liste studenata; ogleda backend `dto/student/StudentListItem`. `godina` je godina upisa;
 * `grupa`, `email`, `brojTelefona` (i u starim redovima `godina`) mogu biti `null`.
 */
export interface StudentListItem {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string | null;
  brojTelefona: string | null;
  grupa: GrupaInfo | null;
}

/**
 * Parametri `GET studenti/pretraga`, pod imenima iz `StudentRest.pretraga` (`StudentFilter` + Spring `Pageable`).
 * `page` je 0-based; `size` podrazumevano 25, najviše 100; `sort` po `prezime`, `ime`, `indeks`, `godina`
 * (npr. `indeks,asc`; podrazumevano prezime pa ime). Prazne vrednosti se ne šalju.
 */
export interface StudentiPretraga {
  grupaId?: number | null;
  /** Studenti iz grupa sa manjom godinom upisa od ove grupe (nepostojeća grupa je 404). */
  starijiOdGrupe?: number | null;
  /** Ime, prezime, puno ime ili indeks (bez razmaka), bez obzira na velika i mala slova. */
  q?: string | null;
  page?: number | null;
  size?: number | null;
  sort?: string | null;
}

@Injectable({ providedIn: 'root' })
export class StudentiApi {
  private readonly http = inject(HttpClient);

  /** `tiho`: greška ne ide u snackbar (`LOCAL_ERRORS`), pozivalac je prikazuje sam. */
  pretraga(params: StudentiPretraga, opcije: { tiho?: boolean } = {}): Observable<Strana<StudentListItem>> {
    let p = new HttpParams();
    for (const [kljuc, v] of Object.entries(params) as [keyof StudentiPretraga, StudentiPretraga[keyof StudentiPretraga]][]) {
      const tekst = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : (v ?? '').trim();
      if (tekst !== '') {
        p = p.set(kljuc, tekst);
      }
    }
    return this.http.get<Strana<StudentListItem>>(`${API_URL}/studenti/pretraga`, {
      params: p,
      context: new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false),
    });
  }
}
