import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { Strana } from '../../shared/models/strana';
import { danIDatum } from '../../shared/util/termin';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { OpcijeZahteva } from './opcije-zahteva';

/**
 * `NE_STIZE_KOD`: student je kliknuo "Ne stiže mi kod"; `PREVISE_KODOVA`: student je pogodio limit kodova (najviše 1 dnevno);
 * `MNOGO_NAJAVA`: za jedan termin rasporeda je odsustvo najavilo više studenata od praga perioda (jednom po terminu).
 */
export type VrstaObavestenja = 'NE_STIZE_KOD' | 'PREVISE_KODOVA' | 'MNOGO_NAJAVA';

/** `podaci` obaveštenja (JSON na serveru); svako polje može da nedostaje. */
export interface PodaciObavestenja {
  /** Indeks kako ga je student uneo (normalizovan). */
  indeks?: string;
  imaMejl?: boolean;
  ip?: string;
  /** Zahtev je nosio kolačić `gfs_student` uređaja tog studenta (`ZAPAMCEN`) ili ne. */
  uredjaj?: 'ZAPAMCEN' | 'NEPOZNAT';
  /** `MNOGO_NAJAVA`: termin (stavka rasporeda i datum `yyyy-MM-dd`), vreme `HH:mm`, nazivi i broj najava kad je prag pređen. */
  stavkaId?: number;
  datum?: string;
  pocetak?: string;
  kraj?: string;
  predmet?: string;
  grupa?: string;
  broj?: number;
  prag?: number;
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
  /** Godina upisa iz zahteva studenta (indeks u tri dela); `null`/bez polja za stara obaveštenja. */
  godina?: number | null;
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

/** Koliko otvorenih obaveštenja front učitava (padajuća lista i kartica "Obaveštenja"). */
export const NAJVISE_OTVORENIH = 10;

/**
 * Tekst stavke: `NE_STIZE_KOD` -> "Ne stiže kod: <Ime Prezime ili indeks>" (+ " · nema mejl", + " · nepoznat uređaj"),
 * `PREVISE_KODOVA` -> "Previše zahteva za kod: <ime>", `MNOGO_NAJAVA` -> "Mnogo najava odsustva: <predmet> · <grupa> ·
 * sreda 4. 11. (6)".
 */
export function tekstObavestenja(o: ObavestenjeInfo): string {
  if (o.vrsta === 'MNOGO_NAJAVA') {
    const p = o.podaci ?? {};
    const delovi = [p.predmet, p.grupa, p.datum ? danIDatum(p.datum) : null].filter((x): x is string => !!x && x.trim() !== '');
    return `Mnogo najava odsustva: ${delovi.join(' · ') || '—'}${typeof p.broj === 'number' ? ` (${p.broj})` : ''}`;
  }
  const indeks = o.indeks?.trim() || o.podaci?.indeks?.trim();
  const saGodinom = indeks && typeof o.godina === 'number' && !indeks.includes('/') ? `${indeks}/${o.godina}` : indeks;
  const ko = o.studentIme?.trim() || saGodinom || '—';
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

/** Kuda vodi stavka: kartica studenta, ili termini rasporeda od dana termina (`MNOGO_NAJAVA`); `null` kad nema veze. */
export interface VezaObavestenja {
  putanja: (string | number)[];
  query: Record<string, string> | null;
  /** Tekst veze na početnoj ("Kartica", "Termin"). */
  oznaka: string;
}

export function vezaObavestenja(o: ObavestenjeInfo): VezaObavestenja | null {
  if (o.vrsta === 'MNOGO_NAJAVA') {
    const datum = o.podaci?.datum;
    return typeof datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datum)
      ? { putanja: ['/raspored/termini'], query: { od: datum }, oznaka: 'Termin' }
      : { putanja: ['/raspored/termini'], query: null, oznaka: 'Termini' };
  }
  return o.studentId !== null ? { putanja: ['/studenti', o.studentId], query: null, oznaka: 'Kartica' } : null;
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
