import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { asyncScheduler, catchError, distinctUntilChanged, EMPTY, filter, map, switchMap, throttleTime } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { RangApi, RangTacnostiStavka } from '../../../core/api/rang.api';
import { PreferencesStore, RANG_NA_TABLI } from '../../../core/state/preferences.store';
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
 * nastavnik; na projektor ga šalju L i Shift+L. "Na tabli" (svi, prvih 10, prvih 5) je nastavnikova postavka u pregledaču
 * (`PreferencesStore.rangNaTabli`, važi za sva izvođenja): kartica je šalje serveru komandom `RANG_BROJ` kad se konzola
 * otvori i kad se izbor promeni.
 */
@Component({
  selector: 'app-rang-konzola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RangTacnostiTabela, UcesniciPanelComponent],
  styles: `
    :host { display: block; }
    .uz-kon-rang-greska { margin: 8px 0 0; color: var(--danger); font-size: 13px; }
    .uz-kon-rang-dno { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px;
      margin-top: 6px; }
    .uz-kon-rang-napomena { margin: 0; color: var(--muted); font-size: 12px; }
    .uz-kon-rang-tabla { display: inline-flex; align-items: center; gap: 4px; margin: 0; padding: 0; border: 0;
      color: var(--muted); font-size: 12px; }
    .uz-kon-rang-tabla legend { float: left; margin-right: 4px; padding: 0; }
    .uz-kon-rang-tabla button { min-height: 26px; padding: 0 8px; border: 1px solid var(--line); border-radius: 999px;
      background: var(--surface); color: var(--ink-2); font: inherit; font-size: 12px; cursor: pointer; }
    .uz-kon-rang-tabla button[aria-pressed='true'] { border-color: var(--primary); background: var(--primary-soft);
      color: var(--primary-soft-ink); font-weight: 600; }
    .uz-kon-rang-tabla button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
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
          <ng-container *ngTemplateOutlet="dno; context: { napomena: 'Redosled: ★, pa prosečno vreme. Neodgovoreno je netačno.' }" />
        }
        @case ('predavanje') {
          <app-rang-tacnosti-tabela [stavke]="rangPredavanja() ?? []" [kolone]="['izvodjenja']" [zbijeno]="true"
                                    [prazno]="rangPredavanja() ? 'Još nema zatvorenih pitanja sa tačnim odgovorom.' : 'Učitavanje…'" />
          <ng-container *ngTemplateOutlet="dno; context: { napomena: 'Sve prezentacije ovog predavanja zajedno.' }" />
        }
      }
    </div>
    <ng-template #dno let-napomena="napomena">
      <div class="uz-kon-rang-dno">
        <p class="uz-kon-rang-napomena">{{ napomena }}</p>
        <fieldset class="uz-kon-rang-tabla">
          <legend>Na tabli:</legend>
          @for (b of naTabliIzbori; track b) {
            <button type="button" [attr.aria-pressed]="naTabli() === b" (click)="prefs.postaviRangNaTabli(b)">{{ b ? 'Prvih ' + b : 'Svi' }}</button>
          }
        </fieldset>
      </div>
    </ng-template>
    @if (greska(); as g) { <p class="uz-kon-rang-greska" role="alert">{{ g }}</p> }
  `,
})
export class RangKonzolaComponent {
  readonly stanje = input.required<NastavnickoStanje>();
  readonly preimenuj = output<{ id: number; ime: string }>();
  readonly izbaci = output<number>();
  /** Koliko redova ranga ide na projektor (`RANG_BROJ`: 0 = svi). */
  readonly rangBroj = output<number>();

  private readonly api = inject(RangApi);
  protected readonly prefs = inject(PreferencesStore);
  protected readonly naTabliIzbori = RANG_NA_TABLI;
  protected readonly naTabli = this.prefs.rangNaTabli;
  /** `verzija` stanja na koju je poslat `RANG_BROJ` (jednom po verziji, pa nema petlje ni kad server zaostane). */
  private poslatoNaVerziji: number | null = null;
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
    // postavka "Na tabli" ide serveru kad se razlikuje od njegove (otvaranje konzole, promena izbora, restart servera);
    // stari backend nema `rangBroj` (undefined) i komandu ne zna, pa mu se ništa ne šalje
    effect(() => {
      const s = this.stanje();
      const zeljeno = this.naTabli();
      if (s.rangBroj === undefined || s.izvodjenje.status !== 'AKTIVNO') return;
      if ((s.rangBroj ?? 0) === zeljeno || this.poslatoNaVerziji === s.verzija) return;
      this.poslatoNaVerziji = s.verzija;
      this.rangBroj.emit(zeljeno);
    });

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
