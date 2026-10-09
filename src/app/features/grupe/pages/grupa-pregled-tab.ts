import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeListItem } from '../../../core/api/predavanja.models';
import { PredavanjaTabela } from '../../predavanja/ui/predavanja-tabela';
import { GrupaStore } from '../data-access/grupa.store';

/** Koliko najnovijih predavanja pokazuje Pregled (sva su u tabu Nastava). */
export const BROJ_NAJNOVIJIH = 5;

/**
 * Tab Pregled grupe: otvoren onboarding (rok, prijave na čekanju, QR i prijave), brze akcije sa zaključanom grupom i
 * najnovija predavanja grupe (svih predmeta i godina, `PredavanjaTabela` bez kolone grupe). G1 brojke su u zaglavlju.
 */
@Component({
  selector: 'app-grupa-pregled-tab',
  imports: [DatumPipe, EmptyState, ErrorPanel, MatButton, MatIcon, PredavanjaTabela, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.pregled(); as p) {
      <div class="akcije" data-brze-akcije>
        <a matButton="filled" routerLink="/predavanja/novo" [queryParams]="{ grupa: p.grupa.id }" data-novo-predavanje>
          <mat-icon svgIcon="add" aria-hidden="true" />Novo predavanje
        </a>
        <a matButton="outlined" routerLink="/domaci/novo" [queryParams]="{ grupa: p.grupa.id }" data-nov-domaci>Nov domaći</a>
        <a matButton="outlined" routerLink="/testovi/novo" [queryParams]="{ grupa: p.grupa.id }" data-nov-test>Nov test</a>
      </div>

      @if (p.otvorenOnboarding; as o) {
        <section class="kartica onboarding" aria-label="Otvoren onboarding" data-otvoren-onboarding>
          <div>
            <h2>Onboarding je otvoren</h2>
            <p>Važi do {{ o.istice | datum: 'sa-vremenom' }} · prijava {{ o.brojPrijava }} od najviše {{ o.maxPrijava }} · na čekanju {{ o.brojNaCekanju }}</p>
          </div>
          <div class="dugmad">
            <a matButton="outlined" [routerLink]="['/grupe', p.grupa.id, 'onboarding', o.id, 'qr']"><mat-icon svgIcon="qr_code_2" aria-hidden="true" />QR</a>
            <a matButton="filled" [routerLink]="['/grupe', p.grupa.id, 'onboarding', o.id]">Prijave</a>
          </div>
        </section>
      }

      <section class="lista-kartica" aria-label="Najnovija predavanja">
        <div class="naslov-sekcije">
          <h2>Najnovija predavanja</h2>
          <a matButton routerLink="../nastava" data-sva-predavanja>Sva predavanja grupe<mat-icon svgIcon="arrow_forward" aria-hidden="true" iconPositionEnd /></a>
        </div>
        @if (greska(); as g) {
          <app-error-panel [poruka]="g" (ponovo)="ucitajPredavanja(p.grupa.id)" />
        } @else if (predavanja(); as lista) {
          @if (lista.length > 0) {
            <app-predavanja-tabela [stavke]="lista" [zakljucano]="['grupa']" [punDatum]="true" (otvori)="otvoriPredavanje($event)" />
          } @else {
            <app-empty-state naslov="Grupa još nema predavanja" ikona="co_present" tekst="Započni prvo predavanje za ovu grupu." />
          }
        } @else {
          <app-skeleton-rows [redovi]="3" />
        }
      </section>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .kartica { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 14px 16px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); }
    .kartica > div:first-child { flex: 1 1 260px; }
    .kartica h2, .naslov-sekcije h2 { font-size: 16px; margin: 0; }
    .kartica p { margin: 4px 0 0; color: var(--ink-2); }
    .onboarding { border-left: 4px solid var(--ok); }
    .dugmad { display: flex; flex-wrap: wrap; gap: 8px; }
    .naslov-sekcije { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px;
      border-bottom: 1px solid var(--line); }
    app-error-panel { display: block; margin: 0 16px; }
  `,
})
export class GrupaPregledTab {
  protected readonly store = inject(GrupaStore);
  private readonly api = inject(PredavanjaApi);
  private readonly router = inject(Router);

  protected readonly predavanja = signal<PredavanjeListItem[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  private readonly grupaId = computed(() => this.store.grupa()?.id ?? null);
  private zahtev: Subscription | null = null;

  constructor() {
    effect(() => {
      const id = this.grupaId();
      if (id !== null) {
        untracked(() => this.ucitajPredavanja(id));
      }
    });
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
  }

  protected ucitajPredavanja(grupaId: number): void {
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.predavanja.set(null);
    this.zahtev = this.api
      .pretraga(
        {
          filteri: { predmet: null, grupa: grupaId, godina: null, status: null, q: null, od: null, do: null },
          sort: 'datum,desc',
          strana: 1,
          velicina: BROJ_NAJNOVIJIH,
        },
        { tiho: true },
      )
      .subscribe({
        next: s => this.predavanja.set(s?.content ?? []),
        error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
      });
  }

  protected otvoriPredavanje(id: number): void {
    void this.router.navigate(['/predavanja', id]);
  }
}
