import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { SledecePredavanjeInfo } from '../../../core/api/pregled.api';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { mnozina } from '../data-access/pocetna.vreme';

/**
 * P1 "Sledeće predavanje": predmet i grupa poslednjeg predavanja, redni broj + 1 (samo predlog), danas, broj studenata i
 * starijih. "Započni predavanje" odmah pokreće predavanje (roditelj zove `POST predavanja/start` pa otvara detalj);
 * "Drugi predmet ili grupa" vodi na formu. Bez ijednog predavanja: "Započni prvo predavanje". Poslednje predavanje bez
 * grupe ne može da se pokrene jednim klikom (nema grupe), pa je tada primarna akcija forma sa predizabranim predmetom.
 * Motiv pruga iz logoa je dekoracija (CSS, kao u maketi).
 */
@Component({
  selector: 'app-sledece-predavanje',
  imports: [MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero ljuska-tamna" aria-labelledby="sledece-naslov">
      <span class="eyebrow">Sledeće predavanje</span>
      @if (sledece(); as s) {
        <h2 id="sledece-naslov">
          {{ s.predmet.naziv }}<br />Predavanje {{ s.rb }} · {{ s.grupa?.naziv ?? '—' }}
        </h2>
        <div class="meta">
          <span class="pill">danas, {{ danas() }}</span>
          @if (s.grupa) {
            <span class="pill" data-studenata>{{ studenata() }}</span>
            @if (s.brojStarijih > 0) {
              <span class="pill" data-starijih>+ {{ starijih() }}</span>
            }
          } @else {
            <span class="pill">grupa nije poznata</span>
          }
        </div>
        <div class="red">
          @if (s.grupa) {
            <button matButton="filled" type="button" class="glavno" data-zapocni [disabled]="salje()" (click)="zapocni.emit()">
              Započni predavanje
            </button>
          }
          <a matButton="outlined" class="sporedno" data-drugo [routerLink]="['/predavanja/novo']"
             [queryParams]="s.grupa ? null : { predmet: s.predmet.id }">{{ s.grupa ? 'Drugi predmet ili grupa' : 'Izaberi grupu' }}</a>
        </div>
      } @else {
        <h2 id="sledece-naslov">Još nema nijednog predavanja</h2>
        <p class="objasnjenje">Predmet i grupa se biraju pri prvom predavanju; posle toga se ovde nudi sledeće.</p>
        <div class="red">
          <a matButton="filled" class="glavno" data-prvo [routerLink]="['/predavanja/novo']">Započni prvo predavanje</a>
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .hero { position: relative; display: grid; gap: 14px; padding: 22px 24px; overflow: hidden; border-radius: var(--radius);
      background: var(--hero-bg); color: var(--hero-ink); }
    /* Motiv pruga iz logoa */
    .hero::after { content: ""; position: absolute; right: -40px; top: -40px; width: 220px; height: 220px; border-radius: 50%;
      background: repeating-linear-gradient(180deg, rgba(255, 255, 255, .16) 0 7px, transparent 7px 14px);
      clip-path: inset(0 50% 0 0); pointer-events: none; }
    .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
    h2 { font-size: 26px; line-height: 1.15; color: inherit; }
    .objasnjenje { margin: 0; max-width: 52ch; opacity: .85; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { padding: 4px 10px; border-radius: var(--chip-radius, 999px); background: rgba(255, 255, 255, .16);
      font-size: 12.5px; font-weight: 600; }
    .red { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px; }
    .glavno { --mat-button-filled-container-color: #fff; --mat-button-filled-label-text-color: var(--hero-btn-ink);
      --mat-button-filled-disabled-container-color: rgba(255, 255, 255, .5); height: 48px; padding: 0 22px; font-size: 16px; }
    .sporedno { --mat-button-outlined-label-text-color: #fff; --mat-button-outlined-outline-color: rgba(255, 255, 255, .45);
      height: 48px; padding: 0 22px; font-size: 16px; }
    @media (max-width: 599.98px) {
      .hero { padding: 18px 16px; }
      h2 { font-size: 22px; }
      .red > * { flex: 1 1 100%; }
    }
  `,
})
export class SledecePredavanje {
  readonly sledece = input.required<SledecePredavanjeInfo | null>();
  /** Trenutak za "danas"; roditelj ga daje (jedan sat za ceo ekran). */
  readonly sada = input.required<Date>();
  /** Pokretanje je u toku (dugme je onemogućeno protiv dvostrukog klika). */
  readonly salje = input(false);
  readonly zapocni = output<void>();

  protected readonly danas = computed(() => formatDatum(this.sada(), 'kratko'));
  protected readonly studenata = computed(() => mnozina(this.sledece()?.brojStudenata ?? 0, 'student', 'studenta', 'studenata'));
  protected readonly starijih = computed(() => mnozina(this.sledece()?.brojStarijih ?? 0, 'stariji', 'starija', 'starijih'));
}
