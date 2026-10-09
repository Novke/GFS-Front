import { ErrorHandler, inject, Injectable } from '@angular/core';
import { catchError, defer, EMPTY, forkJoin, Observable, of, switchMap, take } from 'rxjs';

import { IzvorNesacuvanog, NesacuvaneIzmene } from './nesacuvane-izmene';

/** Ono što registar zna o sesiji čuvanja jednog učitanog entiteta (test, domaći, predavanje). */
export interface SesijaCuvanja extends IzvorNesacuvanog {
  /** Entitet sesije, npr. `test-5`; učitavanje čeka sve sesije istog ključa. */
  readonly kljuc: string;
  /** Poslovi u redu ili u izvršenju (debounce tajmeri se ne računaju). */
  readonly uToku: number;
  /** Emituje svaki put kad `uToku` padne na 0. */
  readonly mirovanje: Observable<void>;
}

/**
 * Registar sesija čuvanja za celu aplikaciju (root), zajednički za `PredavanjeStore`, `DomaciStore` i `TestStore`.
 * Svaki store prijavljuje svoje sesije, a zatvorena sesija (napušten ekran, prelaz na drugi id) se odjavljuje tek kad
 * isprazni red. Pre čitanja entiteta store čeka da **sve** sesije tog ključa (i one iz uništenih store-ova: napušten
 * detalj, prelaz 5 -> 6 -> 5) završe svoje upise, pa učitano stanje nikad ne prethodi izmenama koje su još na putu.
 * Prijavljene sesije se vide i u {@link NesacuvaneIzmene} (upozorenje pre zatvaranja kartice).
 */
@Injectable({ providedIn: 'root' })
export class RegistarCuvanja {
  private readonly sesije = new Set<SesijaCuvanja>();
  private readonly nesacuvane = inject(NesacuvaneIzmene);

  prijavi(s: SesijaCuvanja): void {
    this.sesije.add(s);
    this.nesacuvane.prijavi(s);
  }

  odjavi(s: SesijaCuvanja): void {
    this.sesije.delete(s);
    this.nesacuvane.odjavi(s);
  }

  /** Sesija javlja da se promenio njen broj nesačuvanih izmena (upozorenje pre zatvaranja kartice se uključuje/isključuje). */
  promena(): void {
    this.nesacuvane.proveri();
  }

  /** Emituje jednom kad nijedna prijavljena sesija ključa `kljuc` nema posao u redu ni u izvršenju; odmah ako ih nema. */
  sacekaj(kljuc: string): Observable<unknown> {
    return defer(() => {
      const zauzete = [...this.sesije].filter(s => s.kljuc === kljuc && s.uToku > 0);
      return zauzete.length === 0
        ? of(null)
        : forkJoin(zauzete.map(s => s.mirovanje.pipe(take(1)))).pipe(switchMap(() => this.sacekaj(kljuc)));
    });
  }
}

/**
 * Posao reda sesije koji nikad ne završava greškom. Store-ovi same greške zahteva obrađuju u `catchError`; ovo hvata
 * izuzetak iz **te obrade** (ili iz `tap`-a uspeha), koji bi inače ugasio `concatMap` reda: sledeći poslovi se više ne
 * bi izvršili, `uToku` ne bi pao na 0 i učitavanje istog entiteta (registar) bi čekalo zauvek. Izuzetak ide u
 * `ErrorHandler` (konzola), red nastavlja.
 */
export function bezPrekidaReda<T>(posao: Observable<T>, greske: ErrorHandler): Observable<T> {
  return posao.pipe(
    catchError((e: unknown) => {
      greske.handleError(e);
      return EMPTY;
    }),
  );
}
