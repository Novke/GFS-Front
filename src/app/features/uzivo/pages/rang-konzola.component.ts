import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
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
 * Kartica "Učesnici i rang" u konzoli (rang tačnosti, spec 5): ARIA tabovi (bez `MatTabGroup`: njegovi posmatrači veličine
 * remete merenje formula na umanjenom projektoru, e2e `uzivo-formule-tekst`) "Ovo pitanje" (učesnici po brzini odgovora na
 * trenutnu rundu, sa ishodom i kratkim odgovorom), "Prezentacija" (rang ovog izvođenja) i "Predavanje" (zbir svih
 * izvođenja predavanja; samo kad izvođenje ima predavanje). Rang se učitava samo dok je njegov tab otvoren, kad se
 * promeni runda, faza, broj odgovora ili tačan odgovor, najviše jednom u {@link RANG_OSVEZAVANJE_MS}. Vidi ga samo
 * nastavnik; na projektor ga šalju L i Shift+L.
 */
@Component({
  selector: 'app-rang-konzola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RangTacnostiTabela, UcesniciPanelComponent],
  styles: `
    :host { display: block; }
    .uz-kon-rang-greska { margin: 8px 0 0; color: var(--danger); font-size: 13px; }
    .uz-kon-rang-napomena { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .uz-kon-rang-zaglavlje { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 4px 12px;
      margin-bottom: 6px; border-bottom: 1px solid var(--line); }
    .uz-kon-rang-zaglavlje .uz-kon-naslov { margin: 0 0 8px; }
    .uz-kon-rang-tabovi { display: flex; gap: 2px; }
    .uz-kon-rang-tab { min-height: 32px; padding: 0 8px; border: 0; border-bottom: 2px solid transparent; background: none;
      color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .uz-kon-rang-tab:hover { color: var(--ink); }
    .uz-kon-rang-tab[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--primary); }
    .uz-kon-rang-tab:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  `,
  template: `
    <!-- naslov i tabovi u istom redu: kartica ne sme da bude viša od stare "Učesnici" (konzola 1366 x 768 bez skrola) -->
    <div class="uz-kon-rang-zaglavlje">
      <h2 class="uz-kon-naslov">
        Učesnici i rang
        @if (stanje().rangListaPrikazana) {
          <span class="uz-cip">{{ stanje().rangPrikaz === 'PREDAVANJE' ? 'rang predavanja' : 'rang' }} na projektoru</span>
        }
      </h2>
      <div class="uz-kon-rang-tabovi" role="tablist" aria-label="Učesnici i rang">
        @for (t of tabovi(); track t.id) {
          <button type="button" role="tab" class="uz-kon-rang-tab" [id]="'uz-kon-rang-tab-' + t.id"
                  [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="'uz-kon-rang-panel-' + t.id"
                  [tabIndex]="tab() === t.id ? 0 : -1" (click)="tab.set(t.id)" (keydown)="strelice($event)">{{ t.naslov }}</button>
        }
      </div>
    </div>
    <div class="uz-kon-rang-telo" role="tabpanel" [id]="'uz-kon-rang-panel-' + tab()" [attr.aria-labelledby]="'uz-kon-rang-tab-' + tab()"
         [attr.data-rang]="tab() === 'pitanje' ? null : tab()">
      @switch (tab()) {
        @case ('pitanje') {
          <app-ucesnici-panel [ucesnici]="stanje().ucesnici" [takmicenje]="stanje().takmicenje" [zadatak]="stanje().zadatak ?? null"
                              (preimenuj)="preimenuj.emit($event)" (izbaci)="izbaci.emit($event)" />
        }
        @case ('prezentacija') {
          <app-rang-tacnosti-tabela [stavke]="rangIzvodjenja() ?? []" [kolone]="koloneIzvodjenja()" [zbijeno]="true"
                                    [prazno]="rangIzvodjenja() ? 'Još nema zatvorenih pitanja sa tačnim odgovorom.' : 'Učitavanje…'" />
          <p class="uz-kon-rang-napomena">Tačnost: neodgovoreno pitanje je netačno. Pa prosečno vreme odgovora, pa ★.</p>
        }
        @case ('predavanje') {
          <app-rang-tacnosti-tabela [stavke]="rangPredavanja() ?? []" [kolone]="['izvodjenja']" [zbijeno]="true"
                                    [prazno]="rangPredavanja() ? 'Još nema zatvorenih pitanja sa tačnim odgovorom.' : 'Učitavanje…'" />
          <p class="uz-kon-rang-napomena">Sva izvođenja ovog predavanja zajedno.</p>
        }
      }
    </div>
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
  protected readonly tabovi = computed<{ id: RangTab; naslov: string }[]>(() => [
    { id: 'pitanje', naslov: 'Ovo pitanje' },
    { id: 'prezentacija', naslov: 'Prezentacija' },
    ...(this.predavanjeId() ? [{ id: 'predavanje' as const, naslov: 'Predavanje' }] : []),
  ]);

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

  /** Strelice levo/desno, Home i End menjaju tab (ARIA tabovi; prečice konzole ih na `role="tab"` ne hvataju). */
  protected strelice(e: KeyboardEvent): void {
    const t = this.tabovi();
    const i = t.findIndex(x => x.id === this.tab());
    const novi = e.key === 'ArrowRight' ? (i + 1) % t.length : e.key === 'ArrowLeft' ? (i - 1 + t.length) % t.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? t.length - 1 : null;
    if (novi === null) return;
    e.preventDefault();
    this.tab.set(t[novi].id);
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[novi]?.focus();
  }
}
