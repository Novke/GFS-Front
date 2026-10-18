import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';
import { Strana } from '../../../shared/models/strana';
import {
  BankaFilter, BankaPretragaStavka, GrupaCmd, GrupaCvor, GrupaDetails, MedijInfo, Namena, PreambulaCmd, PreambulaInfo,
  PremestiCmd, RenderProbaCmd, RenderProbaInfo, RenderujSveInfo, StatusVarijante, svgUrl, VarijantaCmd, VarijantaDetails, VarijantaInfo,
} from './banka.models';

/** Strana liste `GET banka/pretraga` (Spring `page` je 0-based, `size` najviše 100). */
export interface StranaPretrage {
  page?: number;
  size?: number;
  sort?: string;
}

/**
 * Banka zadataka (`GrupaZadatakaRest`, `VarijantaRest`, `PrilogRest`, preambula i pretraga). Sve putanje su relativne na
 * `<base href>`. Greške: 409 (grupa bez težine ne prima varijante, aktivacija bez uspelog rendera), 429 (render-proba:
 * najviše 3 istovremeno, `MAX_PROBA` na serveru) i 503 (render servis ne radi); `{ tiho: true }` ostavlja poruku pozivaocu.
 */
@Injectable({ providedIn: 'root' })
export class BankaApi {
  private readonly http = inject(HttpClient);

