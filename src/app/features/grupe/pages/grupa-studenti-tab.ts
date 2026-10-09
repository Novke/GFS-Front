import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState } from '../../../shared/ui/list-states';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { IndeksPipe } from '../../../shared/util/indeks.pipe';
import { kopirajTekst } from '../../../shared/util/kopiraj';
import { brojAdresaTekst } from '../../../shared/util/mnozina';
import { GrupaStore } from '../data-access/grupa.store';
import {
  emailoviZaKopiranje,
  GrupaStudentStat,
  imeStudenta,
  procenat,
  SEPARATOR_EMAILOVA,
  StudentInfo,
} from '../../../core/api/grupe.models';
import { NacinStudentDialoga, StudentDialog } from '../ui/student-dialog';

export const POLJA_SORTA_STUDENATA = ['indeks', 'ime', 'prisutnost', 'domaci'] as const;
export type PoljeSortaStudenata = (typeof POLJA_SORTA_STUDENATA)[number];
export interface SortStudenata {
  polje: PoljeSortaStudenata;
  smer: 'asc' | 'desc';
}
/** Podrazumevano: po indeksu, kao server. */
export const PODRAZUMEVAN_SORT_STUDENATA: SortStudenata = { polje: 'indeks', smer: 'asc' };

/** `?sort=prisutnost,desc` u sort; sve nepoznato (zastareo link, `sort=lozinka,asc`) je podrazumevani sort, bez navigacije. */
export function parseSortStudenata(v: unknown): SortStudenata {
  const m = typeof v === 'string' ? /^([a-z]+),(asc|desc)$/.exec(v) : null;
  return m && (POLJA_SORTA_STUDENATA as readonly string[]).includes(m[1])
    ? { polje: m[1] as PoljeSortaStudenata, smer: m[2] as 'asc' | 'desc' }
    : PODRAZUMEVAN_SORT_STUDENATA;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'dj').toLowerCase();

/** Pretraga po imenu, prezimenu, indeksu i emailu (bez razlike u velikim slovima i dijakriticima). */
export function filtrirajStudente(redovi: readonly GrupaStudentStat[], q: string | null | undefined): GrupaStudentStat[] {
  const t = norm(q?.trim());
  if (!t) {
    return [...redovi];
  }
  return redovi.filter(r => {
    const s = r.student;
    return [s?.ime, s?.prezime, `${s?.prezime ?? ''} ${s?.ime ?? ''}`, `${s?.ime ?? ''} ${s?.prezime ?? ''}`, s?.indeks, s?.email].some(x => norm(x).includes(t));
  });
}

/** Broj iz indeksa (`GD12` -> 12) za prirodan redosled; bez broja na kraj. */
function brojIndeksa(indeks: string | null | undefined): number {
  const m = /(\d+)/.exec(indeks ?? '');
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Stabilno sortiranje G2; red bez vrednosti (nema predavanja, nema domaćih) ide na kraj u oba smera. */
export function sortirajStudente(redovi: readonly GrupaStudentStat[], sort: SortStudenata): GrupaStudentStat[] {
  const smer = sort.smer === 'asc' ? 1 : -1;
  const vrednost = (r: GrupaStudentStat): number | string | null => {
    switch (sort.polje) {
      case 'ime':
        return norm(imeStudenta(r.student));
      case 'prisutnost':
        return procenat(r.prisutan, r.predavanja);
      case 'domaci':
        return procenat(r.domaciUradjeno, r.domaciUkupno);
      default:
        return brojIndeksa(r.student?.indeks);
    }
  };
  return redovi
    .map((r, i) => ({ r, i, v: vrednost(r) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) {
        return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      }
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v as string, 'sr') : a.v - (b.v as number);
      return c !== 0 ? c * smer : a.i - b.i;
    })
    .map(x => x.r);
}

