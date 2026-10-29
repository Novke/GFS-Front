import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { VrednostPolja } from '../../uzivo/ui/polja-zadatka';
import {
  MojZadatak, OcenaStudenta, PredmetStudenta, PregledPrezentacije, PrezentacijaStudenta, PrisustvoStudenta,
  ProveraVezbanja, ResenjeVezbanja, TemaVezbanja, ZadatakVezbanja,
} from './portal.models';

/**
 * Nalog studenta, faze 2 i 3 (tabovi Predmeti i Ja, strana predmeta, vežbanje, pregled prezentacije): samo
 * `api/public/nalog/*`. Server uzima studenta iz kolačića `gfs_student` (401 bez njega) i daje 404 za tuđe ili nepostojeće.
 * Greške prikazuje stranica (`LOCAL_ERRORS`), nikad nastavnički snackbar.
 */
@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog`;

  predmeti(): Observable<PredmetStudenta[]> {
    return this.http.get<PredmetStudenta[]>(`${this.koren}/predmeti`, { context: this.lokalneGreske });
  }

  prisustvo(predmetId: number): Observable<PrisustvoStudenta> {
    return this.http.get<PrisustvoStudenta>(`${this.predmet(predmetId)}/prisustvo`, { context: this.lokalneGreske });
  }

  vezbanje(predmetId: number): Observable<TemaVezbanja[]> {
    return this.http.get<TemaVezbanja[]>(`${this.predmet(predmetId)}/vezbanje`, { context: this.lokalneGreske });
  }

  mojiZadaci(predmetId: number): Observable<MojZadatak[]> {
    return this.http.get<MojZadatak[]>(`${this.predmet(predmetId)}/moji-zadaci`, { context: this.lokalneGreske });
  }

  prezentacije(predmetId: number): Observable<PrezentacijaStudenta[]> {
    return this.http.get<PrezentacijaStudenta[]>(`${this.predmet(predmetId)}/prezentacije`, { context: this.lokalneGreske });
  }

  ocena(predmetId: number): Observable<OcenaStudenta> {
    return this.http.get<OcenaStudenta>(`${this.predmet(predmetId)}/ocena`, { context: this.lokalneGreske });
  }

  pregled(prezentacijaId: number): Observable<PregledPrezentacije> {
    return this.http.get<PregledPrezentacije>(`${this.koren}/prezentacije/${prezentacijaId}`, { context: this.lokalneGreske });
  }

  /** Novi zadatak tipa (`nivo` `null` = svi nivoi); 409 kad nema zadataka (tog nivoa), 404 kad tip nije otvoren. */
  noviZadatak(tipId: number, nivo: number | null): Observable<ZadatakVezbanja> {
    return this.http.post<ZadatakVezbanja>(`${this.koren}/vezbanje`, { tipId, nivo }, { context: this.lokalneGreske });
  }

  provera(pokusajId: number, polja: Record<string, VrednostPolja>): Observable<ProveraVezbanja> {
    return this.http.post<ProveraVezbanja>(`${this.koren}/vezbanje/${pokusajId}/provera`, { polja }, { context: this.lokalneGreske });
  }

  resenje(pokusajId: number): Observable<ResenjeVezbanja> {
    return this.http.post<ResenjeVezbanja>(`${this.koren}/vezbanje/${pokusajId}/resenje`, null, { context: this.lokalneGreske });
  }

  private predmet(id: number): string {
    return `${this.koren}/predmeti/${id}`;
  }
}
