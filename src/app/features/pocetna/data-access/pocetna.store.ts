import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { KontrolnaTablaCeka } from '../../../core/api/pregled.api';
import { DashboardCountsStore } from '../../../core/state/dashboard-counts.store';
import { agendaNedelje } from './pocetna.vreme';

interface PocetnaState {
  /** Trenutak poslednjeg učitavanja: pozdrav, "danas" i nedelja se računaju od njega. */
  sada: Date;
}

const PRAZNO_CEKA: KontrolnaTablaCeka = {
  testovi: [],
  domaci: [],
  prijave: [],
  nezavrsena: [],
  brojTestova: 0,
  brojDomacih: 0,
  brojPrijava: 0,
  brojNezavrsenih: 0,
};

/** Broj iz odgovora; sve što nije konačan nenegativan broj je 0 (stari ili okrnjen odgovor ne sme da ruši ekran). */
const broj = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const lista = <T>(v: readonly T[] | null | undefined): readonly T[] => (Array.isArray(v) ? v : []);

/**
 * Kontrolna tabla (`/`), P1-P4. Odgovor `GET pregled/kontrolna-tabla` je jedan za ceo ekran: drži ga
 * `DashboardCountsStore` (iz njega su i brojači u navigaciji), pa Početna ne pravi drugi zahtev uz onaj iz ljuske.
 * Provajduje se u stranici. Greška ne ide u snackbar (zahtev je tih), nego u panel sa "Pokušaj ponovo". Dok se tabla
 * osvežava, stari podaci ostaju na ekranu.
 */
export const PocetnaStore = signalStore(
  withState<PocetnaState>({ sada: new Date() }),
  withProps(() => ({ _izvor: inject(DashboardCountsStore) })),
  withComputed(store => {
    const tabla = computed(() => store._izvor.tabla());
    const ceka = computed<KontrolnaTablaCeka>(() => {
      const c = tabla()?.ceka;
      return c
        ? {
            testovi: lista(c.testovi),
            domaci: lista(c.domaci),
            prijave: lista(c.prijave),
            nezavrsena: lista(c.nezavrsena),
            brojTestova: broj(c.brojTestova),
            brojDomacih: broj(c.brojDomacih),
            brojPrijava: broj(c.brojPrijava),
            brojNezavrsenih: broj(c.brojNezavrsenih),
          }
        : PRAZNO_CEKA;
    });
    return {
      tabla,
      ucitava: computed(() => store._izvor.status() === 'loading'),
      imaGresku: computed(() => store._izvor.status() === 'error'),
      greska: computed(() => store._izvor.greska()),
      sledece: computed(() => tabla()?.sledece ?? null),
      uToku: computed(() => lista(tabla()?.uToku)),
      ceka,
      nedelja: computed(() => agendaNedelje(lista(tabla()?.nedelja), store.sada())),
    };
  }),
  withMethods(store => ({
    /** Osvežava tablu (bez drugog zahteva ako je jedan upravo počeo) i sat za pozdrav i "danas". */
    ucitaj(): void {
      patchState(store, { sada: new Date() });
      store._izvor.osveziSada();
    },
  })),
);
