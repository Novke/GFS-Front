import { Injectable, signal } from '@angular/core';

/** Ključ u localStorage; van `gfs.prefs.v1` (`PreferencesStore`), kao rang na tabli: postavka ne ulazi u početni paket. */
export const RANIJE_CRTEZI_KLJUC = 'gfs.ranije-crteze.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // zabranjen localStorage: postavka važi do zatvaranja taba
  }
}

/**
 * Podešavanja → Uživo, „Nudi ranije crteže na slajdu” (podrazumevano uključeno): konzola tada za trenutni slajd traži
 * crteže drugih izvođenja iste prezentacije (čip i panel „Ranije ovde”). Važi za ovaj pregledač; isključeno = nema ni
 * zahteva ni čipa, a crteži se i dalje čuvaju i vide u pregledu izvođenja.
 */
@Injectable({ providedIn: 'root' })
export class RanijiCrteziPodesavanje {
  private readonly s = storage();
  private readonly _ukljuceno = signal(this.ucitaj());
  readonly ukljuceno = this._ukljuceno.asReadonly();

  postavi(ukljuceno: boolean): void {
    this._ukljuceno.set(ukljuceno);
    try {
      this.s?.setItem(RANIJE_CRTEZI_KLJUC, ukljuceno ? '1' : '0');
    } catch {
      // pun ili zabranjen localStorage
    }
  }

  private ucitaj(): boolean {
    try {
      return this.s?.getItem(RANIJE_CRTEZI_KLJUC) !== '0';
    } catch {
      return true;
    }
  }
}
