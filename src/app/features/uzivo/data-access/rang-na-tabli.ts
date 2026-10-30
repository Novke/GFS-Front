import { Injectable, signal } from '@angular/core';

/** Izbori "Na tabli" u kartici ranga konzole: 0 = svi (server ograničava na 30), prvih 10, prvih 5. */
export const RANG_NA_TABLI = [0, 10, 5] as const;

/** Ključ u localStorage; van `gfs.prefs.v1` (`PreferencesStore`), da postavka ne ulazi u početni paket aplikacije. */
export const RANG_NA_TABLI_KLJUC = 'gfs.rang-na-tabli.v1';

const jeIzbor = (v: unknown): v is number => RANG_NA_TABLI.includes(v as never);

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // zabranjen localStorage: postavka važi do zatvaranja taba
  }
}

/**
 * Koliko redova ranga tačnosti projektor prikazuje (L / Shift+L): nastavnikova postavka u ovom pregledaču, ista za sva
 * izvođenja. Konzola je šalje serveru komandom `RANG_BROJ` (`RangKonzolaComponent`).
 */
@Injectable({ providedIn: 'root' })
export class RangNaTabli {
  private readonly s = storage();
  private readonly _broj = signal(this.ucitaj());
  readonly broj = this._broj.asReadonly();

  postavi(broj: number): void {
    if (!jeIzbor(broj)) return;
    this._broj.set(broj);
    try {
      this.s?.setItem(RANG_NA_TABLI_KLJUC, String(broj));
    } catch {
      // pun ili zabranjen localStorage
    }
  }

  private ucitaj(): number {
    try {
      const v = Number(this.s?.getItem(RANG_NA_TABLI_KLJUC));
      return jeIzbor(v) ? v : 0;
    } catch {
      return 0;
    }
  }
}
