import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, Observable, reduce } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { Strana } from '../../../shared/models/strana';
import { CreatePredmetCmd, CreateTipTestaCmd, PredmetInfo, TipTestaInfo, UpdateTipTestaCmd } from './predmeti.models';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';

/** Najveća strana koju backend daje (`size` ≤ 100). */
export const VELICINA_STRANE = 100;
/** Granica za "sve strane": 20 × 100 stavki jedne godine je mnogo više od jednog semestra. */
const MAX_STRANA = 20;

/**
 * Sve stavke liste (`*.pretraga`), strana po strana dok ih ima (najviše {@link MAX_STRANA}). `strana` je 1-based.
 * Za preglede nad celom godinom (hub predmeta, lista predmeta), gde paginacija nema smisla.
 */
export function sveStrane<T>(strana: (n: number) => Observable<Strana<T>>): Observable<T[]> {
  return strana(1).pipe(
    expand((s, i) => {
      const sledeca = (s?.page?.number ?? i) + 2;
      return (s?.content?.length ?? 0) > 0 && sledeca <= (s?.page?.totalPages ?? 0) && sledeca <= MAX_STRANA ? strana(sledeca) : EMPTY;
    }),
    reduce<Strana<T>, T[]>((sve, s) => sve.concat(s?.content ?? []), []),
  );
}

/** Predmeti (`PredmetRest`) i tipovi testa (`TestRest`, `test/tip`). Putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class PredmetiApi {
  private readonly http = inject(HttpClient);

  private kontekst(o: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false);
  }

  /** `GET predmeti`. */
  svi(o: OpcijeZahteva = {}): Observable<PredmetInfo[]> {
    return this.http.get<PredmetInfo[]>(`${API_URL}/predmeti`, { context: this.kontekst(o) });
  }

  /** `GET predmeti/{id}` (404 kad ne postoji). */
  get(id: number, o: OpcijeZahteva = {}): Observable<PredmetInfo> {
    return this.http.get<PredmetInfo>(`${API_URL}/predmeti/${id}`, { context: this.kontekst(o) });
  }

  /** `POST predmeti`. */
  create(cmd: CreatePredmetCmd, o: OpcijeZahteva = {}): Observable<PredmetInfo> {
    return this.http.post<PredmetInfo>(`${API_URL}/predmeti`, cmd, { context: this.kontekst(o) });
  }

  /**
   * `GET predmeti/{id}/tipovi`: aktivni tipovi testa; sa `svi` (`?svi=true`) i isključeni, sa `aktivan`, po id-ju
   * (H5, da se isključen tip može ponovo uključiti).
   */
  tipovi(id: number, o: OpcijeZahteva & { svi?: boolean } = {}): Observable<TipTestaInfo[]> {
    const params = o.svi ? new HttpParams().set('svi', 'true') : undefined;
    return this.http.get<TipTestaInfo[]>(`${API_URL}/predmeti/${id}/tipovi`, { params, context: this.kontekst(o) });
  }

  /** `PUT test/tip/{id}`: preimenovanje i (de)aktivacija (H5). */
  izmeniTip(id: number, cmd: UpdateTipTestaCmd, o: OpcijeZahteva = {}): Observable<TipTestaInfo> {
    return this.http.put<TipTestaInfo>(`${API_URL}/test/tip/${id}`, cmd, { context: this.kontekst(o) });
  }

  /** `POST test/tip`: nov (aktivan) tip testa predmeta. */
  noviTip(cmd: CreateTipTestaCmd, o: OpcijeZahteva = {}): Observable<TipTestaInfo> {
    return this.http.post<TipTestaInfo>(`${API_URL}/test/tip`, cmd, { context: this.kontekst(o) });
  }
}
