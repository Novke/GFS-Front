import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { NalogApi } from '../data-access/nalog.api';
import { StudentJa } from '../data-access/nalog.models';
import { porukaGreske } from '../data-access/nalog.pravila';
import { putanjaPrijave, status } from '../data-access/portal.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';
import { NalogPregled } from '../ui/nalog-pregled.component';
import { PodesavanjaMejla } from '../ui/podesavanja-mejla.component';

/** `1 uređaj`, `2 uređaja`, `5 uređaja`, `21 uređaj` (genitiv množine i paukal su isti). */
const uredjaja = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'uređaj' : 'uređaja'}`;

/**
 * Tab **Ja** (`/nalog/ja`, spec studentskog dela 12.5): `GET api/public/nalog/ja` (ime, indeks, grupa i generacija, maska
 * mejla, uređaji, Moodle), "Odjavi se" i "Odjavi sve uređaje" (uz potvrdu). Posle odjave strana prijave (`/nalog`) sa
 * porukom kroz stanje istorije; polje indeksa je tamo prazno (zajednički računar). 401 vodi na prijavu sa povratkom ovde;
 * 401 na odjavi znači da sesije već nema (za odjavu uspeh). Ispod profila kartica "Obaveštenja" ("Javi mi mejlom kad je čas
 * otkazan", `PodesavanjaMejla`, sama učitava i čuva).
 */
@Component({
  selector: 'app-ja-page',
  imports: [FormErrorBanner, MatButton, MatProgressSpinner, NalogOkvir, NalogPregled, PodesavanjaMejla],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Ja">
      <h2>Moj nalog</h2>
      @if (ja(); as s) {
        <app-form-error-banner [poruka]="greska()" />
        <app-nalog-pregled [ja]="s" [salje]="salje()" (odjavi)="odjavi()" (odjaviSvuda)="odjaviSvuda()" />
        <app-podesavanja-mejla />
      } @else if (greskaUcitavanja(); as g) {
        <p class="poruka opasnost" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <p class="stanje" role="status">
          <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
        </p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 14px; font-size: 18px; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
  `,
})
export class JaPage {
  private readonly api = inject(NalogApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ja = signal<StudentJa | null>(null);
  protected readonly greskaUcitavanja = signal<string | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);
  /** Potvrda o odjavi svih uređaja je otvorena: drugi klik ne otvara drugi dijalog. */
  private potvrdaOtvorena = false;
  private zahtev?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.greskaUcitavanja.set(null);
    this.zahtev = this.api.ja().subscribe({
      next: ja => this.ja.set(ja),
      error: (e: unknown) => {
        if (status(e) === 401) {
          void this.router.navigateByUrl(putanjaPrijave(this.router.url));
        } else {
          this.greskaUcitavanja.set(porukaGreske(e));
        }
      },
    });
  }

  protected odjavi(): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.odjavi().subscribe({
      next: () => this.odjavljen('Odjavljen si sa ovog uređaja.'),
      error: (e: unknown) => this.neuspehOdjave(e),
    });
  }

  protected odjaviSvuda(): void {
    if (this.salje() || this.potvrdaOtvorena) {
      return;
    }
    this.potvrdaOtvorena = true;
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Odjaviti sve uređaje?',
      tekst: 'Odjavićeš se na svim uređajima, i na ovom. Na svakom posle možeš ponovo da se prijaviš kodom sa mejla.',
      potvrdi: 'Odjavi sve',
      destruktivno: true,
    }).pipe(
      finalize(() => (this.potvrdaOtvorena = false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(da => {
      if (!da) {
        return;
      }
      this.pocni();
      this.zahtev = this.api.odjaviSvuda().subscribe({
        next: odg => this.odjavljen(`Odjavljeno: ${uredjaja(Math.max(0, Number(odg?.odjavljeno) || 0))}.`),
        error: (e: unknown) => this.neuspehOdjave(e),
      });
    });
  }

  private pocni(): void {
    this.zahtev?.unsubscribe();
    this.salje.set(true);
    this.greska.set(null); // ista poruka dvaput zaredom: baner mora prvo da nestane (FormErrorBanner)
  }

  private neuspehOdjave(e: unknown): void {
    if (status(e) === 401) {
      // sesije studenta već nema: za odjavu je to uspeh
      this.odjavljen('Odjavljen si sa ovog uređaja.');
      return;
    }
    this.salje.set(false);
    this.greska.set(porukaGreske(e));
  }

  /** Strana prijave (van ljuske tabova) sa porukom; prethodni student ne ostaje u istoriji (`replaceUrl`). */
  private odjavljen(poruka: string): void {
    this.ja.set(null);
    void this.router.navigateByUrl('nalog', { replaceUrl: true, state: { info: poruka } });
  }
}
