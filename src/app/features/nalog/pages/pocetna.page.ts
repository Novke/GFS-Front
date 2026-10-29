import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { waLinkZaPrikaz } from '../../../shared/util/wa-link';
import { NalogApi } from '../data-access/nalog.api';
import { StudentJa } from '../data-access/nalog.models';
import { porukaGreske } from '../data-access/nalog.pravila';
import { putanjaPrijave, status } from '../data-access/portal.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';
import { NaredniCasovi } from '../ui/naredni-casovi.component';

/**
 * Tab **Početna** (`/nalog/pocetna`, prvi tab posle prijave): pozdrav po imenu sa grupom i generacijom
 * (`GET api/public/nalog/ja`), dugme **WhatsApp grupa** sopstvene grupe kad je nastavnik postavio link (stoji i posle
 * pridruživanja, kao prečica; samo kanonski `https://chat.whatsapp.com/<kod>`, `waLinkZaPrikaz`), kartica "Naredni časovi"
 * (`ui/naredni-casovi`, sama čita `api/public/nalog/casovi`) i mesto `[data-instalacija-mesto]` za karticu instalacije
 * aplikacije (zaseban posao). Traku "Predavanje je u toku" i "Prezentacija je počela" crta ljuska (`NalogTabovi`). 401
 * vodi na prijavu sa povratkom ovde.
 */
@Component({
  selector: 'app-pocetna-page',
  imports: [MatButton, MatProgressSpinner, NalogOkvir, NaredniCasovi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Studentski portal">
      @if (ja(); as s) {
        <section class="pozdrav" aria-labelledby="pozdrav-naslov" data-pozdrav>
          <h2 id="pozdrav-naslov">Zdravo, {{ s.ime }}!</h2>
          <p class="uvod">Dobro došli na studentski portal: časovi, predmeti, vežbanje i ocene na jednom mestu.</p>
          @if (grupa(); as g) {
            <p class="grupa">{{ g }}</p>
          }
        </section>
        @if (waLink(); as link) {
          <a class="wa" [href]="link" target="_blank" rel="noopener noreferrer" data-wa-grupa>
            <svg class="wa-ikona" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/>
            </svg>
            <span class="wa-tekst">
              <strong>WhatsApp grupa</strong>
              <span>Obaveštenja i dogovori {{ s.grupa ? 'grupe ' + s.grupa : 'tvoje grupe' }}</span>
            </span>
            <span class="vizuelno-skriveno">(otvara WhatsApp)</span>
          </a>
        }
      } @else if (greska(); as g) {
        <p class="poruka" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <p class="stanje" role="status">
          <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
        </p>
      }
      <div class="naredni"><app-naredni-casovi /></div>
      <div class="instalacija" data-instalacija-mesto></div>
    </app-nalog-okvir>
  `,
  styles: `
    .pozdrav { margin: 0 0 18px; }
    h2 { margin: 0 0 6px; font-size: 22px; line-height: 1.25; overflow-wrap: anywhere; }
    .uvod { margin: 0 0 6px; color: var(--ink-2); }
    .grupa { margin: 0; font-size: 14px; color: var(--muted); }
    .wa {
      display: flex; align-items: center; gap: 14px; margin: 0 0 20px; padding: 14px 16px; min-height: 64px;
      border-radius: var(--radius); background: var(--ok); color: var(--ok-ink); text-decoration: none;
      box-shadow: var(--shadow);
    }
    .wa:hover { filter: brightness(1.06); }
    .wa:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
    .wa-ikona { flex: none; width: 32px; height: 32px; }
    .wa-tekst { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .wa-tekst strong { font-size: 17px; }
    .wa-tekst span { font-size: 14px; opacity: .92; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; margin-bottom: 16px; }
    .poruka {
      margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--danger); border-radius: var(--radius-sm);
      background: var(--danger-soft); color: var(--danger);
    }
    .instalacija:empty { display: none; }
    .vizuelno-skriveno {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0);
      white-space: nowrap; border: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .wa { transition: filter .15s; }
    }
  `,
})
export class PocetnaPage {
  private readonly api = inject(NalogApi);
  private readonly router = inject(Router);

  protected readonly ja = signal<StudentJa | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly waLink = computed(() => waLinkZaPrikaz(this.ja()?.waLink));
  /** `Grupa GD-2026 · generacija 2026`; bez grupe i generacije (stari backend) ništa. */
  protected readonly grupa = computed(() => {
    const s = this.ja();
    const delovi = [s?.grupa ? `Grupa ${s.grupa}` : null, s?.generacija ? `generacija ${s.generacija}` : null];
    return delovi.filter(Boolean).join(' · ');
  });
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.zahtev = this.api.ja().subscribe({
      next: ja => this.ja.set(ja),
      error: (e: unknown) => {
        if (status(e) === 401) {
          void this.router.navigateByUrl(putanjaPrijave(this.router.url));
        } else {
          this.greska.set(porukaGreske(e));
        }
      },
    });
  }
}
