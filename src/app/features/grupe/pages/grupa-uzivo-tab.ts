import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { RangApi, UzivoGrupe } from '../../../core/api/rang.api';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { RangTacnostiTabela } from '../../../shared/ui/rang-tacnosti-tabela';
import { opcijeSkolskihGodina } from '../../../shared/util/skolska-godina';
import { GrupaStore } from '../data-access/grupa.store';

/**
 * Tab "Uživo" grupe (rang tačnosti, spec 7): rang studenata grupe po svim časovima (predavanje sa svim izvođenjima, ili
 * izvođenje bez predavanja) sa pitanjima, uz broj časova. Studenti grupe koji nisu odgovarali su na dnu bez mesta; gosti
 * se ne prikazuju. Filteri predmet i školska godina su lokalni.
 */
@Component({
  selector: 'app-grupa-uzivo-tab',
  imports: [ChipSelect, ErrorPanel, RangTacnostiTabela, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filteri">
      <app-chip-select labela="Predmet" [opcije]="predmeti()" [vrednost]="predmetId()" (vrednostChange)="predmetId.set($event)" />
      <app-chip-select labela="Školska godina" [opcije]="godine" [vrednost]="godina()" (vrednostChange)="godina.set($event)" />
    </div>
    <section class="lista-kartica" aria-label="Rang tačnosti grupe" data-rang-grupe>
      @if (greska(); as g) {
        <app-error-panel [poruka]="g" (ponovo)="ucitaj()" />
      } @else if (podaci(); as p) {
        <p class="lista-broj">
          @if (p.brojCasova > 0) { Časova sa pitanjima: {{ p.brojCasova }}. } @else { Grupa još nema časova sa pitanjima uživo. }
        </p>
        <div class="telo">
          <app-rang-tacnosti-tabela [stavke]="p.rang" [kolone]="['casova']" [linkoviStudenata]="true"
                                    prazno="Grupa nema studenata." />
        </div>
      } @else {
        <app-skeleton-rows [redovi]="5" />
      }
    </section>
    <p class="napomena">Redosled: više ★ (pitanje 1, zadatak nivo varijante), pa kraće prosečno vreme. Tačnost: neodgovoreno pitanje je netačno.</p>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .filteri { display: flex; flex-wrap: wrap; gap: 8px; }
    .telo { padding: 0 8px 8px; }
    .napomena { margin: 0; color: var(--muted); font-size: 13px; }
  `,
})
export class GrupaUzivoTab {
  private readonly store = inject(GrupaStore);
  private readonly api = inject(RangApi);
  private readonly reference = inject(ReferenceStore);

  protected readonly predmetId = signal<number | null>(null);
  protected readonly godina = signal<number | null>(null);
  protected readonly podaci = signal<UzivoGrupe | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly godine: ChipOpcija<number>[] = opcijeSkolskihGodina(6);
  protected readonly predmeti = computed<ChipOpcija<number>[]>(() =>
    this.reference.predmeti().map(p => ({ vrednost: p.id, labela: p.naziv })));
  private readonly grupaId = computed(() => this.store.grupa()?.id ?? null);
  private zahtev: Subscription | null = null;

  constructor() {
    this.reference.ucitaj();
    effect(() => {
      const id = this.grupaId();
      this.predmetId();
      this.godina();
      if (id !== null) untracked(() => this.ucitaj());
    });
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
  }

  protected ucitaj(): void {
    const id = this.grupaId();
    if (id === null) return;
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.podaci.set(null);
    this.zahtev = this.api.grupa(id, { predmetId: this.predmetId(), godina: this.godina() }).subscribe({
      next: p => this.podaci.set(p),
      error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
    });
  }
}