/**
 * Tab Studenti grupe (G2, G6, G7, G8): tabela (ime, indeks, prisutnost, domaći, poslednji test, kontakt) sa sortom po
 * zaglavlju i pretragom (`?sort`, `?q`; neispravna vrednost je podrazumevana, bez navigacije), "Dodaj studenta",
 * po redu "Izmeni" i "Premesti u grupu" (dijalozi), "Kopiraj emailove" (`; `) i "Štampaj spisak" (print CSS).
 */
@Component({
  selector: 'app-grupa-studenti-tab',
  imports: [DatumPipe, EmptyState, FilterBar, IndeksPipe, MatButton, MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alati ne-stampaj">
      <button matButton="filled" type="button" (click)="otvoriDijalog('dodaj')" data-dodaj>
        <mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj studenta
      </button>
      <button matButton="outlined" type="button" (click)="kopirajEmailove()" data-kopiraj-emailove>
        <mat-icon svgIcon="content_copy" aria-hidden="true" />Kopiraj emailove
      </button>
      <button matButton="outlined" type="button" (click)="stampaj()" data-stampaj>
        <mat-icon svgIcon="print" aria-hidden="true" />Štampaj spisak
      </button>
    </div>

    <h2 class="samo-stampa">Spisak studenata · {{ store.naziv() }}</h2>

    <section class="lista-kartica" aria-label="Studenti grupe">
      <app-filter-bar class="ne-stampaj" [pretraga]="q() ?? null" pretragaLabela="Pretraži po imenu, indeksu ili emailu…" [imaFiltera]="!!q()"
        (pretragaChange)="postavi({ q: $event })" (ocisti)="postavi({ q: null })" />

      @if (prikazani().length > 0) {
        <p class="lista-broj ne-stampaj" aria-live="polite">{{ brojTekst() }}</p>
        <div class="tabela-okvir">
          <table class="lista-tabela studenti">
            <caption class="sr-only">Studenti grupe {{ store.naziv() }}</caption>
            <thead>
              <tr>
                <th scope="col" class="rb">#</th>
                <th scope="col" [attr.aria-sort]="ariaSort('ime')">
                  <button type="button" class="sortiraj" data-sort="ime" (click)="sortiraj('ime')">Ime<span aria-hidden="true">{{ strelica('ime') }}</span></button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('indeks')">
                  <button type="button" class="sortiraj" data-sort="indeks" (click)="sortiraj('indeks')">Indeks<span aria-hidden="true">{{ strelica('indeks') }}</span></button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('prisutnost')">
                  <button type="button" class="sortiraj" data-sort="prisutnost" (click)="sortiraj('prisutnost')">Prisutnost<span aria-hidden="true">{{ strelica('prisutnost') }}</span></button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('domaci')">
                  <button type="button" class="sortiraj" data-sort="domaci" (click)="sortiraj('domaci')">Domaći<span aria-hidden="true">{{ strelica('domaci') }}</span></button>
                </th>
                <th scope="col">Poslednji test</th>
                <th scope="col">Kontakt</th>
                <th scope="col" class="ne-stampaj"><span class="sr-only">Akcije</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of prikazani(); track r.student.id; let i = $index) {
                @let pr = procenat(r.prisutan, r.predavanja);
                <tr (click)="otvoriStudenta(r.student.id)" [attr.data-student]="r.student.id">
                  <td class="rb mono samo-desktop">{{ i + 1 }}</td>
                  <td class="c-glavno">
                    <button type="button" class="otvori" (click)="$event.stopPropagation(); otvoriStudenta(r.student.id)">{{ ime(r.student) }}</button>
                  </td>
                  <td class="mono nowrap">{{ r.student.indeks | indeks: r.student.godina }}</td>
                  <td class="samo-desktop nowrap">
                    @if (pr !== null) {
                      <span class="traka" aria-hidden="true"><i [style.width.%]="pr"></i></span>
                      <span class="mono">{{ pr }} %</span>
                      <span class="sitno"> ({{ r.prisutan }}/{{ r.predavanja }})</span>
                    } @else {
                      <span class="nema">—</span>
                    }
                  </td>
                  <td class="samo-desktop mono nowrap">{{ r.domaciUkupno > 0 ? r.domaciUradjeno + '/' + r.domaciUkupno : '—' }}</td>
                  <td class="samo-desktop">
                    @if (r.poslednjiTest; as t) {
                      <a [routerLink]="['/testovi', t.testId]" (click)="$event.stopPropagation()">{{ t.tip || 'Test' }}</a>
                      <span class="sitno"> · {{ t.datum | datum: 'kratko' }} · {{ t.poeni ?? '—' }}@if (t.maxPoena) {/{{ t.maxPoena }}}</span>
                    } @else {
                      <span class="nema">—</span>
                    }
                  </td>
                  <td class="samo-desktop kontakt">
                    @if (r.student.email; as e) {
                      <a [href]="'mailto:' + e" (click)="$event.stopPropagation()">{{ e }}</a>
                    }
                    @if (r.student.brojTelefona; as t) {
                      <a [href]="telHref(t)" (click)="$event.stopPropagation()">{{ t }}</a>
                    }
                    @if (!r.student.email && !r.student.brojTelefona) {
                      <span class="nema">—</span>
                    }
                  </td>
                  <td class="c-st ne-stampaj">
                    <button matIconButton type="button" [matMenuTriggerFor]="meni" [attr.aria-label]="'Akcije za ' + ime(r.student)"
                      (click)="$event.stopPropagation()" data-meni-studenta><mat-icon svgIcon="more_vert" /></button>
                    <mat-menu #meni="matMenu" xPosition="before">
                      <button mat-menu-item type="button" (click)="otvoriDijalog('izmena', r.student)" data-izmeni><mat-icon svgIcon="edit" />Izmeni</button>
                      <button mat-menu-item type="button" (click)="otvoriDijalog('premesti', r.student)" data-premesti><mat-icon svgIcon="swap_horiz" />Premesti u grupu</button>
                    </mat-menu>
                  </td>
                  <td class="c-meta">{{ meta(r) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (q()) {
        <app-empty-state naslov="Nema studenata za izabrane filtere" [tekst]="'Nijedan student ne odgovara pretrazi „' + q() + '“.'">
          <button matButton="outlined" type="button" (click)="postavi({ q: null })" data-ocisti>Očisti filtere</button>
        </app-empty-state>
      } @else {
        <app-empty-state naslov="Grupa još nema studenata" ikona="groups" tekst="Dodaj studente ručno ili pokreni onboarding, pa se prijave sami.">
          <button matButton="filled" type="button" (click)="otvoriDijalog('dodaj')"><mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj studenta</button>
          <a matButton="outlined" routerLink="../onboarding">Onboarding</a>
        </app-empty-state>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .alati { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .samo-stampa { display: none; }
    .rb { width: 1%; color: var(--muted); }
    .nowrap { white-space: nowrap; }
    .sitno { font-size: 12.5px; color: var(--muted); }
    .nema { color: var(--muted); }
    .kontakt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; overflow-wrap: anywhere; }
    .kontakt a, td a { color: var(--primary); }
    /* email i telefon su jedan ispod drugog: svaki je cilj od bar 24 px (WCAG 2.5.8, axe target-size) */
    .kontakt a { display: inline-flex; align-items: center; min-height: 24px; }
    .traka { display: inline-block; width: 48px; height: 6px; margin-right: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; vertical-align: middle; }
    .traka i { display: block; height: 100%; background: var(--primary); }
    @media print {
      .samo-stampa { display: block; margin: 0 0 8px; }
      .lista-kartica { border: 0; }
      .samo-desktop { display: table-cell !important; }
      .c-meta { display: none !important; }
    }
  `,
})
export class GrupaStudentiTab {
  protected readonly store = inject(GrupaStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly obavestenja = inject(NotificationStore);
  private readonly reference = inject(ReferenceStore);
  private readonly dokument = inject(DOCUMENT);

  /** Query parametri (`withComponentInputBinding`). */
  readonly q = input<string | null>();
  readonly sort = input<string>();

  protected readonly procenat = procenat;
  protected readonly ime = imeStudenta;

  protected readonly sortUpit = computed(() => parseSortStudenata(this.sort()));
  protected readonly prikazani = computed(() => sortirajStudente(filtrirajStudente(this.store.studenti(), this.q()), this.sortUpit()));
  protected readonly brojTekst = computed(() => {
    const n = this.prikazani().length;
    const ukupno = this.store.studenti().length;
    return n === ukupno ? `${n} studenata` : `${n} od ${ukupno} studenata`;
  });

  protected postavi(izmene: { q?: string | null; sort?: string | null }): void {
    void this.router.navigate([], { queryParams: izmene, queryParamsHandling: 'merge', replaceUrl: 'q' in izmene });
  }

  protected sortiraj(polje: PoljeSortaStudenata): void {
    const s = this.sortUpit();
    const smer = s.polje === polje && s.smer === 'asc' ? 'desc' : 'asc';
    const novi = polje === PODRAZUMEVAN_SORT_STUDENATA.polje && smer === PODRAZUMEVAN_SORT_STUDENATA.smer ? null : `${polje},${smer}`;
    this.postavi({ sort: novi });
  }

  protected ariaSort(polje: PoljeSortaStudenata): string | null {
    const s = this.sortUpit();
    return s.polje === polje ? (s.smer === 'asc' ? 'ascending' : 'descending') : null;
  }

  protected strelica(polje: PoljeSortaStudenata): string {
    const s = this.sortUpit();
    return s.polje === polje ? (s.smer === 'asc' ? ' ↑' : ' ↓') : '';
  }

  protected meta(r: GrupaStudentStat): string {
    const pr = procenat(r.prisutan, r.predavanja);
    return [pr !== null ? `prisutnost ${pr} %` : null, r.domaciUkupno > 0 ? `domaći ${r.domaciUradjeno}/${r.domaciUkupno}` : null, r.student.email]
      .filter(Boolean)
      .join(' · ');
  }

  protected telHref(t: string): string {
    return 'tel:' + t.replace(/[^\d+]/g, '');
  }

  protected otvoriStudenta(id: number): void {
    void this.router.navigate(['/studenti', id]);
  }

  protected otvoriDijalog(nacin: NacinStudentDialoga, student?: StudentInfo): void {
    const g = this.store.grupa();
    if (!g) {
      return;
    }
    StudentDialog.otvori(this.dialog, { nacin, grupa: { id: g.id, naziv: g.naziv, godinaUpisa: g.godinaUpisa }, student })
      .pipe(filter((s): s is StudentInfo => !!s))
      .subscribe(s => {
        const ime = imeStudenta(s);
        if (nacin === 'premesti') {
          this.obavestenja.uspeh(`${ime} je premešten u drugu grupu.`);
        } else {
          this.obavestenja.uspeh(nacin === 'dodaj' ? `${ime} je dodat u grupu.` : `${ime} je sačuvan.`);
        }
        this.reference.invalidiraj('grupe');
        this.store.osvezi();
      });
  }

  protected kopirajEmailove(): void {
    const adrese = emailoviZaKopiranje(this.prikazani().map(r => r.student));
    if (adrese.length === 0) {
      this.obavestenja.info('Nijedan student nema email.');
      return;
    }
    void kopirajTekst(adrese.join(SEPARATOR_EMAILOVA), this.dokument).then(ok =>
      ok ? this.obavestenja.uspeh(`Kopirano: ${brojAdresaTekst(adrese.length)}`) : this.obavestenja.greska('Kopiranje nije uspelo. Pregledač ne dozvoljava pristup clipboardu.'),
    );
  }

  protected stampaj(): void {
    this.dokument.defaultView?.print();
  }
}
