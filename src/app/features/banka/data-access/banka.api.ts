import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';
import type { OpcijeZahteva } from '../../../core/api/opcije-zahteva';
import { Strana } from '../../../shared/models/strana';
import {
  BankaFilter, BankaPretragaStavka, GrupaCmd, GrupaCvor, GrupaDetails, IskljucenaTemaCmd, IskljucenaTemaInfo, MedijInfo, Namena, NivoCmd,
  OtvorenoZaGrupu, PonistavanjeInfo, PreambulaCmd, PreambulaInfo, PremestiCmd, RenderProbaCmd, RenderProbaInfo, RenderujSveInfo, SerijaInfo,
  StatistikaFilter, StatistikaTipa, StatusVarijante, svgUrl, VarijantaCmd, VarijantaDetails, VarijantaInfo,
} from './banka.models';

/** Strana liste `GET banka/pretraga` (Spring `page` je 0-based, `size` najviše 100). */
export interface StranaPretrage {
  page?: number;
  size?: number;
  sort?: string;
}

/**
 * Banka zadataka (`GrupaZadatakaRest`, `VarijantaRest`, `PrilogRest`, preambula, pretraga, Klodove serije i isključene teme:
 * `SerijaRest`, `IskljuceneTemeRest`). Sve putanje su relativne na `<base href>`. Greške: 409 (grupa bez težine ne prima
 * varijante, aktivacija bez uspelog rendera), 429 (render-proba: najviše 3 istovremeno, `MAX_PROBA` na serveru) i 503 (render
 * servis ne radi); `{ tiho: true }` ostavlja poruku pozivaocu.
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

  /**
   * `PATCH banka/varijante/{id}/nivo`: nivo 1-3 u svakom statusu; ne renderuje i ne menja status (400 van opsega).
   */
  promeniNivo(id: number, nivo: number, o: OpcijeZahteva = {}): Observable<VarijantaDetails> {
    const cmd: NivoCmd = { nivo };
    return this.http.patch<VarijantaDetails>(`${API_URL}/banka/varijante/${id}/nivo`, cmd, { context: this.kontekst(o) });
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

  /**
   * `GET banka/pretraga`: pretraga varijanti predmeta, a bez `predmetId` (`null`) svih predmeta (`q` ima bar 2 znaka); `izvor` i
   * `serija` sužavaju na Klodove ili ručne varijante i na jednu seriju. Šalju se samo postavljeni filteri.
   */
  pretraga(f: BankaFilter, strana: StranaPretrage = {}, o: OpcijeZahteva = {}): Observable<Strana<BankaPretragaStavka>> {
    let params = new HttpParams();
    const filteri = { predmetId: f.predmetId, namena: f.namena, q: f.q, status: f.status, izvor: f.izvor, serija: f.serija, nivo: f.nivo, ...strana };
    for (const [kljuc, vrednost] of Object.entries(filteri)) {
      if (vrednost !== null && vrednost !== undefined && vrednost !== '') {
        params = params.set(kljuc, vrednost);
      }
    }
    return this.http.get<Strana<BankaPretragaStavka>>(`${API_URL}/banka/pretraga`, { params, context: this.kontekst(o) });
  }

  // ---------------------------------------------------------------------------------------------- serije i isključene teme

  /** `GET banka/serije?predmetId=`: Klodove serije predmeta sa brojevima, najnovije prve. */
  serije(predmetId: number, o: OpcijeZahteva = {}): Observable<SerijaInfo[]> {
    const params = new HttpParams().set('predmetId', predmetId);
    return this.http.get<SerijaInfo[]>(`${API_URL}/banka/serije`, { params, context: this.kontekst(o) });
  }

  /**
   * `POST banka/serije/{serija}/odbaci`: briše neodobrene Klodove nacrte i prazne Klodove grupe serije (ostalo je u
   * `preskoceno`); prezentacije i slajdove serije ne dira.
   */
  odbaciSeriju(serija: string, o: OpcijeZahteva = {}): Observable<PonistavanjeInfo> {
    const putanja = `${API_URL}/banka/serije/${encodeURIComponent(serija)}/odbaci`;
    return this.http.post<PonistavanjeInfo>(putanja, null, { context: this.kontekst(o) });
  }

  /** `GET predmeti/{id}/iskljucene-teme`: teme koje Klod ne nudi, najnovije prve. */
  iskljuceneTeme(predmetId: number, o: OpcijeZahteva = {}): Observable<IskljucenaTemaInfo[]> {
    return this.http.get<IskljucenaTemaInfo[]>(`${API_URL}/predmeti/${predmetId}/iskljucene-teme`, { context: this.kontekst(o) });
  }

  /** `POST predmeti/{id}/iskljucene-teme` (409 kad je ista grupa ili isti opis bez grupe već isključen). */
  iskljuciTemu(predmetId: number, cmd: IskljucenaTemaCmd, o: OpcijeZahteva = {}): Observable<IskljucenaTemaInfo> {
    return this.http.post<IskljucenaTemaInfo>(`${API_URL}/predmeti/${predmetId}/iskljucene-teme`, cmd, { context: this.kontekst(o) });
  }

  /** `DELETE iskljucene-teme/{id}`: tema je ponovo uključena (Klod je opet može nuditi). */
  ukljuciTemu(id: number, o: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/iskljucene-teme/${id}`, { context: this.kontekst(o) });
  }

  // ---------------------------------------------------------------------------------------------- zadaci za vežbanje

  /** `GET banka/grupe/{id}/otvoreno`: stanje čvora (PREDAVANJE) po grupi studenata; 404 za TEST čvor. */
  otvoreno(grupaId: number, o: OpcijeZahteva = {}): Observable<OtvorenoZaGrupu[]> {
    return this.http.get<OtvorenoZaGrupu[]>(`${API_URL}/banka/grupe/${grupaId}/otvoreno`, { context: this.kontekst(o) });
  }

  /** `PUT banka/grupe/{id}/otvoreno/{grupaStudenataId}`: ručno otvaranje (RUCNO), vraća novo stanje svih grupa. */
  otvori(grupaId: number, grupaStudenataId: number, o: OpcijeZahteva = {}): Observable<OtvorenoZaGrupu[]> {
    return this.http.put<OtvorenoZaGrupu[]>(`${API_URL}/banka/grupe/${grupaId}/otvoreno/${grupaStudenataId}`, null,
      { context: this.kontekst(o) });
  }

  /** `DELETE banka/grupe/{id}/otvoreno/{grupaStudenataId}`: zatvara čvor i celo podstablo (otvoren predak ostaje). */
  zatvori(grupaId: number, grupaStudenataId: number, o: OpcijeZahteva = {}): Observable<OtvorenoZaGrupu[]> {
    return this.http.delete<OtvorenoZaGrupu[]>(`${API_URL}/banka/grupe/${grupaId}/otvoreno/${grupaStudenataId}`,
      { context: this.kontekst(o) });
  }

  /** `GET predmeti/{id}/vezbanje/statistika?grupa&od&do`: zbirno po tipu (bez imena studenata). */
  statistikaVezbanja(predmetId: number, f: StatistikaFilter = {}, o: OpcijeZahteva = {}): Observable<StatistikaTipa[]> {
    let params = new HttpParams();
    if (f.grupa != null) {
      params = params.set('grupa', f.grupa);
    }
    if (f.od) {
      params = params.set('od', f.od);
    }
    if (f.do) {
      params = params.set('do', f.do);
    }
    return this.http.get<StatistikaTipa[]>(`${API_URL}/predmeti/${predmetId}/vezbanje/statistika`, { params, context: this.kontekst(o) });
  }
}
