import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { CrtanjeApi } from '../../uzivo/crtanje/crtanje.api';
import type { ElementCrteza } from '../../uzivo/crtanje/crtanje.models';
import { SlicicaCrtezaComponent } from '../../uzivo/crtanje/slicica-crteza.component';
import { tablaPredavanja } from './tabla';

/**
 * „Tabla sa ovog časa” na stranici predavanja (spec crtanja 5.7): sličica sačuvane table, klik je otvara u novoj kartici za
 * nastavak. Prazna ili nesačuvana tabla: odeljka nema. Čita se ponovo kad se kartica predavanja ponovo prikaže (tabla se
 * crta u drugoj kartici). Greška je tiha: stranica predavanja radi i bez table.
 */
@Component({
  selector: 'app-tabla-casa',
  imports: [RouterLink, SlicicaCrtezaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (elementi().length) {
      <section class="tc" aria-labelledby="naslov-table-casa" data-tabla-casa>
        <h2 id="naslov-table-casa">Tabla sa ovog časa</h2>
        <a class="tc-slicica" [routerLink]="'/' + putanja()" target="_blank" rel="noopener"
           aria-label="Otvori tablu sa ovog časa (otvara se u novoj kartici)">
          <app-slicica-crteza [elementi]="elementi()" />
        </a>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .tc { margin-top: 24px; }
    .tc h2 { font-size: 18px; margin-bottom: 8px; }
    .tc-slicica { display: block; width: min(360px, 100%); border: 2px solid var(--line); border-radius: 6px; overflow: hidden; }
    .tc-slicica:hover { border-color: var(--primary); }
    .tc-slicica:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `,
})
export class TablaCasa {
  private readonly api = inject(CrtanjeApi);
  private readonly dokument = inject(DOCUMENT);

  readonly predavanjeId = input.required<number>();
  protected readonly elementi = signal<readonly ElementCrteza[]>([]);
  protected readonly putanja = () => tablaPredavanja(this.predavanjeId());
  private zahtev: Subscription | null = null;

  constructor() {
    effect(() => {
      this.predavanjeId();
      untracked(() => this.ucitaj());
    });
    const slusalac = () => {
      if (this.dokument.visibilityState === 'visible') this.ucitaj();
    };
    this.dokument.addEventListener('visibilitychange', slusalac);
    inject(DestroyRef).onDestroy(() => {
      this.dokument.removeEventListener('visibilitychange', slusalac);
      this.zahtev?.unsubscribe();
    });
  }

  private ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.tabla(this.predavanjeId()).subscribe({
      next: t => this.elementi.set(t?.elementi ?? []),
      error: (e: unknown) => console.warn('Tabla predavanja nije učitana.', e),
    });
  }
}
