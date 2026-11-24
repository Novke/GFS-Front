import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { odbrojavanje, opisRoka, preostaloMs } from '../../../shared/util/ankete';
import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { nijeGlasalo } from '../data-access/ankete.pravila';
import { AnketaTrakeComponent } from '../../../shared/ui/anketa-trake.component';

/**
 * Rezultati prikazane ankete (maketa C, desno u I): trake uživo (nastavnik ih vidi uvek), "N / M glasalo", koliko još nije,
 * odbrojavanje do roka, "Pokaži / Sakrij rezultat" (R), "Zatvori" (Enter), za anketu bez šablona "★ Sačuvaj", a posle
 * zatvaranja "Pokreni ponovo". Osvežavanje na 2 s radi store panela.
 */
@Component({
  selector: 'app-anketa-rezultati',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, AnketaTrakeComponent],
  template: `
    @if (store.anketa(); as a) {
      <div class="re-cipovi">
        <span class="re-cip">{{ a.publika === 'NA_CASU' ? 'Na času' : 'Cela grupa' }}</span>
        <span class="re-cip" [class.re-cip--otvorena]="a.otvorena" data-anketa-status>
          {{ a.otvorena ? (preostalo() !== null ? 'otvoreno još ' + preostalo() : 'otvoreno') : 'zatvoreno' }}
        </span>
        @if (a.izvor === 'CLAUDE') { <span class="re-cip">pokrenuo Claude</span> }
        <span class="re-glasalo" data-anketa-glasalo>{{ a.brojGlasalo }} / {{ a.brojMogucih }} glasalo</span>
      </div>
      <h3 id="anketa-desno-naslov" class="re-pitanje">{{ a.pitanje }}</h3>
      <p class="re-napomena">Anonimno · jedan glas po studentu · može da se promeni dok je otvoreno{{ a.viseOdgovora ? ' · više odgovora' : '' }}</p>
      <app-anketa-trake [opcije]="a.opcije" [glasovi]="a.glasovi" [brojGlasalo]="a.brojGlasalo" />
      <p class="re-napomena re-ostatak" aria-live="polite">
        @if (ostalo() > 0) { Još nije glasalo: {{ ostalo() }}. } @else if (a.brojMogucih > 0) { Svi su glasali. }
        @if (a.publika === 'GRUPA' && a.rokMs !== null) { Rok: {{ rok() }}. }
        @else if (a.otvorena && a.publika === 'NA_CASU') { Zatvara se sama kad se predavanje završi. }
      </p>
      <p class="re-vidljivost" data-anketa-vidljivost>
        {{ a.rezultatPrikazan ? 'Rezultat vide studenti i projektor.' : 'Rezultat vidiš samo ti.' }}
      </p>
      <div class="re-dugmad">
        @if (a.sablonId === null && !store.sacuvanaKaoPrecica()) {
          <button mat-button type="button" [disabled]="store.radi()" (click)="klik($event); store.sacuvajKaoPrecicu()" data-anketa-sacuvaj-precicu>
            ★ Sačuvaj
          </button>
        }
        @if (!a.otvorena) {
          <button mat-button type="button" [disabled]="store.radi()" (click)="klik($event); store.pokreniPonovo()" data-anketa-ponovo>
            <mat-icon svgIcon="replay" />Pokreni ponovo
          </button>
        }
        <button mat-stroked-button type="button" [disabled]="store.radi()" [attr.aria-pressed]="a.rezultatPrikazan"
                aria-keyshortcuts="R" (click)="klik($event); store.prebaciRezultat()" data-anketa-rezultat>
          {{ a.rezultatPrikazan ? 'Sakrij rezultat' : 'Pokaži rezultat' }}@if (siroko()) { <kbd class="re-kbd">R</kbd> }
        </button>
        @if (a.otvorena) {
          <button mat-flat-button type="button" [disabled]="store.radi()" aria-keyshortcuts="Enter"
                  (click)="klik($event); store.zatvoriAnketu()" data-anketa-zatvori>
            Zatvori@if (siroko()) { <kbd class="re-kbd">Enter</kbd> }
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .re-cipovi { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
    .re-cip { padding: 2px 10px; border-radius: 999px; background: var(--surface-2); color: var(--ink-2); font-size: 13px; font-weight: 600; }
    .re-cip--otvorena { background: var(--warn-soft); color: var(--ink); font-variant-numeric: tabular-nums; }
    .re-glasalo { margin-left: auto; font-size: 14px; color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }
    .re-pitanje { margin: 14px 0 4px; font-size: 22px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
    .re-napomena { margin: 0 0 16px; font-size: 13px; color: var(--muted); }
    .re-ostatak { margin: 16px 0 4px; }
    .re-vidljivost { margin: 0 0 16px; font-size: 13px; color: var(--ink-2); }
    .re-dugmad { margin-top: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 8px; }
    .re-kbd { margin-left: 8px; padding: 0 5px; border: 1px solid currentColor; border-radius: 4px; font: 600 11px var(--font-mono); opacity: .8; }
  `,
})
export class RezultatiEkranComponent {
  readonly siroko = input(false);

  protected readonly store = inject(AnketePanelStore);
  /** Lokalni sat za odbrojavanje (svake sekunde). */
  private readonly sada = signal(Date.now());

  protected readonly ostalo = computed(() => {
    const a = this.store.anketa();
    return a ? nijeGlasalo(a) : 0;
  });
  protected readonly preostalo = computed(() => {
    const a = this.store.anketa();
    const ms = a?.otvorena ? preostaloMs(a.rokMs, a.sadaMs, this.store.primljenoMs(), this.sada()) : null;
    return ms === null ? null : odbrojavanje(ms);
  });
  protected readonly rok = computed(() => {
    const a = this.store.anketa();
    return a?.rokMs != null ? opisRoka(a.rokMs, a.sadaMs) : '';
  });

  constructor() {
    const t = setInterval(() => this.sada.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  /** Posle klika mišem fokus ne ostaje na dugmetu, pa Enter i R ostaju tasteri panela. */
  protected klik(e: MouseEvent): void {
    if (e.detail > 0) {
      (e.currentTarget as HTMLElement | null)?.blur();
    }
  }
}
