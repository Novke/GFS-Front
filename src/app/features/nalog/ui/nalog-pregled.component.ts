import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { DatumPipe } from '../../../shared/util/datum.pipe';
import { StudentJa } from '../data-access/nalog.models';

/**
 * Prijavljen student (spec prijave 5.1 tačka 5): indeks, ime, maska mejla, Moodle, uređaji, "Odjavi se" i "Odjavi sve
 * uređaje" (potvrdu otvara roditelj). Prezentaciona komponenta, bez HTTP-a.
 */
@Component({
  selector: 'app-nalog-pregled',
  imports: [DatumPipe, MatButton, MatProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = ja();
    <dl class="podaci">
      <dt>Ime</dt><dd>{{ s.ime }} {{ s.prezime }}</dd>
      <dt>Indeks</dt><dd class="mono">{{ s.indeks }}@if (s.godina) {/{{ s.godina }}}</dd>
      <dt>Mejl</dt><dd>{{ s.maskaMejla ?? '—' }}</dd>
      <dt>Moodle</dt><dd>{{ s.moodlePovezan ? 'povezan' : 'nije povezan' }}</dd>
    </dl>

    @if (nastaviNa()) {
      <button type="button" mat-flat-button class="dugme" (click)="nastavi.emit()">Nastavi</button>
    }

    <h3 id="naslov-uredjaja">Prijavljeni uređaji</h3>
    @if (s.uredjaji.length === 0) {
      <p class="prazno">Nema prijavljenih uređaja.</p>
    } @else {
      <ul class="uredjaji" aria-labelledby="naslov-uredjaja">
        @for (u of s.uredjaji; track u.id) {
          <li>
            <span class="opis">{{ u.opis }}</span>
            @if (u.trenutni) {
              <span class="cip">Ovaj uređaj</span>
            }
            <span class="detalj">
              {{ u.nacin === 'LTI' ? 'Moodle' : 'Kod na mejl' }} · prvi put {{ u.prviUlaz | datum: 'sa-vremenom' }} ·
              poslednji put {{ u.poslednjiUlaz | datum: 'sa-vremenom' }}
            </span>
          </li>
        }
      </ul>
    }

    <div class="akcije">
      <button type="button" matButton="outlined" [disabled]="salje()" (click)="odjavi.emit()">
        @if (salje()) {
          <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
        }
        Odjavi se
      </button>
      <button type="button" matButton="outlined" class="destruktivno" [disabled]="salje()" (click)="odjaviSvuda.emit()">
        Odjavi sve uređaje
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .podaci { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0 0 18px; }
    .podaci dt { color: var(--muted); }
    .podaci dd { margin: 0; overflow-wrap: anywhere; }
    .mono { font-family: var(--font-mono); }
    .dugme { width: 100%; min-height: 48px; margin-bottom: 18px; font-size: 16px; }
    h3 { margin: 0 0 8px; font-size: 16px; }
    .prazno { color: var(--muted); }
    .uredjaji { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
    .uredjaji li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 10px 0;
      border-bottom: 1px solid var(--line); }
    .opis { font-weight: 600; overflow-wrap: anywhere; }
    .cip { padding: 2px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--primary-soft-ink);
      font-size: 12px; font-weight: 600; }
    .detalj { flex-basis: 100%; color: var(--ink-2); font-size: 14px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .akcije button { min-height: 44px; }
    .akcije mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .destruktivno { --mat-button-outlined-label-text-color: var(--danger); }
  `,
})
export class NalogPregled {
  readonly ja = input.required<StudentJa>();
  /** Bezbedna putanja za "Nastavi" (`nazad`), ili `null`: tada dugmeta nema. */
  readonly nastaviNa = input<string | null>(null);
  readonly salje = input(false);
  readonly odjavi = output<void>();
  readonly odjaviSvuda = output<void>();
  readonly nastavi = output<void>();
}
