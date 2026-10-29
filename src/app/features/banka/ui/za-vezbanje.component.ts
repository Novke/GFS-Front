import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { filter, Observable, switchMap } from 'rxjs';

import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog, ConfirmDialogCfg } from '../../../shared/ui/confirm-dialog';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { sRecju } from '../../../shared/util/mnozina';
import { BankaApi } from '../data-access/banka.api';
import { OtvorenoZaGrupu } from '../data-access/banka.models';
import { razlogBanke, TIHO, UPIS } from '../data-access/greske';

/** Tekst stanja čvora za jednu grupu studenata (panel "Za vežbanje"). */
export function opisOtvorenosti(o: OtvorenoZaGrupu): string {
  switch (o.stanje) {
    case 'OTVORENO':
      return o.izvor === 'RUCNO'
        ? `Otvoreno ručno ${formatDatum(o.prviPut)}`
        : `Otvoreno posle časa ${formatDatum(o.prviPut)}`;
    case 'PREKO_TEME':
      return `Otvoreno preko teme „${o.tema ?? '—'}“`;
    case 'DELIMICNO':
      return `Delimično: ${o.otvorenihListova} od ${sRecju(o.listova, 'tipa', 'tipa', 'tipova')}`;
    default:
      return 'Zatvoreno';
  }
}

/** Naziv grupe sa generacijom: "G1 (2025)". */
export function nazivGrupe(o: Pick<OtvorenoZaGrupu, 'naziv' | 'godinaUpisa'>): string {
  return o.godinaUpisa === null ? o.naziv : `${o.naziv} (${o.godinaUpisa})`;
}

/**
 * Panel "Za vežbanje" na čvoru banke za predavanja (detalj grupe zadataka; spec studentskog dela 5.3 i 12.3): za svaku grupu
 * studenata koja ima predavanje iz predmeta (i svaku koja ima zapis u stablu) stanje čvora i jedna radnja. "Otvori" daje grupi
 * ceo čvor sa podstablom (izvor RUCNO; čvor otvoren posle časa ostaje kakav jeste), "Zatvori" briše zapise čvora i celog podstabla
 * za tu grupu, bez obzira na izvor, i ništa ga više ne otvara samo osim novog časa sa tim tipom. Čvor otvoren preko teme pretka
 * zatvara se na toj temi, pa ovde nema dugmeta. Studentima se reč "banka" nikad ne pokazuje; ovde je nastavnička strana.
 *
 * Panel sam čita stanje (`GET banka/grupe/{id}/otvoreno`) i posle svake radnje prikazuje stanje iz odgovora. Greške idu u
 * `NotificationStore` (zahtevi su tihi, pa se globalni snackbar ne udvostručuje).
 */
