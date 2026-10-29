import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import { IzvodjenjeNaPredavanju } from './prezentacije-predavanja.api';

/**
 * Red ranga tačnosti (backend `RangTacnostiStavka`). `mesto` je `null` samo za studenta grupe koji nije dugovao nijedno
 * pitanje (dno liste grupe); `procenat` = ceo procenat `tacnih/dugovanih`; `prosekMs` = prosečno vreme odgovorenih
 * (`null` bez odgovora); `zvezdice` = ★ tačnih (pitanje 1, zadatak nivo varijante). `poeni` samo u takmičenju,
 * `izvodjenja` u zbiru predavanja, `casova` u zbiru grupe i studenta.
 */
export interface RangTacnostiStavka {
  mesto: number | null;
  ucesnikId: number | null;
  studentId: number | null;
  ime: string;
  gost: boolean;
  tacnih: number;
  dugovanih: number;
  odgovorenih: number;
  procenat: number | null;
  prosekMs: number | null;
  zvezdice: number;
  poeni: number | null;
  izvodjenja: number | null;
  casova: number | null;
}

/** Rang predavanja: izvođenja sa bar jednom rundom (najnovije prvo) i zbir svih njih. */
export interface RangPredavanja {
  predavanjeId: number;
  izvodjenja: IzvodjenjeNaPredavanju[];
  rang: RangTacnostiStavka[];
}

/** Čas na kartici studenta: predavanje (ili izvođenje bez predavanja) i studentov red u rangu tog časa. */
export interface UzivoStudentaRed {
  predavanjeId: number | null;
  izvodjenjeId: number | null;
  /** `LocalDate`. */
  datum: string;
  predmetId: number;
  predmet: string;
  naslov: string;
  stavka: RangTacnostiStavka;
  ukupnoURangu: number;
}

export interface UzivoStudenta {
  ukupno: RangTacnostiStavka | null;
  casovi: UzivoStudentaRed[];
}

export interface UzivoGrupe {
  grupaId: number;
  brojCasova: number;
  rang: RangTacnostiStavka[];
}

/** Filteri kartice studenta i ranga grupe (oba opciona; `godina` = školska godina). */
export interface FilterUzivo {
  predmetId?: number | null;
  godina?: number | null;
}

/**
 * Rang tačnosti (Uživo): izvođenje, predavanje, student, grupa. Koriste ga uživo, predavanja, studenti i grupe, pa je u
 * `core/api`. Greške prikazuje pozivalac (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class RangApi {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  izvodjenje(id: number): Observable<RangTacnostiStavka[]> {
    return this.http.get<RangTacnostiStavka[]>(`${API_URL}/izvodjenja/${id}/rang`, { context: this.context });
  }

  predavanje(id: number): Observable<RangPredavanja> {
    return this.http.get<RangPredavanja>(`${API_URL}/predavanja/${id}/rang`, { context: this.context });
  }

  student(id: number, filter: FilterUzivo = {}): Observable<UzivoStudenta> {
    return this.http.get<UzivoStudenta>(`${API_URL}/studenti/${id}/uzivo`, { params: parametri(filter), context: this.context });
  }

  grupa(id: number, filter: FilterUzivo = {}): Observable<UzivoGrupe> {
    return this.http.get<UzivoGrupe>(`${API_URL}/grupe/${id}/uzivo`, { params: parametri(filter), context: this.context });
  }
}

function parametri(f: FilterUzivo): HttpParams {
  let p = new HttpParams();
  if (f.predmetId != null) p = p.set('predmetId', f.predmetId);
  if (f.godina != null) p = p.set('godina', f.godina);
  return p;
}

/** Prosečno vreme za prikaz: "3,2 s" (jedna decimala, decimalni zarez), "—" bez vremena. */
export function prikazVremena(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}
