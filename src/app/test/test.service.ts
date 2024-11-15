import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTestCmd, TestDetails, TipTestaInfo } from '../models/model';

@Injectable({
  providedIn: 'root'
})
export class TestService {

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  createTest(cmd: CreateTestCmd): Observable<TestDetails>{
    return this.http.post<TestDetails>(`${this.apiUrl}/test`, cmd);
  }

  findTipoveTestovaPredmeta(predmetId: number): Observable<TipTestaInfo[]>{
    return this.http.get<TipTestaInfo[]>(`${this.apiUrl}/predmeti/${predmetId}/tipovi`);
  }
}
