import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, numberAttribute, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { NazivIkone } from '../../core/layout/icons';

/** Skeleton se pokazuje tek posle ovog kašnjenja, da brzo učitavanje ne trepće (spec 4). */
export const SKELETON_KASNJENJE_MS = 150;

/**
 * Prazno stanje liste: "Nema … za izabrane filtere" + "Očisti filtere", ili objašnjenje + "Novo …" (akcije se
 * projektuju). Motiv pruga iz logoa (polukrug) je dekoracija (spec 3).
 */
@Component({
  selector: 'app-empty-state',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="motiv" aria-hidden="true">
      <mat-icon [svgIcon]="ikona()" />
    </div>
    <h2>{{ naslov() }}</h2>
    @if (tekst()) {
      <p>{{ tekst() }}</p>
    }
    <div class="akcije"><ng-content /></div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 16px; text-align: center; }
    .motiv { position: relative; display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 8px;
      border-radius: 50%; background: var(--primary-soft); color: var(--primary-soft-ink); overflow: hidden; }
    .motiv::before { content: ""; position: absolute; inset: 0; clip-path: inset(0 50% 0 0);
      background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--primary) 22%, transparent) 0 5px, transparent 5px 10px); }
    .motiv .mat-icon { position: relative; width: 32px; height: 32px; }
    h2 { font-size: 17px; }
    p { margin: 0; max-width: 46ch; color: var(--muted); }
    .akcije { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
    .akcije:empty { display: none; }
  `,
})
export class EmptyState {
  readonly naslov = input.required<string>();
  readonly tekst = input<string | null | undefined>(null);
  readonly ikona = input<NazivIkone>('search');
}

/** Greška učitavanja liste ili detalja: poruka (`reason` ili opšta) i "Pokušaj ponovo". */
@Component({
  selector: 'app-error-panel',
  imports: [MatButton, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" role="alert">
      <mat-icon svgIcon="error" aria-hidden="true" />
      <div class="tekst">
        <strong>{{ naslov() }}</strong>
        <span>{{ poruka() }}</span>
      </div>
      <button matButton="outlined" type="button" data-ponovo (click)="ponovo.emit()">
        <mat-icon svgIcon="refresh" aria-hidden="true" />Pokušaj ponovo
      </button>
    </div>
  `,
  styles: `
    .panel { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 16px; margin: 12px 0;
      border: 1px solid var(--danger); border-radius: var(--radius); background: var(--danger-soft); color: var(--ink); }
    .panel > .mat-icon { color: var(--danger); flex: none; }
    .tekst { flex: 1 1 200px; display: flex; flex-direction: column; gap: 2px; }
    .tekst span { color: var(--ink-2); }
  `,
})
export class ErrorPanel {
  readonly poruka = input<string | null | undefined>(null);
  readonly naslov = input('Učitavanje nije uspelo.');
  readonly ponovo = output<void>();
}

/** Skeleton redovi dok se lista učitava; vidljivi tek posle {@link SKELETON_KASNJENJE_MS}. */
@Component({
  selector: 'app-skeleton-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="sr-only" role="status">Učitavanje…</span>
    @if (vidljivo()) {
      @for (r of nizRedova(); track $index) {
        <div class="red" aria-hidden="true">
          <span class="crta kratka"></span><span class="crta"></span><span class="crta srednja"></span>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .red { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .crta { flex: 1; height: 12px; border-radius: 4px; background: var(--surface-2); animation: puls 1.4s ease-in-out infinite; }
    .kratka { flex: 0 0 32px; }
    .srednja { flex: 0 0 22%; }
    @keyframes puls { 50% { opacity: .45; } }
  `,
})
export class SkeletonRows {
  readonly redovi = input(5, { transform: numberAttribute });
  protected readonly vidljivo = signal(false);

  protected readonly nizRedova = computed(() => Array.from({ length: Math.max(0, Math.min(this.redovi() || 0, 50)) }, (_, i) => i));

  constructor() {
    const tajmer = setTimeout(() => this.vidljivo.set(true), SKELETON_KASNJENJE_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(tajmer));
  }
}
