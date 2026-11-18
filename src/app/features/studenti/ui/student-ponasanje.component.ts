import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { OPIS_OZNAKE, OznakaPonasanja, OznakePonasanjaApi } from '../data-access/oznake-ponasanja.api';

let brojac = 0;

/**
 * Sekcija "Ponašanje na času" na kartici studenta (moderacija uživo, spec 2026-11-18): oznake iz konzole (sakriven odgovor,
 * utišan, izbačen), najnovije prve, svaka se briše uz potvrdu. Bez oznaka sekcije nema (karton većine studenata ostaje
 * isti). Brisanje oznake "Izbačen do kraja predavanja" skida i zabranu ulaska na tom predavanju; brisanje "Sakriven odgovor"
 * ne vraća odgovor na tablu. Učitavanje je tiho; greška je red u sekciji sa "Pokušaj ponovo".
 */
@Component({
  selector: 'app-student-ponasanje',
  imports: [DatumPipe, MatButton, MatIcon, MatIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (greska(); as g) {
      <section class="ponasanje" [attr.aria-labelledby]="naslovId" data-ponasanje>
        <h2 [id]="naslovId">Ponašanje na času</h2>
        <div class="red-greske">
          <p role="alert">Oznake nisu učitane: {{ g }}</p>
          <button matButton="outlined" type="button" data-ponovo (click)="ucitaj()">Pokušaj ponovo</button>
        </div>
      </section>
    } @else if (oznake().length) {
      <section class="ponasanje" [attr.aria-labelledby]="naslovId" data-ponasanje>
        <h2 [id]="naslovId">Ponašanje na času</h2>
        <ul class="lista">
          @for (o of oznake(); track o.id) {
            <li [attr.data-oznaka]="o.id">
              <span class="vrsta" [class.vrsta--izbacen]="o.vrsta === 'IZBACEN' || o.vrsta === 'IZBACEN_PREDAVANJE'">{{ opis[o.vrsta] }}</span>
              <span class="kada">{{ o.kreirano | datum: 'sa-vremenom' }}</span>
              <span class="gde">{{ gde(o) }}</span>
              @if (o.tekst) { <q class="tekst">{{ o.tekst }}</q> }
              <button matIconButton type="button" class="obrisi" [attr.aria-label]="'Obriši oznaku: ' + opis[o.vrsta]"
                      [disabled]="brise() === o.id" data-obrisi (click)="obrisi(o)">
                <mat-icon svgIcon="delete" />
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .ponasanje { margin-bottom: 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
    h2 { margin: 0 0 8px; font-size: 16px; }
    p { margin: 0; }
    .lista { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; min-height: 40px; }
    .vrsta { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--warn) 18%, var(--surface)); color: var(--ink);
      font-size: 12px; font-weight: 600; }
    .vrsta--izbacen { background: color-mix(in srgb, var(--danger) 16%, var(--surface)); }
    .kada, .gde { color: var(--muted); font-size: 13px; }
    .tekst { overflow-wrap: anywhere; font-style: italic; }
    .obrisi { margin-left: auto; }
    .red-greske { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  `,
})
export class StudentPonasanjeComponent {
  private readonly api = inject(OznakePonasanjaApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly studentId = input.required<number>();

  protected readonly opis = OPIS_OZNAKE;
  protected readonly oznake = signal<OznakaPonasanja[]>([]);
  protected readonly greska = signal<string | null>(null);
  /** Oznaka koja se upravo briše (dugme isključeno). */
  protected readonly brise = signal<number | null>(null);
  protected readonly naslovId = `ponasanje-naslov-${++brojac}`;
  private veza: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.veza?.unsubscribe());
    effect(() => {
      this.studentId();
      untracked(() => {
        this.oznake.set([]);
        this.ucitaj();
      });
    });
  }

  protected ucitaj(): void {
    const id = this.studentId();
    this.veza?.unsubscribe();
    this.greska.set(null);
    this.veza = this.api.lista(id).subscribe({
      next: l => this.oznake.set(l),
      error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
    });
  }

  protected gde(o: OznakaPonasanja): string {
    return [o.predmet?.naziv, o.prezentacija].filter(Boolean).join(' · ');
  }

  protected obrisi(o: OznakaPonasanja): void {
    if (this.brise() !== null) return;
    const tekst = o.vrsta === 'IZBACEN_PREDAVANJE'
      ? 'Brisanje skida i zabranu ulaska u prezentacije tog predavanja.'
      : o.vrsta === 'SAKRIVEN_ODGOVOR'
        ? 'Odgovor ostaje sakriven sa table; briše se samo oznaka na kartonu.'
        : 'Oznaka nestaje sa kartona studenta.';
    const studentId = this.studentId();
    ConfirmDialog.otvori(this.dialog, { naslov: 'Obrisati oznaku?', tekst, potvrdi: 'Obriši oznaku', destruktivno: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(da => {
        if (!da || studentId !== this.studentId()) return;
        this.brise.set(o.id);
        this.api.obrisi(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => {
            this.brise.set(null);
            this.oznake.update(l => l.filter(x => x.id !== o.id));
            this.poruke.uspeh('Oznaka je obrisana.');
          },
          error: (e: unknown) => {
            this.brise.set(null);
            const r = e instanceof HttpErrorResponse ? toApiError(e) : null;
            if (r?.status === 404) this.oznake.update(l => l.filter(x => x.id !== o.id));
            this.poruke.greska(r?.reason ?? PORUKA_SISTEM);
          },
        });
      });
  }
}
