import { Location } from '@angular/common';
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
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { godinaIzUpita, predlogGodine, prikazIndeksa } from '../../../shared/util/indeks';
import { NalogApi } from '../data-access/nalog.api';
import { IndeksIGodina, PORUKA_KOD_POSLAT, PORUKA_POMOC, StudentJa } from '../data-access/nalog.models';
import { javnoNazad, porukaGreske, putanjaCilja } from '../data-access/nalog.pravila';
import { IndeksKorak } from '../ui/indeks-korak.component';
import { KodKorak } from '../ui/kod-korak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';

export type KorakNaloga = 'ucitavanje' | 'greska' | 'indeks' | 'kod' | 'prijavljen';

const NASLOV: Record<KorakNaloga, string> = {
  ucitavanje: 'Nalog',
  greska: 'Nalog',
  indeks: 'Prijava',
  kod: 'Unesi kod',
  prijavljen: 'Prijavljen si',
};

/** Tab Početna: podrazumevana strana prijavljenog studenta (pozdrav, WhatsApp grupa, naredni časovi). */
export const NALOG_POCETNA = 'nalog/pocetna';

/**
 * Prijava studenta (`/nalog`, u `PublicLayout`-u: student na telefonu, bez sesije nastavnika; spec prijave 5.1):
 * indeks -> kod na mejl -> prijavljen na ovom telefonu (kolačić `gfs_student`, 365 dana). Zove **samo** `api/public/nalog/*`
 * (`NalogApi`); ESLint `gfs/javna-ruta-uvozi` drži uvoze, e2e `nalog.spec.ts` mrežu.
 *
 * Na prvom učitavanju `GET stanje` bira korak. Prijavljen student bez `nazad` odmah ide na tab Početna (`nalog/pocetna`;
 * nalog, uređaji i odjava su na tabu Ja). Posle uspešne prijave ide na `nazad` (query,
 * `withComponentInputBinding`) ako ga `javnoNazad` pusti (samo relativna putanja javne rute: `uzivo`, `upis`, `nalog`, npr.
 * `uzivo/ABC123`), inače na tab Početna; spoljni ili apsolutni URL i nastavnička ruta se nikad ne otvaraju, a `nazad` na ovu
 * istu stranicu (`nalog`) je tab Početna. Već prijavljen student sa `nazad` dobija "Nastavi" (`GET ja` za ime; bez automatskog skoka,
 * pa nema petlje ako ga ciljna strana vrati ovde). Greške servera (401, 429, 503) su doslovno u baneru koraka; mreža i
 * ostale 5xx opšte poruke. Poruku posle odjave (tab Ja) donosi stanje istorije (`info`).
 */
