import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { detektujInstalaciju, PrikazInstalacije } from './instalacija.pravila';

/** `beforeinstallprompt` (Chromium); nije u standardnim tipovima DOM-a. */
export interface PonudaBrowsera extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ProzorSaPonudom {
  __gfsPonudaInstalacije?: PonudaBrowsera;
}

function standalone(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Ponuda za instalaciju (spec „Aplikacija i obaveštenja“ 4.3): drži `beforeinstallprompt` (stiže i pre Angular-a, pa ga
 * inline skripta iz `index.html` čuva u `window.__gfsPonudaInstalacije`) i zna da li je aplikacija već instalirana. Bez
 * HTTP poziva; koriste ga nalog studenta (kartica, tab Ja) i meni nastavnika.
 */
@Injectable({ providedIn: 'root' })
export class PonudaInstalacije {
  private readonly ponuda = signal<PonudaBrowsera | null>(null);
  private readonly _instalirano = signal(standalone());
  readonly instalirano = this._instalirano.asReadonly();
  readonly prikaz = computed<PrikazInstalacije>(() => detektujInstalaciju({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: this._instalirano(),
    imaPonudu: this.ponuda() !== null,
  }));

  constructor() {
    const prozor = window as Window & ProzorSaPonudom;
    this.ponuda.set(prozor.__gfsPonudaInstalacije ?? null);
    const naPonudu = (e: Event) => {
      e.preventDefault();
      this.ponuda.set(e as PonudaBrowsera);
    };
    const naInstalaciju = () => {
      this.ponuda.set(null);
      this._instalirano.set(true);
    };
    window.addEventListener('beforeinstallprompt', naPonudu);
    window.addEventListener('appinstalled', naInstalaciju);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', naPonudu);
      window.removeEventListener('appinstalled', naInstalaciju);
    });
  }

  /** Otvara prozor browsera; ponuda važi jednom, pa se posle odgovora briše (browser šalje novu kad hoće). */
  async instaliraj(): Promise<'prihvaceno' | 'odbijeno' | 'nema'> {
    const p = this.ponuda();
    if (!p) {
      return 'nema';
    }
    this.ponuda.set(null);
    delete (window as Window & ProzorSaPonudom).__gfsPonudaInstalacije;
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      return outcome === 'accepted' ? 'prihvaceno' : 'odbijeno';
    } catch {
      return 'nema';
    }
  }
}
