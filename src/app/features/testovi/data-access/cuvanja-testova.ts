import { Injectable } from '@angular/core';
import { defer, forkJoin, Observable, of, Subject, switchMap, take } from 'rxjs';

/** Ono što registar zna o sesiji `TestStore`-a: test, broj poslova u redu ili u izvršenju i signal pražnjenja. */
export interface SesijaCuvanja {
  readonly tId: number;
  readonly uToku: number;
  readonly mirovanje: Subject<void>;
}

/**
 * Registar sesija čuvanja testova za celu aplikaciju (root). Svaki `TestStore` prijavljuje svoje sesije, a zatvorena sesija
 * se odjavljuje tek kad isprazni red. Pre čitanja testa N store čeka da **sve** sesije za N (i one iz uništenih store-ova:
 * napušten detalj, prelaz 5 -> 6 -> 5, detalj -> statistika) završe svoje upise, pa učitano stanje nikad ne prethodi
 * izmenama koje su još na putu.
 */
@Injectable({ providedIn: 'root' })
export class CuvanjaTestova {
  private readonly sesije = new Set<SesijaCuvanja>();

  prijavi(s: SesijaCuvanja): void {
    this.sesije.add(s);
  }

  odjavi(s: SesijaCuvanja): void {
    this.sesije.delete(s);
  }

  /** Emituje jednom kad nijedna prijavljena sesija testa `tId` nema posao u redu ni u izvršenju; odmah ako ih nema. */
  sacekaj(tId: number): Observable<unknown> {
    return defer(() => {
      const zauzete = [...this.sesije].filter(s => s.tId === tId && s.uToku > 0);
      return zauzete.length === 0
        ? of(null)
        : forkJoin(zauzete.map(s => s.mirovanje.pipe(take(1)))).pipe(switchMap(() => this.sacekaj(tId)));
    });
  }
}
