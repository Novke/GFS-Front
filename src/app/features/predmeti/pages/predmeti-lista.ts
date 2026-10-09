import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { catchError, filter, forkJoin, map, Observable, of } from 'rxjs';

import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { formatSkolskaGodina, tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { podrazumevanaListaPredavanja } from '../../../core/state/predavanja-lista.store';
import { TestoviApi } from '../../../core/api/testovi.api';
import { podrazumevanaListaTestova } from '../../../core/state/testovi-lista.store';
import { sveStrane, VELICINA_STRANE } from '../data-access/predmeti.api';
import { PredmetInfo, statistikaPredmeta, StatistikaPredmeta } from '../data-access/predmeti.models';
import { PredmetDialog } from '../ui/predmet-dialog';

/** Brojke tekuće godine; `null` dok se učitavaju ili ako učitavanje nije uspelo (lista predmeta ostaje). */
type Brojke = Map<number, StatistikaPredmeta> | null;

/**
 * Svi predmeti (`/predmeti`): naziv, broj predavanja i testova i grupe u tekućoj školskoj godini (iz lista predavanja i
 * testova godine, sve strane) + "Nov predmet" (dijalog, `POST predmeti`). Red vodi na hub predmeta.
 */
@Component({
  selector: 'app-predmeti-lista',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Predmeti" [podnaslov]="'Brojke za školsku godinu ' + godina">
      <button akcije matButton="filled" type="button" (click)="novPredmet()" data-nov-predmet>
        <mat-icon svgIcon="add" aria-hidden="true" />Nov predmet
      </button>
    </app-page-header>
    <section class="lista-kartica" aria-label="Lista predmeta" [attr.aria-busy]="reference.ucitava()">
      @if (reference.imaGresku() && predmeti().length === 0) {
        <app-error-panel [poruka]="reference.greska()" (ponovo)="reference.invalidiraj('predmeti')" />
      } @else if (predmeti().length > 0) {
        <div class="tabela-okvir">
          <table class="lista-tabela">
            <caption class="sr-only">Predmeti</caption>
            <thead>
              <tr>
                <th scope="col">Naziv</th>
                <th scope="col" class="broj">Predavanja</th>
                <th scope="col" class="broj">Testovi</th>
                <th scope="col">Grupe</th>
              </tr>
            </thead>
            <tbody>
              @for (p of predmeti(); track p.id) {
                @let s = statistika(p.id);
                <tr (click)="otvori(p.id)" [attr.data-predmet]="p.id">
                  <td class="c-glavno"><a class="otvori" [routerLink]="['/predmeti', p.id]" (click)="$event.stopPropagation()">{{ p.naziv || '—' }}</a></td>
                  <td class="samo-desktop broj mono">{{ s ? s.predavanja : '—' }}</td>
                  <td class="samo-desktop broj mono">{{ s ? s.testovi : '—' }}</td>
                  <td class="samo-desktop" [class.nema]="!s?.grupe?.length">{{ s?.grupe?.length ? s!.grupe.join(', ') : '—' }}</td>
                  <td class="c-meta">{{ meta(s) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (greskaBrojki()) {
          <p class="lista-broj" role="status">Brojke za školsku godinu nisu učitane.
            <button matButton type="button" (click)="brojke.reload()">Pokušaj ponovo</button></p>
        }
      } @else if (reference.status() === 'loaded') {
        <app-empty-state naslov="Još nema predmeta" ikona="menu_book" tekst="Dodaj prvi predmet; predavanja, domaći i testovi se vezuju za njega.">
          <button matButton="filled" type="button" (click)="novPredmet()"><mat-icon svgIcon="add" aria-hidden="true" />Nov predmet</button>
        </app-empty-state>
      } @else {
        <app-skeleton-rows [redovi]="4" />
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .otvori { text-decoration: none; }
    .broj { text-align: right; }
    app-error-panel { display: block; margin: 0 16px; }
  `,
})
export class PredmetiLista implements OnInit {
  protected readonly reference = inject(ReferenceStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private readonly predavanja = inject(PredavanjaApi);
  private readonly testovi = inject(TestoviApi);

  private readonly tekuca = tekucaSkolskaGodina();
  protected readonly godina = formatSkolskaGodina(this.tekuca);
  protected readonly predmeti = computed<PredmetInfo[]>(() =>
    [...this.reference.predmeti()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr')),
  );

  protected readonly brojke = rxResource<Brojke | 'greska', number>({
    params: () => this.tekuca,
    stream: ({ params: godina }): Observable<Brojke | 'greska'> => {
      const p = podrazumevanaListaPredavanja();
      const t = podrazumevanaListaTestova();
      const strana = { sort: 'datum,desc', velicina: VELICINA_STRANE };
      return forkJoin({
        predavanja: sveStrane(n => this.predavanja.pretraga({ ...p, ...strana, strana: n, filteri: { ...p.filteri, godina } }, { tiho: true })),
        testovi: sveStrane(n => this.testovi.pretraga({ ...t, ...strana, strana: n, filteri: { ...t.filteri, godina } }, { tiho: true })),
      }).pipe(
        map(x => statistikaPredmeta(x.predavanja, x.testovi)),
        catchError(() => of('greska' as const)),
      );
    },
  });
  private readonly mapa = computed<Brojke>(() => {
    const v = this.brojke.hasValue() ? this.brojke.value() : null;
    return v === 'greska' ? null : v;
  });
  protected readonly greskaBrojki = computed(() => this.brojke.hasValue() && this.brojke.value() === 'greska');

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  /** Brojke predmeta; predmet bez nastave u godini ima nule, a dok brojke nisu tu (ili su pale) `null` (`—`). */
  protected statistika(id: number): StatistikaPredmeta | null {
    const m = this.mapa();
    return m ? (m.get(id) ?? { predavanja: 0, testovi: 0, grupe: [] }) : null;
  }

  protected meta(s: StatistikaPredmeta | null): string {
    if (!s) {
      return '—';
    }
    return `${s.predavanja} pred. · ${s.testovi} test. · ${s.grupe.length ? s.grupe.join(', ') : 'bez grupa'}`;
  }

  protected otvori(id: number): void {
    void this.router.navigate(['/predmeti', id]);
  }

  protected novPredmet(): void {
    PredmetDialog.otvori(this.dialog)
      .pipe(filter((p): p is PredmetInfo => !!p))
      .subscribe(p => {
        this.reference.invalidiraj('predmeti');
        this.obavestenja.uspeh(`Predmet ${p.naziv} je dodat.`);
        void this.router.navigate(['/predmeti', p.id]);
      });
  }
}
