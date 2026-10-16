// Poništavanje editora platna (odluka 8): istorija živi u instanci editora (jedna po slajdu), snimak je ceo dokument
// (nepromenljivi objekti, deljenje strukture), najviše 100 koraka. Čista klasa; sat dolazi spolja (`SAT_ISTORIJE`).
import { InjectionToken } from '@angular/core';
import type { Platno } from '../data-access/platno.models';

export const MAX_ISTORIJE = 100;
export const PROZOR_SPAJANJA_MS = 1000;
/** Sat istorije; `PlatnoEditorStore` ga ubrizgava, specovi daju lažni (`{ provide: SAT_ISTORIJE, useValue: () => t }`). */
export const SAT_ISTORIJE = new InjectionToken<() => number>('SAT_ISTORIJE', {
  providedIn: 'root',
  factory: () => () => performance.now(),
});

/**
 * Poništavanje editora platna (odluka 8): stek snimaka dokumenta PRE izmene. Uzastopne izmene istog `kljuc`-a u roku od
 * 1 s od poslednje takve izmene (strelice, isto brojčano polje) su jedan korak; izmena bez ključa, poništavanje,
 * ponavljanje i `resetuj` prekidaju spajanje. Svaka nova izmena briše "ponovi".
 */
export class Istorija {
  private nazad: Platno[] = [];
  private napred: Platno[] = [];
  private poslednje: { kljuc: string; vreme: number } | null = null;

  constructor(private readonly sat: () => number = () => performance.now()) {}

  zabelezi(pre: Platno, kljuc?: string): void {
    const sada = this.sat();
    const spoji = !!kljuc && this.poslednje?.kljuc === kljuc && sada - this.poslednje.vreme <= PROZOR_SPAJANJA_MS;
    if (!spoji) {
      this.nazad.push(pre);
      if (this.nazad.length > MAX_ISTORIJE) this.nazad.shift();
    }
    this.poslednje = kljuc ? { kljuc, vreme: sada } : null;
    this.napred = [];
  }

  ponisti(sada: Platno): Platno | null {
    const p = this.nazad.pop();
    if (!p) return null;
    this.napred.push(sada);
    this.poslednje = null;
    return p;
  }

  ponovi(sada: Platno): Platno | null {
    const p = this.napred.pop();
    if (!p) return null;
    this.nazad.push(sada);
    this.poslednje = null;
    return p;
  }

  /** Nov dokument (inicijalizacija editora): obe strane prazne, spajanje prekinuto. */
  resetuj(): void {
    this.nazad = [];
    this.napred = [];
    this.poslednje = null;
  }

  get mozeNazad(): boolean { return this.nazad.length > 0; }
  get mozeNapred(): boolean { return this.napred.length > 0; }
}
