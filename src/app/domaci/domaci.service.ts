import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DodajDomaciCmd, DomaciInfo } from '../models/model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DomaciService {

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  dodajDomaci(cmd: DodajDomaciCmd){
    return this.http.post<DomaciInfo>(`${this.apiUrl}/domaci`, cmd)
  }

}
