import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ObavestenjeInfo, tekstObavestenja, vezaObavestenja } from '../../../core/api/obavestenja.api';
import { DatumPipe } from '../../../shared/util/datum.pipe';

/** Najviše redova na Početnoj; ostalo je "+N još" (cela lista je u zvonu gornje trake). */
const MAX_REDOVA = 5;

/**
 * "Obaveštenja" uz "Čeka na tebe" (spec prijave, sekcija 6; do najave odsustva "Nalozi"): otvorena obaveštenja ("Ne stiže
 * kod", "Previše zahteva za kod", "Mnogo najava odsustva"). Veza vodi na karticu studenta ili na termin rasporeda (i
 * označava obaveštenje pročitanim); "Rešeno" ga skida sa liste.
 * Obaveštenje bez studenta (indeks koji ne postoji) nema vezu, samo "Rešeno". Prikazuje se samo kad ima otvorenih.
 */
@Component({
  selector: 'app-nalozi-kartica',
  imports: [DatumPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="nalozi-naslov">
      <div class="zaglavlje"><h2 id="nalozi-naslov">Obaveštenja</h2></div>
      <ul class="sanduce">
        @for (o of redovi(); track o.id) {
          <li [attr.data-nalog]="o.id">
            <span class="broj" aria-hidden="true">!</span>
            <div class="tekst">
              <div class="t">{{ tekst(o) }}</div>
              <div class="s">{{ o.kreirano | datum: 'sa-vremenom' }}@if (!o.procitano) { · nepročitano}</div>
            </div>
            <div class="akcije">
              @if (veza(o); as v) {
                <a class="ide" [routerLink]="v.putanja" [queryParams]="v.query" (click)="otvoreno(o)">{{ v.oznaka }}<span class="sr-only"> — {{ tekst(o) }}</span></a>
              }
              <button type="button" class="ide" data-reseno (click)="reseno.emit(o.id)">Rešeno<span class="sr-only"> — {{ tekst(o) }}</span></button>
            </div>
          </li>
        }
      </ul>
      @if (jos() > 0) {
        <p class="jos" data-jos>+{{ jos() }} još · sva otvorena su pod zvonom u gornjoj traci</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .zaglavlje { padding: 14px 18px; border-bottom: 1px solid var(--line); }
    h2 { font-size: 16px; }
    .sanduce { margin: 0; padding: 4px 18px; list-style: none; }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 11px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .broj { display: grid; place-items: center; flex: none; min-width: 30px; height: 30px; border-radius: var(--radius-sm);
      background: var(--warn-soft); color: var(--warn); font-family: var(--font-mono); font-size: 14px; font-weight: 700; }
    .tekst { min-width: 0; flex: 1 1 180px; }
    .akcije { display: flex; gap: 8px; margin-left: auto; }
    .t { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .s { color: var(--muted); font-size: 12.5px; }
    .ide { flex: none; padding: 8px 4px; border: 0; background: none; color: var(--primary); font: inherit; font-size: 13px;
      font-weight: 600; text-decoration: none; cursor: pointer; }
    .ide:hover { text-decoration: underline; }
    .jos { margin: 0; padding: 0 18px 14px; color: var(--muted); font-size: 12.5px; }
  `,
})
export class NaloziKartica {
  /** Otvorena obaveštenja (najnovija prva), npr. `ObavestenjaStore.otvorena()`. */
  readonly stavke = input.required<readonly ObavestenjeInfo[]>();
  /** Ukupno otvorenih (`broj.otvorena`), za "+N još". */
  readonly ukupno = input(0);
  /** Nastavnik je otvorio karticu studenta iz nepročitanog obaveštenja. */
  readonly procitano = output<number>();
  readonly reseno = output<number>();

  protected readonly redovi = computed(() => this.stavke().slice(0, MAX_REDOVA));
  protected readonly jos = computed(() => Math.max(0, Math.max(this.ukupno(), this.stavke().length) - this.redovi().length));
  protected readonly tekst = tekstObavestenja;
  protected readonly veza = vezaObavestenja;

  protected otvoreno(o: ObavestenjeInfo): void {
    if (!o.procitano) {
      this.procitano.emit(o.id);
    }
  }
}
