import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { StatusChip } from '../../../shared/ui/status-chip';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { OnlineTest, RezultatiTesta, StudentRezultata } from '../data-access/online.models';
import { NAZIV_STANJA_PRIMERKA, TON_STANJA_PRIMERKA, formatPoena } from '../data-access/online.pravila';
import { PrimerakDialog } from './primerak-dialog';

/**
 * Tab **Studenti** online testa (spec 13, plan 4.4): rezultati po studentu i zadatku (ručni zadaci bez poena su označeni),
 * prosek i tačnost po zadatku; klik na studenta otvara primerak (odgovori, ključ, ručni poeni).
 */
@Component({
  selector: 'app-online-rezultati',
  imports: [StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (r(); as r) {
      <div class="tabela-okvir">
        <table class="tabela">
          <caption class="sr-only">Rezultati online testa</caption>
          <thead>
            <tr>
              <th scope="col">Student</th><th scope="col">Grupa</th><th scope="col">Stanje</th>
              @for (s of r.stavke; track s.rb) { <th scope="col" class="broj" [title]="s.naziv">{{ s.rb }}</th> }
              <th scope="col" class="broj">Ukupno</th><th scope="col">Znaci</th>
            </tr>
          </thead>
          <tbody>
            @for (s of r.studenti; track s.primerakId) {
              <tr [attr.data-rezultat-studenta]="s.primerakId">
                <td><button type="button" class="link" (click)="otvori(s)" data-otvori-primerak>{{ s.prezime }} {{ s.ime }}</button>
                  <span class="tiho">&nbsp;· {{ s.indeks }}</span></td>
                <td>{{ s.grupaTesta ?? '—' }}</td>
                <td><app-status-chip [tekst]="stanje(s)" [ton]="ton(s)" />@if (s.prepisivao) { <app-status-chip tekst="Prepisivao" ton="danger" /> }</td>
                @for (z of s.zadaci; track z.rb) {
                  <td class="broj" [class.ceka]="z.rucno && z.poeni === null">{{ z.rucno && z.poeni === null ? 'ručno' : poeni(z.poeni) }}</td>
                }
                <td class="broj"><strong>{{ poeni(s.poeni) }}</strong>@if (r.pragProlaza !== null && s.poeni !== null) { <span class="tiho"> {{ s.poeni >= r.pragProlaza ? '✓' : '' }}</span> }</td>
                <td class="tiho">{{ s.znaci.join(', ') }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="3">Prosek · tačnost</th>
              @for (s of r.stavke; track s.rb) {
                <td class="broj">{{ poeni(s.prosek) }}<br><span class="tiho">{{ s.tacnost === null ? '—' : round(s.tacnost * 100) + ' %' }}</span></td>
              }
              <td colspan="2" class="tiho">od {{ poeni(r.maxPoena) }}@if (r.pragProlaza !== null) { · prag {{ poeni(r.pragProlaza) }} }</td>
            </tr>
          </tfoot>
        </table>
      </div>
    } @else {
      <p class="tiho">Učitavanje rezultata…</p>
    }
  `,
  styles: `
    .tabela-okvir { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
    .tabela th { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; text-align: left; }
    .tabela td { padding: 6px 10px; border-bottom: 1px solid var(--line); }
    .broj { font-family: var(--font-mono); text-align: right; white-space: nowrap; }
    .ceka { color: var(--warn); font-weight: 600; }
    .tiho { color: var(--ink-2); font-weight: 400; }
    .link { padding: 0; border: 0; background: none; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
    .link:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
})
export class OnlineRezultati {
  readonly test = input.required<OnlineTest>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  protected readonly r = signal<RezultatiTesta | null>(null);
  protected readonly poeni = formatPoena;
  protected readonly round = Math.round;
  protected readonly stanje = (s: StudentRezultata) => NAZIV_STANJA_PRIMERKA[s.stanje];
  protected readonly ton = (s: StudentRezultata) => TON_STANJA_PRIMERKA[s.stanje];

  constructor() {
    effect(() => {
      const id = this.test().testId;
      untracked(() => this.ucitaj(id));
    });
  }

  private ucitaj(id: number): void {
    this.api.rezultati(id).subscribe(r => this.r.set(r));
  }

  protected otvori(s: StudentRezultata): void {
    PrimerakDialog.otvori(this.dialog, this.test().testId, s.primerakId).subscribe(promenjeno => {
      if (promenjeno) this.ucitaj(this.test().testId);
    });
  }
}
