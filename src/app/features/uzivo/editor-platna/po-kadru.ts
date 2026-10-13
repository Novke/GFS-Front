// Najviše jedna obrada pokazivača po kadru (odluka 33): gest mišem nad platnom sa 300 slojeva menja dokument najviše
// jednom po kadru, ma koliko `pointermove` događaja stiglo između dva kadra.
import { InjectionToken } from '@angular/core';

/** Raspored kadrova (`requestAnimationFrame`); testovi ga zamenjuju lažnim, koji sam ne zove ništa. */
export interface RasporedKadra {
  zakazi(f: () => void): number;
  otkazi(id: number): void;
}

export const RASPORED_KADRA = new InjectionToken<RasporedKadra>('RASPORED_KADRA', {
  providedIn: 'root',
  factory: () => ({
    zakazi: (f) => requestAnimationFrame(() => f()),
    otkazi: (id) => cancelAnimationFrame(id),
  }),
});

export class PoKadru<T> {
  private poslednji: T | null = null;
  private zakazano = 0;

  constructor(
    private readonly obradi: (v: T) => void,
    private readonly zakazi: (f: () => void) => number = (f) => requestAnimationFrame(() => f()),
    private readonly otkaziKadar: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  /** Pamti poslednju vrednost; obrada ide jednom, u sledećem kadru. */
  dodaj(v: T): void {
    this.poslednji = v;
    if (!this.zakazano) this.zakazano = this.zakazi(() => this.isprazni());
  }

  /** Odmah obradi ono što čeka (pointerup ne sme da izgubi poslednji pokret). */
  isprazni(): void {
    if (this.zakazano) {
      this.otkaziKadar(this.zakazano);
      this.zakazano = 0;
    }
    const v = this.poslednji;
    this.poslednji = null;
    if (v !== null) this.obradi(v);
  }

  /** Gest prekinut (Esc, pointercancel, uništavanje): ono što čeka se odbacuje. */
  prekini(): void {
    if (this.zakazano) this.otkaziKadar(this.zakazano);
    this.zakazano = 0;
    this.poslednji = null;
  }
}
