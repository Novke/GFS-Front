import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { Strana } from '../../../shared/models/strana';
import {
  AnketaDetails, AnketaInfo, AnketeSabloniInfo, FolderAnkete, PokreniAnketuCmd, SablonAnkete, SablonAnketeCmd,
} from './ankete.models';

/** Filter aktivnih i istorije: predavanje i/ili grupa (bez oba server vraća sve). */
export interface FilterAnketa {
  predavanjeId?: number | null;
  grupaId?: number | null;
}

/**
 * Brza anketa, nastavnik (`api/ankete/*`, spec 5). Svaki zahtev je tih (`LOCAL_ERRORS`): panel, projektor i konzola sami
 * prikazuju grešku (projektor nikad), a projektor pita na 2 s, pa snackbar ne sme da se puni.
 */
@Injectable({ providedIn: 'root' })
export class AnketeApi {
  private readonly http = inject(HttpClient);
  private readonly tiho = { context: new HttpContext().set(LOCAL_ERRORS, true) };
  private readonly koren = `${API_URL}/ankete`;

  sabloni(): Observable<AnketeSabloniInfo> {
    return this.http.get<AnketeSabloniInfo>(`${this.koren}/sabloni`, this.tiho);
  }

  /** Nov šablon (bez `id`) ili cela zamena postojećeg. */
  sacuvajSablon(cmd: SablonAnketeCmd, id: number | null = null): Observable<SablonAnkete> {
    return id === null
      ? this.http.post<SablonAnkete>(`${this.koren}/sabloni`, cmd, this.tiho)
      : this.http.put<SablonAnkete>(`${this.koren}/sabloni/${id}`, cmd, this.tiho);
  }

  obrisiSablon(id: number): Observable<void> {
    return this.http.delete<void>(`${this.koren}/sabloni/${id}`, this.tiho);
  }

  /** Redosled prečica; šabloni van spiska prestaju da budu prečice. */
  poredjajPrecice(ids: number[]): Observable<AnketeSabloniInfo> {
    return this.http.put<AnketeSabloniInfo>(`${this.koren}/precice`, { ids }, this.tiho);
  }

  noviFolder(naziv: string): Observable<FolderAnkete> {
    return this.http.post<FolderAnkete>(`${this.koren}/folderi`, { naziv }, this.tiho);
  }

  preimenujFolder(id: number, naziv: string): Observable<FolderAnkete> {
    return this.http.put<FolderAnkete>(`${this.koren}/folderi/${id}`, { naziv }, this.tiho);
  }

  poredjajFoldere(ids: number[]): Observable<AnketeSabloniInfo> {
    return this.http.put<AnketeSabloniInfo>(`${this.koren}/folderi/redosled`, { ids }, this.tiho);
  }

  /** Šabloni foldera ostaju, bez foldera. */
  obrisiFolder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.koren}/folderi/${id}`, this.tiho);
  }

  pokreni(cmd: PokreniAnketuCmd): Observable<AnketaDetails> {
    return this.http.post<AnketaDetails>(this.koren, cmd, this.tiho);
  }

  anketa(id: number): Observable<AnketaDetails> {
    return this.http.get<AnketaDetails>(`${this.koren}/${id}`, this.tiho);
  }

  /** Otvorene i zatvorene sa prikazanim rezultatom u poslednjih 30 min (projektor, panel). */
  aktivne(f: FilterAnketa): Observable<AnketaDetails[]> {
    return this.http.get<AnketaDetails[]>(`${this.koren}/aktivne`, { ...this.tiho, params: filterParametri(f) });
  }

  /** Istorija, najnovije prvo (`page` od 0). */
  istorija(f: FilterAnketa, page: number, size: number): Observable<Strana<AnketaInfo>> {
    const params = filterParametri(f).set('page', page).set('size', size);
    return this.http.get<Strana<AnketaInfo>>(this.koren, { ...this.tiho, params });
  }

  /** Idempotentno: zatvorena ostaje zatvorena. */
  zatvori(id: number): Observable<AnketaDetails> {
    return this.http.post<AnketaDetails>(`${this.koren}/${id}/zatvori`, null, this.tiho);
  }

  rezultat(id: number, prikazan: boolean): Observable<AnketaDetails> {
    return this.http.put<AnketaDetails>(`${this.koren}/${id}/rezultat`, { prikazan }, this.tiho);
  }

  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.koren}/${id}`, this.tiho);
  }
}

function filterParametri(f: FilterAnketa): HttpParams {
  let p = new HttpParams();
  if (f.predavanjeId != null) {
    p = p.set('predavanjeId', f.predavanjeId);
  }
  if (f.grupaId != null) {
    p = p.set('grupaId', f.grupaId);
  }
  return p;
}