  private kontekst(o: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false);
  }

  // ---------------------------------------------------------------------------------------------- grupe

  /** `GET banka/stablo`: celo stablo predmeta za jednu namenu, sa brojačima varijanti. */
  stablo(predmetId: number, namena: Namena, o: OpcijeZahteva = {}): Observable<GrupaCvor[]> {
    const params = new HttpParams().set('predmetId', predmetId).set('namena', namena);
    return this.http.get<GrupaCvor[]>(`${API_URL}/banka/stablo`, { params, context: this.kontekst(o) });
  }

  /** `GET banka/grupe/{id}`. */
  grupa(id: number, o: OpcijeZahteva = {}): Observable<GrupaDetails> {
    return this.http.get<GrupaDetails>(`${API_URL}/banka/grupe/${id}`, { context: this.kontekst(o) });
  }

  /** `POST banka/grupe`: koren (`predmetId` + `namena`) ili podgrupa (`roditeljId`). */
  kreirajGrupu(cmd: GrupaCmd, o: OpcijeZahteva = {}): Observable<GrupaDetails> {
    return this.http.post<GrupaDetails>(`${API_URL}/banka/grupe`, cmd, { context: this.kontekst(o) });
  }

  /** `PUT banka/grupe/{id}`: puna zamena naziva, opisa, težine i uputstva; `polja: null` ostavlja šemu. */
  izmeniGrupu(id: number, cmd: GrupaCmd, o: OpcijeZahteva = {}): Observable<GrupaDetails> {
    return this.http.put<GrupaDetails>(`${API_URL}/banka/grupe/${id}`, cmd, { context: this.kontekst(o) });
  }

  /** `DELETE banka/grupe/{id}` (409 dok ima podgrupe). */
  obrisiGrupu(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/banka/grupe/${id}`, { context: this.kontekst(o) });
  }

  /** `POST banka/grupe/{id}/premesti`. */
  premesti(id: number, cmd: PremestiCmd, o: OpcijeZahteva = {}): Observable<GrupaDetails> {
    return this.http.post<GrupaDetails>(`${API_URL}/banka/grupe/${id}/premesti`, cmd, { context: this.kontekst(o) });
  }

  /**
   * `PUT banka/grupe/redosled`: novi redosled dece grupe `roditeljId` (`null` = koren predmeta i namene); `ids` su tačno svi
   * njihovi id-jevi.
   */
  redosled(predmetId: number, namena: Namena, roditeljId: number | null, ids: number[], o: OpcijeZahteva = {}): Observable<void> {
    let params = new HttpParams().set('predmetId', predmetId).set('namena', namena);
    if (roditeljId !== null) {
      params = params.set('roditeljId', roditeljId);
    }
    return this.http.put<void>(`${API_URL}/banka/grupe/redosled`, { ids }, { params, context: this.kontekst(o) });
  }

  // ---------------------------------------------------------------------------------------------- varijante

  /** `GET banka/grupe/{id}/varijante`: po redosledu; bez `status` sve. */
  varijante(grupaId: number, status?: StatusVarijante | null, o: OpcijeZahteva = {}): Observable<VarijantaInfo[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<VarijantaInfo[]>(`${API_URL}/banka/grupe/${grupaId}/varijante`, { params, context: this.kontekst(o) });
  }

  /** `GET banka/varijante/{id}`. */
  varijanta(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.get<VarijantaDetails>(`${API_URL}/banka/varijante/${id}`, { context: this.kontekst(o) });
  }

  /** `POST banka/grupe/{id}/varijante`: renderuje sinhrono (neuspeh LaTeX-a je `renderStatus: GRESKA` u odgovoru). */
  kreirajVarijantu(grupaId: number, cmd: VarijantaCmd, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/grupe/${grupaId}/varijante`, cmd, { context: this.kontekst(o) });
  }

  /** `PUT banka/varijante/{id}`: puna zamena; server renderuje samo kad se ulaz rendera promenio. */
  izmeniVarijantu(id: number, cmd: VarijantaCmd, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.put<VarijantaDetails>(`${API_URL}/banka/varijante/${id}`, cmd, { context: this.kontekst(o) });
  }

  /** `DELETE banka/varijante/{id}`. */
  obrisiVarijantu(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/banka/varijante/${id}`, { context: this.kontekst(o) });
  }

  /** `POST banka/varijante/{id}/odobri`: u AKTIVNU (409 bez uspelog rendera). */
  odobri(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/odobri`, null, { context: this.kontekst(o) });
  }

  /** `POST banka/varijante/{id}/arhiviraj`. */
  arhiviraj(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/arhiviraj`, null, { context: this.kontekst(o) });
  }

  /** `POST banka/varijante/{id}/vrati-u-nacrt`. */
  vratiUNacrt(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/vrati-u-nacrt`, null, { context: this.kontekst(o) });
  }

  /** `POST banka/varijante/{id}/render`: ponovni render bez obzira na keš (503 kad render servis ne radi). */
  render(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/render`, null, { context: this.kontekst(o) });
  }

  /** `POST banka/varijante/{id}/dupliraj`. */
  dupliraj(id: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    return this.http.post<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/dupliraj`, null, { context: this.kontekst(o) });
  }

  // ---------------------------------------------------------------------------------------------- render, prilozi

  /** `POST banka/render-proba`: render bez čuvanja (pregled u editoru); 429 kad je zauzet, 503 kad render servis ne radi. */
  renderProba(cmd: RenderProbaCmd, o: OpcijeZahteva = {}): Observable<RenderProbaInfo> {
    return this.http.post<RenderProbaInfo>(`${API_URL}/banka/render-proba`, cmd, { context: this.kontekst(o) });
  }

  /** SVG rendera (`api/public/mediji/{id}`) kao tekst: pregled sačuvane varijante u editoru, kroz `ocistiSvg` (bez probe). */
  svg(id: string, o: OpcijeZahteva = {}): Observable<string> {
    return this.http.get(svgUrl(id), { responseType: 'text', context: this.kontekst(o) });
  }

  /** `POST banka/prilozi` (multipart, polje `fajl`): PNG, JPEG ili PDF za LaTeX render. */
  prilog(fajl: File, o: OpcijeZahteva = {}): Observable<MedijInfo> {
    const telo = new FormData();
    telo.append('fajl', fajl, fajl.name);
    return this.http.post<MedijInfo>(`${API_URL}/banka/prilozi`, telo, { context: this.kontekst(o) });
  }

  // ---------------------------------------------------------------------------------------------- preambula i pretraga

  /** `GET predmeti/{id}/latex-preambula`. */
  preambula(predmetId: number, o: OpcijeZahteva = {}): Observable<PreambulaInfo> {
    return this.http.get<PreambulaInfo>(`${API_URL}/predmeti/${predmetId}/latex-preambula`, { context: this.kontekst(o) });
  }

  /** `PUT predmeti/{id}/latex-preambula`: `null` ili prazan tekst vraća podrazumevanu; menja render svih varijanti predmeta. */
  postaviPreambulu(predmetId: number, tekst: string | null, o: OpcijeZahteva = {}): Observable<PreambulaInfo> {
    const cmd: PreambulaCmd = { preambula: tekst };
    return this.http.put<PreambulaInfo>(`${API_URL}/predmeti/${predmetId}/latex-preambula`, cmd, { context: this.kontekst(o) });
  }

  /**
   * `POST banka/predmeti/{id}/renderuj-sve`: jedan korak; ponavljati dok `preostalo` nije 0. `neuspelo` broji varijante čiji
   * render u tom pozivu nije uspeo (status im ostaje, i SVG poslednjeg uspelog rendera).
   */
  renderujSve(predmetId: number, o: OpcijeZahteva = {}): Observable<RenderujSveInfo> {
    return this.http.post<RenderujSveInfo>(`${API_URL}/banka/predmeti/${predmetId}/renderuj-sve`, null, { context: this.kontekst(o) });
  }

  /** `GET banka/pretraga`: tekstualna pretraga varijanti predmeta (`q` ima bar 2 znaka). */
  pretraga(f: BankaFilter, strana: StranaPretrage = {}, o: OpcijeZahteva = {}): Observable<Strana<BankaPretragaStavka>> {
    let params = new HttpParams().set('predmetId', f.predmetId);
    for (const [kljuc, vrednost] of Object.entries({ namena: f.namena, q: f.q, status: f.status, ...strana })) {
      if (vrednost !== null && vrednost !== undefined && vrednost !== '') {
        params = params.set(kljuc, vrednost);
      }
    }
    return this.http.get<Strana<BankaPretragaStavka>>(`${API_URL}/banka/pretraga`, { params, context: this.kontekst(o) });
  }
}
