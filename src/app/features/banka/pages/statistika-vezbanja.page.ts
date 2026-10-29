import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { Params, Router, RouterLink } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { PredmetInfo } from '../../../core/api/reference.api';
import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { DateRangeChip, OpsegDatuma } from '../../../shared/ui/date-range-chip';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { parseDatum } from '../../../shared/util/datum.pipe';
import { BankaApi } from '../data-access/banka.api';
import { StatistikaTipa } from '../data-access/banka.models';
import { razlogBanke, TIHO } from '../data-access/greske';

/** `?predmet=` / `?grupa=`: pozitivan ceo broj ili `null`. */
function parseId(v: unknown): number | null {
  return typeof v === 'string' && JE_ID.test(v) ? Number(v) : null;
}

/** Rezultat čitanja: redovi ili poruka greške (greška ostaje u panelu, ne u snackbaru). */
interface Ucitano {
  redovi: StatistikaTipa[];
  greska: string | null;
}

/** `?od=` / `?do=`: ISO dan (`YYYY-MM-DD`) koji postoji, inače `null` (neispravan link = bez tog kraja). */
export function parseDan(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && parseDatum(v) !== null ? v : null;
}

/** Udeo u procentima (ceo broj) ili `—` kad je imenilac 0. */
export function procenat(deo: number, celo: number): string {
  return celo > 0 ? `${Math.round((100 * deo) / celo)} %` : '—';
}

/**
 * Statistika vežbanja (`/banka/vezbanje?predmet&grupa&od&do`, samo nastavnik; spec studentskog dela 5.6): po tipu iz banke za
 * predavanja koliko studenata je vežbalo, koliko zadataka su izvukli, koliko proverili, koliko je bilo tačno iz prve provere
 * i koliko puta je rešenje otvoreno bez tačne provere. Samo zbirno: imena i pojedinačni pokušaji se nikad ne prikazuju (ni API
 * ih ne daje). Filteri su query parametri (izvor istine); bez `?predmet` stranica traži izbor predmeta. Lenja ruta.
 */
