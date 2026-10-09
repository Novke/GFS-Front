import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Strana } from '../../shared/models/strana';
import type { TipAktivnosti } from './predavanja.models';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import { GrupaInfo, PredmetInfo, TipTestaInfo } from './reference.api';
import type { OpcijeZahteva } from './opcije-zahteva';

/**
 * Red liste studenata; ogleda backend `dto/student/StudentListItem`. `godina` je godina upisa;
 * `grupa`, `email`, `brojTelefona` (i u starim redovima `godina`) mogu biti `null`.
 */
export interface StudentListItem {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string | null;
  brojTelefona: string | null;
  grupa: GrupaInfo | null;
}

/**
 * Parametri `GET studenti/pretraga`, pod imenima iz `StudentRest.pretraga` (`StudentFilter` + Spring `Pageable`).
 * `page` je 0-based; `size` podrazumevano 25, najviše 100; `sort` po `prezime`, `ime`, `indeks`, `godina`
 * (npr. `indeks,asc`; podrazumevano prezime pa ime). Prazne vrednosti se ne šalju.
 */
export interface StudentiPretraga {
  grupaId?: number | null;
  /** Studenti iz grupa sa manjom godinom upisa od ove grupe (nepostojeća grupa je 404). */
  starijiOdGrupe?: number | null;
  /** Ime, prezime, puno ime ili indeks (bez razmaka), bez obzira na velika i mala slova. */
  q?: string | null;
  page?: number | null;
  size?: number | null;
  sort?: string | null;
}

/** `StudentInfo`: odgovor `PUT studenti/{id}` i student u kartici po predmetu; `godina` je godina upisa (`int` na serveru). */
export interface StudentInfo {
  id: number;
  ime: string;
  prezime: string;
  godina: number | null;
  indeks: string;
  brojTelefona: string | null;
  email: string | null;
  datumRodjenja: string | null;
  opstina: string | null;
}

/**
 * `PUT studenti/{id}` (`UpdateStudentCmd`): pun zamenski zapis, izostavljeno opciono polje se na serveru briše.
 * `grupaId` je nova grupa studenta, pa isti poziv služi i za premeštanje. Ograničenja: ime i prezime do 60 znakova,
 * indeks 2-20, godina 2000-2100, email do 255, telefon do 20, opština do 100.
 */
export interface UpdateStudentCmd {
  grupaId: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number;
  email?: string | null;
  brojTelefona?: string | null;
  datumRodjenja?: string | null;
  opstina?: string | null;
}

/** Aktivnost na predavanju (`StudentPregledAktivnostInfo`); `datum` i `tema` dolaze od predavanja. */
export interface StudentPregledAktivnostInfo {
  id: number;
  predavanjeId: number | null;
  tip: TipAktivnosti | null;
  napomene: string | null;
  datum: string | null;
  tema: string | null;
}

/** Urađeni domaći (`StudentPregledDomaciInfo`); `bodovi` su 0-10, oslobođeni imaju 10. */
export interface StudentPregledDomaciInfo {
  id: number;
  domaciId: number | null;
  bodovi: number | null;
  napomene: string | null;
  prepisivanje: boolean | null;
  oslobodjen: boolean | null;
  datum: string | null;
  naslov: string | null;
}

/**
 * Polaganje testa (`StudentPregledTestInfo`). Prolaz računa server (jedino pravilo prolaza za pregled): `pragProlaza` je
 * `null` kad test nema prag, `polozeno` je `null` kad test nema prag ili poeni nisu upisani (inače `false` i za
 * prepisivanje). Redosled sa servera nije određen.
 */
export interface StudentPregledTestInfo {
  id: number;
  testId: number | null;
  ostvareniPoeni: number | null;
  pragProlaza: number | null;
  polozeno: boolean | null;
  prepisivao: boolean | null;
  napomene: string | null;
  datum: string | null;
  tipTesta: TipTestaInfo | null;
}

