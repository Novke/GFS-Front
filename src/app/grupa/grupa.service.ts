import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateGrupaCmd, CreateStudentCmd, GrupaDetails, GrupaInfo, StudentInfo } from '../models/model';
import { API_URL } from '../shared/api-url';

@Injectable({
  providedIn: 'root'
})
export class GrupaService {

  private apiUrl = API_URL;

  constructor(private http: HttpClient) { }

  getGrupe(): Observable<GrupaInfo[]> {
    return this.http.get<GrupaInfo[]>(`${this.apiUrl}/grupe`);
  }

  getGrupa(id: number): Observable<GrupaDetails> {
    return this.http.get<GrupaDetails>(`${this.apiUrl}/grupe/${id}`);
  }

  createGrupa(cmd: CreateGrupaCmd): Observable<GrupaInfo> {
    return this.http.post<GrupaInfo>(`${this.apiUrl}/grupe`, cmd);
  }

  createStudent(cmd: CreateStudentCmd): Observable<StudentInfo> {
    return this.http.post<StudentInfo>(`${this.apiUrl}/studenti`, cmd);
  }
}
