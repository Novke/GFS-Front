import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateOnboardingCmd, JavniUpisInfo, OdbijPrijavuCmd, OnboardingSesijaDetails, OnboardingSesijaInfo,
  PodnesiPrijavuCmd, PodnetaPrijavaInfo, PrijavaInfo, UpdateOnboardingCmd, UpdatePrijavaCmd
} from '../models/model';
import { API_URL } from '../shared/api-url';

@Injectable({
  providedIn: 'root'
})
export class OnboardingService {
  private http = inject(HttpClient);


  private apiUrl = API_URL;

  listSesije(grupaId: number): Observable<OnboardingSesijaInfo[]> {
    return this.http.get<OnboardingSesijaInfo[]>(`${this.apiUrl}/grupe/${grupaId}/onboarding`);
  }

  createSesija(grupaId: number, cmd: CreateOnboardingCmd): Observable<OnboardingSesijaInfo> {
    return this.http.post<OnboardingSesijaInfo>(`${this.apiUrl}/grupe/${grupaId}/onboarding`, cmd);
  }

  getSesija(id: number): Observable<OnboardingSesijaDetails> {
    return this.http.get<OnboardingSesijaDetails>(`${this.apiUrl}/onboarding/${id}`);
  }

  setAktivna(id: number, cmd: UpdateOnboardingCmd): Observable<OnboardingSesijaInfo> {
    return this.http.patch<OnboardingSesijaInfo>(`${this.apiUrl}/onboarding/${id}`, cmd);
  }

  updatePrijava(id: number, prijavaId: number, cmd: UpdatePrijavaCmd): Observable<PrijavaInfo> {
    return this.http.put<PrijavaInfo>(`${this.apiUrl}/onboarding/${id}/prijave/${prijavaId}`, cmd);
  }

  prihvati(id: number, prijavaId: number): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${this.apiUrl}/onboarding/${id}/prijave/${prijavaId}/prihvati`, {});
  }

  odbij(id: number, prijavaId: number, cmd: OdbijPrijavuCmd): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${this.apiUrl}/onboarding/${id}/prijave/${prijavaId}/odbij`, cmd);
  }

  prihvatiSve(id: number): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${this.apiUrl}/onboarding/${id}/prihvati-sve`, {});
  }

  // Javni endpointi (bez prijave): koristi ih samo stranica upis/:token.
  getJavniUpis(token: string): Observable<JavniUpisInfo> {
    return this.http.get<JavniUpisInfo>(`${this.apiUrl}/public/upis/${token}`);
  }

  podnesiPrijavu(token: string, cmd: PodnesiPrijavuCmd): Observable<PodnetaPrijavaInfo> {
    return this.http.post<PodnetaPrijavaInfo>(`${this.apiUrl}/public/upis/${token}`, cmd);
  }
}
