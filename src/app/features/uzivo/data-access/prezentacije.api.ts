import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import {
  CreatePrezentacijaCmd, GrupaKratko, MedijInfo, PredavanjeZaPokretanje, PredmetKratko, PrezentacijaDetails,
  PrezentacijaInfo, SlajdCmd, SlajdDetails, UpdatePrezentacijaCmd,
} from './uzivo.models';

/** REST za nastavnika (editor prezentacija). Sve putanje su relativne na `<base href>`.
 * Svaki pozivalac u uživo prikazuje grešku sam (u formi, traci ili sopstvenoj poruci), pa svi zahtevi idu sa
 * `LOCAL_ERRORS` (bez globalnog snackbara, bez dvostruke poruke) i klijent ne prima `OpcijeZahteva`.
 */
@Injectable({ providedIn: 'root' })
export class PrezentacijeApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  lista(predmetId?: number | null): Observable<PrezentacijaInfo[]> {
    const params = predmetId != null ? new HttpParams().set('predmetId', predmetId) : undefined;
    return this.http.get<PrezentacijaInfo[]>(`${this.api}/prezentacije`, { params, context: this.context });
  }

  kreiraj(cmd: CreatePrezentacijaCmd): Observable<PrezentacijaDetails> {
    return this.http.post<PrezentacijaDetails>(`${this.api}/prezentacije`, cmd, { context: this.context });
  }

  detalji(id: number): Observable<PrezentacijaDetails> {
    return this.http.get<PrezentacijaDetails>(`${this.api}/prezentacije/${id}`, { context: this.context });
  }

  izmeni(id: number, cmd: UpdatePrezentacijaCmd): Observable<PrezentacijaDetails> {
    return this.http.put<PrezentacijaDetails>(`${this.api}/prezentacije/${id}`, cmd, { context: this.context });
  }

  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/prezentacije/${id}`, { context: this.context });
  }

  dupliraj(id: number): Observable<PrezentacijaDetails> {
    return this.http.post<PrezentacijaDetails>(`${this.api}/prezentacije/${id}/dupliraj`, null, { context: this.context });
  }

  /** `posle` = id slajda posle kog se ubacuje; bez njega ide na kraj. */
  dodajSlajd(prezentacijaId: number, cmd: SlajdCmd, posle?: number | null): Observable<SlajdDetails> {
    const params = posle != null ? new HttpParams().set('posle', posle) : undefined;
    return this.http.post<SlajdDetails>(`${this.api}/prezentacije/${prezentacijaId}/slajdovi`, cmd, { params, context: this.context });
  }

  izmeniSlajd(slajdId: number, cmd: SlajdCmd): Observable<SlajdDetails> {
    return this.http.put<SlajdDetails>(`${this.api}/slajdovi/${slajdId}`, cmd, { context: this.context });
  }

  obrisiSlajd(slajdId: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/slajdovi/${slajdId}`, { context: this.context });
  }

  duplirajSlajd(slajdId: number): Observable<SlajdDetails> {
    return this.http.post<SlajdDetails>(`${this.api}/slajdovi/${slajdId}/dupliraj`, null, { context: this.context });
  }

  /** `slajdIds` mora biti tačna permutacija postojećih slajdova, inače 400. */
  redosled(prezentacijaId: number, slajdIds: number[]): Observable<PrezentacijaDetails> {
    return this.http.put<PrezentacijaDetails>(`${this.api}/prezentacije/${prezentacijaId}/redosled`, { slajdIds }, { context: this.context });
  }

  upload(fajl: File): Observable<MedijInfo> {
    const telo = new FormData();
    telo.append('fajl', fajl, fajl.name);
    return this.http.post<MedijInfo>(`${this.api}/mediji`, telo, { context: this.context });
  }

  predmeti(): Observable<PredmetKratko[]> {
    return this.http.get<PredmetKratko[]>(`${this.api}/predmeti`, { context: this.context })
      .pipe(map(lista => lista.map(p => ({ id: p.id, naziv: p.naziv }))));
  }

  grupe(): Observable<GrupaKratko[]> {
    return this.http.get<GrupaKratko[]>(`${this.api}/grupe`, { context: this.context })
      .pipe(map(lista => lista.map(g => ({ id: g.id, naziv: g.naziv }))));
  }

  /** Predavanja predmeta ove prezentacije za dijalog "Pokreni". */
  predavanja(prezentacijaId: number): Observable<PredavanjeZaPokretanje[]> {
    return this.http.get<PredavanjeZaPokretanje[]>(`${this.api}/prezentacije/${prezentacijaId}/predavanja`, { context: this.context });
  }
}
