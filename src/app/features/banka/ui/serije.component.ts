import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { formatDatum } from '../../../shared/util/datum.pipe';
import { sRecju } from '../../../shared/util/mnozina';
import { SerijaInfo } from '../data-access/banka.models';

/** "3 nacrta, 1 odobrena, 1 grupa, 0 slajdova": brojači serije koje lista prikazuje (i nule, da se vidi napredak pregleda). */
export function brojaciSerije(s: SerijaInfo): string {
  return [
    sRecju(s.nacrta, 'nacrt', 'nacrta', 'nacrta'),
    sRecju(s.odobrenih, 'odobrena', 'odobrene', 'odobrenih'),
    sRecju(s.grupa, 'grupa', 'grupe', 'grupa'),
    sRecju(s.slajdova, 'slajd', 'slajda', 'slajdova'),
  ].join(', ');
}

/**
 * Klodove serije predmeta (sekcija ispod stabla na `/banka`): jedna serija je jedan Klodov posao (oznaka koju nosi sve što je
 * u njemu napravio). Poslednje prve (po `poslednja`, i kad server pošalje drugim redom), sa brojačima i vremenom poslednjeg upisa,
 * i vezom "Pregledaj" na pregled nacrta te serije (`/banka/pregled?predmet&serija`). Prazna lista ne prikazuje ništa.
 */
@Component({
  selector: 'app-serije',
  imports: [MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sekcije-stabla.css',
  template: `
    @if (sortirane().length > 0) {
      <section class="lista-kartica bk-sek" aria-labelledby="bk-naslov-serija">
        <h2 id="bk-naslov-serija" class="bk-sek-naslov">Klodove serije</h2>
        <ul class="bk-sek-lista">
          @for (s of sortirane(); track s.serija) {
            <li class="bk-sek-stavka" [attr.data-serija]="s.serija">
              <span class="bk-sek-tekst">
                <span class="bk-sr-ime">{{ s.serija }}</span>
                <span class="bk-sek-sporedno bk-sr-brojaci">{{ brojaci(s) }}</span>
                <span class="bk-sek-sporedno bk-sr-vreme">poslednji upis {{ vreme(s) }}</span>
              </span>
              <a matButton routerLink="/banka/pregled" [queryParams]="{ predmet: predmetId(), serija: s.serija }"
                [attr.aria-label]="'Pregledaj seriju ' + s.serija" data-pregledaj>Pregledaj</a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class SerijeComponent {
  readonly serije = input.required<readonly SerijaInfo[]>();
  /** Predmet serija (ide u vezu pregleda). */
  readonly predmetId = input.required<number>();

  protected readonly brojaci = brojaciSerije;
  protected readonly sortirane = computed(() => [...this.serije()].sort((a, b) => b.poslednja.localeCompare(a.poslednja)));

  protected vreme(s: SerijaInfo): string {
    return formatDatum(s.poslednja, 'sa-vremenom');
  }
}
