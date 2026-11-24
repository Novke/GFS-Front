import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import type { FajlKratko, MejlFajlaOdgovor } from './fajlovi';

/** Poruka uz jedan fajl u spisku: šalje se, poslato ili greška. */
export interface PorukaFajla {
  vrsta: 'salje' | 'poslato' | 'greska';
  tekst: string;
}

/** Tekst greške: `reason` servera doslovno (i za 429 i 503), mreža i ostalo opšte poruke. */
export function porukaGreskeMejla(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Nema veze sa serverom.';
    const reason = (e.error as { reason?: unknown } | null)?.reason;
    if (typeof reason === 'string' && reason.trim() !== '') return reason;
  }
  return 'Slanje nije uspelo. Pokušaj ponovo.';
}

/**
 * „Pošalji mi na mejl” za spisak fajlova (nalog i telefon uživo): stanje poruke po fajlu. Poziv servera daje stranica
 * (`posalji`), pa klasa nema HTTP-a i uvozi samo @angular/*, rxjs i `fajlovi`. Dvostruki klik dok se šalje ništa ne radi.
 * Sa `prijavaNa401` (telefon uživo) 401 ili 403 ne daje poruku nego postavlja `trebaPrijava`: dugme se menja linkom na prijavu.
 */
export class MejlFajlova {
  readonly poruke = signal<Record<number, PorukaFajla>>({});
  readonly trebaPrijava = signal(false);

  constructor(
    private readonly pozovi: (fajlId: number) => Observable<MejlFajlaOdgovor>,
    private readonly razaranje: DestroyRef,
    private readonly prijavaNa401 = false,
  ) {}

  posalji(f: FajlKratko): void {
    if (this.poruke()[f.id]?.vrsta === 'salje') return;
    this.postavi(f.id, { vrsta: 'salje', tekst: 'Šaljem…' });
    this.pozovi(f.id).pipe(takeUntilDestroyed(this.razaranje)).subscribe({
      next: o => this.postavi(f.id, { vrsta: 'poslato', tekst: `Poslato na ${o.poslatoNa}.` }),
      error: (e: unknown) => {
        const s = e instanceof HttpErrorResponse ? e.status : 0;
        if (this.prijavaNa401 && (s === 401 || s === 403)) {
          this.postavi(f.id, null);
          this.trebaPrijava.set(true);
        } else {
          this.postavi(f.id, { vrsta: 'greska', tekst: porukaGreskeMejla(e) });
        }
      },
    });
  }

  private postavi(id: number, p: PorukaFajla | null): void {
    this.poruke.update(sve => {
      const novo = { ...sve };
      if (p) novo[id] = p; else delete novo[id];
      return novo;
    });
  }
}
