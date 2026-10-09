import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter, of } from 'rxjs';

import { UpdateTestCmd } from '../data-access/testovi.models';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StudentPicker } from '../../../shared/ui/student-picker';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { formatBroja, opisProlaza, TestStore } from '../data-access/test.store';
import { brojIspitanika } from '../data-access/testovi.models';
import { TestZaglavlje } from '../ui/test-zaglavlje';
import { obrisiTestUzPotvrdu } from './obrisi-test';
import { UnosPoenaRed } from '../ui/unos-poena-red';

/** `Kolokvijum 1 · 16. 10. 2025.` (mrvice, "Nedavno"). */
export function naslovTesta(t: { tipTesta: { naziv: string } | null; datum: string | null } | null): string | null {
  if (!t) {
    return null;
  }
  const naziv = t.tipTesta?.naziv?.trim() || 'Test';
  return t.datum ? `${naziv} · ${formatDatum(t.datum)}` : naziv;
}

/**
 * Test (`/testovi/:id`): zaglavlje sa izmenom tipa, datuma i max poena, statistika uživo (iz unetih poena), "Dodaj
 * ispitanike" (zajednički birač, i stariji studenti), tabela unosa (varijanta, poeni 0-max, prepisivao, napomena; svaki
 * red se čuva sam) i "Završi evidentiranje". Evidentiran test je samo za čitanje (backend ga ne vraća u unos).
 * Uneti poeni se šalju i kad se ekran napusti pre isteka debounce-a (`TestStore`).
 */
