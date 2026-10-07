import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { AppRoutes } from '../../../app.routes';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { PredmetKratko, PrezentacijaInfo } from '../data-access/uzivo.models';
import { otvoriNovuPrezentaciju } from './nova-prezentacija.dialog';

function predmetIzUpita(v: string | null): number | null {
  return v !== null && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null;
}

/** Lista prezentacija (spec 6.2): filter predmeta u `?predmet=`, "Nova prezentacija", "U toku" za aktivno izvođenje. */
@Component({
  selector: 'gfs-prezentacije-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  template: `
    <main class="uz-ed-strana">
      <header class="uz-ed-strana-zaglavlje">
        <h1>Prezentacije</h1>
        <mat-form-field class="uz-ed-filter" subscriptSizing="dynamic">
          <mat-label>Predmet</mat-label>
          <mat-select [value]="predmetId()" (selectionChange)="filtriraj($event.value)">
            <mat-option [value]="null">Svi predmeti</mat-option>
            @for (p of predmeti(); track p.id) {
              <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button color="primary" type="button" (click)="nova()">
          <mat-icon>add</mat-icon>Nova prezentacija
        </button>
      </header>

      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }

      @if (lista(); as l) {
        @if (l.length) {
          <table class="uz-ed-tabela">
            <thead>
              <tr>
                <th scope="col">Naziv</th>
                <th scope="col">Predmet</th>
                <th scope="col" class="uz-ed-broj">Slajdova / pitanja</th>
                <th scope="col">Izmenjeno</th>
              </tr>
            </thead>
            <tbody>
              @for (p of l; track p.id) {
                <tr>
                  <td>
                    <a class="uz-ed-veza" [routerLink]="'/' + rute.prezentacija(p.id)">{{ p.naziv }}</a>
                    @if (p.aktivnoIzvodjenjeId) {
                      <span class="uz-cip uz-ed-u-toku">U toku</span>
                    }
                    @if (p.opis) {
                      <div class="uz-ed-opis-red">{{ p.opis }}</div>
                    }
                  </td>
                  <td>{{ p.predmet.naziv }}</td>
                  <td class="uz-ed-broj">{{ p.brojSlajdova }} / {{ p.brojPitanja }}</td>
                  <td>{{ p.izmenjeno | date: 'd.M.yyyy. HH:mm' }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <section class="uz-ed-prazno-stanje">
            <mat-icon aria-hidden="true">co_present</mat-icon>
            <h2>{{ predmetId() ? 'Ovaj predmet još nema prezentacija.' : 'Još nema prezentacija.' }}</h2>
            <p>
              Prezentacija je niz slajdova sa tekstom i pitanjima. Tokom predavanja je pokreneš, studenti uđu preko QR
              koda sa telefona i odgovaraju na pitanja, a ti biraš kada se vide rezultati.
            </p>
            <button mat-flat-button color="primary" type="button" (click)="nova()">
              <mat-icon>add</mat-icon>Nova prezentacija
            </button>
          </section>
        }
      } @else if (!greska()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacija" />
      }
    </main>
  `,
})
export class PrezentacijeListaPage {
  private readonly api = inject(PrezentacijeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  protected readonly rute = AppRoutes;
  protected readonly predmetId = toSignal(
    this.route.queryParamMap.pipe(map(q => predmetIzUpita(q.get('predmet')))), { initialValue: null });
  protected readonly predmeti = signal<PredmetKratko[]>([]);
  protected readonly lista = signal<PrezentacijaInfo[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  private readonly predmetiUcitani = computed(() => this.predmeti().length > 0);

  constructor() {
    this.api.predmeti().pipe(takeUntilDestroyed()).subscribe({
      next: p => this.predmeti.set(p),
      error: e => this.greska.set(razlogGreske(e, 'Predmeti nisu učitani.')),
    });
    this.route.queryParamMap.pipe(
      map(q => predmetIzUpita(q.get('predmet'))),
      distinctUntilChanged(),
      tap(() => this.lista.set(null)),
      switchMap(id => this.api.lista(id).pipe(catchError(e => {
        this.greska.set(razlogGreske(e, 'Prezentacije nisu učitane.'));
        return of(null);
      }))),
      takeUntilDestroyed(),
    ).subscribe(l => {
      if (l) this.greska.set(null);
      this.lista.set(l);
    });
  }

  protected filtriraj(predmet: number | null): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { predmet }, queryParamsHandling: 'merge' });
  }

  protected nova(): void {
    if (!this.predmetiUcitani()) {
      this.greska.set('Predmeti još nisu učitani. Pokušaj ponovo za trenutak.');
      return;
    }
    otvoriNovuPrezentaciju(this.dialog, { predmeti: this.predmeti(), predmetId: this.predmetId() })
      .subscribe(p => p && this.router.navigate(['/' + AppRoutes.prezentacija(p.id)]));
  }
}
