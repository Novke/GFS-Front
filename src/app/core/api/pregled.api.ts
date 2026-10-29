import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { DomaciListItem } from './domaci.models';
import type { PredavanjeListItem } from './predavanja.models';
import type { TestListItem } from './testovi.models';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { GrupaInfo, PredmetInfo } from './reference.api';
import type { OpcijeZahteva } from './opcije-zahteva';

/** Ogleda backend `dto/pregled/SledecePredavanjeInfo`: predlog sledećeg predavanja (`rb + 1` je samo predlog). */
export interface SledecePredavanjeInfo {
  predmet: PredmetInfo;
  /** `null` kad poslednje predavanje nema grupu (stari redovi); tada su oba broja 0. */
  grupa: GrupaInfo | null;
  rb: number;
  /** Studenti koji su sada u grupi. */
  brojStudenata: number;
  /** Studenti iz starijih grupa sa aktivnošću ili polaganjem na predmetu u tekućoj školskoj godini (ponovci). */
  brojStarijih: number;
  /** Termin rasporeda iz koga je predlog (sa brojem najava odsustva); `null`/bez polja za `POSLEDNJE`. */
  termin?: TerminKratkoInfo | null;
  /**
   * `POSLEDNJE`: poslednje predavanje, `rb + 1` (nijedan raspored ne pokriva danas); `RASPORED_DANAS`: današnji termin;
   * `RASPORED_SLEDECI`: danas nema časa po rasporedu, ovo je sledeći. Bez polja (stariji backend) = `POSLEDNJE`.
   */
  izvor?: 'POSLEDNJE' | 'RASPORED_DANAS' | 'RASPORED_SLEDECI';
}

/** Ogleda `dto/pregled/TerminKratkoInfo`: termin rasporeda na početnoj (broj najava bez imena). Vreme `HH:mm:ss`. */
export interface TerminKratkoInfo {
  stavkaId: number;
  datum: string;
  pocetak: string;
  kraj: string;
  predmet: PredmetInfo;
  grupa: GrupaInfo | null;
  otkazan: boolean;
  napomena: string | null;
  brojNajava: number;
  /** Predavanje istog predmeta, grupe i datuma, ako postoji. */
  predavanjeId: number | null;
}

/** Ogleda `dto/pregled/RasporedTablaInfo`: termini od danas do danas + 6 i da li neki raspored pokriva danas. */
export interface RasporedTablaInfo {
  pokrivaDanas: boolean;
  naredni: readonly TerminKratkoInfo[];
}

/** Ogleda `dto/pregled/CekaStavkaInfo`: onboarding sesija sa prijavama na čekanju. */
export interface CekaStavkaInfo {
  sesijaId: number;
  grupa: GrupaInfo | null;
  brojNaCekanju: number;
  /** ISO `LocalDateTime`; `null` = sesija nema rok. */
  istice: string | null;
}

export type AgendaTip = 'PREDAVANJE' | 'DOMACI' | 'TEST';

/** Ogleda `dto/pregled/AgendaStavkaInfo`; `grupa` je `null` za stare redove bez grupe. */
export interface AgendaStavkaInfo {
  tip: AgendaTip;
  id: number;
  /** `YYYY-MM-DD`. */
  datum: string | null;
  naslov: string | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
}

/**
 * "Čeka na tebe". Liste su ograničene na 10 stavki (najnovije prve), a `broj*` su ukupni brojevi (za "+N još" i brojače
 * u navigaciji). Testovi, domaći i nezavršena predavanja su iz tekuće školske godine; testovi i domaći samo održani
 * (datum do danas).
 */
export interface KontrolnaTablaCeka {
  testovi: readonly TestListItem[];
  domaci: readonly DomaciListItem[];
  prijave: readonly CekaStavkaInfo[];
  nezavrsena: readonly PredavanjeListItem[];
  brojTestova: number;
  brojDomacih: number;
  /** Zbir prijava na čekanju po svim otvorenim sesijama (ne samo prikazanih). */
  brojPrijava: number;
  brojNezavrsenih: number;
}

/**
 * Odgovor `GET pregled/kontrolna-tabla` (`KontrolnaTablaInfo`). Liste nikad nisu `null`; `sledece` je `null` kad nema
 * nijednog predavanja. `nedelja` je ponedeljak-nedelja (prikaz je pon-pet, vikend se filtrira na klijentu).
 */
export interface KontrolnaTablaInfo {
  sledece: SledecePredavanjeInfo | null;
  /** Nezavršena predavanja sa današnjim datumom. */
  uToku: readonly PredavanjeListItem[];
  ceka: KontrolnaTablaCeka;
  nedelja: readonly AgendaStavkaInfo[];
  /** Raspored narednih 7 dana; bez polja kod starijeg backenda. */
  raspored?: RasporedTablaInfo | null;
}

@Injectable({ providedIn: 'root' })
export class PregledApi {
  private readonly http = inject(HttpClient);

  /** `tiho`: greška ne ide u snackbar (`LOCAL_ERRORS`), npr. za brojače koji se osvežavaju u pozadini. */
  kontrolnaTabla(opcije: OpcijeZahteva = {}): Observable<KontrolnaTablaInfo> {
    return this.http.get<KontrolnaTablaInfo>(`${API_URL}/pregled/kontrolna-tabla`, {
      context: new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false),
    });
  }
}
