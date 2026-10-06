import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { StudentNaPredmetuDetails, StudentPregledDetails } from '../models/model';
import { API_URL } from '../shared/api-url';

@Injectable({
  providedIn: 'root'
})
export class StudentService {

  private apiUrl = API_URL;

  constructor(private http: HttpClient) { }

  getDetails(id: number): Observable<StudentPregledDetails>{
    return this.http.get<StudentPregledDetails>(`${this.apiUrl}/studenti/${id}`)
  }

  getStudentNaPredmetu(studentId: number, predmetId: number): Observable<StudentNaPredmetuDetails> {
    return this.http.get<StudentNaPredmetuDetails>(`${this.apiUrl}/studenti/${studentId}/predmet/${predmetId}`)
  }
}
