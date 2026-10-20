import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { OpcijeZahteva } from './opcije-zahteva';

/**
 * Čvor stabla banke predavanja za izbor grupe Zadatak slajda (deca po `rb`, kao na serveru). `brojAktivnih` je za unutrašnji
 * čvor zbir celog podstabla; `iskljucena`: čvor ili neki predak ima isključenu temu (slajd se ipak sme napraviti, uz upozorenje).
 */
export interface CvorIzbora {
  id: number;
  naziv: string;
  /** Nema podgrupa: samo list ima šemu polja i varijante. */
  list: boolean;
  brojAktivnih: number;
  iskljucena: boolean;
  deca: CvorIzbora[];
}

/** Deo `GrupaCvor` (`GET banka/stablo`) koji izbor čita; ostali brojači i izvor se odbacuju. */
type CvorStabla = Omit<CvorIzbora, 'deca'> & { deca?: CvorStabla[] | null };

function uCvor(c: CvorStabla): CvorIzbora {
  return {
    id: c.id, naziv: c.naziv, list: c.list, brojAktivnih: c.brojAktivnih, iskljucena: c.iskljucena,
    deca: (c.deca ?? []).map(uCvor),
  };
}

/**
 * Stablo banke za izbor grupe u Uživo editoru. Živi u `core/api`, jer `features/uzivo` ne sme da uvozi banka `data-access`
 * (`gfs/granice-featurea`); isti `GET banka/stablo` kao banka, uvek namena PREDAVANJE (Zadatak slajd ne prima grupe za testove).
 */
@Injectable({ providedIn: 'root' })
export class BankaIzborApi {
  private readonly http = inject(HttpClient);

  /** `GET banka/stablo?predmetId=&namena=PREDAVANJE`. */
  stablo(predmetId: number, o: OpcijeZahteva = {}): Observable<CvorIzbora[]> {
    const params = new HttpParams().set('predmetId', predmetId).set('namena', 'PREDAVANJE');
    return this.http
      .get<CvorStabla[]>(`${API_URL}/banka/stablo`, { params, context: new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false) })
      .pipe(map(stablo => stablo.map(uCvor)));
  }
}
