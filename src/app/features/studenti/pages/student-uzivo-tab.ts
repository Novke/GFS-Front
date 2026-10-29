import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { prikazVremena, RangApi, UzivoStudenta, UzivoStudentaRed } from '../../../core/api/rang.api';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatTile } from '../../../shared/ui/stat-tile';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { opcijeSkolskihGodina } from '../../../shared/util/skolska-godina';
import { StudentStore } from '../data-access/student.store';

/** Link časa: predavanje, a izvođenje bez predavanja vodi na svoj pregled. */
export function linkCasa(r: Pick<UzivoStudentaRed, 'predavanjeId' | 'izvodjenjeId'>): string[] | null {
  if (r.predavanjeId) return ['/predavanja', String(r.predavanjeId)];
  if (r.izvodjenjeId) return ['/izvodjenja', String(r.izvodjenjeId), 'pregled'];
  return null;
}

/**
 * Tab "Uživo" profila (rang tačnosti, spec 7): zbir studenta (tačnost, prosečno vreme, ★, broj časova) i red po času
 * (predavanje sa svim njegovim izvođenjima, ili izvođenje bez predavanja): mesto u rangu tog časa, tačnost, vreme, ★.
 * Filteri predmet i školska godina su lokalni (ne u URL-u).
 */
@Component({
  selector: 'app-student-uzivo-tab',
  imports: [ChipSelect, DatumPipe, EmptyState, ErrorPanel, RouterLink, SkeletonRows, StatTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filteri">
      <app-chip-select labela="Predmet" [opcije]="predmeti()" [vrednost]="predmetId()" (vrednostChange)="predmetId.set($event)" />
      <app-chip-select labela="Školska godina" [opcije]="godine" [vrednost]="godina()" (vrednostChange)="godina.set($event)" />
    </div>
    @if (greska(); as g) {
      <app-error-panel [poruka]="g" (ponovo)="ucitaj()" />
    } @else if (podaci(); as p) {
      @if (p.ukupno; as u) {
        <div class="plocice" data-zbir>
          <app-stat-tile labela="Tačnost" [vrednost]="u.procenat === null ? null : u.procenat + '%'" [podtekst]="u.tacnih + '/' + u.dugovanih" />
          <app-stat-tile labela="Prosečno vreme" [vrednost]="vreme(u.prosekMs)" />
          <app-stat-tile labela="Zvezdice ★" [vrednost]="u.zvezdice" />
          <app-stat-tile labela="Časova" [vrednost]="u.casova" />
        </div>
        <section class="lista-kartica" aria-label="Uživo po časovima">
          <div class="tabela-okvir">
            <table class="lista-tabela" data-casovi>
              <thead>
                <tr><th scope="col">Datum</th><th scope="col">Čas</th><th scope="col">Predmet</th><th scope="col" class="br">Mesto</th>
                  <th scope="col" class="br">Tačnost</th><th scope="col" class="br">Prosek</th><th scope="col" class="br">★</th></tr>
              </thead>
              <tbody>
                @for (r of p.casovi; track (r.predavanjeId ?? 0) + '-' + (r.izvodjenjeId ?? 0)) {
                  <tr>
                    <td class="mono">{{ r.datum | datum }}</td>
                    <td>
                      @if (link(r); as l) { <a [routerLink]="l">{{ r.naslov }}</a> } @else { {{ r.naslov }} }
                    </td>
                    <td>{{ r.predmet }}</td>
                    <td class="br">{{ r.stavka.mesto ?? '—' }} <span class="od">od {{ r.ukupnoURangu }}</span></td>
                    <td class="br">{{ r.stavka.procenat === null ? '—' : r.stavka.procenat + '%' }} <span class="od">{{ r.stavka.tacnih }}/{{ r.stavka.dugovanih }}</span></td>
                    <td class="br">{{ vreme(r.stavka.prosekMs) }}</td>
                    <td class="br">{{ r.stavka.zvezdice }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        <p class="napomena">Tačnost: neodgovoreno pitanje je netačno. ★: pitanje 1, zadatak nivo varijante.</p>
      } @else {
        <app-empty-state naslov="Student nije odgovarao na pitanja uživo" ikona="leaderboard"
          tekst="Kad student učestvuje u prezentaciji sa pitanjima koja imaju tačan odgovor, rezultati se vide ovde." />
      }
    } @else {
      <app-skeleton-rows [redovi]="4" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .filteri { display: flex; flex-wrap: wrap; gap: 8px; }
    .plocice { display: flex; flex-wrap: wrap; gap: 8px; }
    .br { text-align: right; white-space: nowrap; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    th.br { font-family: var(--font); }
    .od { margin-left: 4px; color: var(--muted); font-size: 12px; }
    td a { color: var(--ink); font-weight: 600; text-decoration: none; }
    td a:hover { color: var(--primary); text-decoration: underline; }
    .napomena { margin: 0; color: var(--muted); font-size: 13px; }
  `,
})
export class StudentUzivoTab {
  private readonly store = inject(StudentStore);
  private readonly api = inject(RangApi);
  private readonly reference = inject(ReferenceStore);

  protected readonly predmetId = signal<number | null>(null);
  protected readonly godina = signal<number | null>(null);
  protected readonly podaci = signal<UzivoStudenta | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly vreme = prikazVremena;
  protected readonly link = linkCasa;
  protected readonly godine: ChipOpcija<number>[] = opcijeSkolskihGodina(6);
  protected readonly predmeti = computed<ChipOpcija<number>[]>(() =>
    this.reference.predmeti().map(p => ({ vrednost: p.id, labela: p.naziv })));
  private zahtev: Subscription | null = null;

  constructor() {
    this.reference.ucitaj();
    effect(() => {
      const id = this.store.id();
      this.predmetId();
      this.godina();
      if (id !== null) untracked(() => this.ucitaj());
    });
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
  }

  protected ucitaj(): void {
    const id = this.store.id();
    if (id === null) return;
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.podaci.set(null);
    this.zahtev = this.api.student(id, { predmetId: this.predmetId(), godina: this.godina() }).subscribe({
      next: p => this.podaci.set(p),
      error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
    });
  }
}
