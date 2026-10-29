import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import { PodesavanjaNaloga } from '../data-access/portal.models';

/**
 * Kartica "Obaveštenja" na tabu Ja: "Javi mi mejlom kad je čas otkazan" (`GET|PUT api/public/nalog/podesavanja`). Izbor važi
 * za mejl o otkazanom času i za "čas se ipak održava"; podrazumevano uključeno. **Samostalna:** sama učitava i čuva, bez
 * ulaza i izlaza. Promena se odmah prikazuje i šalje; greška vraća prethodno stanje i prikazuje poruku servera.
 */
@Component({
  selector: 'app-podesavanja-mejla',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="naslov-obavestenja" data-podesavanja>
      <h3 id="naslov-obavestenja">Obaveštenja</h3>
      @if (stanje(); as s) {
        <label class="izbor">
          <input type="checkbox" [checked]="s.mejlOtkazanCas" [disabled]="salje()" (change)="promeni($event)"
                 aria-describedby="pomoc-obavestenja" data-mejl-otkazan />
          <span>Javi mi mejlom kad je čas otkazan</span>
        </label>
        <p class="pomoc" id="pomoc-obavestenja">I kad se otkazan čas ipak održava. Mejl stiže na adresu sa tvog naloga.</p>
        @if (greska(); as g) {
          <p class="greska" role="alert">{{ g }}</p>
        } @else if (sacuvano()) {
          <p class="sacuvano" role="status" data-sacuvano>Sačuvano.</p>
        }
      } @else if (greska(); as g) {
        <p class="greska" role="alert">{{ g }}</p>
        <button type="button" class="ponovo" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <p class="stanje" role="status">Učitavanje...</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { margin: 16px 0 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); }
    h3 { margin: 0 0 8px; font-size: 16px; }
    .izbor { display: flex; align-items: center; gap: 10px; min-height: 44px; cursor: pointer; font-weight: 600; }
    .izbor input { width: 20px; height: 20px; margin: 0; flex: none; accent-color: var(--primary); }
    .pomoc { margin: 0 0 0 30px; color: var(--muted); font-size: 13px; }
    .greska { margin: 8px 0 0; color: var(--danger); }
    .sacuvano { margin: 8px 0 0; color: var(--ink-2); font-size: 13px; }
    .stanje { margin: 0; color: var(--muted); }
    .ponovo { margin-top: 8px; min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
  `,
})
export class PodesavanjaMejla {
  private readonly api = inject(PortalApi);

  protected readonly stanje = signal<PodesavanjaNaloga | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);
  protected readonly sacuvano = signal(false);
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.zahtev = this.api.podesavanja().subscribe({
      next: p => this.stanje.set(p),
      error: (e: unknown) => this.greska.set(porukaGreske(e)),
    });
  }

  protected promeni(e: Event): void {
    const pre = this.stanje();
    if (!pre || this.salje()) {
      return;
    }
    const novo: PodesavanjaNaloga = { mejlOtkazanCas: (e.target as HTMLInputElement).checked };
    this.stanje.set(novo);
    this.salje.set(true);
    this.greska.set(null);
    this.sacuvano.set(false);
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.sacuvajPodesavanja(novo).subscribe({
      next: p => {
        this.salje.set(false);
        this.stanje.set(p);
        this.sacuvano.set(true);
      },
      error: (err: unknown) => {
        this.salje.set(false);
        this.stanje.set(pre);
        this.greska.set(porukaGreske(err));
      },
    });
  }
}
