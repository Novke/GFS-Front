import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AktivnostInfo, GrupaDetails, GrupaInfo, PredavanjeDetails, PredavanjeInfo, IdCmd, PredmetInfo, StartPredavanjeCmd, UpdateAktivnostNapomenaCmd, UpdatePredavanjeCmd } from '../models/model';

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
    const cmd : IdCmd = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/prisustvo`, cmd)
  }

  skloniPrisutnog(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/prisustvo/${studentId}`)
  }

  dodajZadatak(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    const cmd : IdCmd = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zadatak`, cmd)
  }
  
  skloniZadatak(studentId: number, predavanjeId: number): Observable<PredavanjeDetails> {
    return this.http.delete<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zadatak/${studentId}`)
  }

  dodajZadatakZvezdica(studentId: number, predavanjeId: number): Observable<PredavanjeDetails>{
    const cmd : IdCmd = {id: studentId}
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}/zvezdica`, cmd)
  }
  
  updateAktivnostiNapomena(aktivnostId: number, value: string) {
    const cmd : UpdateAktivnostNapomenaCmd = {napomene:value}
    return this.http.put<AktivnostInfo>(`${this.apiUrl}/predavanja/aktivnost/${aktivnostId}`, cmd)
  }

  searchPredavanja(predmetId: number, grupaId: number){
    return this.http.get<PredavanjeInfo[]>(`${this.apiUrl}/predavanja/search`, {
      params: {
        predmet: predmetId.toString(),
        grupa: grupaId.toString()
      }
    });
  }

  getPredmet(predmetId: number){
    return this.http.get<PredmetInfo>(`${this.apiUrl}/predmeti/${predmetId}`)
  }

  zavrsiPredavanje(predavanjeId: number){
    return this.http.patch<PredavanjeDetails>(`${this.apiUrl}/predavanja/${predavanjeId}`, null)
  }

  vratiPredavanjaGrupaPredmet(grupaId: number, predmetId: number){
    return this.http.get<PredavanjeInfo[]>(`${this.apiUrl}/predavanja/grupa/${grupaId}/predmet/${predmetId}`)
  }

}
