import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { Strana } from '../../shared/models/strana';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { OpcijeZahteva } from './opcije-zahteva';

/** `NE_STIZE_KOD`: student je kliknuo "Ne stiže mi kod"; `PREVISE_KODOVA`: student je pogodio limit kodova (najviše 1 dnevno). */
export type VrstaObavestenja = 'NE_STIZE_KOD' | 'PREVISE_KODOVA';

/** `podaci` obaveštenja (JSON na serveru); svako polje može da nedostaje. */
export interface PodaciObavestenja {
  /** Indeks kako ga je student uneo (normalizovan). */
  indeks?: string;
  imaMejl?: boolean;
  ip?: string;
  /** Zahtev je nosio kolačić `gfs_student` uređaja tog studenta (`ZAPAMCEN`) ili ne. */
  uredjaj?: 'ZAPAMCEN' | 'NEPOZNAT';
}

/** Ogleda backend `ObavestenjeInfo` (`GET api/obavestenja`). */
export interface ObavestenjeInfo {
  id: number;
  vrsta: VrstaObavestenja;
  /** `null` za indeks koji ne postoji (npr. greška u kucanju pri upisu). */
  studentId: number | null;
  /** "Ime Prezime". */
  studentIme: string | null;
  indeks: string | null;
  podaci: PodaciObavestenja | null;
  kreirano: string;
  procitano: string | null;
  reseno: string | null;
}

/** `GET api/obavestenja/broj`: značka je `neprocitana`, "otvorena" su nerešena. */
export interface BrojObavestenja {
  neprocitana: number;
  otvorena: number;
}

/** Koliko otvorenih obaveštenja front učitava (padajuća lista i kartica "Nalozi"). */
export const NAJVISE_OTVORENIH = 10;

/**
 * Tekst stavke: `NE_STIZE_KOD` -> "Ne stiže kod: <Ime Prezime ili indeks>" (+ " · nema mejl", + " · nepoznat uređaj"),
 * `PREVISE_KODOVA` -> "Previše zahteva za kod: <ime>".
 */
export function tekstObavestenja(o: ObavestenjeInfo): string {
  const ko = o.studentIme?.trim() || o.indeks?.trim() || o.podaci?.indeks?.trim() || '—';
  if (o.vrsta === 'PREVISE_KODOVA') {
    return `Previše zahteva za kod: ${ko}`;
  }
  const delovi = [`Ne stiže kod: ${ko}`];
  if (o.podaci?.imaMejl === false) {
    delovi.push('nema mejl');
  }
  if (o.podaci?.uredjaj === 'NEPOZNAT') {
    delovi.push('nepoznat uređaj');
  }
  return delovi.join(' · ');
}

const tiho = new HttpContext().set(LOCAL_ERRORS, true);
const kontekst = (o?: OpcijeZahteva) => (o?.tiho ? tiho : undefined);

/** Obaveštenja za nastavnika (`api/obavestenja`, backend `ObavestenjeRest`, samo uz sesiju nastavnika). */
@Injectable({ providedIn: 'root' })
export class ObavestenjaApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/obavestenja`;

  /** Prvih {@link NAJVISE_OTVORENIH} otvorenih (nerešenih), najnovija prva. */
  otvorena(opcije?: OpcijeZahteva): Observable<Strana<ObavestenjeInfo>> {
    return this.http.get<Strana<ObavestenjeInfo>>(this.url, {
      params: { stanje: 'otvorena', page: 0, size: NAJVISE_OTVORENIH },
      context: kontekst(opcije),
    });
  }

  broj(opcije?: OpcijeZahteva): Observable<BrojObavestenja> {
    return this.http.get<BrojObavestenja>(`${this.url}/broj`, { context: kontekst(opcije) });
  }

  procitano(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/procitano`, null, { context: kontekst(opcije) });
  }

  reseno(id: number, opcije?: OpcijeZahteva): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/reseno`, null, { context: kontekst(opcije) });
  }

  /** 204 ili `{procitano: n}`; front ne čita telo. */
  procitajSve(opcije?: OpcijeZahteva): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/procitaj-sve`, null, { context: kontekst(opcije) });
  }
}