@Component({
  selector: 'app-nalog-page',
  imports: [FormErrorBanner, IndeksKorak, KodKorak, MatButton, MatProgressSpinner, NalogOkvir, RouterLink],
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
            [godina]="predlozenaGodina()"
            [hintGodine]="hintGodine()"
            [salje]="salje()"
            [greska]="greska()"
            (posaljiKod)="posaljiKod($event)"
            (imamKod)="imamKod($event)"
          />
        }
        @case ('kod') {
          <app-nalog-kod-korak
            [indeks]="prikazIndeksa()"
            [odNastavnika]="odNastavnika()"
            [maska]="maska()"
            [poruka]="porukaKoda()"
            [slanjeBroj]="slanjeBroj()"
            [salje]="salje()"
            [greska]="greska()"
            [pomoc]="pomoc()"
            [pomocSalje]="pomocSalje()"
            (prijavi)="prijavi($event)"
            (posaljiPonovo)="posaljiKod(student())"
            (neStize)="neStize()"
            (promeniIndeks)="idiNa('indeks')"
          />
        }
        @case ('prijavljen') {
          <app-form-error-banner [poruka]="greska()" />
          @if (ja(); as s) {
            <p class="ko" data-prijavljen>Prijavljen si kao <strong>{{ s.ime }} {{ s.prezime }}</strong>
              (<span class="mono">{{ s.indeks }}@if (s.godina) {/{{ s.godina }}}</span>).</p>
          }
          @if (nastaviNa()) {
            <button type="button" mat-flat-button class="dugme" [disabled]="salje()" (click)="nastavi()">Nastavi</button>
          }
          <a matButton="outlined" class="dugme drugo" routerLink="/nalog/pocetna">Moj nalog</a>
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
    .ko { margin: 0 0 16px; overflow-wrap: anywhere; }
    .mono { font-family: var(--font-mono); }
    .drugo { margin-top: 8px; }
  `,
})
export class NalogPage {
  /** Query `nazad` (relativna putanja aplikacije); proverava ga `bezbednoNazad` tek pri upotrebi. */
  readonly nazad = input<string | null | undefined>(null);
  /**
   * Query `godina` (npr. iz Uživo izvođenja: godina upisa grupe predavanja): predlog godine upisa. Nevalidna vrednost se
   * ignoriše i predlog je početna godina tekuće školske godine (`predlogGodine`).
   */
  readonly godina = input<string | null | undefined>(null);

  private readonly api = inject(NalogApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly korak = signal<KorakNaloga>('ucitavanje');
  protected readonly naslov = computed(() => NASLOV[this.korak()]);
  protected readonly indeks = signal('');
  /** Godina upisa koju je student uneo (do tada predlog iz upita ili tekuća školska godina). */
  private readonly unetaGodina = signal<number | null>(null);
  protected readonly predlozenaGodina = computed(() => this.unetaGodina() ?? predlogGodine(this.godina()));
  protected readonly hintGodine = computed(() =>
    godinaIzUpita(this.godina()) !== null ? 'Godina grupe sa časa; promeni ako si upisan ranije.' : 'Promeni ako si upisan ranije.');
  protected readonly student = computed<IndeksIGodina>(() => ({ indeks: this.indeks(), godina: this.predlozenaGodina() }));
  protected readonly prikazIndeksa = computed(() => prikazIndeksa(this.indeks(), this.predlozenaGodina()));
  /** Korak koda bez slanja mejla ("Imam kod od nastavnika"). */
  protected readonly odNastavnika = signal(false);
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
  /** Poruka posle odjave (na koraku indeksa): tab Ja je šalje kroz stanje istorije (`{ info }`). */
  protected readonly info = signal<string | null>(porukaIzIstorije(inject(Location).getState()));
  /** Javni `nazad` koji ne vodi na ovu istu stranicu (`nalog`, `nalog?...`: posle prijave je to tab Početna). */
  protected readonly nastaviNa = computed(() => {
    const cilj = javnoNazad(this.nazad());
    return cilj !== null && putanjaCilja(cilj) !== 'nalog' ? cilj : null;
  });

  private zahtev?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj(false);
  }

  /** `GET stanje` bira početni korak; prijavljen sa `nazad` još `GET ja` (ime uz "Nastavi"), bez njega tab Početna. */
  protected ucitaj(fokus = true): void {
    this.zahtev?.unsubscribe();
    this.korak.set('ucitavanje');
    this.zahtev = this.api.stanje().subscribe({
      next: s => {
        if (!s?.prijavljen) {
          this.idiNa('indeks', fokus);
        } else if (this.nastaviNa()) {
          this.ucitajJa(fokus);
        } else {
          this.idiNaNalog();
        }
      },
      error: (e: unknown) => this.greskaPriUcitavanju(e, fokus),
    });
  }

  protected posaljiKod(s: IndeksIGodina): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.posaljiKod(s).subscribe({
      next: odg => {
        this.salje.set(false);
        this.postaviStudenta(s);
        this.odNastavnika.set(false);
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

  /** "Imam kod od nastavnika": korak koda za uneti indeks i godinu, bez slanja mejla. */
  protected imamKod(s: IndeksIGodina): void {
    if (this.salje()) {
      return;
    }
    this.postaviStudenta(s);
    this.maska.set('');
    this.pomoc.set(null);
    this.odNastavnika.set(true);
    this.idiNa('kod');
  }

  /**
   * Prijava kodom, pa `nazad` ili tab Početna. `salje` ostaje `true` dok navigacija ne završi, da dupli dodir ne pošalje drugu
   * prijavu već iskorišćenim kodom (401 bi prijavljenom studentu pokazao "Kod nije ispravan").
   */
  protected prijavi(kod: string): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.prijavi(this.student(), kod).subscribe({
      next: () => {
        const cilj = this.nastaviNa();
        if (cilj) {
          this.idi(this.router.navigateByUrl(cilj));
        } else {
          this.idiNaNalog();
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
    this.api.pomoc(this.student()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  /** Tab Čas umesto `/nalog` u istoriji (dugme "nazad" ne vraća na prijavu). Uspela navigacija uništava stranicu. */
  private idiNaNalog(): void {
    this.salje.set(true);
    this.idi(this.router.navigateByUrl(NALOG_POCETNA, { replaceUrl: true }));
  }

  /** Neuspela navigacija (npr. lenji chunk bez mreže) vraća dugme i kaže šta je bilo. */
  private idi(navigacija: Promise<boolean>): void {
    const neuspeh = () => {
      this.salje.set(false);
      if (this.korak() === 'ucitavanje') {
        this.greskaUcitavanja.set('Stranica nije učitana. Proveri vezu i pokušaj ponovo.');
        this.idiNa('greska');
      }
    };
    navigacija.then(ok => {
      if (!ok) {
        neuspeh();
      }
    }, neuspeh);
  }

  private ucitajJa(fokus: boolean): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.ja().subscribe({
      next: ja => {
        this.salje.set(false);
        this.ja.set(ja);
        this.indeks.set(ja.indeks);
        this.unetaGodina.set(typeof ja.godina === 'number' ? ja.godina : null);
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

  private postaviStudenta(s: IndeksIGodina): void {
    this.indeks.set(s.indeks);
    this.unetaGodina.set(s.godina);
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

  private greskaPriUcitavanju(e: unknown, fokus: boolean): void {
    this.greskaUcitavanja.set(porukaGreske(e));
    this.idiNa('greska', fokus);
  }
}

/** `{ info: string }` iz stanja istorije (odjava na tabu Ja), inače `null`. */
function porukaIzIstorije(stanje: unknown): string | null {
  const info = (stanje as { info?: unknown } | null)?.info;
  return typeof info === 'string' && info.trim() !== '' && info.length <= 200 ? info : null;
}
