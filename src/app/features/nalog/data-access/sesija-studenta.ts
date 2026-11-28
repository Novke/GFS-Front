import { Injectable, computed, signal } from '@angular/core';

import type { StudentJa } from './nalog.models';

/**
 * Poslednji `GET api/public/nalog/ja` u ovom tabu (postavljaju ga Početna, Ja i strana `/r`), bez sopstvenog zahteva. Iz njega
 * ljuska tabova zna da je sesija **RACUNAR** (prijava računara u laboratoriji, online testovi faza 2): tada nema ponude za
 * instalaciju ni push-a, a stalno stoji „Prijavljen: Ime · Nisi ti? Odjavi“. Ograničenje: traka se pojavi tek kad je `ja`
 * poznat (Početna ga čita odmah posle prijave, pa je to praktično uvek).
 */
@Injectable({ providedIn: 'root' })
export class SesijaStudenta {
  readonly ja = signal<StudentJa | null>(null);
  readonly racunar = computed(() => this.ja()?.nacin === 'RACUNAR');
}
