import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { formatIndeks } from '../../../shared/util/indeks.pipe';
import { formatSkolskaGodina } from '../../../shared/util/skolska-godina';
import { GrupeApi } from '../../../core/api/grupe.api';
import { GrupaStudentStat, imeStudenta, procenat } from '../../../core/api/grupe.models';
import { brojStudenataTekst } from '../../../shared/util/mnozina';
import { PredmetStore } from '../data-access/predmet.store';
import { grupeSaPredavanjima } from '../data-access/predmeti.models';

/** Red taba: student sa statistikom na predmetu i grupom iz koje dolazi. */
export interface StudentPredmeta {
  stat: GrupaStudentStat;
  grupa: { id: number; naziv: string };
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'dj').toLowerCase();

/** Pretraga po imenu, prezimenu i indeksu (bez dijakritika); redosled: grupa po nazivu, pa prezime i ime. */
export function studentiPredmeta(redovi: readonly StudentPredmeta[], q: string | null): StudentPredmeta[] {
  const t = norm(q?.trim());
  const ime = (r: StudentPredmeta) => `${r.stat.student?.prezime ?? ''} ${r.stat.student?.ime ?? ''}`;
  return redovi
    .filter(r => !t || [ime(r), `${r.stat.student?.ime ?? ''} ${r.stat.student?.prezime ?? ''}`, r.stat.student?.indeks].some(x => norm(x).includes(t)))
    .sort((a, b) => a.grupa.naziv.localeCompare(b.grupa.naziv, 'sr') || ime(a).localeCompare(ime(b), 'sr'));
}

interface Ucitano {
  redovi: StudentPredmeta[];
  greska: string | null;
}

/**
 * Tab Studenti huba: studenti grupa koje imaju predavanja iz predmeta u izabranoj školskoj godini (`GET grupe` za
 * nazive, grupe sa predavanjima iz nastave godine), ili samo izabrane grupe iz zaglavlja. Statistika po studentu je za
 * ovaj predmet (`GET grupe/{id}/pregled?predmetId`): prisutnost x/y i domaći x/y. Ime vodi na karticu studenta na
 * predmetu (`/studenti/:id/predmeti/:pid`).
 */
