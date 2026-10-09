import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_URL } from '../../../shared/api-url';
import {
  CreatePrezentacijaCmd, GrupaKratko, MedijInfo, PredavanjeZaPokretanje, PredmetKratko, PrezentacijaDetails,
  PrezentacijaInfo, SlajdCmd, SlajdDetails, UpdatePrezentacijaCmd,
} from './uzivo.models';

/** REST za nastavnika (editor prezentacija). Sve putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class PrezentacijeApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;

  lista(predmetId?: number | null): Observable<PrezentacijaInfo[]> {
    const params = predmetId != null ? new HttpParams().set('predmetId', predmetId) : undefined;
    return this.http.get<PrezentacijaInfo[]>(`${this.api}/prezentacije`, { params });
  }

  kreiraj(cmd: CreatePrezentacijaCmd): Observable<PrezentacijaDetails> {
    return this.http.post<PrezentacijaDetails>(`${this.api}/prezentacije`, cmd);
  }

  detalji(id: number): Observable<PrezentacijaDetails> {
    return this.http.get<PrezentacijaDetails>(`${this.api}/prezentacije/${id}`);
  }

  izmeni(id: number, cmd: UpdatePrezentacijaCmd): Observable<PrezentacijaDetails> {
    return this.http.put<PrezentacijaDetails>(`${this.api}/prezentacije/${id}`, cmd);
  }

  obrisi(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/prezentacije/${id}`);
  }

  dupliraj(id: number): Observable<PrezentacijaDetails> {
    return this.http.post<PrezentacijaDetails>(`${this.api}/prezentacije/${id}/dupliraj`, null);
  }

  /** `posle` = id slajda posle kog se ubacuje; bez njega ide na kraj. */
  dodajSlajd(prezentacijaId: number, cmd: SlajdCmd, posle?: number | null): Observable<SlajdDetails> {
    const params = posle != null ? new HttpParams().set('posle', posle) : undefined;
    return this.http.post<SlajdDetails>(`${this.api}/prezentacije/${prezentacijaId}/slajdovi`, cmd, { params });
  }

  izmeniSlajd(slajdId: number, cmd: SlajdCmd): Observable<SlajdDetails> {
    return this.http.put<SlajdDetails>(`${this.api}/slajdovi/${slajdId}`, cmd);
  }

  obrisiSlajd(slajdId: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/slajdovi/${slajdId}`);
  }

  duplirajSlajd(slajdId: number): Observable<SlajdDetails> {
    return this.http.post<SlajdDetails>(`${this.api}/slajdovi/${slajdId}/dupliraj`, null);
  }

  /** `slajdIds` mora biti tačna permutacija postojećih slajdova, inače 400. */
  redosled(prezentacijaId: number, slajdIds: number[]): Observable<PrezentacijaDetails> {
    return this.http.put<PrezentacijaDetails>(`${this.api}/prezentacije/${prezentacijaId}/redosled`, { slajdIds });
  }

  upload(fajl: File): Observable<MedijInfo> {
    const telo = new FormData();
    telo.append('fajl', fajl, fajl.name);
    return this.http.post<MedijInfo>(`${this.api}/mediji`, telo);
  }

  predmeti(): Observable<PredmetKratko[]> {
    return this.http.get<PredmetKratko[]>(`${this.api}/predmeti`)
      .pipe(map(lista => lista.map(p => ({ id: p.id, naziv: p.naziv }))));
  }

  grupe(): Observable<GrupaKratko[]> {
    return this.http.get<GrupaKratko[]>(`${this.api}/grupe`)
      .pipe(map(lista => lista.map(g => ({ id: g.id, naziv: g.naziv }))));
  }

  /** Predavanja predmeta ove prezentacije za dijalog "Pokreni". */
  predavanja(prezentacijaId: number): Observable<PredavanjeZaPokretanje[]> {
    return this.http.get<PredavanjeZaPokretanje[]>(`${this.api}/prezentacije/${prezentacijaId}/predavanja`);
  }
}
