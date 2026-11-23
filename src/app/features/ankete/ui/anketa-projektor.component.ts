import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';

import { glasovaTekst } from '../../../shared/util/ankete';
import { AnketeApi } from '../data-access/ankete.api';
import { AnketaDetails } from '../data-access/ankete.models';
import { OSVEZAVANJE_ANKETE_MS, anketaZaProjektor } from '../data-access/ankete.pravila';
import { AnketaTrakeComponent } from '../../../shared/ui/anketa-trake.component';

/**
 * Anketa na projektoru (spec 6.2, maketa H): prozor preko slajda (slajd ispod se ne menja) sa pitanjem i odgovorima, a trake
 * i brojevi tek kad je nastavnik pokazao rezultat. Pita `GET ankete/aktivne?predavanjeId=` na 2 s dok ima predavanja (živo);
 * skrivena stranica ne pita, greška se nikad ne prikazuje (projektor ostaje kakav je bio). Nikad imena: samo "N glasova".
 */
@Component({
  selector: 'app-anketa-projektor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnketaTrakeComponent],
  template: `
    @if (anketa(); as a) {
      <aside class="apj" role="status" aria-live="polite" aria-label="Anketa" data-anketa-projektor>
        <div class="apj-gore">
          <span class="apj-cip">{{ a.otvorena ? 'Anketa' : 'Anketa · zatvorena' }}</span>
          <span class="apj-broj" data-anketa-projektor-broj>{{ glasova(a.brojGlasalo) }}</span>
        </div>
        <p class="apj-pitanje">{{ a.pitanje }}</p>
        @if (a.rezultatPrikazan) {
          <app-anketa-trake [opcije]="a.opcije" [glasovi]="a.glasovi" [brojGlasalo]="a.brojGlasalo" [projektor]="true" data-anketa-projektor-rezultat />
        } @else {
          <ul class="apj-odgovori">
            @for (o of a.opcije; track $index) { <li>{{ o }}</li> }
          </ul>
        }
      </aside>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: flex; align-items: center; justify-content: flex-end; padding: 3vw; }
    .apj {
      pointer-events: auto; width: min(44vw, 760px); max-height: 90vh; overflow: hidden; padding: 1.1em 1.3em; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); color: var(--ink); box-shadow: var(--shadow); font-size: clamp(16px, 1.9vw, 34px);
    }
    .apj-gore { display: flex; justify-content: space-between; align-items: center; gap: 1em; font-size: .7em; }
    .apj-cip { padding: .15em .7em; border-radius: 999px; background: var(--primary-soft); color: var(--primary-soft-ink); font-weight: 600; }
    .apj-broj { color: var(--ink-2); font-variant-numeric: tabular-nums; }
    .apj-pitanje { margin: .5em 0 .8em; font-size: 1.25em; line-height: 1.25; font-weight: 600; overflow-wrap: anywhere; }
    .apj-odgovori { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .45em; }
    .apj-odgovori li { padding: .35em .6em; border: 1px solid var(--line); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
  `,
})
export class AnketaProjektorComponent {
  /** Živo predavanje (`null`: ništa se ne pita ni ne prikazuje). */
  readonly predavanjeId = input<number | null>(null);

  private readonly api = inject(AnketeApi);
  private readonly dokument = inject(DOCUMENT);
  private readonly lista = signal<AnketaDetails[]>([]);
  private zahtev: Subscription | null = null;

  protected readonly anketa = computed(() => (this.predavanjeId() === null ? null : anketaZaProjektor(this.lista())));

  constructor() {
    // novo predavanje: staro se briše i pita se odmah
    effect(() => {
      const id = this.predavanjeId();
      untracked(() => {
        this.zahtev?.unsubscribe();
        this.zahtev = null;
        this.lista.set([]);
        if (id !== null) {
          this.pitaj();
        }
      });
    });
    const t = setInterval(() => this.pitaj(), OSVEZAVANJE_ANKETE_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(t);
      this.zahtev?.unsubscribe();
    });
  }

  protected glasova(n: number): string {
    return glasovaTekst(n);
  }

  private pitaj(): void {
    const id = this.predavanjeId();
    if (id === null || this.dokument.visibilityState === 'hidden' || (this.zahtev && !this.zahtev.closed)) {
      return;
    }
    this.zahtev = this.api.aktivne({ predavanjeId: id }).subscribe({
      next: lista => {
        if (this.predavanjeId() === id) {
          this.lista.set(lista);
        }
      },
      error: () => undefined, // projektor nikad ne pokazuje grešku; sledeći krug za 2 s
    });
  }
}
