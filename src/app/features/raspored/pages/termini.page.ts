import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { finalize, Observable, Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { brojStudenataTekst } from '../../../shared/util/mnozina';
import { blokVremena, danIDatum, isoDatum } from '../../../shared/util/termin';
import { RasporedApi } from '../data-access/raspored.api';
import { DANA_TERMINA, PromenaTerminaOdgovor, TerminInfo } from '../data-access/raspored.models';
import { imeStudenta, iznadPraga, odIliDanas, poDatumu, pomeriOd } from '../data-access/raspored.pravila';
import { OtkazivanjeDialog } from '../ui/otkazivanje.dialog';
import { VracanjeDialog } from '../ui/vracanje.dialog';

type Status = 'ucitavanje' | 'greska' | 'ok';

const kljuc = (t: Pick<TerminInfo, 'stavkaId' | 'datum'>) => `${t.stavkaId}:${t.datum}`;

/**
 * Naredni termini (`/raspored/termini?od=<datum>`; spec najave odsustva, odeljak 7): termini svih perioda za 4 nedelje od
 * `od` (podrazumevano danas), po danu, sa brojem najava (istaknut iznad praga), ko ne dolazi i zašto (rasklapa se),
 * predavanjem tog dana, i „Otkaži čas“ / „Vrati čas“ dok termin nije počeo. Obaveštenje „Mnogo najava odsustva“ vodi
 * ovde sa `od` = datum termina.
 */
@Component({
  selector: 'app-termini-page',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Naredni termini" podnaslov="Časovi iz rasporeda, sa najavama odsustva studenata.">
      <a akcije matButton="outlined" routerLink="/raspored"><mat-icon svgIcon="event" aria-hidden="true" />Raspored časova</a>
    </app-page-header>

    <nav class="prozor" aria-label="Period termina">
      <button matButton="outlined" type="button" (click)="pomeri(-dana)" data-ranije>
        <mat-icon svgIcon="chevron_left" aria-hidden="true" />Ranije
      </button>
      <span class="opseg" data-opseg>{{ opseg() }}</span>
      <button matButton="outlined" type="button" (click)="pomeri(dana)" data-kasnije>
        Kasnije<mat-icon svgIcon="chevron_right" aria-hidden="true" iconPositionEnd />
      </button>
      @if (pocetak() !== danas) {
        <button matButton type="button" (click)="idiNa(null)" data-danas>Od danas</button>
      }
    </nav>

    @switch (status()) {
      @case ('ucitavanje') {
        <app-skeleton-rows redovi="4" />
      }
      @case ('greska') {
        <app-error-panel [poruka]="greska()" (ponovo)="ucitaj()" />
      }
      @default {
        @if (dani().length === 0) {
          <app-empty-state naslov="Nema termina u ovom periodu" ikona="event"
            tekst="Termini dolaze iz rasporeda časova; proveri da li neki raspored važi u ovim danima.">
            <a matButton="outlined" routerLink="/raspored">Raspored časova</a>
          </app-empty-state>
        }
        @for (d of dani(); track d.datum) {
          <section class="dan" [attr.aria-labelledby]="'dan-' + d.datum" [attr.data-dan]="d.datum">
            <h2 [id]="'dan-' + d.datum">{{ naslovDana(d.datum) }}</h2>
            <ul class="termini">
              @for (t of d.termini; track kljuc(t)) {
                <li [attr.data-termin]="kljuc(t)" [class.otkazan]="t.otkazan">
                  <div class="glava">
                    <span class="vreme">{{ blok(t) }}</span>
                    <span class="naziv"><strong>{{ t.predmet.naziv }}</strong> · {{ t.grupa.naziv }}</span>
                    @if (t.otkazan) {
                      <app-status-chip tekst="Otkazano" ton="danger" />
                    }
                    @if (t.brojNajava > 0) {
                      <app-status-chip [tekst]="'Ne dolazi: ' + t.brojNajava" [ton]="iznadPraga(t) ? 'warn' : 'neutral'"
                                       data-broj-najava />
                    }
                    @if (t.predavanjeId) {
                      <a class="veza" [routerLink]="['/predavanja', t.predavanjeId]">Predavanje</a>
                    }
                  </div>
                  @if (t.otkazan && t.napomena) {
                    <p class="napomena">Napomena: {{ t.napomena }}</p>
                  }
                  @if (t.najave.length > 0) {
                    <details class="najave">
                      <summary>Ko ne dolazi ({{ t.najave.length }})</summary>
                      <ul>
                        @for (n of t.najave; track n.studentId) {
                          <li>
                            <a [routerLink]="['/studenti', n.studentId]">{{ ime(n) }}</a>
                            @if (n.razlog) {
                              <span class="razlog">: {{ n.razlog }}</span>
                            }
                          </li>
                        }
                      </ul>
                    </details>
                  }
                  @if (!t.poceo) {
                    <div class="akcije">
                      @if (t.otkazan) {
                        <button matButton="outlined" type="button" [disabled]="salje() !== null" (click)="vrati(t)"
                                [attr.aria-label]="'Vrati čas: ' + opis(t)" data-vrati>Vrati čas</button>
                        <button matButton type="button" [disabled]="salje() !== null" (click)="otkazi(t)"
                                [attr.aria-label]="'Izmeni napomenu: ' + opis(t)">Izmeni napomenu</button>
                      } @else {
                        <button matButton="outlined" type="button" class="destruktivno" [disabled]="salje() !== null"
                                (click)="otkazi(t)" [attr.aria-label]="'Otkaži čas: ' + opis(t)" data-otkazi>Otkaži čas</button>
                      }
                    </div>
                  }
                </li>
              }
            </ul>
          </section>
        }
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .prozor { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .opseg { font-weight: 600; padding: 0 6px; }
    .dan { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; }
    h2 { margin: 0 0 8px; font-size: 16px; }
    .termini { margin: 0; padding: 0; list-style: none; }
    .termini > li { padding: 10px 0; border-top: 1px solid var(--line); }
    .termini > li:first-child { border-top: 0; padding-top: 0; }
    .glava { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .vreme { font-family: var(--font-mono); font-weight: 600; }
    .naziv { overflow-wrap: anywhere; }
    .otkazan .naziv, .otkazan .vreme { text-decoration: line-through; color: var(--muted); }
    .veza { font-size: 14px; }
    .napomena { margin: 6px 0 0; color: var(--ink-2); font-size: 14px; }
    .najave { margin: 6px 0 0; font-size: 14px; }
    .najave summary { cursor: pointer; color: var(--primary); }
    .najave ul { margin: 6px 0 0; padding-left: 1.2em; }
    .razlog { color: var(--ink-2); overflow-wrap: anywhere; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .destruktivno { --mat-button-outlined-label-text-color: var(--danger); }
  `,
})
export class TerminiPage {
  private readonly api = inject(RasporedApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Query `od` (ISO datum); neispravan ili prazan = danas. */
  readonly od = input<string>();

  protected readonly danas = isoDatum(new Date());
  protected readonly dana = DANA_TERMINA;
  protected readonly pocetak = computed(() => odIliDanas(this.od(), this.danas));
  protected readonly termini = signal<TerminInfo[]>([]);
  protected readonly dani = computed(() => poDatumu(this.termini()));
  protected readonly status = signal<Status>('ucitavanje');
  protected readonly greska = signal<string | null>(null);
  /** Ključ termina čija promena je u toku. */
  protected readonly salje = signal<string | null>(null);
  protected readonly opseg = computed(() => `${formatDatum(this.pocetak(), 'kratko')} – ${formatDatum(pomeriOd(this.pocetak(), this.dana - 1))}`);
  protected readonly iznadPraga = iznadPraga;
  protected readonly kljuc = kljuc;
  private ucitavanje?: Subscription;
  private dijalogOtvoren = false;

  constructor() {
    effect(() => {
      this.pocetak();
      untracked(() => this.ucitaj());
    });
    this.destroyRef.onDestroy(() => this.ucitavanje?.unsubscribe());
  }

  protected ucitaj(): void {
    this.ucitavanje?.unsubscribe();
    this.status.set('ucitavanje');
    this.ucitavanje = this.api.termini(this.pocetak(), this.dana, { tiho: true }).subscribe({
      next: l => {
        this.termini.set(l ?? []);
        this.status.set('ok');
      },
      error: (e: unknown) => {
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        this.status.set('greska');
      },
    });
  }

  protected pomeri(dana: number): void {
    this.idiNa(pomeriOd(this.pocetak(), dana));
  }

  protected idiNa(od: string | null): void {
    void this.router.navigate([], { queryParams: { od: od === this.danas ? null : od }, queryParamsHandling: 'merge' });
  }

  protected naslovDana(datum: string): string {
    const d = danIDatum(datum);
    return datum === this.danas ? `Danas, ${d}` : d.charAt(0).toUpperCase() + d.slice(1);
  }

  protected blok(t: TerminInfo): string {
    return blokVremena(t.pocetak, t.kraj);
  }

  protected opis(t: TerminInfo): string {
    return `${t.predmet.naziv}, ${t.grupa.naziv}, ${danIDatum(t.datum)} ${this.blok(t)}`;
  }

  protected ime(n: TerminInfo['najave'][number]): string {
    return imeStudenta(n);
  }

  protected otkazi(t: TerminInfo): void {
    if (this.dijalogOtvoren || this.salje() !== null) {
      return;
    }
    this.dijalogOtvoren = true;
    OtkazivanjeDialog.otvori(this.dialog, t)
      .pipe(finalize(() => (this.dijalogOtvoren = false)), takeUntilDestroyed(this.destroyRef))
      .subscribe(izbor => {
        if (izbor !== undefined) {
          this.posalji(t, this.api.otkazi({
            stavkaId: t.stavkaId, datum: t.datum, napomena: izbor.napomena || null, posaljiMejl: izbor.posaljiMejl,
          }), t.otkazan ? () => 'Napomena je sačuvana.' : o => `Čas je otkazan. ${tekstMejla(o, izbor.posaljiMejl)}`);
        }
      });
  }

  protected vrati(t: TerminInfo): void {
    if (this.dijalogOtvoren || this.salje() !== null) {
      return;
    }
    this.dijalogOtvoren = true;
    VracanjeDialog.otvori(this.dialog, t)
      .pipe(finalize(() => (this.dijalogOtvoren = false)), takeUntilDestroyed(this.destroyRef))
      .subscribe(izbor => {
        if (izbor !== undefined) {
          this.posalji(t, this.api.vrati({ stavkaId: t.stavkaId, datum: t.datum, posaljiMejl: izbor.posaljiMejl }),
            o => `Čas se ipak održava. ${tekstMejla(o, izbor.posaljiMejl)}`);
        }
      });
  }

  /**
   * Zahtev nije tih: poruka servera (409 „Termin je već počeo.“) ide u snackbar, a lista se učitava iznova. Kad neki mejl
   * nije stavljen u red (`neposlato`), poruka je greška, da se ne previdi.
   */
  private posalji(t: TerminInfo, zahtev: Observable<PromenaTerminaOdgovor>, poruka: (o: PromenaTerminaOdgovor) => string): void {
    const k = kljuc(t);
    this.salje.set(k);
    zahtev.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: o => {
        this.salje.set(null);
        this.termini.update(l => l.map(x => (kljuc(x) === k ? o.termin : x)));
        if ((o.neposlato ?? 0) > 0) {
          this.poruke.greska(poruka(o));
        } else {
          this.poruke.uspeh(poruka(o));
        }
      },
      error: () => {
        this.salje.set(null);
        this.ucitaj();
      },
    });
  }
}

/** Deo poruke o mejlu posle otkazivanja ili vraćanja (`posaljiMejl` = izbor nastavnika u dijalogu). */
export function tekstMejla(o: PromenaTerminaOdgovor, posaljiMejl: boolean): string {
  if (!posaljiMejl) {
    return 'Mejl studentima nije slat.';
  }
  const neposlato = o.neposlato ?? 0;
  const poslat = o.obavesteno > 0 ? `Mejl je poslat: ${brojStudenataTekst(o.obavesteno)}.` : '';
  if (neposlato > 0) {
    return `${poslat} Mejl nije poslat: ${brojStudenataTekst(neposlato)} (red za slanje je pun ili slanje nije podešeno); javi im drugim putem.`.trim();
  }
  return poslat || 'Mejl nije poslat nikome.';
}