@Component({
  selector: 'app-test-detalj',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, RouterLink, SkeletonRows, StatTile, TestZaglavlje, UnosPoenaRed],
  providers: [TestStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'preZatvaranja($event)' },
  template: `
    @if (store.test(); as t) {
      <app-test-zaglavlje [test]="t" [tipovi]="tipovi()" [izmenljivo]="!store.evidentiran()" [najviseUneto]="store.statistikaUzivo().max"
        [sacuvaj]="sacuvajZaglavlje" [cuvajPrag]="cuvajPrag" (obrisi)="obrisi()">
        @if (!store.evidentiran()) {
          <div akcije class="akcije">
            @if (t.grupa) {
              <button matButton="outlined" type="button" data-dodaj (click)="dodaj()">
                <mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj ispitanike
              </button>
            }
            <button matButton="filled" type="button" data-zavrsi [disabled]="!store.spremnost().moze" (click)="zavrsi()"
              [attr.aria-describedby]="store.spremnost().razlog ? 'razlog-zavrsetka' : null">
              <mat-icon svgIcon="check" aria-hidden="true" />Završi evidentiranje
            </button>
          </div>
        }
      </app-test-zaglavlje>

      <div class="kpi" role="group" aria-label="Statistika uživo" aria-live="polite">
        <app-stat-tile labela="uneto" [vrednost]="s().broj" [podtekst]="'od ' + s().ukupno" data-kpi-uneto />
        <app-stat-tile labela="prosek" [vrednost]="prosek()" [podtekst]="t.maxPoena ? '/ ' + t.maxPoena : null" data-kpi-prosek />
        <app-stat-tile labela="prolaz" [vrednost]="prolaz()" data-kpi-prolaz />
        <app-stat-tile labela="min" [vrednost]="min()" data-kpi-min />
        <app-stat-tile labela="max" [vrednost]="maks()" data-kpi-max />
      </div>
      <p class="uputstvo">
        @if (store.evidentiran()) {
          <mat-icon svgIcon="info" aria-hidden="true" />Evidentiranje je završeno; poeni su samo za čitanje.
        } @else {
          {{ opisProlaza() }} Svaki red se čuva sam; Enter prelazi na sledeći red.
          @if (store.spremnost().razlog; as r) {
            <span id="razlog-zavrsetka" class="razlog" data-razlog> {{ r }}</span>
          }
        }
      </p>

      @if (store.redovi().length === 0) {
        <app-empty-state ikona="person_add" naslov="Još nema ispitanika"
          [tekst]="store.evidentiran() ? null : 'Dodaj studente koji su radili test (iz grupe ili starije generacije), pa unesi poene.'">
          @if (!store.evidentiran() && t.grupa) {
            <button matButton="filled" type="button" (click)="dodaj()"><mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj ispitanike</button>
          }
        </app-empty-state>
      } @else {
        <div class="tabela-okvir">
          <table class="poeni-tabela">
            <caption class="sr-only">{{ store.evidentiran() ? 'Rezultati testa' : 'Unos poena' }}</caption>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Indeks</th>
                <th scope="col">Varijanta</th>
                <th scope="col">Poeni</th>
                <th scope="col">Prepisivao</th>
                <th scope="col">Napomena</th>
                @if (!store.evidentiran()) {
                  <th scope="col"><span class="sr-only">Čuvanje</span></th>
                  <th scope="col"><span class="sr-only">Ukloni</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of store.redovi(); track r.id) {
                <tr appUnosPoenaRed [red]="r" [vrednost]="store.vrednosti()[r.id]" [varijante]="store.varijante()" [max]="store.maxPoena()"
                  [stanje]="store.statusi()[r.id]" [greskaServera]="store.greske()[r.id]" [greskaValidacije]="store.greskeValidacije()[r.id]"
                  [zauzet]="store.zauzet()[r.id]" [samoCitanje]="store.evidentiran()"
                  (izmena)="store.izmeni(r.id, $event)" (ponovo)="store.ponovo(r.id)" (ukloni)="ukloni(r.id)"></tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else if (store.imaGresku()) {
      <app-error-panel naslov="Test nije učitan." [poruka]="store.greska()" (ponovo)="ponovo()" />
      <a matButton routerLink="/testovi"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Svi testovi</a>
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .kpi { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
    .uputstvo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; font-size: 13px; color: var(--muted); }
    .uputstvo .mat-icon { width: 18px; height: 18px; flex: none; }
    .razlog { color: var(--warn); font-weight: 600; }
    .tabela-okvir { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .poeni-tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
    .poeni-tabela thead th { padding: 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600;
      text-align: left; white-space: nowrap; }
    @media (max-width: 599.98px) {
      .kpi app-stat-tile { flex: 1 1 calc(33% - 10px); min-width: 0; }
      .poeni-tabela thead { display: none; }
      .poeni-tabela, .poeni-tabela tbody { display: block; }
      .akcije { flex: 1 1 0; min-width: 0; }
      .akcije > * { flex: 1 1 0; }
    }
  `,
})
export class TestDetalj {
  protected readonly store = inject(TestStore);
  private readonly reference = inject(ReferenceStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();
  protected readonly tId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly opisProlaza = computed(() => opisProlaza(this.store.pragProlaza()));

  protected readonly s = computed(() => this.store.statistikaUzivo());
  protected readonly prosek = computed(() => (this.s().prosek === null ? null : formatBroja(this.s().prosek)));
  protected readonly prolaz = computed(() => (this.s().prolaz === null ? null : `${Math.round(this.s().prolaz!)} %`));
  protected readonly min = computed(() => (this.s().min === null ? null : formatBroja(this.s().min)));
  protected readonly maks = computed(() => (this.s().max === null ? null : formatBroja(this.s().max)));
  private readonly predmetId = computed(() => this.store.test()?.predmet?.id ?? null);
  protected readonly tipovi = computed(() => {
    const p = this.predmetId();
    return p === null || this.store.evidentiran() ? [] : this.reference.tipoviTesta(p)();
  });
  protected readonly naslov = computed(() => naslovTesta(this.store.test()));

  /** Stabilna referenca (ulaz zaglavlja). */
  protected readonly sacuvajZaglavlje = (izmena: UpdateTestCmd) => this.store.izmeniZaglavlje(izmena);
  protected readonly cuvajPrag = (prag: number | null) => this.store.postaviPrag(prag);

  constructor() {
    effect(() => {
      const id = this.tId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });
    effect(() => {
      const naslov = this.naslov();
      const id = untracked(() => this.store.test()?.id);
      if (naslov === null || id === undefined) {
        return;
      }
      untracked(() => {
        this.mrvice.postavi(naslov);
        this.preference.zabeleziNedavno({ tip: 'test', id, naslov, url: `/testovi/${id}` });
      });
    });
  }

  /**
   * Napuštanje ekrana unutar aplikacije ne gubi poene (store ih šalje i posle uništenja), ali zatvaranje kartice ili
   * osvežavanje prekida JavaScript: dok ima nesačuvanih izmena, pregledač pita za potvrdu.
   */
  protected preZatvaranja(e: BeforeUnloadEvent): void {
    if (this.store.imaNesacuvanih()) {
      e.preventDefault();
    }
  }

  protected ponovo(): void {
    const id = this.tId();
    if (id !== null) {
      this.store.ucitaj(id);
    }
  }

  /** Birač studenata grupe testa i starijih generacija; mlađe i studente bez grupe server odbija. */
  protected dodaj(): void {
    const grupa = this.store.test()?.grupa;
    if (!grupa) {
      return;
    }
    StudentPicker.otvori(this.dialog, {
      grupaId: grupa.id,
      iskljuci: this.store.redovi().map(r => r.id),
      naslov: 'Dodaj ispitanike',
    }).subscribe(izabrani => this.store.dodajIspitanike(izabrani));
  }

  /** Red sa unetim poenima se uklanja tek posle potvrde (poeni se brišu sa servera). */
  protected ukloni(sId: number): void {
    const red = this.store.redovi().find(r => r.id === sId);
    const v = this.store.vrednosti()[sId];
    if (!red || !v) {
      return;
    }
    const potvrda = v.poeni.trim()
      ? ConfirmDialog.otvori(this.dialog, {
          naslov: 'Ukloni ispitanika?',
          tekst: `${red.ime} ${red.prezime} se uklanja sa testa zajedno sa unetim poenima (${v.poeni}).`,
          potvrdi: 'Ukloni',
          destruktivno: true,
        })
      : of(true);
    potvrda.pipe(filter(Boolean)).subscribe(() => this.store.ukloni(sId));
  }

  protected zavrsi(): void {
    const s = this.s();
    const t = this.store.test();
    const detalji =
      s.broj > 0
        ? `${brojIspitanika(s.broj)}, prosek ${formatBroja(s.prosek)}${t?.maxPoena ? ' / ' + t.maxPoena : ''}` +
          (s.prolaz === null ? ', bez praga prolaza.' : `, prolaz ${Math.round(s.prolaz)} %.`)
        : 'Test nema ispitanika.';
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Završi evidentiranje?',
      tekst: `${detalji} Posle završetka poeni se više ne mogu menjati.`,
      potvrdi: 'Završi evidentiranje',
    })
      .pipe(filter(Boolean))
      .subscribe(() => void this.store.zavrsi());
  }

  protected obrisi(): void {
    obrisiTestUzPotvrdu(this.dialog, this.router, this.store);
  }

}
