import { Injectable, signal } from '@angular/core';

/**
 * Projektorski layout je uvek svetao (`.rezim-dan`); stranica u njemu ovim privremeno traži režim aplikacije (dan/noć),
 * npr. konzola na završnom ekranu, koji je obična nastavnička strana, a ne projektor. Stranica vraća `false` kad ode.
 */
@Injectable({ providedIn: 'root' })
export class RezimProjektora {
  readonly pratiRezim = signal(false);
}
