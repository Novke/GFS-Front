import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import {
  CekanjeZahteva, CuvanjeCmd, CuvanjeOdgovor, DogadjajCmd, PolaganjeStudenta, RacunarZaOdobrenje, RezultatTestaKratko,
  RezultatTestaStudenta, TestNaNalogu, UlazCmd, ZahtevRacunara,
} from './testovi-studenta.models';

/**
 * Online testovi i prijava računara, student (ugovor plana, odeljak 5): samo `api/public/nalog/testovi/*`,
 * `api/public/nalog/predmeti/{id}/testovi` i `api/public/nalog/racunar/*`. Student je uvek iz kolačića (`gfs_student`); greške
 * prikazuje strana (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class TestoviStudentaApi {
  private readonly http = inject(HttpClient);
  private readonly lokalneGreske = new HttpContext().set(LOCAL_ERRORS, true);
  private readonly koren = `${API_URL}/public/nalog`;

  private test(id: number): string {
    return `${this.koren}/testovi/${id}`;
  }

  /** Otvoreni za ulaz ili započeti testovi (ne završeni). */
  testovi(): Observable<TestNaNalogu[]> {
    return this.http.get<TestNaNalogu[]>(`${this.koren}/testovi`, { context: this.lokalneGreske });
  }

  /** 403 `Pogrešan ulazni kod.`; 409 `Test je otvoren na drugom uređaju.` (ponovo sa `preuzmi: true` = „Nastavi ovde“). */
  udji(testId: number, cmd: UlazCmd): Observable<PolaganjeStudenta> {
    return this.http.post<PolaganjeStudenta>(`${this.test(testId)}/ulaz`, cmd, { context: this.lokalneGreske });
  }

  polaganje(testId: number): Observable<PolaganjeStudenta> {
    return this.http.get<PolaganjeStudenta>(this.test(testId), { context: this.lokalneGreske });
  }

  /** 409 `Zastarela izmena.`, `Vreme je isteklo.`, `Test je predat.`, `Test je otvoren na drugom uređaju.`. */
  sacuvaj(testId: number, zadatakId: number, cmd: CuvanjeCmd): Observable<CuvanjeOdgovor> {
    return this.http.put<CuvanjeOdgovor>(`${this.test(testId)}/zadaci/${zadatakId}`, cmd, { context: this.lokalneGreske });
  }

  predaj(testId: number): Observable<PolaganjeStudenta> {
    return this.http.post<PolaganjeStudenta>(`${this.test(testId)}/predaj`, null, { context: this.lokalneGreske });
  }

  /** Meki znak (napuštanje prozora i povratak): 204, samo za prikaz nastavniku. */
  dogadjaj(testId: number, cmd: DogadjajCmd): Observable<void> {
    return this.http.post<void>(`${this.test(testId)}/dogadjaj`, cmd, { context: this.lokalneGreske });
  }

  /** Objavljena polaganja predmeta (i papir). */
  testoviPredmeta(predmetId: number): Observable<RezultatTestaKratko[]> {
    return this.http.get<RezultatTestaKratko[]>(`${this.koren}/predmeti/${predmetId}/testovi`, { context: this.lokalneGreske });
  }

  /** 404 dok nije objavljen. */
  rezultat(testId: number): Observable<RezultatTestaStudenta> {
    return this.http.get<RezultatTestaStudenta>(`${this.test(testId)}/rezultat`, { context: this.lokalneGreske });
  }

  // ---------------------------------------------------------------------------------------------- prijava računara

  /** Anonimno: nov zahtev (QR + broj) i kolačić `gfs_racunar` sa tajnom. */
  zahtev(): Observable<ZahtevRacunara> {
    return this.http.post<ZahtevRacunara>(`${this.koren}/racunar/zahtev`, null, { context: this.lokalneGreske });
  }

  /** Anonimno, uz kolačić `gfs_racunar`: CEKA, ISTEKAO ili ODOBREN (tada isti odgovor postavlja `gfs_student`). */
  cekaj(): Observable<CekanjeZahteva> {
    return this.http.get<CekanjeZahteva>(`${this.koren}/racunar/zahtev`, { context: this.lokalneGreske });
  }

  /** Telefon studenta: šta se odobrava; 410 kad je zahtev istekao ili iskorišćen. */
  racunar(token: string): Observable<RacunarZaOdobrenje> {
    return this.http.get<RacunarZaOdobrenje>(`${this.koren}/racunar/${encodeURIComponent(token)}`, { context: this.lokalneGreske });
  }

  /** 204; 403 `Računar se odobrava sa telefona.` (sesija nije KOD); 410. */
  odobri(token: string): Observable<void> {
    return this.http.post<void>(`${this.koren}/racunar/${encodeURIComponent(token)}/odobri`, null, { context: this.lokalneGreske });
  }
}