@Component({
  selector: 'app-statistika-vezbanja-page',
  imports: [
    ChipSelect, DateRangeChip, EmptyState, ErrorPanel, MatFormField, MatLabel, MatOption, MatSelect, PageHeader, RouterLink,
    SkeletonRows,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .sv-filteri { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
    .sv-predmet { min-width: 240px; }
    .sv-tabela-omot { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    caption { text-align: left; padding: 12px 16px 4px; color: var(--muted); font-size: 13px; }
    th, td { padding: 8px 12px; border-top: 1px solid var(--line); text-align: right; vertical-align: top; }
    th:first-child, td:first-child { text-align: left; }
    thead th { color: var(--muted); font-size: 12px; font-weight: 600; border-top: 0; }
    td { font-variant-numeric: tabular-nums; }
    .sv-putanja { display: block; color: var(--muted); font-size: 12px; }
    .sv-sporedno { color: var(--muted); font-size: 12px; }
  `,
  template: `
    <app-page-header naslov="Statistika vežbanja" podnaslov="Zadaci za vežbanje po tipu, zbirno za grupu i period">
      <a kontekst routerLink="/banka" [queryParams]="{ predmet: predmetId(), namena: 'PREDAVANJE' }" data-nazad>Banka zadataka</a>
    </app-page-header>

    <div class="sv-filteri" role="group" aria-label="Filteri statistike">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="sv-predmet">
        <mat-label>Predmet</mat-label>
        <mat-select [value]="predmetId()" (selectionChange)="promeni({ predmet: $event.value })" data-predmet>
          @for (p of predmeti(); track p.id) {
            <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <app-chip-select labela="Grupa" [opcije]="grupe()" [vrednost]="grupaId()" (vrednostChange)="promeni({ grupa: $event })" />
      <app-date-range-chip labela="Period" [opseg]="opseg()" (opsegChange)="promeniOpseg($event)" />
    </div>

    @if (predmetId() === null) {
      <app-empty-state naslov="Izaberi predmet" ikona="quiz" tekst="Statistika se vodi po predmetu; izaberi ga iznad." />
    } @else if (podaci.hasValue()) {
      @let u = podaci.value();
      @if (u.greska !== null) {
        <app-error-panel naslov="Statistika nije učitana." [poruka]="u.greska" (ponovo)="podaci.reload()" />
      } @else {
        @let redovi = u.redovi;
        @if (redovi.length === 0) {
          <app-empty-state naslov="Još niko nije vežbao" ikona="quiz"
            tekst="Kad studenti vežbaju otvorene tipove, ovde se vidi zbirno po tipu (bez imena)." data-prazno />
        } @else {
          <div class="lista-kartica sv-tabela-omot">
            <table data-statistika>
              <caption>Samo zbirno: koliko studenata, ne ko.</caption>
              <thead>
                <tr>
                  <th scope="col">Tip</th>
                  <th scope="col">Studenata</th>
                  <th scope="col">Izvučeno</th>
                  <th scope="col">Provereno</th>
                  <th scope="col">Tačno iz prve</th>
                  <th scope="col">Rešenje bez tačnog</th>
                </tr>
              </thead>
              <tbody>
                @for (r of redovi; track r.tipId) {
                  <tr [attr.data-tip]="r.tipId">
                    <th scope="row">
                      @if (r.putanja.length > 0) {
                        <span class="sv-putanja">{{ r.putanja.join(' › ') }}</span>
                      }
                      <a [routerLink]="['/banka/grupe', r.tipId]">{{ r.naziv }}</a>
                    </th>
                    <td>{{ r.studenata }}</td>
                    <td>{{ r.pokusaja }}</td>
                    <td>{{ r.provereno }}</td>
                    <td>{{ r.prvaTacno }} <span class="sv-sporedno">({{ procenat(r.prvaTacno, r.provereno) }})</span></td>
                    <td>{{ r.resenjeBezTacne }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
})
export class StatistikaVezbanjaPage {
  private readonly api = inject(BankaApi);
  private readonly router = inject(Router);
  protected readonly reference = inject(ReferenceStore);

  /** Query parametri (`withComponentInputBinding`). */
  readonly predmet = input<string>();
  readonly grupa = input<string>();
  readonly od = input<string>();
  readonly do = input<string>();

  protected readonly predmetId = computed(() => parseId(this.predmet()));
  protected readonly grupaId = computed(() => parseId(this.grupa()));
  protected readonly opseg = computed<OpsegDatuma>(() => ({ od: parseDan(this.od()), do: parseDan(this.do()) }));
  protected readonly predmeti = computed<PredmetInfo[]>(() =>
    [...this.reference.predmeti()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr')),
  );
  protected readonly grupe = computed<ChipOpcija<number>[]>(() =>
    [...this.reference.grupe()]
      .sort((a, b) => (b.godinaUpisa ?? 0) - (a.godinaUpisa ?? 0) || a.naziv.localeCompare(b.naziv, 'sr'))
      .map(g => ({ vrednost: g.id, labela: g.godinaUpisa === null ? g.naziv : `${g.naziv} (${g.godinaUpisa})` })),
  );

  protected readonly podaci = rxResource<Ucitano, { predmet: number; grupa: number | null; od: string | null; do: string | null } | undefined>({
    params: () => {
      const predmet = this.predmetId();
      return predmet === null ? undefined : { predmet, grupa: this.grupaId(), ...this.opseg() };
    },
    stream: ({ params }): Observable<Ucitano> => this.api.statistikaVezbanja(params.predmet, params, TIHO).pipe(
      map(redovi => ({ redovi, greska: null })),
      catchError((e: unknown) => of({ redovi: [], greska: razlogBanke(e) })),
    ),
  });

  protected readonly procenat = procenat;

  constructor() {
    this.reference.ucitaj();
    // bez ?predmet: prvi predmet po nazivu, jednom (replaceUrl)
    effect(() => {
      if (this.predmet() !== undefined) {
        return;
      }
      const prvi = this.predmeti()[0]?.id;
      if (prvi !== undefined) {
        untracked(() => this.promeni({ predmet: prvi }, true));
      }
    });
  }

  protected promeniOpseg(o: OpsegDatuma): void {
    this.promeni({ od: o.od, do: o.do });
  }

  protected promeni(izmena: Params, zameni = false): void {
    void this.router.navigate([], { queryParams: izmena, queryParamsHandling: 'merge', replaceUrl: zameni });
  }
}
