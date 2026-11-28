import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { SablonInfo } from '../data-access/online.models';
import { NAZIV_REZIMA, formatPoena } from '../data-access/online.pravila';

/**
 * Šabloni online testova (`/testovi/sabloni?predmet=&arhivirani=`, spec 7, plan 4.1): spisak po predmetu sa kopiranjem,
 * arhiviranjem i brisanjem; „Nov šablon“ vodi na editor. Šablon je recept (stavke iz banke namene TEST), test se iz njega generiše.
 */
@Component({
  selector: 'app-sabloni-lista',
  imports: [EmptyState, ErrorPanel, MatButton, MatCheckbox, MatIcon, PageHeader, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Šabloni testova" podnaslov="Recept za online test: stavke sa zadacima iz banke, poeni i trajanje.">
      <div akcije>
        <a matButton="filled" routerLink="/testovi/sabloni/novo" [queryParams]="{ predmet: predmetId() }" data-nov-sablon>
          <mat-icon svgIcon="add" aria-hidden="true" />Nov šablon
        </a>
      </div>
    </app-page-header>

    <div class="filteri">
      <label class="izbor">Predmet
        <select [value]="predmetId() ?? ''" (change)="promeniPredmet($any($event.target).value)" data-filter-predmet>
          <option value="">Svi predmeti</option>
          @for (p of reference.predmeti(); track p.id) { <option [value]="p.id">{{ p.naziv }}</option> }
        </select>
      </label>
      <mat-checkbox [checked]="arhivirani()" (change)="arhivirani.set($event.checked)" data-filter-arhivirani>Arhivirani</mat-checkbox>
    </div>

    @if (greska(); as g) {
      <app-error-panel naslov="Šabloni nisu učitani." [poruka]="g" (ponovo)="ucitaj()" />
    } @else if (sabloni(); as lista) {
      @if (lista.length === 0) {
        <app-empty-state ikona="description" naslov="Nema šablona" tekst="Napravi šablon, pa iz njega online test na strani „Nov test“." />
      } @else {
        <div class="tabela-okvir">
          <table class="tabela">
            <caption class="sr-only">Šabloni testova</caption>
            <thead>
              <tr><th scope="col">Naziv</th><th scope="col">Tip testa</th><th scope="col">Trajanje</th><th scope="col">Raspodela</th>
                <th scope="col" class="broj">Poena</th><th scope="col" class="broj">Stavki</th><th scope="col">Izmenjen</th>
                <th scope="col"><span class="sr-only">Radnje</span></th></tr>
            </thead>
            <tbody>
              @for (s of lista; track s.id) {
                <tr [attr.data-sablon]="s.id">
                  <td><a [routerLink]="['/testovi/sabloni', s.id]">{{ s.naziv }}</a>@if (s.arhiviran) { <app-status-chip tekst="Arhiviran" /> }</td>
                  <td>{{ s.tipTesta ?? '—' }}</td>
                  <td>{{ s.trajanjeMin }} min</td>
                  <td>{{ raspodela(s) }}</td>
                  <td class="broj">{{ poeni(s.maxPoena) }}</td>
                  <td class="broj">{{ s.brojStavki }}</td>
                  <td>{{ datum(s.izmenjeno) }}</td>
                  <td class="radnje">
                    <button matButton type="button" (click)="kopiraj(s)" data-kopiraj><mat-icon svgIcon="content_copy" aria-hidden="true" />Kopiraj</button>
                    <button matButton type="button" (click)="arhiviraj(s)" data-arhiviraj>{{ s.arhiviran ? 'Vrati' : 'Arhiviraj' }}</button>
                    <button matButton type="button" class="opasno" (click)="obrisi(s)" data-obrisi><mat-icon svgIcon="delete" aria-hidden="true" />Obriši</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <app-skeleton-rows [redovi]="4" />
    }
  `,
  styles: `
    :host { display: block; }
    .filteri { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin: 0 0 12px; }
    .izbor { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
    .izbor select { min-height: 40px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; }
    .tabela-okvir { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
    .tabela th { padding: 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; text-align: left; white-space: nowrap; }
    .tabela td { padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .tabela a { color: var(--primary); font-weight: 600; }
    .broj { text-align: right; font-family: var(--font-mono); }
    .radnje { white-space: nowrap; }
    .opasno { color: var(--danger); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
})
export class SabloniLista implements OnInit {
  readonly predmet = input<string>();

  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly arhivirani = signal(false);
  protected readonly predmetId = computed(() => {
    const p = this.predmet();
    return p !== undefined && JE_ID.test(p) ? Number(p) : null;
  });
  protected readonly sabloni = signal<SablonInfo[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly poeni = formatPoena;
  protected readonly datum = formatDatum;

  constructor() {
    effect(() => {
      this.predmetId();
      this.arhivirani();
      untracked(() => this.ucitaj());
    });
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  ucitaj(): void {
    this.sabloni.set(null);
    this.greska.set(null);
    this.api.sabloni(this.predmetId(), this.arhivirani(), { tiho: true }).subscribe({
      next: l => this.sabloni.set(l),
      error: () => this.greska.set('Proveri vezu i pokušaj ponovo.'),
    });
  }

  protected promeniPredmet(v: string): void {
    void this.router.navigate([], { queryParams: { predmet: v || null }, replaceUrl: true });
  }

  protected raspodela(s: SablonInfo): string {
    return s.rezim === 'GRUPE' ? `${s.brojGrupa} ${s.brojGrupa === 1 ? 'grupa' : 'grupe'}` : NAZIV_REZIMA.POJEDINACNO;
  }

  protected kopiraj(s: SablonInfo): void {
    this.api.kopirajSablon(s.id).subscribe(k => void this.router.navigate(['/testovi/sabloni', k.id]));
  }

  protected arhiviraj(s: SablonInfo): void {
    this.api.arhivirajSablon(s.id, !s.arhiviran).subscribe(() => this.ucitaj());
  }

  protected obrisi(s: SablonInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati šablon?', tekst: `„${s.naziv}“ se briše. Testovi napravljeni iz njega ostaju.`, potvrdi: 'Obriši', destruktivno: true,
    }).pipe(filter(Boolean), switchMap(() => this.api.obrisiSablon(s.id))).subscribe(() => this.ucitaj());
  }
}
