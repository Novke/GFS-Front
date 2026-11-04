import { Injectable, signal } from '@angular/core';

/** Veličina pregleda u editoru varijante: `telefon` = 84 mm, `vece` = 1,5 puta veće (126 mm), `cela` = cela širina kolone. */
export type VelicinaPregleda = 'telefon' | 'vece' | 'cela';

export const VELICINE_PREGLEDA: readonly { vrednost: VelicinaPregleda; natpis: string }[] = [
  { vrednost: 'telefon', natpis: 'Kao na telefonu' },
  { vrednost: 'vece', natpis: 'Veće' },
  { vrednost: 'cela', natpis: 'Cela širina' },
];

export const PODRAZUMEVANA_VELICINA: VelicinaPregleda = 'vece';

/** Ključ u localStorage; van `gfs.prefs.v1` (`PreferencesStore`), da postavka ne ulazi u početni paket aplikacije. */
export const VELICINA_PREGLEDA_KLJUC = 'gfs.banka.pregled-velicina.v1';

const jeVelicina = (v: unknown): v is VelicinaPregleda => VELICINE_PREGLEDA.some(x => x.vrednost === v);

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // zabranjen localStorage: postavka važi do zatvaranja taba
  }
}

/** Veličina pregleda u editoru varijante: nastavnikova postavka u ovom pregledaču, ista za zadatak i rešenje. */
@Injectable({ providedIn: 'root' })
export class VelicinaPregledaPostavka {
  private readonly s = storage();
  private readonly _velicina = signal<VelicinaPregleda>(this.ucitaj());
  readonly velicina = this._velicina.asReadonly();

  postavi(v: VelicinaPregleda): void {
    if (!jeVelicina(v)) {
      return;
    }
    this._velicina.set(v);
    try {
      this.s?.setItem(VELICINA_PREGLEDA_KLJUC, v);
    } catch {
      // pun ili zabranjen localStorage
    }
  }

  private ucitaj(): VelicinaPregleda {
    try {
      const v = this.s?.getItem(VELICINA_PREGLEDA_KLJUC);
      return jeVelicina(v) ? v : PODRAZUMEVANA_VELICINA;
    } catch {
      return PODRAZUMEVANA_VELICINA;
    }
  }
}
