import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GrupaDetails, GrupaInfo, PredavanjeDetails, PredavanjeStudentId, PredmetInfo, StartPredavanjeCmd, UpdatePredavanjeCmd } from './models/predavanje.model';

@Injectable({
  providedIn: 'root'
})
export class PredavanjeService {
  

  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) { }

  getGrupe(): Observable<GrupaInfo[]> {
    return this.http.get<any[]>(`${this.apiUrl}/grupe`);
  }

  getPredmeti(): Observable<PredmetInfo[]> {
    return this.http.get<any[]>(`${this.apiUrl}/predmeti`);
  }

  startPredavanje(cmd: StartPredavanjeCmd): Observable<PredavanjeDetails> {
    return this.http.post<PredavanjeDetails>(`${this.apiUrl}/predavanja/start`, cmd);
  }

  getPredavanjeDetails(id: number): Observable<PredavanjeDetails> {
    return this.http.get<PredavanjeDetails>(`${this.apiUrl}/predavanja/${id}`);
  }

  getGrupaDetails(id: number): Observable<GrupaDetails> {
    return this.http.get<GrupaDetails>(`${this.apiUrl}/grupe/${id}`);
  }

  updatePredavanje(id: number, cmd: UpdatePredavanjeCmd): Observable<PredavanjeDetails> {
    return this.http.put<PredavanjeDetails>(`${this.apiUrl}/predavanja/${id}`, cmd); 
  }

  updatePosecenost(predavanjeId: number): Observable<PredavanjeDetails>{
    return this.http.put<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/posecenost`, null);
  }

  dodajPrisutnog(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    const cmd : PredavanjeStudentId = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/prisustvo`, cmd)
  }

  skloniPrisutnog(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/prisustvo/${studentId}`)
  }

  dodajZadatak(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    const cmd : PredavanjeStudentId = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zadatak`, cmd)
  }
  
  skloniZadatak(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zadatak/${studentId}`)
  }

  dodajZadatakZvezdica(studentId: number, predavanjeId: number): Observable<PredavanjeDetails>{
    const cmd : PredavanjeStudentId = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zvezdica`, cmd)
  }

}
