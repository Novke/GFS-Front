// „Ranije na ovom slajdu” (spec 5.4): crteži drugih izvođenja iste prezentacije, jednom po slajdu, samo kad je prekidač
// u Podešavanjima → Uživo uključen.
import { computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { PozadinaCrteza, RanijiCrtez } from './crtanje.models';

const PRAZNO: readonly RanijiCrtez[] = [];

export class RanijiCrtezi {
  private readonly kes = signal<ReadonlyMap<number, readonly RanijiCrtez[]>>(new Map());
  private readonly trazeno = new Set<number>();
  private readonly slajdId = signal<number | null>(null);

  /** Svi raniji crteži trenutnog slajda (obe pozadine). */
  readonly naSlajdu = computed(() => {
    const id = this.slajdId();
    return id === null ? PRAZNO : this.kes().get(id) ?? PRAZNO;
  });

  constructor(private readonly ucitaj: (slajdId: number) => Observable<RanijiCrtez[]>) {}

  /** Trenutni slajd (bela pozadina: slajd bele strane); `ukljuceno` = prekidač. Isti slajd se traži samo jednom. */
  postavi(slajdId: number | null, ukljuceno: boolean): void {
    this.slajdId.set(ukljuceno ? slajdId : null);
    if (!ukljuceno || slajdId === null || this.trazeno.has(slajdId)) return;
    this.trazeno.add(slajdId);
    this.ucitaj(slajdId).subscribe({
      next: lista => this.kes.update(m => new Map(m).set(slajdId, lista)),
      // bez ranijih crteža (nije bitno za čas); sledeći dolazak na slajd ne pokušava ponovo
      error: (e: unknown) => console.warn('Raniji crteži nisu učitani.', e),
    });
  }

  /** Raniji crteži za pozadinu trenutne strane („Ranije ovde” u crtanju). */
  za(pozadina: PozadinaCrteza): readonly RanijiCrtez[] {
    return this.naSlajdu().filter(r => r.pozadina === pozadina && r.elementi.length > 0);
  }
}
