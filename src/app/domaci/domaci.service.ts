import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CreateUradjenDomaciCmd, DodajDomaciCmd, DomaciDetails, DomaciInfo, UpdateDomaciCmd } from '../models/model';

@Injectable({
  providedIn: 'root'
})
export class DomaciService {

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  dodajDomaci(cmd: DodajDomaciCmd){
    return this.http.post<DomaciInfo>(`${this.apiUrl}/domaci`, cmd)
  }

  viewDomaci(id: number){
    return this.http.get<DomaciDetails>(`${this.apiUrl}/domaci/${id}`)
  }

  evidentirajDomaci(cmd: CreateUradjenDomaciCmd){
    return this.http.post<DomaciDetails>(`${this.apiUrl}/domaci/evidentiraj`, cmd)
  }

  oslobodiDomaceg(domaciId: number){
    return this.http.post<DomaciDetails>(`${this.apiUrl}/domaci/${domaciId}/oslobodi`, null)
  }

  azurirajDomaci(domaciId: number, cmd: UpdateDomaciCmd){
    return this.http.put<DomaciDetails>(`${this.apiUrl}/domaci/${domaciId}`, cmd)
  }

  zavrsiPregledanje(domaciId: number){
    return this.http.patch<void>(`${this.apiUrl}/domaci/${domaciId}`, null)
  }

}
