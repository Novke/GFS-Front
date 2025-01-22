import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { StudentPregledDetails } from '../models/model';

@Injectable({
  providedIn: 'root'
})
export class StudentService {

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  getDetails(id: number): Observable<StudentPregledDetails>{
    return this.http.get<StudentPregledDetails>(`${this.apiUrl}/studenti/${id}`)
  }
}
