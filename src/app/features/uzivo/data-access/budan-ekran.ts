import { DestroyRef, DOCUMENT, inject, Signal, signal } from '@angular/core';

export type StanjeBudnosti = 'nepodrzano' | 'trazi' | 'aktivno' | 'odbijeno' | 'iskljuceno';

export interface BravaEkrana {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(tip: 'release', f: () => void): void;
}

export interface WakeLockLike {
  request(tip: 'screen'): Promise<BravaEkrana>;
}

type DokumentVidljivosti = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/** Drži ekran budnim (Screen Wake Lock); traži ponovo pri svakom povratku na stranicu, jer pregledač bravu sam pusti. */
export class BudanEkran {
  private readonly _stanje = signal<StanjeBudnosti>('iskljuceno');
  readonly stanje: Signal<StanjeBudnosti> = this._stanje.asReadonly();

  private zeli = false;
  private brava: BravaEkrana | null = null;
  private zahtev: Promise<void> | null = null;
  private slusa = false;
  private readonly poVidljivosti = (): void => {
    if (this.doc.visibilityState === 'visible') this.trazi();
  };

  constructor(private readonly api: WakeLockLike | undefined, private readonly doc: DokumentVidljivosti) {
    if (!api) this._stanje.set('nepodrzano');
  }

  ukljuci(): void {
    if (!this.api) return;
    this.zeli = true;
    if (!this.slusa) {
      this.doc.addEventListener('visibilitychange', this.poVidljivosti);
      this.slusa = true;
    }
    this.trazi();
  }

  iskljuci(): void {
    this.zeli = false;
    if (this.slusa) {
      this.doc.removeEventListener('visibilitychange', this.poVidljivosti);
      this.slusa = false;
    }
    const brava = this.brava;
    this.brava = null;
    if (brava) brava.release().catch(() => undefined);
    if (this.api) this._stanje.set('iskljuceno');
  }

  private trazi(): void {
    if (!this.api || !this.zeli || this.brava || this.zahtev || this.doc.visibilityState !== 'visible') return;
    this._stanje.set('trazi');
    this.zahtev = this.api.request('screen').then(
      brava => {
        this.zahtev = null;
        if (!this.zeli) {
          brava.release().catch(() => undefined);
          return;
        }
        // Stranica je sakrivena dok je zahtev trajao (ili je pregledač bravu već pustio): nije aktivno; povratak traži ponovo.
        if (brava.released || this.doc.visibilityState !== 'visible') {
          if (!brava.released) brava.release().catch(() => undefined);
          this._stanje.set('trazi');
          return;
        }
        this.brava = brava;
        this._stanje.set('aktivno');
        brava.addEventListener('release', () => {
          if (this.brava !== brava) return;
          this.brava = null;
          if (this.zeli) this._stanje.set('trazi');
        });
      },
      () => {
        this.zahtev = null;
        if (this.zeli) this._stanje.set('odbijeno');
      },
    );
  }
}

/** Za komponente: ukljuci/iskljuci ručno; `iskljuci` se zove i pri uništenju. */
export function napraviBudanEkran(): BudanEkran {
  const be = new BudanEkran((navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock, inject(DOCUMENT));
  inject(DestroyRef).onDestroy(() => be.iskljuci());
  return be;
}
