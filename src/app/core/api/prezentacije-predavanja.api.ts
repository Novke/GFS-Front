import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import { VrstaPrezentacije } from './redosled-prezentacija';

/**
 * Prezentacija predmeta kao stavka izbora (`GET prezentacije?predmetId`, `GET prezentacije/izbor`); `aktivnoIzvodjenjeId` =
 * izvođenje u toku, ako ga ima. `vezba` je redni broj vežbe (`null` = bez broja), `vrsta` se računa iz slajdova,
 * `brojZadataka` broji ZADATAK slajdove, `poslednjePustanje` je početak najnovijeg izvođenja bilo koje grupe.
 */
export interface PrezentacijaZaIzbor {
  id: number;
  naziv: string;
  brojSlajdova: number;
  brojPitanja: number;
  izmenjeno: string;
  aktivnoIzvodjenjeId: number | null;
  vezba: number | null;
  vrsta: VrstaPrezentacije;
  brojZadataka: number;
  kreirano: string;
  poslednjePustanje: string | null;
}

/** Stavka izbora: prezentacija i kad ju je grupa iz upita poslednji put puštala (`null` = nije, ili upit bez grupe). */
export interface StavkaIzbora {
  prezentacija: PrezentacijaZaIzbor;
  pustenoGrupi: string | null;
}

/** `GET prezentacije/izbor`: sve prezentacije predmeta po vežbama i id-jevi predloženih sledećih (najviše 3, redom). */
export interface IzborPrezentacija {
  stavke: StavkaIzbora[];
  predlog: number[];
}

/** Izvođenje (jedno prikazivanje prezentacije) vezano za predavanje (`GET izvodjenja?predavanjeId`), najnovije prvo. */
export interface IzvodjenjeNaPredavanju {
  id: number;
  prezentacija: { id: number; naziv: string };
  status: 'AKTIVNO' | 'ZAVRSENO';
  /** `LocalDateTime` bez zone. */
  pocetak: string;
  kraj: string | null;
  brojUcesnika: number;
  brojPitanja: number;
  cuvanje: boolean;
}

/**
 * Prezentacije (uživo) na ekranu predavanja: izbor prezentacije predmeta, pokretanje izvođenja vezanog za predavanje i
 * izvođenja koja su već vezana za njega. Uživo ima svoj klijent (`features/uzivo/data-access`), koji ovde ne sme da se
 * uvozi; ovo je samo ono što predavanje koristi. Greške prikazuje pozivalac (`LOCAL_ERRORS`).
 */
@Injectable({ providedIn: 'root' })
export class PrezentacijePredavanjaApi {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  /**
   * Izbor za pokretanje: sa `grupaId` predlog prati šta je ta grupa puštala, bez nje (izvođenje van predavanja) nudi sledeće
   * po redu posle `posle`.
   */
  izbor(predmetId: number, grupaId: number | null, posle: number | null = null): Observable<IzborPrezentacija> {
    let params = new HttpParams().set('predmetId', predmetId);
    if (grupaId !== null) params = params.set('grupaId', grupaId);
    if (posle !== null) params = params.set('posle', posle);
    return this.http.get<IzborPrezentacija>(`${API_URL}/prezentacije/izbor`, { params, context: this.context });
  }

  izvodjenja(predavanjeId: number): Observable<IzvodjenjeNaPredavanju[]> {
    const params = new HttpParams().set('predavanjeId', predavanjeId);
    return this.http.get<IzvodjenjeNaPredavanju[]>(`${API_URL}/izvodjenja`, { params, context: this.context });
  }

  /** Izvođenje sa čuvanjem, vezano za predavanje (i kad prezentacija nema pitanja: svaka prikazana prezentacija ostaje zabeležena). */
  pokreni(prezentacijaId: number, predavanjeId: number): Observable<IzvodjenjeNaPredavanju> {
    const telo = { cuvanje: true, grupaId: null, predavanjeId, boduje: false };
    return this.http.post<IzvodjenjeNaPredavanju>(`${API_URL}/prezentacije/${prezentacijaId}/izvodjenja`, telo, { context: this.context });
  }
}