@Component({
  selector: 'app-predmet-studenti-tab',
  imports: [EmptyState, ErrorPanel, FilterBar, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (predmet.statusNastave() === 'error') {
      <app-error-panel naslov="Nastava predmeta nije učitana." [poruka]="predmet.greskaNastave()" (ponovo)="predmet.osveziNastavu()" />
    } @else if (predmet.statusNastave() !== 'loaded') {
      <app-skeleton-rows [redovi]="6" />
    } @else if (grupe().length === 0) {
      <app-empty-state [naslov]="'Nijedna grupa nema predavanja iz predmeta u školskoj godini ' + godina()" ikona="groups"
        tekst="Studenti se prikazuju za grupe koje imaju nastavu iz predmeta u izabranoj godini." />
    } @else {
      <section class="lista-kartica" aria-label="Studenti predmeta" [attr.aria-busy]="podaci.isLoading()">
        <app-filter-bar [pretraga]="q()" pretragaLabela="Pretraži po imenu ili indeksu…" (pretragaChange)="q.set($event)" />
        @let st = stanje();
        @if (st?.greska) {
          <app-error-panel naslov="Studenti nisu učitani." [poruka]="st?.greska" (ponovo)="podaci.reload()" />
        } @else if (!st) {
          <app-skeleton-rows [redovi]="6" />
        } @else if (redovi().length === 0) {
          <app-empty-state [naslov]="q() ? 'Nema studenata za pretragu' : 'Grupe nemaju studenata'" ikona="person" />
        } @else {
          <p class="lista-broj" aria-live="polite">{{ brojStudenata(redovi().length) }} · grupe: {{ naziviGrupa() }}</p>
          <div class="tabela-okvir">
            <table class="lista-tabela studenti">
              <caption class="sr-only">Studenti predmeta</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Indeks</th>
                  <th scope="col">Grupa</th>
                  <th scope="col">Prisutnost</th>
                  <th scope="col">Domaći</th>
                </tr>
              </thead>
              <tbody>
                @for (r of redovi(); track r.grupa.id + '-' + r.stat.student.id) {
                  <tr [attr.data-student]="r.stat.student.id">
                    <td class="c-glavno">
                      <a class="otvori" [routerLink]="['/studenti', r.stat.student.id, 'predmeti', predmet.id()]">{{ ime(r) }}</a>
                    </td>
                    <td class="samo-desktop mono brojevi-sitno">{{ indeks(r) }}</td>
                    <td class="samo-desktop brojevi-sitno">{{ r.grupa.naziv }}</td>
                    <td class="samo-desktop mono brojevi-sitno">{{ prisutnost(r) }}</td>
                    <td class="samo-desktop mono brojevi-sitno">{{ domaci(r) }}</td>
                    <td class="c-meta">{{ indeks(r) }} · {{ r.grupa.naziv }} · prisutnost {{ prisutnost(r) }} · domaći {{ domaci(r) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .otvori { text-decoration: none; }
    .studenti tbody tr { cursor: default; }
    app-error-panel { display: block; }
    section app-error-panel { margin: 0 16px; }
  `,
})
export class PredmetStudentiTab implements OnInit {
  protected readonly predmet = inject(PredmetStore);
  private readonly reference = inject(ReferenceStore);
  private readonly api = inject(GrupeApi);

  protected readonly brojStudenata = brojStudenataTekst;
  protected readonly q = signal<string | null>(null);
  protected readonly godina = computed(() => formatSkolskaGodina(this.predmet.godina()));

  /** Izabrana grupa iz zaglavlja ili sve grupe sa predavanjima u godini (nazivi iz `GET grupe`). */
  protected readonly grupe = computed(() => {
    const izabrana = this.predmet.grupa();
    const ids = izabrana !== null ? [izabrana] : grupeSaPredavanjima(this.predmet.nastava() ?? { predavanja: [] });
    const sve = this.reference.grupe();
    const izNastave = this.predmet.grupe();
    return ids.map(id => ({ id, naziv: sve.find(g => g.id === id)?.naziv ?? izNastave.find(g => g.id === id)?.naziv ?? '—' }));
  }, { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  protected readonly naziviGrupa = computed(() => this.grupe().map(g => g.naziv).join(', '));

  protected readonly podaci = rxResource<Ucitano, { predmet: number; grupe: { id: number; naziv: string }[] } | undefined>({
    params: () => {
      const predmet = this.predmet.id();
      const grupe = this.grupe();
      return predmet === null || this.predmet.statusNastave() !== 'loaded' || grupe.length === 0 ? undefined : { predmet, grupe };
    },
    stream: ({ params }): Observable<Ucitano> =>
      forkJoin(
        params.grupe.map(g =>
          this.api.pregled(g.id, params.predmet, { tiho: true }).pipe(map(p => (p?.studenti ?? []).filter(s => !!s?.student).map(stat => ({ stat, grupa: g })))),
        ),
      ).pipe(
        map(liste => ({ redovi: liste.flat(), greska: null })),
        catchError((e: unknown) => of({ redovi: [], greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM })),
      ),
  });

  protected readonly stanje = computed(() => (this.podaci.hasValue() ? this.podaci.value() : null));
  protected readonly redovi = computed(() => studentiPredmeta(this.stanje()?.redovi ?? [], this.q()));

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  protected ime(r: StudentPredmeta): string {
    return imeStudenta(r.stat.student);
  }

  protected indeks(r: StudentPredmeta): string {
    return formatIndeks(r.stat.student.indeks, r.stat.student.godina || null);
  }

  protected prisutnost(r: StudentPredmeta): string {
    const p = procenat(r.stat.prisutan, r.stat.predavanja);
    return r.stat.predavanja > 0 ? `${r.stat.prisutan}/${r.stat.predavanja}${p === null ? '' : ` (${p} %)`}` : '—';
  }

  protected domaci(r: StudentPredmeta): string {
    return r.stat.domaciUkupno > 0 ? `${r.stat.domaciUradjeno}/${r.stat.domaciUkupno}` : '—';
  }
}
