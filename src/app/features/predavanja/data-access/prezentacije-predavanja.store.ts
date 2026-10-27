import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { IzvodjenjeNaPredavanju, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';

/** Poruka za korisnika iz greške zahteva (`reason` servera ili opšta). */
export function razlogZahteva(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/**
 * Izvođenja prezentacija vezana za jedno predavanje ("Prezentacije na ovom predavanju"). Pripada stranici predavanja
 * (provajder u `PredavanjeDetalj`), pa živi dok je stranica otvorena. Odgovor starog zahteva (drugo predavanje ili sporiji
 * raniji poziv) se odbacuje po brojaču, da prikazana lista nikad ne pripada tuđem predavanju.
 */
@Injectable()
export class PrezentacijePredavanjaStore {
  private readonly api = inject(PrezentacijePredavanjaApi);
  private brojac = 0;

  readonly izvodjenja = signal<IzvodjenjeNaPredavanju[]>([]);
  readonly ucitano = signal(false);
  readonly greska = signal<string | null>(null);
  /** Izvođenja u toku za ovo predavanje (najviše jedno po prezentaciji; različite prezentacije mogu biti u toku istovremeno). */
  readonly uToku = computed(() => this.izvodjenja().filter(i => i.status === 'AKTIVNO'));

  /** Čita listu ponovo; prikazana lista ostaje dok nova ne stigne (nema treperenja pri osvežavanju). */
  ucitaj(predavanjeId: number): void {
    const moj = ++this.brojac;
    this.api.izvodjenja(predavanjeId).subscribe({
      next: lista => {
        if (moj !== this.brojac) return;
        this.izvodjenja.set(lista);
        this.greska.set(null);
        this.ucitano.set(true);
      },
      error: e => {
        if (moj !== this.brojac) return;
        this.greska.set(razlogZahteva(e));
        this.ucitano.set(true);
      },
    });
  }

  /** Predavanje je promenjeno: stara lista ne važi. */
  resetuj(): void {
    this.brojac++;
    this.izvodjenja.set([]);
    this.ucitano.set(false);
    this.greska.set(null);
  }
}
