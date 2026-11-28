import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, inject, input, numberAttribute, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { KonzolaTesta } from '../data-access/online.models';
import { satTesta } from '../data-access/online.pravila';

/** Projektor čita konzolu na 3 s (isti upit kao tab Uživo), samo dok je tab vidljiv. */
export const OSVEZAVANJE_PROJEKTORA_MS = 3_000;

/**
 * Projektor online testa (`/testovi/:id/projektor`, `ProjectorLayout`, plan 6): veliki sat (rok smene po satu servera), adresa
 * za prijavu računara (`<base>/r`), ulazni kod kad ga test traži i „Predalo 9 od 14“. **Bez imena** studenata.
 */
@Component({
  selector: 'app-test-projektor',
  imports: [MatButton, MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alati">
      <a matButton [routerLink]="['/testovi', id()]"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Nazad na test</a>
    </div>
    @if (k(); as k) {
      <div class="ekran" data-projektor-testa>
        <section class="levo">
          <p class="oznaka">{{ naslovStanja() }}</p>
          <p class="sat" role="timer" aria-live="off" data-sat>{{ sat() }}</p>
          <p class="predalo" data-predalo>Predalo {{ k.predalo }} od {{ k.ukupno }}</p>
          <p class="uslo">Ušlo {{ k.usli }}</p>
        </section>
        <section class="desno">
          <p class="oznaka">Prijava na računaru</p>
          <p class="adresa" data-adresa>{{ adresa }}</p>
          @if (k.smena.ulazniKod; as kod) {
            <p class="oznaka">Ulazni kod</p>
            <p class="kod" data-ulazni-kod>{{ kod }}</p>
          }
        </section>
      </div>
    } @else if (greska(); as g) {
      <p class="greska" role="alert">{{ g }}</p>
    } @else {
      <p class="tiho">Učitavanje…</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; padding: 16px 24px; box-sizing: border-box; }
    .alati { display: flex; gap: 8px; }
    .ekran { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
    .levo, .desno { display: flex; flex-direction: column; gap: 8px; }
    .oznaka { margin: 0; color: var(--ink-2); font-size: 28px; font-weight: 600; }
    .sat { margin: 0; font-family: var(--font-mono); font-size: clamp(96px, 16vw, 240px); font-weight: 700; line-height: 1;
      font-variant-numeric: tabular-nums; }
    .predalo { margin: 16px 0 0; font-size: 48px; font-weight: 700; }
    .uslo { margin: 0; color: var(--ink-2); font-size: 28px; }
    .adresa { margin: 0 0 32px; font-family: var(--font-mono); font-size: clamp(32px, 4vw, 64px); font-weight: 700; overflow-wrap: anywhere; }
    .kod { margin: 0; font-family: var(--font-mono); font-size: clamp(64px, 10vw, 160px); font-weight: 700; letter-spacing: .15em; }
    .greska, .tiho { margin: 48px auto; font-size: 24px; }
  `,
})
export class TestProjektor {
  readonly id = input.required({ transform: numberAttribute });

  private readonly api = inject(OnlineTestoviApi);
  private readonly dokument = inject(DOCUMENT);
  protected readonly k = signal<KonzolaTesta | null>(null);
  protected readonly greska = signal<string | null>(null);
  private readonly pomak = signal(0);
  private readonly sada = signal(Date.now());
  /** Adresa za prijavu računara bez protokola (čita se sa platna). */
  protected readonly adresa = new URL('r', this.dokument.baseURI).href.replace(/^https?:\/\//u, '');

  protected readonly sat = computed(() => {
    const k = this.k();
    return k ? satTesta(k.stanje, k.smena.rokMs, this.pomak(), this.sada(), null) : '';
  });
  protected readonly naslovStanja = computed(() => {
    switch (this.k()?.stanje) {
      case 'PRIPREMA': return 'Test još nije otvoren';
      case 'ULAZ': return 'Ulaz je otvoren · čeka se početak';
      case 'U_TOKU': return 'Preostalo vreme';
      default: return 'Test je završen';
    }
  });

  private zahtev?: Subscription;

  constructor() {
    const upit = () => {
      if (this.dokument.visibilityState === 'hidden' || (this.zahtev && !this.zahtev.closed)) return;
      this.zahtev = this.api.konzola(this.id(), { tiho: true }).subscribe({
        next: k => {
          this.k.set(k);
          this.pomak.set(k.serverVremeMs - Date.now());
          this.greska.set(null);
        },
        error: () => {
          if (!this.k()) this.greska.set('Stanje testa nije učitano. Pokušavam ponovo.');
        },
      });
    };
    const tik = setInterval(() => this.sada.set(Date.now()), 1_000);
    const t = setInterval(upit, OSVEZAVANJE_PROJEKTORA_MS);
    queueMicrotask(upit);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tik);
      clearInterval(t);
      this.zahtev?.unsubscribe();
    });
  }
}
