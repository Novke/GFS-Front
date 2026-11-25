import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { nazivVezbe, OZNAKA_VRSTE, SaVezbom } from '../../core/api/redosled-prezentacija';

export type PrezentacijaZaPlocicu = Pick<SaVezbom, 'vezba' | 'vrsta'> & { brojFajlova?: number };

/** Tekst pločice za čitač ekrana i `title`: "Vežbe 5 · zadaci · ima fajlove za skidanje". */
export function opisPlocice(p: PrezentacijaZaPlocicu): string {
  const delovi = [nazivVezbe(p.vezba), OZNAKA_VRSTE[p.vrsta]];
  if (p.brojFajlova) delovi.push('ima fajlove za skidanje');
  return delovi.join(' · ');
}

/**
 * Obojena pločica prezentacije u listama: boja je vrsta (plava pitanja, narandžasta zadaci, bela gradivo), u sredini broj
 * vežbe, u donjem desnom uglu znak vrste (`?` samo pitanja, olovka čim ima zadataka, gradivo bez znaka). Strelica u gornjem
 * desnom uglu znači da prezentacija ima fajlove za skidanje i ne zavisi od vrste. Bez broja vežbe znak vrste je u sredini.
 * Vrsta se nikad ne vidi samo po boji: tu su znak i tekst (`opisPlocice`).
 */
@Component({
  selector: 'app-plocica-prezentacije',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
  host: { role: 'img', '[attr.aria-label]': 'opis()', '[attr.title]': 'opis()', '[class]': `'vrsta-' + prezentacija().vrsta` },
  template: `
    @if (prezentacija().vezba !== null) {
      <span class="broj" data-broj-vezbe>{{ prezentacija().vezba }}</span>
      @switch (prezentacija().vrsta) {
        @case ('PITANJA') { <span class="znak dole" data-znak="PITANJA">?</span> }
        @case ('ZADACI') { <span class="znak dole" data-znak="ZADACI"><mat-icon svgIcon="edit" /></span> }
      }
    } @else {
      @switch (prezentacija().vrsta) {
        @case ('PITANJA') { <span class="broj" data-znak="PITANJA">?</span> }
        @case ('ZADACI') { <mat-icon class="veliki" svgIcon="edit" data-znak="ZADACI" /> }
        @default { <mat-icon class="veliki" svgIcon="co_present" /> }
      }
    }
    @if (prezentacija().brojFajlova) {
      <span class="znak gore" data-znak="FAJL"><mat-icon svgIcon="download" /></span>
    }
  `,
  styles: `
    :host { position: relative; flex: none; display: inline-grid; place-items: center; width: 40px; height: 40px;
      border: 1.5px solid transparent; border-radius: var(--radius); line-height: 1; }
    :host(.vrsta-GRADIVO) { background: var(--surface); color: var(--ink-2); border-color: var(--line); }
    :host(.vrsta-PITANJA) { background: var(--primary); color: var(--primary-ink); }
    :host(.vrsta-ZADACI) { background: var(--accent); color: var(--accent-ink); }
    .broj { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .veliki { width: 22px; height: 22px; font-size: 22px; }
    .znak { position: absolute; right: -8px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
      border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; }
    .dole { bottom: -7px; }
    .gore { top: -7px; }
    .znak mat-icon { width: 14px; height: 14px; font-size: 14px; }
  `,
})
export class PlocicaPrezentacije {
  readonly prezentacija = input.required<PrezentacijaZaPlocicu>();
  protected readonly opis = computed(() => opisPlocice(this.prezentacija()));
}
