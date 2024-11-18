import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTestCmd, TestDetails, TestInfo, TipTestaInfo } from '../models/model';

@Injectable({
  providedIn: 'root'
})
export class TestService {

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  createTest(cmd: CreateTestCmd): Observable<TestInfo>{
    return this.http.post<TestInfo>(`${this.apiUrl}/test`, cmd);
  }

  viewTest(id: number){
    return this.http.get<TestDetails>(`${this.apiUrl}/test/${id}`)
  }

  findTipoveTestovaPredmeta(predmetId: number): Observable<TipTestaInfo[]>{
    return this.http.get<TipTestaInfo[]>(`${this.apiUrl}/predmeti/${predmetId}/tipovi`);
  }
}
