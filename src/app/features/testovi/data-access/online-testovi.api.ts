import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';
import {
  CvorBankeTesta, IspravkaCmd, IzvuciCmd, KandidatiStudenti, KonzolaTesta, NoviOnlineTestCmd, OdgovoriTesta, OnlineTest,
  PrimerakNastavnika, RezultatiTesta, SablonCmd, SablonDetails, SablonInfo, VarijantaZaIzbor,
} from './online.models';

type CvorStabla = Omit<CvorBankeTesta, 'deca'> & { deca?: CvorStabla[] | null };

function uCvor(c: CvorStabla): CvorBankeTesta {
  return { id: c.id, naziv: c.naziv, list: c.list, brojAktivnih: c.brojAktivnih, iskljucena: c.iskljucena, deca: (c.deca ?? []).map(uCvor) };
}

/**
 * Online testovi, nastavnik (ugovor plana, odeljak 4): šabloni (`sabloni-testa`), pravljenje i priprema (`test/online`,
 * `test/{id}/online/*`), konzola, rezultati, ispravke ključa i objava (`test/{id}/objava`). Stablo banke namene TEST i
 * varijante tipa za izbor izvora i „Izaberi varijantu“ čita isti `banka/*` kao banka (ovde, jer feature ne sme da uvozi
 * banka `data-access`). Sve putanje su relativne na `<base href>`.
 */
@Injectable({ providedIn: 'root' })
export class OnlineTestoviApi {
  private readonly http = inject(HttpClient);

