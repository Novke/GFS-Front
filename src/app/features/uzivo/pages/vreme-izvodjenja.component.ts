import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { NotificationStore } from '../../../core/state/notification.store';
import { ServerskiSat } from '../data-access/sat';
import {
  Stoperica, formatSata, formatTrajanja, nastavi, nuluj, pauziraj, proteklo, sacuvajStopericu, ucitajStopericu,
} from '../data-access/stoperica';
import { pustiFokusPosleKlika } from './precice';

const OSVEZAVANJE_MS = 500;

function bezbednoSkladiste(): Storage | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/**
 * Vreme izvođenja: lokalna štoperica (pauza, nulovanje sa "Poništi") i sat, oba po serverskom vremenu. Stanje
 * štoperice se čuva u `sessionStorage`, pa preživi ponovno učitavanje taba.
 */
@Component({
  selector: 'app-vreme-izvodjenja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'uz-vreme', '[class.uz-vreme--kompaktno]': 'kompaktno()' },
  template: `
    <span class="uz-vreme-stoperica" role="timer" aria-label="Štoperica">{{ prikaz() }}</span>
    <button mat-icon-button type="button" [attr.aria-label]="pauzirana() ? 'Nastavi štopericu' : 'Pauziraj štopericu'"
            [attr.aria-pressed]="pauzirana()" [disabled]="!poznat()" (click)="pustiFokus($event); preklopi()">
      <mat-icon aria-hidden="true" [svgIcon]="pauzirana() ? 'play_arrow' : 'pause'" />
    </button>
    <button mat-icon-button type="button" aria-label="Nuluj štopericu" [disabled]="!poznat()"
            (click)="pustiFokus($event); nulujStopericu()">
      <mat-icon aria-hidden="true" svgIcon="restart_alt" />
    </button>
    <span class="uz-vreme-sat" aria-label="Sat">{{ satPrikaz() }}</span>
  `,
})
export class VremeIzvodjenjaComponent {
  readonly izvodjenjeId = input.required<number>();
  readonly pocetakMs = input.required<number | null | undefined>();
  readonly sat = input.required<ServerskiSat>();
  readonly kompaktno = input(false);

  private readonly obavestenja = inject(NotificationStore);
  private readonly skladiste = bezbednoSkladiste();
  private readonly sada = signal(Date.now());

  protected readonly pustiFokus = pustiFokusPosleKlika;
  protected readonly poznat = computed(() => typeof this.pocetakMs() === 'number');
  private readonly serversko = computed(() => this.sat().sada(this.sada()));

  private readonly stoperica = linkedSignal<Stoperica | null>(() => {
    const pocetak = this.pocetakMs();
    return typeof pocetak === 'number' ? ucitajStopericu(this.skladiste, this.izvodjenjeId(), pocetak) : null;
  });
  protected readonly pauzirana = computed(() => this.stoperica()?.pauzaOd != null);
  protected readonly prikaz = computed(() => {
    const s = this.stoperica();
    return s ? formatTrajanja(proteklo(s, this.serversko())) : '–:––';
  });
  protected readonly satPrikaz = computed(() => formatSata(this.serversko()));

  constructor() {
    const interval = setInterval(() => this.sada.set(Date.now()), OSVEZAVANJE_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

  protected preklopi(): void {
    const s = this.stoperica();
    if (!s) return;
    const sad = this.serversko();
    this.postavi(s.pauzaOd === null ? pauziraj(s, sad) : nastavi(s, sad));
  }

  protected nulujStopericu(): void {
    const prethodna = this.stoperica();
    if (!prethodna) return;
    this.postavi(nuluj(prethodna, this.serversko()));
    this.obavestenja.uspeh('Štoperica je nulovana.', { label: 'Poništi', run: () => this.postavi(prethodna) });
  }

  private postavi(s: Stoperica): void {
    this.stoperica.set(s);
    sacuvajStopericu(this.skladiste, this.izvodjenjeId(), s);
  }
}
