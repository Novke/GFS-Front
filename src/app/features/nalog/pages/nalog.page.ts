import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { NalogApi } from '../data-access/nalog.api';
import { PORUKA_KOD_POSLAT, PORUKA_POMOC, StudentJa } from '../data-access/nalog.models';
import { javnoNazad, porukaGreske, putanjaCilja } from '../data-access/nalog.pravila';
import { IndeksKorak } from '../ui/indeks-korak.component';
import { KodKorak } from '../ui/kod-korak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';
import { NalogPregled } from '../ui/nalog-pregled.component';

export type KorakNaloga = 'ucitavanje' | 'greska' | 'indeks' | 'kod' | 'prijavljen';

const NASLOV: Record<KorakNaloga, string> = {
  ucitavanje: 'Nalog',
  greska: 'Nalog',
  indeks: 'Prijava',
  kod: 'Unesi kod',
  prijavljen: 'Prijavljen si',
};

/** `1 uređaj`, `2 uređaja`, `5 uređaja`, `21 uređaj` (genitiv množine i paukal su isti). */
const uredjaja = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'uređaj' : 'uređaja'}`;

/**
 * Javni nalog studenta (`/nalog`, u `PublicLayout`-u: student na telefonu, bez sesije nastavnika; spec prijave 5.1):
 * indeks -> kod na mejl -> prijavljen na ovom telefonu (kolačić `gfs_student`, 365 dana). Zove **samo** `api/public/nalog/*`
 * (`NalogApi`); ESLint `gfs/javna-ruta-uvozi` drži uvoze, e2e `nalog.spec.ts` mrežu.
 *
 * Na prvom učitavanju `GET stanje` (i `GET ja` kad je prijavljen) bira početni korak. Posle uspešne prijave ide na `nazad`
 * (query, `withComponentInputBinding`) ako ga `javnoNazad` pusti (samo relativna putanja javne rute: `uzivo`, `upis`, `nalog`,
 * npr. `uzivo/ABC123`), inače pokazuje nalog; spoljni ili apsolutni URL i nastavnička ruta se nikad ne otvaraju, a `nazad` na
 * ovu istu stranicu (`nalog`) je ekran naloga. Već prijavljen student sa `nazad` dobija "Nastavi" (bez automatskog skoka,
 * pa nema petlje ako ga ciljna strana vrati ovde). Greške servera (401, 429, 503) su doslovno u baneru koraka; mreža i
 * ostale 5xx opšte poruke.
 */