@Component({
  selector: 'app-za-vezbanje',
  imports: [MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sekcije-stabla.css',
  template: `
    <section class="lista-kartica bk-sek" aria-labelledby="bk-naslov-vezbanje" data-za-vezbanje
      [attr.aria-busy]="stanja() === null && greska() === null">
      <h2 id="bk-naslov-vezbanje" class="bk-sek-naslov">Za vežbanje</h2>
      <p class="bk-sek-objasnjenje">
        Studenti grupe vežbaju otvorene tipove bez bodova. Tip se otvara sam kad se završi čas na kome je izvučen; ovde ga otvaraš
        ili zatvaraš ručno, sa celim podstablom.
        <a routerLink="/banka/vezbanje" [queryParams]="{ predmet: predmetId() }" data-statistika>Statistika vežbanja</a>
      </p>
      @if (greska(); as m) {
        <p class="bk-sek-objasnjenje" role="alert" data-greska>{{ m }}</p>
      } @else if (stanja(); as lista) {
        @if (lista.length === 0) {
          <p class="bk-sek-objasnjenje" data-prazno>Nijedna grupa još nema predavanje iz ovog predmeta.</p>
        } @else {
          <ul class="bk-sek-lista">
            @for (o of lista; track o.grupaId) {
              <li class="bk-sek-stavka" [attr.data-grupa]="o.grupaId" [attr.data-stanje]="o.stanje">
                <span class="bk-sek-tekst">
                  <span>{{ naziv(o) }}</span>
                  <span class="bk-sek-sporedno">{{ opis(o) }}</span>
                </span>
                @if (o.stanje === 'OTVORENO' || o.stanje === 'DELIMICNO') {
                  <button matButton type="button" disabledInteractive [disabled]="uToku() === o.grupaId"
                    [attr.aria-label]="'Zatvori za grupu ' + naziv(o)" (click)="zatvori(o)" data-zatvori>Zatvori</button>
                }
                @if (o.stanje === 'ZATVORENO' || o.stanje === 'DELIMICNO') {
                  <button matButton type="button" disabledInteractive [disabled]="uToku() === o.grupaId"
                    [attr.aria-label]="'Otvori za grupu ' + naziv(o)" (click)="otvori(o)" data-otvori>Otvori</button>
                }
              </li>
            }
          </ul>
        }
      } @else {
        <p class="bk-sek-objasnjenje">Učitavanje…</p>
      }
    </section>
  `,
})
export class ZaVezbanjeComponent {
  /** Čvor banke (PREDAVANJE). */
  readonly grupaId = input.required<number>();
  readonly predmetId = input.required<number>();

  private readonly api = inject(BankaApi);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly stanja = signal<OtvorenoZaGrupu[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly uToku = signal<number | null>(null);

  protected readonly opis = opisOtvorenosti;
  protected readonly naziv = nazivGrupe;

  constructor() {
    effect(() => {
      const id = this.grupaId();
      untracked(() => this.ucitaj(id));
    });
  }

  private ucitaj(id: number): void {
    this.stanja.set(null);
    this.greska.set(null);
    this.api.otvoreno(id, TIHO).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: l => this.stanja.set(l),
      error: (e: unknown) => this.greska.set(`Stanje vežbanja nije učitano. ${razlogBanke(e)}`),
    });
  }

  protected otvori(o: OtvorenoZaGrupu): void {
    this.radnja(o, {
      naslov: `Otvori za vežbanje grupi ${nazivGrupe(o)}?`,
      tekst: 'Studenti grupe odmah vide ovaj tip (i sve tipove ispod njega) u „Zadacima za vežbanje“, sa svim varijantama i rešenjima posle provere.',
      potvrdi: 'Otvori',
    }, () => this.api.otvori(this.grupaId(), o.grupaId, TIHO), 'Otvoreno za vežbanje.');
  }

  protected zatvori(o: OtvorenoZaGrupu): void {
    this.radnja(o, {
      naslov: `Zatvori vežbanje grupi ${nazivGrupe(o)}?`,
      tekst: [
        'Zatvara se ovaj tip i svi tipovi ispod njega, i oni otvoreni posle časa.',
        'Ništa ga ne otvara ponovo samo, osim novog časa na kome se izvuče.',
      ],
      potvrdi: 'Zatvori',
    }, () => this.api.zatvori(this.grupaId(), o.grupaId, TIHO), 'Zatvoreno za vežbanje.');
  }

  private radnja(o: OtvorenoZaGrupu, potvrda: ConfirmDialogCfg, zahtev: () => Observable<OtvorenoZaGrupu[]>, uspeh: string): void {
    if (this.uToku() !== null) {
      return;
    }
    ConfirmDialog.otvori(this.dialog, potvrda)
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.uToku.set(o.grupaId);
          return zahtev();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: l => {
          this.uToku.set(null);
          this.stanja.set(l);
          this.obavestenja.uspeh(uspeh);
        },
        error: (e: unknown) => {
          this.uToku.set(null);
          this.obavestenja.greska(razlogBanke(e, UPIS));
        },
      });
  }
}
