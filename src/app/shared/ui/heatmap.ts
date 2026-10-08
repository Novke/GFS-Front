import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/** Stanje studenta na predavanju: 0 odsutan, 1 prisutan, 2 zadatak, 3 zvezdica (aktivnosti `PRISUSTVO`/`ZADATAK`/`SA_ZVEZDICOM`). */
export type StanjePrisustva = 0 | 1 | 2 | 3;

export interface HeatmapRed {
  kljuc: number | string;
  /** Ime i prezime. */
  labela: string;
  /** Npr. indeks `GD12/2025`. */
  podlabela?: string | null;
}

export interface HeatmapKolona {
  kljuc: number | string;
  /** Kratko, u zaglavlju (redni broj predavanja). */
  labela: string;
  /** Duže, u opisu ćelije (`Predavanje 2 · 8. 10. 2025.`); bez njega `labela`. */
  naslov?: string | null;
}

export const STANJA_PRISUSTVA = ['odsutan', 'prisutan', 'zadatak', 'zvezdica'] as const;

function stanje(v: unknown): StanjePrisustva {
  return v === 1 || v === 2 || v === 3 ? v : 0;
}

/**
 * Matrica prisustva studenti × predavanja (G3). Jednobojna redna skala iz `--primary` (odsutan prazno, prisutan svetlo,
 * zadatak srednje, zvezdica puno), validirana `dataviz` validatorom za dan i noć; zadatak i zvezdica imaju ikonu, a svaka
 * ćelija tekst za čitač ekrana i `title`, pa boja nikad nije jedini nosilac. Kolona "Ukupno" broji prisustva (1-3).
 * Tabela je sama sebi tabelarni prikaz; široka matrica se skroluje vodoravno unutar okvira (prva kolona ostaje).
 * Stilovi su globalni (`.heatmap` u `styles/_ui.scss`).
 */
@Component({
  selector: 'app-heatmap',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (redovi().length === 0 || kolone().length === 0) {
      <p class="heatmap-prazno">Nema podataka.</p>
    } @else {
      <div class="heatmap-okvir" tabindex="0" role="region" [attr.aria-label]="naslov()">
        <table class="heatmap">
          <caption class="sr-only">{{ naslov() }}</caption>
          <thead>
            <tr>
              <th scope="col" class="ugao">Student</th>
              @for (k of kolone(); track k.kljuc) {
                <th scope="col" [attr.title]="k.naslov || null">{{ k.labela }}</th>
              }
              <th scope="col" class="ukupno-z">Ukupno</th>
            </tr>
          </thead>
          <tbody>
            @for (r of matrica(); track r.red.kljuc) {
              <tr>
                <th scope="row">
                  <span class="labela">{{ r.red.labela }}</span>
                  @if (r.red.podlabela) {
                    <!-- razmak da čitač ekrana ne spoji ime i indeks -->
                    <span class="podlabela">{{ ' ' + r.red.podlabela }}</span>
                  }
                </th>
                @for (c of r.celije; track $index) {
                  <td class="celija" [class]="'n' + c.stanje" [attr.title]="c.opis">
                    @switch (c.stanje) {
                      @case (2) {
                        <mat-icon svgIcon="task_alt" aria-hidden="true" />
                      }
                      @case (3) {
                        <mat-icon svgIcon="star" aria-hidden="true" />
                      }
                    }
                    <span class="sr-only">{{ stanja[c.stanje] }}</span>
                  </td>
                }
                <td class="ukupno">{{ r.prisutan }}/{{ kolone().length }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ul class="legenda heatmap-legenda" aria-label="Legenda">
        @for (s of stanja; track $index) {
          <li>
            <span class="uzorak" [class]="'n' + $index" aria-hidden="true">
              @if ($index === 2) {
                <mat-icon svgIcon="task_alt" />
              } @else if ($index === 3) {
                <mat-icon svgIcon="star" />
              }
            </span>
            {{ s }}
          </li>
        }
      </ul>
    }
  `,
})
export class Heatmap {
  readonly naslov = input('Prisustvo');
  readonly redovi = input<readonly HeatmapRed[]>([]);
  readonly kolone = input<readonly HeatmapKolona[]>([]);
  readonly vrednost = input.required<(r: HeatmapRed, k: HeatmapKolona) => StanjePrisustva>();

  protected readonly stanja = STANJA_PRISUSTVA;

  /** Jedan poziv `vrednost` po ćeliji, pri promeni ulaza (ne pri svakoj detekciji promena). */
  protected readonly matrica = computed(() => {
    const f = this.vrednost();
    const kolone = this.kolone();
    return this.redovi().map(red => {
      const celije = kolone.map(k => {
        const s = stanje(f(red, k));
        return { stanje: s, opis: `${red.labela} · ${k.naslov || k.labela}: ${STANJA_PRISUSTVA[s]}` };
      });
      return { red, celije, prisutan: celije.filter(c => c.stanje > 0).length };
    });
  });
}