  private k(o: OpcijeZahteva): { context: HttpContext } {
    return { context: new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false) };
  }

  private test(id: number): string {
    return `${API_URL}/test/${id}/online`;
  }

  // ---------------------------------------------------------------------------------------------- šabloni

  sabloni(predmetId: number | null, arhivirani: boolean, o: OpcijeZahteva = {}): Observable<SablonInfo[]> {
    let params = new HttpParams().set('arhivirani', arhivirani);
    if (predmetId !== null) {
      params = params.set('predmetId', predmetId);
    }
    return this.http.get<SablonInfo[]>(`${API_URL}/sabloni-testa`, { params, ...this.k(o) });
  }

  sablon(id: number, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.get<SablonDetails>(`${API_URL}/sabloni-testa/${id}`, this.k(o));
  }

  noviSablon(cmd: SablonCmd, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.post<SablonDetails>(`${API_URL}/sabloni-testa`, cmd, this.k(o));
  }

  izmeniSablon(id: number, cmd: SablonCmd, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.put<SablonDetails>(`${API_URL}/sabloni-testa/${id}`, cmd, this.k(o));
  }

  kopirajSablon(id: number, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.post<SablonDetails>(`${API_URL}/sabloni-testa/${id}/kopija`, null, this.k(o));
  }

  arhivirajSablon(id: number, arhiviran: boolean, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.patch<SablonDetails>(`${API_URL}/sabloni-testa/${id}/arhiviran`, { arhiviran }, this.k(o));
  }

  obrisiSablon(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/sabloni-testa/${id}`, this.k(o));
  }

  /** Kandidati i upozorenja bez čuvanja (`id` je `null`), dok nastavnik kuca. */
  proveriSablon(cmd: SablonCmd, o: OpcijeZahteva = {}): Observable<SablonDetails> {
    return this.http.post<SablonDetails>(`${API_URL}/sabloni-testa/provera`, cmd, this.k(o));
  }

  /** `GET banka/stablo?predmetId=&namena=TEST`: izvori stavki šablona. */
  stabloTesta(predmetId: number, o: OpcijeZahteva = {}): Observable<CvorBankeTesta[]> {
    const params = new HttpParams().set('predmetId', predmetId).set('namena', 'TEST');
    return this.http.get<CvorStabla[]>(`${API_URL}/banka/stablo`, { params, ...this.k(o) }).pipe(map(s => s.map(uCvor)));
  }

  /** `GET banka/grupe/{id}/varijante?status=AKTIVNA`: kandidati za „Izaberi varijantu“. */
  varijanteTipa(tipId: number, o: OpcijeZahteva = {}): Observable<VarijantaZaIzbor[]> {
    const params = new HttpParams().set('status', 'AKTIVNA');
    return this.http.get<VarijantaZaIzbor[]>(`${API_URL}/banka/grupe/${tipId}/varijante`, { params, ...this.k(o) });
  }

  // ---------------------------------------------------------------------------------------------- pravljenje i priprema

  kandidatiStudenti(grupaId: number, predmetId: number, o: OpcijeZahteva = {}): Observable<KandidatiStudenti> {
    const params = new HttpParams().set('grupaId', grupaId).set('predmetId', predmetId);
    return this.http.get<KandidatiStudenti>(`${API_URL}/test/online/kandidati-studenti`, { params, ...this.k(o) });
  }

  napravi(cmd: NoviOnlineTestCmd, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${API_URL}/test/online`, cmd, this.k(o));
  }

  online(id: number, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.get<OnlineTest>(this.test(id), this.k(o));
  }

  izvuci(id: number, cmd: IzvuciCmd, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${this.test(id)}/izvuci`, cmd, this.k(o));
  }

  dodajStudenta(id: number, studentId: number, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${this.test(id)}/studenti`, { studentId }, this.k(o));
  }

  ukloniStudenta(id: number, studentId: number, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.delete<OnlineTest>(`${this.test(id)}/studenti/${studentId}`, this.k(o));
  }

  // ---------------------------------------------------------------------------------------------- tok i konzola

  otvoriUlaz(id: number, ulazniKod: boolean, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${this.test(id)}/otvori-ulaz`, { ulazniKod }, this.k(o));
  }

  pokreni(id: number, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${this.test(id)}/pokreni`, null, this.k(o));
  }

  zavrsi(id: number, o: OpcijeZahteva = {}): Observable<OnlineTest> {
    return this.http.post<OnlineTest>(`${this.test(id)}/zavrsi`, null, this.k(o));
  }

  /** `primerakId` `null` = svima koji rade; 1-120 minuta. */
  produzi(id: number, minuti: number, primerakId: number | null, o: OpcijeZahteva = {}): Observable<KonzolaTesta> {
    return this.http.post<KonzolaTesta>(`${this.test(id)}/produzi`, { minuti, primerakId }, this.k(o));
  }

  vrati(id: number, primerakId: number, o: OpcijeZahteva = {}): Observable<KonzolaTesta> {
    return this.http.post<KonzolaTesta>(`${this.test(id)}/primerci/${primerakId}/vrati`, null, this.k(o));
  }

  ponisti(id: number, primerakId: number, napomena: string, o: OpcijeZahteva = {}): Observable<KonzolaTesta> {
    return this.http.post<KonzolaTesta>(`${this.test(id)}/primerci/${primerakId}/ponisti`, { napomena }, this.k(o));
  }

  prepisivao(id: number, primerakId: number, prepisivao: boolean, o: OpcijeZahteva = {}): Observable<KonzolaTesta> {
    return this.http.patch<KonzolaTesta>(`${this.test(id)}/primerci/${primerakId}/prepisivao`, { prepisivao }, this.k(o));
  }

  konzola(id: number, o: OpcijeZahteva = {}): Observable<KonzolaTesta> {
    return this.http.get<KonzolaTesta>(`${this.test(id)}/konzola`, this.k(o));
  }

  // ---------------------------------------------------------------------------------------------- rezultati i ispravke

  rezultati(id: number, o: OpcijeZahteva = {}): Observable<RezultatiTesta> {
    return this.http.get<RezultatiTesta>(`${this.test(id)}/rezultati`, this.k(o));
  }

  primerak(id: number, primerakId: number, o: OpcijeZahteva = {}): Observable<PrimerakNastavnika> {
    return this.http.get<PrimerakNastavnika>(`${this.test(id)}/primerci/${primerakId}`, this.k(o));
  }

  /** `poeni` `null` briše ručne poene (važe automatski); 0..maxPoena, 2 decimale. */
  rucniPoeni(id: number, zadatakId: number, poeni: number | null, napomena: string | null, o: OpcijeZahteva = {}): Observable<PrimerakNastavnika> {
    return this.http.put<PrimerakNastavnika>(`${this.test(id)}/zadaci/${zadatakId}/rucni-poeni`, { poeni, napomena }, this.k(o));
  }

  odgovori(id: number, o: OpcijeZahteva = {}): Observable<OdgovoriTesta> {
    return this.http.get<OdgovoriTesta>(`${this.test(id)}/odgovori`, this.k(o));
  }

  ispravi(id: number, cmd: IspravkaCmd, o: OpcijeZahteva = {}): Observable<OdgovoriTesta> {
    return this.http.post<OdgovoriTesta>(`${this.test(id)}/ispravke`, cmd, this.k(o));
  }

  vratiIspravku(id: number, ispravkaId: number, o: OpcijeZahteva = {}): Observable<OdgovoriTesta> {
    return this.http.delete<OdgovoriTesta>(`${this.test(id)}/ispravke/${ispravkaId}`, this.k(o));
  }

  /** Objava rezultata (i za test na papiru; online tek kad je ZAVRSEN): 204. */
  objavi(id: number, tacni: boolean, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.post<void>(`${API_URL}/test/${id}/objava`, { tacni }, this.k(o));
  }

  povuciObjavu(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/test/${id}/objava`, this.k(o));
  }

  /** „Završi evidentiranje“ (postojeći `PATCH test/{id}`); za online test tek kad je ZAVRSEN i ručni zadaci imaju poene. */
  zavrsiEvidentiranje(id: number, o: OpcijeZahteva = {}): Observable<unknown> {
    return this.http.patch(`${API_URL}/test/${id}`, null, this.k(o));
  }

  obrisiTest(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/test/${id}`, this.k(o));
  }
}