/**
 * `GET studenti/{id}` (`StudentPregledDetails`). `grupa` je naziv grupe, `grupaId` njen id (`null` za studenta bez grupe);
 * `godina` je godina upisa. `email`, `brojTelefona`, `datumRodjenja` (`YYYY-MM-DD`) i `opstina` mogu biti `null`.
 */
export interface StudentPregledDetails {
  id: number;
  ime: string | null;
  prezime: string | null;
  godina: number | null;
  indeks: string | null;
  brojTelefona: string | null;
  email: string | null;
  datumRodjenja: string | null;
  opstina: string | null;
  grupa: string | null;
  grupaId: number | null;
  aktivnosti: StudentPregledAktivnostInfo[];
  uradjeniDomaci: StudentPregledDomaciInfo[];
  polaganja: StudentPregledTestInfo[];
}

/** Poeni studenta na jednom tipu testa u kartici (`MaxPoeniStudentaNaTestuInfo`). */
export interface PoeniNaTipuTesta {
  tipTesta: TipTestaInfo | null;
  ostvarenoPoena: number | null;
}

/**
 * Kartica studenta na jednom predmetu (`StudentPredmetKarticaInfo`, `GET studenti/{id}/predmeti`). `doSledeceOcene` je
 * `null` kad je predlog ocene već 10; `predlogOcene` je `null` dok student nije položio (do 51 poen).
 */
export interface StudentPredmetKartica {
  predmet: PredmetInfo;
  prisutan: number;
  predavanja: number;
  zadaci: number;
  zvezdice: number;
  domaciUradjeno: number;
  domaciUkupno: number;
  domaciProsek: number | null;
  testovi: PoeniNaTipuTesta[];
  ukupno: number;
  predlogOcene: number | null;
  doSledeceOcene: number | null;
}

/** Polaganja jednog tipa testa na kartici studenta po predmetu; `najboljePolaganje` je `null` bez polaganja. */
export interface StudentTestoviPoTipu {
  tipTesta: TipTestaInfo | null;
  polaganja: StudentPregledTestInfo[];
  najboljePolaganje: StudentPregledTestInfo | null;
}

/** `GET studenti/{s}/predmet/{p}` (`StudentNaPredmetuDetails`). */
export interface StudentNaPredmetuDetails {
  student: StudentInfo;
  predmet: PredmetInfo | null;
  grupaNaziv: string | null;
  aktivnosti: StudentPregledAktivnostInfo[];
  domaci: StudentPregledDomaciInfo[];
  testoviPoTipu: StudentTestoviPoTipu[];
  ukupnoPoenaAktivnost: number;
  ukupnoPoenaDomaci: number;
}

/** Beleška nastavnika o studentu (`BeleskaInfo`); `izmenjeno` je `null` dok se beleška nije menjala. */
export interface BeleskaInfo {
  id: number;
  tekst: string;
  kreirano: string;
  izmenjeno: string | null;
}

/** Student u `GET grupe/{id}` (`GrupaStudentInfo`); server ih vraća sortirane po broju iz indeksa. */
export interface GrupaStudentInfo {
  id: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  godina: number | null;
  brojTelefona: string | null;
  email: string | null;
}

/** `GET grupe/{id}` (`GrupaDetails`). */
export interface GrupaSaStudentima {
  id: number;
  naziv: string;
  godinaUpisa: number | null;
  studenti: GrupaStudentInfo[];
}

/** Studenti (`StudentRest`, `BeleskaRest`). Sve putanje su relativne na `<base href>`. */
@Injectable({ providedIn: 'root' })
export class StudentiApi {
  private readonly http = inject(HttpClient);