@Component({
  selector: 'app-nalog-page',
  imports: [FormErrorBanner, IndeksKorak, KodKorak, MatButton, MatProgressSpinner, NalogOkvir, NalogPregled],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir>
      <h2 tabindex="-1">{{ naslov() }}</h2>
      @switch (korak()) {
        @case ('ucitavanje') {
          <p class="stanje" role="status">
            <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
          </p>
        }
        @case ('greska') {
          <p class="poruka opasnost" role="alert">{{ greskaUcitavanja() }}</p>
          <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
        }
        @case ('indeks') {
          @if (info(); as poruka) {
            <p class="poruka uspeh" role="status">{{ poruka }}</p>
          }
          <app-nalog-indeks-korak
            [indeks]="indeks()"
            [salje]="salje()"
            [greska]="greska()"
            (posaljiKod)="posaljiKod($event)"
          />
        }
        @case ('kod') {
          <app-nalog-kod-korak
            [indeks]="indeks()"
            [maska]="maska()"
            [poruka]="porukaKoda()"
            [slanjeBroj]="slanjeBroj()"
            [salje]="salje()"
            [greska]="greska()"
            [pomoc]="pomoc()"
            [pomocSalje]="pomocSalje()"
            (prijavi)="prijavi($event)"
            (posaljiPonovo)="posaljiKod(indeks())"
            (neStize)="neStize()"
            (promeniIndeks)="idiNa('indeks')"
          />
        }
        @case ('prijavljen') {
          <app-form-error-banner [poruka]="greska()" />
          @if (ja(); as s) {
            <app-nalog-pregled
              [ja]="s"
              [nastaviNa]="nastaviNa()"
              [salje]="salje()"
              (odjavi)="odjavi()"
              (odjaviSvuda)="odjaviSvuda()"
              (nastavi)="nastavi()"
            />
          }
        }
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 14px; font-size: 18px; }
    h2:focus { outline: none; }

    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0;
      color: var(--muted); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.uspeh { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
  `,
})
export class NalogPage {
  /** Query `nazad` (relativna putanja aplikacije); proverava ga `bezbednoNazad` tek pri upotrebi. */
  readonly nazad = input<string | null | undefined>(null);

  private readonly api = inject(NalogApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  /** Potvrda o odjavi svih uređaja je otvorena: drugi klik ne otvara drugi dijalog. */
  private potvrdaOtvorena = false;

  protected readonly korak = signal<KorakNaloga>('ucitavanje');
  protected readonly naslov = computed(() => NASLOV[this.korak()]);
  protected readonly indeks = signal('');
  protected readonly maska = signal('');
  protected readonly porukaKoda = signal(PORUKA_KOD_POSLAT);
  protected readonly slanjeBroj = signal(0);
  protected readonly salje = signal(false);
  /** Greška servera za baner trenutnog koraka. */
  protected readonly greska = signal<string | null>(null);
  protected readonly greskaUcitavanja = signal('');
  protected readonly pomoc = signal<string | null>(null);
  protected readonly pomocSalje = signal(false);
  protected readonly ja = signal<StudentJa | null>(null);
  /** Poruka posle odjave (na koraku indeksa). */
  protected readonly info = signal<string | null>(null);
  /** Javni `nazad` koji ne vodi na ovu istu stranicu (`nalog`, `nalog?...`: posle prijave je to ekran naloga). */
  protected readonly nastaviNa = computed(() => {
    const cilj = javnoNazad(this.nazad());
    return cilj !== null && putanjaCilja(cilj) !== 'nalog' ? cilj : null;
  });

  private zahtev?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj(false);
  }

  /** `GET stanje`, pa (prijavljen) `GET ja`: bira početni korak. */
  protected ucitaj(fokus = true): void {
    this.zahtev?.unsubscribe();
    this.korak.set('ucitavanje');
    this.zahtev = this.api.stanje().subscribe({
      next: s => (s?.prijavljen ? this.ucitajJa(fokus) : this.idiNa('indeks', fokus)),
      error: (e: unknown) => this.greskaPriUcitavanju(e, fokus),
    });
  }

  protected posaljiKod(indeks: string): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.posaljiKod(indeks).subscribe({
      next: odg => {
        this.salje.set(false);
        this.indeks.set(indeks);
        this.maska.set(odg?.maska ?? '');
        this.porukaKoda.set(odg?.poruka || PORUKA_KOD_POSLAT);
        this.slanjeBroj.update(n => n + 1);
        this.pomoc.set(null);
        if (this.korak() !== 'kod') {
          this.idiNa('kod');
        }
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  /**
   * Prijava kodom, pa `nazad` ili ekran naloga. `salje` ostaje `true` dok navigacija ili `GET ja` ne završe, da dupli dodir
   * ne pošalje drugu prijavu već iskorišćenim kodom (401 bi prijavljenom studentu pokazao "Kod nije ispravan").
   */
  protected prijavi(kod: string): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.prijavi(this.indeks(), kod).subscribe({
      next: () => {
        const cilj = this.nastaviNa();
        if (cilj) {
          // uspela navigacija uništava stranicu; neuspela (npr. lenji chunk bez mreže) vraća dugme
          this.router.navigateByUrl(cilj).then(
            ok => {
              if (!ok) {
                this.salje.set(false);
              }
            },
            () => this.salje.set(false),
          );
        } else {
          this.ucitajJa(true);
        }
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  protected neStize(): void {
    if (this.pomocSalje()) {
      return;
    }
    this.pomocSalje.set(true);
    this.greska.set(null);
    this.pomoc.set(null);
    this.api.pomoc(this.indeks()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: odg => {
        this.pomocSalje.set(false);
        this.pomoc.set(odg?.poruka || PORUKA_POMOC);
      },
      error: (e: unknown) => {
        this.pomocSalje.set(false);
        this.greska.set(porukaGreske(e));
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

  protected nastavi(): void {
    const cilj = this.nastaviNa();
    if (cilj) {
      void this.router.navigateByUrl(cilj);
    }
  }

  /** Prelaz na korak; posle radnje korisnika fokus ide na naslov koraka (čitač ekrana čuje gde je). */
  protected idiNa(korak: KorakNaloga, fokus = true): void {
    this.greska.set(null);
    this.korak.set(korak);
    if (korak !== 'indeks') {
      this.info.set(null);
    }
    if (fokus) {
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('h2')?.focus(), { injector: this.injector });
    }
  }

  private ucitajJa(fokus: boolean): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.ja().subscribe({
      next: ja => {
        this.salje.set(false);
        this.ja.set(ja);
        this.indeks.set(ja.indeks);
        this.idiNa('prijavljen', fokus);
      },
      // kolačić je istekao ili je opozvan u međuvremenu: prijava ispočetka
      error: (e: unknown) => {
        this.salje.set(false);
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.idiNa('indeks', fokus);
        } else {
          this.greskaPriUcitavanju(e, fokus);
        }
      },
    });
  }

  private pocni(): void {
    this.zahtev?.unsubscribe();
    this.salje.set(true);
    this.greska.set(null); // ista poruka dvaput zaredom: baner mora prvo da nestane (FormErrorBanner)
  }

  private neuspeh(e: unknown): void {
    this.salje.set(false);
    this.greska.set(porukaGreske(e));
  }

  private neuspehOdjave(e: unknown): void {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      // sesije studenta već nema: za odjavu je to uspeh
      this.odjavljen('Odjavljen si sa ovog uređaja.');
      return;
    }
    this.neuspeh(e);
  }

  private odjavljen(poruka: string): void {
    this.salje.set(false);
    this.ja.set(null);
    this.pomoc.set(null);
    // zajednički računar: indeks i maska prethodnog studenta ne smeju da ostanu u polju
    this.indeks.set('');
    this.maska.set('');
    this.idiNa('indeks');
    this.info.set(poruka);
  }

  private greskaPriUcitavanju(e: unknown, fokus: boolean): void {
    this.greskaUcitavanja.set(porukaGreske(e));
    this.idiNa('greska', fokus);
  }
}
