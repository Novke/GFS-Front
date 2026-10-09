import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { DomaciListItem } from './domaci.models';
import type { PredavanjeListItem } from './predavanja.models';
import type { TestListItem } from './testovi.models';
import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';
import type { GrupaInfo, PredmetInfo } from './reference.api';

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
}

@Injectable({ providedIn: 'root' })
export class PregledApi {
  private readonly http = inject(HttpClient);

  /** `tiho`: greška ne ide u snackbar (`LOCAL_ERRORS`), npr. za brojače koji se osvežavaju u pozadini. */
  kontrolnaTabla(opcije: { tiho?: boolean } = {}): Observable<KontrolnaTablaInfo> {
    return this.http.get<KontrolnaTablaInfo>(`${API_URL}/pregled/kontrolna-tabla`, {
      context: new HttpContext().set(LOCAL_ERRORS, opcije.tiho ?? false),
    });
  }
}