  private kontekst(opcije: OpcijeZahteva): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false);
  }

  /** `GET studenti/{id}`: aktivnosti, urađeni domaći i polaganja (polaganja bez određenog redosleda). */
  get(id: number, opcije: OpcijeZahteva = {}): Observable<StudentPregledDetails> {
    return this.http.get<StudentPregledDetails>(`${API_URL}/studenti/${id}`, { context: this.kontekst(opcije) });
  }

  /** `GET studenti/{id}/predmeti`: kartica po predmetu (prazno za studenta bez grupe i aktivnosti). */
  predmeti(id: number, opcije: OpcijeZahteva = {}): Observable<StudentPredmetKartica[]> {
    return this.http.get<StudentPredmetKartica[]>(`${API_URL}/studenti/${id}/predmeti`, { context: this.kontekst(opcije) });
  }

  /** `GET studenti/{id}/predmet/{predmetId}`: aktivnosti, domaći i testovi po tipu na jednom predmetu. */
  naPredmetu(id: number, predmetId: number, opcije: OpcijeZahteva = {}): Observable<StudentNaPredmetuDetails> {
    return this.http.get<StudentNaPredmetuDetails>(`${API_URL}/studenti/${id}/predmet/${predmetId}`, { context: this.kontekst(opcije) });
  }

  /** `PUT studenti/{id}`: izmena podataka i premeštanje u drugu grupu (`grupaId`); vidi {@link UpdateStudentCmd}. */
  izmeni(id: number, cmd: UpdateStudentCmd, opcije: OpcijeZahteva = {}): Observable<StudentInfo> {
    return this.http.put<StudentInfo>(`${API_URL}/studenti/${id}`, cmd, { context: this.kontekst(opcije) });
  }

  /** `GET grupe/{id}`: studenti grupe (za prethodni/sledeći u profilu). */
  grupa(grupaId: number, opcije: OpcijeZahteva = {}): Observable<GrupaSaStudentima> {
    return this.http.get<GrupaSaStudentima>(`${API_URL}/grupe/${grupaId}`, { context: this.kontekst(opcije) });
  }

  /** `GET studenti/{id}/beleske`: najnovije prve (kreirano, pa id opadajuće). */
  beleske(id: number, opcije: OpcijeZahteva = {}): Observable<BeleskaInfo[]> {
    return this.http.get<BeleskaInfo[]>(`${API_URL}/studenti/${id}/beleske`, { context: this.kontekst(opcije) });
  }

  /** `POST studenti/{id}/beleske`: tekst do 2000 znakova, obavezan (server ga skida sa razmaka). */
  dodajBelesku(id: number, tekst: string, opcije: OpcijeZahteva = {}): Observable<BeleskaInfo> {
    return this.http.post<BeleskaInfo>(`${API_URL}/studenti/${id}/beleske`, { tekst }, { context: this.kontekst(opcije) });
  }

  /** `PUT beleske/{id}`: `id` je id beleške, ne studenta. */
  izmeniBelesku(id: number, tekst: string, opcije: OpcijeZahteva = {}): Observable<BeleskaInfo> {
    return this.http.put<BeleskaInfo>(`${API_URL}/beleske/${id}`, { tekst }, { context: this.kontekst(opcije) });
  }

  /** `DELETE beleske/{id}` (204). */
  obrisiBelesku(id: number, opcije: OpcijeZahteva = {}): Observable<void> {
    return this.http.delete<void>(`${API_URL}/beleske/${id}`, { context: this.kontekst(opcije) });
  }

  /** `tiho`: greška ne ide u snackbar (`LOCAL_ERRORS`), pozivalac je prikazuje sam. */
  pretraga(params: StudentiPretraga, opcije: OpcijeZahteva = {}): Observable<Strana<StudentListItem>> {
    let p = new HttpParams();
    for (const [kljuc, v] of Object.entries(params) as [keyof StudentiPretraga, StudentiPretraga[keyof StudentiPretraga]][]) {
      const tekst = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : (v ?? '').trim();
      if (tekst !== '') {
        p = p.set(kljuc, tekst);
      }
    }
    return this.http.get<Strana<StudentListItem>>(`${API_URL}/studenti/pretraga`, {
      params: p,
      context: new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false),
    });
  }
}
