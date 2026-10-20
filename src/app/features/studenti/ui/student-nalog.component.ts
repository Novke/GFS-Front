import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { finalize, Observable, Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ObavestenjaStore } from '../../../core/state/obavestenja.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { StudentNalogApi, StudentNalogInfo } from '../data-access/student-nalog.api';

type Status = 'loading' | 'loaded' | 'error';

let brojac = 0;

/**
 * Sekcija "Nalog" na kartici studenta (spec prijave, 5.3): da li student ima mejl, zapamćeni uređaji (opis, način `Kod` /
 * `Moodle`, poslednji ulaz), Moodle veza i akcije "Pošalji kod", "Opozovi uređaje" i "Raskini Moodle vezu" (poslednje dve uz
 * `ConfirmDialog`). Učitavanje je tiho (greška je u sekciji), akcije nisu tihe: razlog servera (409 `Student nema mejl.`,
 * 429) prikazuje snackbar. `email` je samo ključ osvežavanja: kad se mejl studenta izmeni na istoj stranici, nalog se
 * učitava ponovo, pa `imaMejl` ostaje tačan. Posle "Pošalji kod" server rešava otvorena obaveštenja "Ne stiže mi kod" tog
 * studenta, pa se značka u gornjoj traci osvežava.
 */
@Component({
  selector: 'app-student-nalog',
  imports: [DatumPipe, MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nalog" [attr.aria-labelledby]="naslovId" data-nalog>
      <h2 [id]="naslovId">Nalog</h2>
      @switch (status()) {
        @case ('loading') {
          <p class="stanje" role="status">Učitavanje naloga…</p>
        }
        @case ('error') {
          <div class="stanje">
            <p role="alert">{{ greska() }}</p>
            <button matButton="outlined" type="button" data-ponovo (click)="ucitaj()">Pokušaj ponovo</button>
          </div>
        }
        @default {
          @if (nalog(); as n) {
            @if (greskaOsvezavanja(); as g) {
              <div class="osvezavanje" data-osvezavanje-greska>
                <p role="alert">Podaci možda nisu ažurni: {{ g }}</p>
                <button matButton="outlined" type="button" data-osvezi-ponovo (click)="ucitaj()">Pokušaj ponovo</button>
              </div>
            }
            <div class="redovi">
              @if (!n.imaMejl) {
                <p class="upozorenje" [id]="mejlId" data-bez-mejla>Student nema mejl: upiši ga da bi mogao da dobije kod.</p>
              }
              @if (n.poslednjaPrijava; as p) {
                <p class="red" data-poslednja-prijava><span class="oznaka">Poslednja prijava</span> {{ p | datum: 'sa-vremenom' }}</p>
              }
              <div class="red" data-uredjaji>
                <span class="oznaka">Uređaji</span>
                @if (n.uredjaji.length > 0) {
                  <ul class="lista">
                    @for (u of n.uredjaji; track u.id) {
                      <li [attr.data-uredjaj]="u.id">
                        <span class="opis">{{ u.opis || 'Nepoznat uređaj' }}</span>
                        <span class="nacin">{{ u.nacin === 'LTI' ? 'Moodle' : 'Kod' }}</span>
                        <span class="vreme">poslednji ulaz {{ u.poslednjiUlaz | datum: 'sa-vremenom' }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <span class="prazno" [id]="uredjajiId" data-bez-uredjaja>Nema zapamćenih uređaja.</span>
                }
              </div>
              <p class="red" [id]="moodleId" data-moodle>
                <span class="oznaka">Moodle</span>
                @if (n.moodle.povezan) {
                  povezan · poslednji ulaz {{ n.moodle.poslednjiUlaz | datum: 'sa-vremenom' }}
                } @else {
                  nije povezan
                }
              </p>
            </div>
            <div class="akcije">
              <button matButton="filled" type="button" data-posalji-kod [disabled]="!n.imaMejl || radi()"
                      [attr.aria-describedby]="n.imaMejl ? null : mejlId" (click)="posaljiKod()">Pošalji kod</button>
              <button matButton="outlined" type="button" data-opozovi [disabled]="n.uredjaji.length === 0 || radi()"
                      [attr.aria-describedby]="n.uredjaji.length === 0 ? uredjajiId : null" (click)="opozovi()">Opozovi uređaje</button>
              <button matButton="outlined" type="button" data-raskini-moodle [disabled]="!n.moodle.povezan || radi()"
                      [attr.aria-describedby]="n.moodle.povezan ? null : moodleId" (click)="raskiniMoodle()">Raskini Moodle vezu</button>
            </div>
          }
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; margin-bottom: 16px; }
    .nalog { padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
    h2 { margin: 0 0 8px; font-size: 16px; }
    p { margin: 0; }
    .redovi { display: flex; flex-direction: column; gap: 6px; }
    .red { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
    .oznaka { min-width: 9.5rem; color: var(--muted); font-size: 13px; font-weight: 600; }
    .upozorenje { color: var(--ink); font-weight: 600; }
    .lista { margin: 0; padding: 0; list-style: none; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    li { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
    .opis { font-weight: 600; overflow-wrap: anywhere; }
    .nacin { padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink); font-size: 12px; font-weight: 600; }
    .vreme, .prazno { color: var(--muted); font-size: 13px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .osvezavanje { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 8px; }
    .stanje { color: var(--muted); }
    .stanje p { margin-bottom: 8px; color: var(--ink); }
    @media (max-width: 599.98px) { .oznaka { min-width: 100%; } .akcije button { flex: 1 1 100%; } }
  `,
})
export class StudentNalogComponent {
  private readonly api = inject(StudentNalogApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly obavestenja = inject(ObavestenjaStore);

  readonly studentId = input.required<number>();
  /** Mejl studenta sa kartice: ne prikazuje se, samo njegova promena ponovo učitava nalog. */
  readonly email = input<string | null | undefined>(null);

  protected readonly nalog = signal<StudentNalogInfo | null>(null);
  protected readonly status = signal<Status>('loading');
  protected readonly greska = signal<string | null>(null);
  /** Akcija u toku (dugmad su isključena dok se ne završi). */
  protected readonly radi = signal(false);
  protected readonly naslovId = `nalog-naslov-${++brojac}`;
  protected readonly mejlId = `nalog-bez-mejla-${brojac}`;
  protected readonly uredjajiId = `nalog-bez-uredjaja-${brojac}`;
  protected readonly moodleId = `nalog-moodle-${brojac}`;
  /** Osvežavanje nije uspelo, a stariji podaci istog studenta su još tu: red iznad podataka umesto praznog stanja greške. */
  protected readonly greskaOsvezavanja = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  private ucitanZa: number | null = null;
  private veza: Subscription | null = null;
  /** Raste kad se prikaže drugi student: zahtev i potvrda iz prethodne generacije ne rade ništa. */
  private generacija = 0;
  /** Neka potvrda (`ConfirmDialog`) je otvorena: drugi klik ne otvara drugu. */
  private potvrdaOtvorena = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.veza?.unsubscribe());
    effect(() => {
      const id = this.studentId();
      this.email();
      untracked(() => {
        if (id !== this.ucitanZa) {
          // drugi student: ne pokazuj uređaje prethodnog
          this.generacija++;
          this.radi.set(false);
          this.nalog.set(null);
          this.greskaOsvezavanja.set(null);
          this.status.set('loading');
        }
        this.ucitaj();
      });
    });
  }

  protected ucitaj(): void {
    const id = this.studentId();
    this.veza?.unsubscribe();
    if (this.nalog() === null) {
      this.status.set('loading');
    }
    this.veza = this.api.nalog(id, { tiho: true }).subscribe({
      next: n => {
        this.ucitanZa = id;
        this.nalog.set(n);
        this.greskaOsvezavanja.set(null);
        this.status.set('loaded');
      },
      error: (e: unknown) => {
        const razlog = e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
        if (this.nalog() !== null && this.ucitanZa === id) {
          // akcija je možda uspela: podaci istog studenta ostaju vidljivi, greška je red iznad njih
          this.greskaOsvezavanja.set(razlog);
          return;
        }
        this.nalog.set(null);
        this.greska.set(razlog);
        this.status.set('error');
      },
    });
  }

  protected posaljiKod(): void {
    this.izvrsi(
      this.api.posaljiKod(this.studentId()),
      () => {
        this.poruke.uspeh('Kod je poslat na mejl studenta.');
        this.obavestenja.osveziBroj();
      },
      false,
    );
  }

  protected opozovi(): void {
    this.uzPotvrdu({
      naslov: 'Opozvati uređaje studenta?',
      tekst: 'Student će morati ponovo da se prijavi kodom sa mejla (ili iz Moodle-a) na svakom uređaju.',
      potvrdi: 'Opozovi uređaje',
      destruktivno: true,
    }, () => this.izvrsi(this.api.opozoviUredjaje(this.studentId()), r => {
      const n = typeof r?.opozvano === 'number' ? r.opozvano : 0;
      if (n > 0) {
        this.poruke.uspeh(`Opozvano uređaja: ${n}.`);
      } else {
        this.poruke.info('Nijedan uređaj nije bio zapamćen.');
      }
    }));
  }

  protected raskiniMoodle(): void {
    this.uzPotvrdu({
      naslov: 'Raskinuti vezu sa Moodle nalogom?',
      tekst: [
        'Moodle nalog više neće biti povezan sa ovim studentom. Veza se može uspostaviti ponovo pri sledećem ulasku iz Moodle-a.',
        'Uređaji prijavljeni preko Moodle-a biće odjavljeni.',
      ],
      potvrdi: 'Raskini vezu',
      destruktivno: true,
    }, () => this.izvrsi(this.api.raskiniMoodle(this.studentId()), () => this.poruke.uspeh('Moodle veza je raskinuta.')));
  }

  /**
   * Potvrda pa akcija. Jedna potvrda odjednom (dvoklik ne otvara dva dijaloga); ako se u međuvremenu prikaže drugi student,
   * potvrda ne važi za njega i akcija se ne izvršava.
   */
  private uzPotvrdu(cfg: Parameters<typeof ConfirmDialog.otvori>[1], akcija: () => void): void {
    if (this.potvrdaOtvorena || this.radi()) {
      return;
    }
    this.potvrdaOtvorena = true;
    const generacija = this.generacija;
    ConfirmDialog.otvori(this.dialog, cfg).pipe(
      finalize(() => (this.potvrdaOtvorena = false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(da => {
      if (da && generacija === this.generacija) {
        akcija();
      }
    });
  }

  /**
   * Zahtev akcije (greška ide u snackbar, interceptor). `osvezi` = posle odgovora se nalog učitava ponovo; posle greške
   * uvek (npr. 409 znači da mejl više ne postoji), osim kod 429, gde se ništa nije promenilo.
   */
  private izvrsi<T>(zahtev: Observable<T>, uspeh: (r: T) => void, osvezi = true): void {
    if (this.radi()) {
      return;
    }
    this.radi.set(true);
    const generacija = this.generacija;
    zahtev.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (generacija !== this.generacija) {
          return; // u međuvremenu je prikazan drugi student: bez poruke i bez novog učitavanja
        }
        this.radi.set(false);
        uspeh(r);
        if (osvezi) {
          this.ucitaj();
        }
      },
      error: (e: unknown) => {
        if (generacija !== this.generacija) {
          return;
        }
        this.radi.set(false);
        if (!(e instanceof HttpErrorResponse && e.status === 429)) {
          this.ucitaj();
        }
      },
    });
  }
}
