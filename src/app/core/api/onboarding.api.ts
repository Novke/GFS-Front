import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { GrupaInfo } from './reference.api';

export type StatusPrijave = 'NA_CEKANJU' | 'PRIHVACENA' | 'ODBIJENA';

/**
 * `OnboardingSesijaInfo`. `otvorena` = aktivna, rok nije prošao i nije popunjena (računa server); `istice` i `kreirano`
 * su `LocalDateTime` stringovi.
 */
export interface OnboardingSesijaInfo {
  id: number;
  token: string;
  grupa: GrupaInfo;
  aktivna: boolean;
  otvorena: boolean;
  kreirano: string;
  istice: string;
  maxPrijava: number;
  brojPrijava: number;
  brojNaCekanju: number;
  napomena: string | null;
}

/** `PrijavaInfo`; `studentId` postoji posle prihvatanja. */
export interface PrijavaInfo {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number;
  email: string;
  brojTelefona: string;
  datumRodjenja: string | null;
  opstina: string | null;
  status: StatusPrijave;
  podneto: string;
  obradjeno: string | null;
  studentId: number | null;
  napomena: string | null;
}

/** `OnboardingSesijaDetails`: `poruka` je zbirni rezultat akcije (npr. "Prihvaćeno: 2"), inače `null`. */
export interface OnboardingSesijaDetails {
  sesija: OnboardingSesijaInfo;
  prijave: PrijavaInfo[];
  poruka: string | null;
}

/** `CreateOnboardingCmd`: rok 1-60 dana (podrazumevano 7), max prijava 1-1000 (200), napomena do 255. */
export interface CreateOnboardingCmd {
  isticeZaDana: number;
  maxPrijava: number;
  napomena: string | null;
}

/** `UpdateOnboardingCmd` (`PATCH onboarding/{id}`): ponovo otvorena istekla sesija dobija nov rok na serveru. */
export interface UpdateOnboardingCmd {
  aktivna: boolean;
  isticeZaDana?: number;
}

/** `UpdatePrijavaCmd`: ista pravila kao javna forma (indeks latinicom, email i telefon obavezni). */
export interface UpdatePrijavaCmd {
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string;
  brojTelefona: string;
  datumRodjenja: string | null;
  opstina: string | null;
}

export interface OdbijPrijavuCmd {
  napomena: string | null;
}

export interface OpcijeOnboardinga {
  tiho?: boolean;
}

/**
 * Nastavnički onboarding (`OnboardingRest`, iza basic-auth-a; premešteno iz `onboarding/onboarding.service.ts`, isti
 * endpointi). Javni deo (`api/public/upis`) je samo u `features/upis`.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingApi {
  private readonly http = inject(HttpClient);

  private kontekst(o: OpcijeOnboardinga): HttpContext {
    return new HttpContext().set(LOCAL_ERRORS, o.tiho ?? false);
  }

  /** `GET grupe/{id}/onboarding`: sesije grupe. */
  sesije(grupaId: number, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaInfo[]> {
    return this.http.get<OnboardingSesijaInfo[]>(`${API_URL}/grupe/${grupaId}/onboarding`, { context: this.kontekst(o) });
  }

  pokreni(grupaId: number, cmd: CreateOnboardingCmd, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaInfo> {
    return this.http.post<OnboardingSesijaInfo>(`${API_URL}/grupe/${grupaId}/onboarding`, cmd, { context: this.kontekst(o) });
  }

  sesija(id: number, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaDetails> {
    return this.http.get<OnboardingSesijaDetails>(`${API_URL}/onboarding/${id}`, { context: this.kontekst(o) });
  }

  /** `PATCH onboarding/{id}`: zatvori (`aktivna=false`) ili ponovo otvori. */
  promeniAktivnost(id: number, cmd: UpdateOnboardingCmd, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaInfo> {
    return this.http.patch<OnboardingSesijaInfo>(`${API_URL}/onboarding/${id}`, cmd, { context: this.kontekst(o) });
  }

  izmeniPrijavu(id: number, prijavaId: number, cmd: UpdatePrijavaCmd, o: OpcijeOnboardinga = {}): Observable<PrijavaInfo> {
    return this.http.put<PrijavaInfo>(`${API_URL}/onboarding/${id}/prijave/${prijavaId}`, cmd, { context: this.kontekst(o) });
  }

  prihvati(id: number, prijavaId: number, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${API_URL}/onboarding/${id}/prijave/${prijavaId}/prihvati`, {}, { context: this.kontekst(o) });
  }

  odbij(id: number, prijavaId: number, cmd: OdbijPrijavuCmd, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${API_URL}/onboarding/${id}/prijave/${prijavaId}/odbij`, cmd, { context: this.kontekst(o) });
  }

  prihvatiSve(id: number, o: OpcijeOnboardinga = {}): Observable<OnboardingSesijaDetails> {
    return this.http.post<OnboardingSesijaDetails>(`${API_URL}/onboarding/${id}/prihvati-sve`, {}, { context: this.kontekst(o) });
  }
}

// ---------------------------------------------------------------------------------------------- pravila prikaza

/** Apsolutni javni link za token; radi pod `<base href>` `/` i `/gfs/` (`document.baseURI` je već apsolutan). */
export function upisLink(token: string, baseUri: string = document.baseURI): string {
  return new URL('upis/' + token, baseUri).href;
}

export type StatusSesije = 'Otvorena' | 'Zatvorena' | 'Istekla' | 'Popunjena';

function istekla(s: Pick<OnboardingSesijaInfo, 'istice'>, sada: number): boolean {
  const t = new Date(s.istice).getTime();
  return Number.isFinite(t) && t < sada;
}

/** Tekst statusa sesije kao u starom UI-ju (staging smoke čita "Otvorena" / "Zatvorena"). */
export function statusSesije(s: Pick<OnboardingSesijaInfo, 'otvorena' | 'aktivna' | 'istice'>, sada = Date.now()): StatusSesije {
  if (s.otvorena) {
    return 'Otvorena';
  }
  if (!s.aktivna) {
    return 'Zatvorena';
  }
  return istekla(s, sada) ? 'Istekla' : 'Popunjena';
}

/**
 * "Zatvori" ima smisla dok je sesija aktivna i rok nije prošao (otvorena ili popunjena); zatvorena i istekla se ponovo
 * otvaraju ("Otvori"; istekla dobija nov rok na serveru).
 */
export function moguceZatvoriti(s: Pick<OnboardingSesijaInfo, 'aktivna' | 'istice'>, sada = Date.now()): boolean {
  return s.aktivna && !istekla(s, sada);
}

export const NAZIV_STATUSA_PRIJAVE: Record<StatusPrijave, string> = {
  NA_CEKANJU: 'Na čekanju',
  PRIHVACENA: 'Prihvaćena',
  ODBIJENA: 'Odbijena',
};
