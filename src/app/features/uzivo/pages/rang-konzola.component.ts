import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatTabsModule } from '@angular/material/tabs';
import { asyncScheduler, catchError, distinctUntilChanged, EMPTY, filter, map, switchMap, throttleTime } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { RangApi, RangTacnostiStavka } from '../../../core/api/rang.api';
import { RangKolona, RangTacnostiTabela } from '../../../shared/ui/rang-tacnosti-tabela';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { UcesniciPanelComponent } from './ucesnici-panel.component';

/** Najviše jedan zahtev za rang na ovoliko ms dok odgovori stižu (poslednja promena se uvek učita). */
export const RANG_OSVEZAVANJE_MS = 2000;

export type RangTab = 'pitanje' | 'prezentacija' | 'predavanje';

/**
 * Kartica "Učesnici i rang" u konzoli (rang tačnosti, spec 5): tabovi "Ovo pitanje" (učesnici po brzini odgovora na
 * trenutnu rundu, sa ishodom i kratkim odgovorom), "Prezentacija" (rang ovog izvođenja) i "Predavanje" (zbir svih
 * izvođenja predavanja; samo kad izvođenje ima predavanje). Rang se učitava samo dok je njegov tab otvoren, kad se
 * promeni runda, faza, broj odgovora ili tačan odgovor, najviše jednom u {@link RANG_OSVEZAVANJE_MS}. Vidi ga samo
 * nastavnik; na projektor ga šalju L i Shift+L.
 */
@Component({
  selector: 'app-rang-konzola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RangTacnostiTabela, UcesniciPanelComponent],
  styles: `
    :host { display: block; }
    .uz-kon-rang-greska { margin: 8px 0 0; color: var(--danger); font-size: 13px; }
    .uz-kon-rang-napomena { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .uz-kon-rang-telo { padding-top: 8px; }
  `,
  template: `
    <mat-tab-group [selectedIndex]="indeks()" (selectedIndexChange)="izaberi($event)" animationDuration="0ms"
                   mat-stretch-tabs="false" aria-label="Učesnici i rang">
      <mat-tab label="Ovo pitanje">
        <div class="uz-kon-rang-telo">
          <app-ucesnici-panel [ucesnici]="stanje().ucesnici" [takmicenje]="stanje().takmicenje" [zadatak]="stanje().zadatak ?? null"
                              (preimenuj)="preimenuj.emit($event)" (izbaci)="izbaci.emit($event)" />
        </div>
      </mat-tab>
      <mat-tab label="Prezentacija">
        <div class="uz-kon-rang-telo" data-rang="prezentacija">
          <app-rang-tacnosti-tabela [stavke]="rangIzvodjenja() ?? []" [kolone]="koloneIzvodjenja()" [zbijeno]="true"
                                    [prazno]="rangIzvodjenja() ? 'Još nema zatvorenih pitanja sa tačnim odgovorom.' : 'Učitavanje…'" />
          <p class="uz-kon-rang-napomena">Tačnost: neodgovoreno pitanje je netačno. Pa prosečno vreme odgovora, pa ★.</p>
        </div>
      </mat-tab>
      @if (predavanjeId()) {
        <mat-tab label="Predavanje">
          <div class="uz-kon-rang-telo" data-rang="predavanje">
            <app-rang-tacnosti-tabela [stavke]="rangPredavanja() ?? []" [kolone]="['izvodjenja']" [zbijeno]="true"
                                      [prazno]="rangPredavanja() ? 'Još nema zatvorenih pitanja sa tačnim odgovorom.' : 'Učitavanje…'" />
            <p class="uz-kon-rang-napomena">Sva izvođenja ovog predavanja zajedno.</p>
          </div>
        </mat-tab>
      }
    </mat-tab-group>
    @if (greska(); as g) { <p class="uz-kon-rang-greska" role="alert">{{ g }}</p> }
  `,
})
export class RangKonzolaComponent {
  readonly stanje = input.required<NastavnickoStanje>();
  readonly preimenuj = output<{ id: number; ime: string }>();
  readonly izbaci = output<number>();

  private readonly api = inject(RangApi);
  protected readonly tab = signal<RangTab>('pitanje');
  protected readonly rangIzvodjenja = signal<RangTacnostiStavka[] | null>(null);
  protected readonly rangPredavanja = signal<RangTacnostiStavka[] | null>(null);
  protected readonly greska = signal<string | null>(null);

  protected readonly predavanjeId = computed(() => this.stanje().izvodjenje.predavanje?.id ?? null);
  protected readonly koloneIzvodjenja = computed<RangKolona[]>(() => this.stanje().takmicenje ? ['poeni'] : []);
  protected readonly indeks = computed(() => ['pitanje', 'prezentacija', 'predavanje'].indexOf(this.tab()));

  /** Ključ osvežavanja: otvoren tab i ono što menja rang (runda, faza, odgovori, tačan odgovor, učesnici). */
  private readonly kljuc = computed(() => {
    const s = this.stanje();
    const tab = this.tab();
    if (tab === 'pitanje') return null;
    return {
      tab, izvodjenjeId: s.izvodjenje.id, predavanjeId: this.predavanjeId(),
      otisak: [tab, s.izvodjenje.id, s.runda?.id ?? '-', s.faza ?? '-', s.brojOdgovora, s.tacanPrikazan, s.ucesnici.length].join('|'),
    };
  });

  constructor() {
    toObservable(this.kljuc).pipe(
      filter(k => k !== null),
      distinctUntilChanged((a, b) => a.otisak === b.otisak),
      throttleTime(RANG_OSVEZAVANJE_MS, asyncScheduler, { leading: true, trailing: true }),
      switchMap(k => {
        const zahtev = k.tab === 'predavanje' && k.predavanjeId
          ? this.api.predavanje(k.predavanjeId).pipe(map(r => ({ tab: k.tab, rang: r.rang })))
          : this.api.izvodjenje(k.izvodjenjeId).pipe(map(rang => ({ tab: k.tab, rang })));
        return zahtev.pipe(catchError((e: unknown) => {
          this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
          return EMPTY;
        }));
      }),
      takeUntilDestroyed(),
    ).subscribe(({ tab, rang }) => {
      this.greska.set(null);
      (tab === 'predavanje' ? this.rangPredavanja : this.rangIzvodjenja).set(rang);
    });
  }

  protected izaberi(i: number): void {
    this.tab.set((['pitanje', 'prezentacija', 'predavanje'] as const)[i] ?? 'pitanje');
  }
}
