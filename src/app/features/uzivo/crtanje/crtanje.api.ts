import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import { CrtezIzvodjenja, ElementCrteza, KljucStrane, RanijiCrtez, StranaCrteza } from './crtanje.models';

/**
 * REST crteža (ugovor iz plana crtanja): strane izvođenja, ranije na slajdu, pregled i tabla predavanja. Sve iza prijave
 * nastavnika (javne rute ga ne uvoze). Greške prikazuje pozivalac (znak "nije sačuvano", tiho ponavljanje), pa svi zahtevi
 * idu sa `LOCAL_ERRORS`.
 */
@Injectable({ providedIn: 'root' })
export class CrtanjeApi {
  private readonly http = inject(HttpClient);
  private readonly api = API_URL;
  private readonly context = new HttpContext().set(LOCAL_ERRORS, true);

  private parametri(k: KljucStrane): HttpParams {
    return new HttpParams().set('slajdId', String(k.slajdId)).set('pozadina', k.pozadina);
  }

  strana(izvodjenjeId: number, k: KljucStrane): Observable<StranaCrteza> {
    return this.http.get<StranaCrteza>(`${this.api}/izvodjenja/${izvodjenjeId}/crtezi/strana`, { params: this.parametri(k), context: this.context });
  }

  upisiStranu(izvodjenjeId: number, k: KljucStrane, elementi: readonly ElementCrteza[]): Observable<{ verzija: number }> {
    return this.http.put<{ verzija: number }>(`${this.api}/izvodjenja/${izvodjenjeId}/crtezi/strana`, { elementi },
      { params: this.parametri(k), context: this.context });
  }

  /** Crteži drugih izvođenja iste prezentacije na slajdu (obe pozadine, najnoviji prvi, do 5 po pozadini). */
  ranije(izvodjenjeId: number, slajdId: number): Observable<RanijiCrtez[]> {
    return this.http.get<RanijiCrtez[]>(`${this.api}/izvodjenja/${izvodjenjeId}/crtezi/ranije`,
      { params: new HttpParams().set('slajdId', slajdId), context: this.context });
  }

  /** Sve ne-prazne strane izvođenja (pregled), redom slajdova. */
  crtezi(izvodjenjeId: number): Observable<CrtezIzvodjenja[]> {
    return this.http.get<CrtezIzvodjenja[]>(`${this.api}/izvodjenja/${izvodjenjeId}/crtezi`, { context: this.context });
  }

  /** Tabla predavanja; `posle` = poznata verzija: `null` kad se nije menjala (204). */
  tabla(predavanjeId: number, posle?: number): Observable<StranaCrteza | null> {
    const params = posle === undefined ? undefined : new HttpParams().set('posle', posle);
    return this.http.get<StranaCrteza>(`${this.api}/predavanja/${predavanjeId}/tabla`, { params, observe: 'response', context: this.context })
      .pipe(map(r => (r.status === 204 ? null : r.body)));
  }

  upisiTablu(predavanjeId: number, elementi: readonly ElementCrteza[]): Observable<{ verzija: number }> {
    return this.http.put<{ verzija: number }>(`${this.api}/predavanja/${predavanjeId}/tabla`, { elementi }, { context: this.context });
  }
}
