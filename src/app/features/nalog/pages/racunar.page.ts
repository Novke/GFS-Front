import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { toCanvas } from 'qrcode';
import { Subscription } from 'rxjs';

import { predlogGodine, prikazIndeksa } from '../../../shared/util/indeks';
import { NalogApi } from '../data-access/nalog.api';
import { IndeksIGodina, PORUKA_KOD_POSLAT, StudentJa } from '../data-access/nalog.models';
import { porukaGreske } from '../data-access/nalog.pravila';
import { status } from '../data-access/portal.pravila';
import { SesijaStudenta } from '../data-access/sesija-studenta';
import { TestoviStudentaApi } from '../data-access/testovi-studenta.api';
import { ZahtevRacunara } from '../data-access/testovi-studenta.models';
import { formatSata, pomakSata, preostaloMs } from '../data-access/testovi-studenta.pravila';
import { IndeksKorak } from '../ui/indeks-korak.component';
import { KodKorak } from '../ui/kod-korak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';

/** Čekanje odobrenja sa telefona: 3 s dok je QR na ekranu. */
const CEKANJE_MS = 3_000;
/** Nov zahtev kad do isteka ostane 15 s (zahtev važi 2 min). */
const OBNOVA_PRE_MS = 15_000;
/** Posle ovoliko obnova bez skeniranja (~10 min) strana staje i nudi „Prikaži novi kod“ (limit 200 zahteva na sat po adresi). */
const NAJVISE_OBNOVA = 5;

type Korak = 'provera' | 'prijavljen' | 'qr' | 'stalo' | 'indeks' | 'kod' | 'gotovo';

/**
 * Prijava računara u laboratoriji (`/r`, javna; online testovi faza 2, spec 11 i plan 5.1). QR sa adresom
 * `<base>/nalog/racunar/<token>` i veliki broj od 4 cifre; student ga skenira telefonom na kome je već prijavljen i potvrdi, a
 * ova strana pita `GET racunar/zahtev` na 3 s (samo dok je QR na ekranu i strana vidljiva) i na ODOBREN ide na nalog (kolačić
 * sesije RACUNAR postavlja server). Zahtev se sam obnavlja pred istek najviše {@link NAJVISE_OBNOVA} puta, pa strana staje.
 * Kad je neko već prijavljen: „Nastavi kao …“ ili „Odjavi i prijavi mene“. „Imam kod“: indeks + kod sa mejla ili od nastavnika,
 * prijava sa `racunar: true`. Zove samo `api/public/nalog/*`.
 */
@Component({
  selector: 'app-racunar-page',
  imports: [IndeksKorak, KodKorak, MatButton, NalogOkvir],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Prijava na računaru">
      @if (greska(); as g) {
        <p class="poruka" role="alert" data-greska>{{ g }}</p>
      }
      @switch (korak()) {
        @case ('provera') {
          <p class="tiho" role="status">Učitavanje…</p>
        }
        @case ('prijavljen') {
          @let s = ja();
          <h2>Na ovom računaru je prijavljen</h2>
          <p class="ko" data-prijavljen><strong>{{ s?.ime }} {{ s?.prezime }}</strong> ({{ s?.indeks }})</p>
          <div class="akcije">
            <button mat-flat-button type="button" class="dugme" (click)="nastavi()" data-nastavi>Nastavi kao {{ s?.ime }}</button>
            <button mat-stroked-button type="button" class="dugme" [disabled]="salje()" (click)="odjaviPaPrijavi()" data-odjavi-prijavi>
              Odjavi i prijavi mene
            </button>
          </div>
        }
        @case ('qr') {
          <h2>Skeniraj telefonom</h2>
          <p class="uputstvo">Otvori kameru na telefonu na kome si prijavljen u nalog, skeniraj kod i potvrdi broj.</p>
          <div class="qr"><canvas #platno width="320" height="320" aria-hidden="true" data-qr></canvas></div>
          <p class="broj" aria-label="Broj računara" data-broj>{{ zahtev()?.broj }}</p>
          <p class="tiho" role="timer" aria-live="off">Kod se obnavlja za {{ obnovaZa() }}</p>
          <button mat-stroked-button type="button" class="dugme" (click)="idiNaKod()" data-imam-kod>Imam kod</button>
        }
        @case ('stalo') {
          <h2>Kod je istekao</h2>
          <p class="uputstvo">Niko nije skenirao kod nekoliko minuta.</p>
          <div class="akcije">
            <button mat-flat-button type="button" class="dugme" (click)="noviZahtev(true)" data-novi-kod>Prikaži novi kod</button>
            <button mat-stroked-button type="button" class="dugme" (click)="idiNaKod()" data-imam-kod>Imam kod</button>
          </div>
        }
        @case ('indeks') {
          <app-nalog-indeks-korak [indeks]="indeks()" [godina]="godina()" [salje]="salje()" [greska]="null"
                                  (posaljiKod)="posaljiKod($event)" (imamKod)="imamKod($event)" />
          <button mat-button type="button" class="dugme" (click)="noviZahtev(true)" data-nazad-qr>Nazad na QR kod</button>
        }
        @case ('kod') {
          <app-nalog-kod-korak [indeks]="prikaz()" [odNastavnika]="odNastavnika()" [maska]="maska()" [poruka]="porukaKoda()"
                               [slanjeBroj]="slanjeBroj()" [salje]="salje()" [greska]="greskaKoda()"
                               (prijavi)="prijavi($event)" (posaljiPonovo)="posaljiKod(student())" (neStize)="idiNa('indeks')"
                               (promeniIndeks)="idiNa('indeks')" />
        }
        @case ('gotovo') {
          <p class="tiho" role="status">Prijavljen si. Otvaram nalog…</p>
        }
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 8px; font-size: 20px; }
    .uputstvo, .ko { margin: 0 0 12px; }
    .tiho { margin: 8px 0; color: var(--ink-2); }
    .qr { display: flex; justify-content: center; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; }
    .qr canvas { width: min(320px, 100%); height: auto; aspect-ratio: 1; }
    .broj { margin: 12px 0 0; text-align: center; font-family: var(--font-mono); font-size: 64px; font-weight: 700; letter-spacing: .15em; }
    .akcije { display: flex; flex-direction: column; gap: 8px; }
    .dugme { width: 100%; min-height: 48px; margin-top: 8px; }
    .poruka { margin: 0 0 12px; padding: 12px 16px; border: 1px solid var(--danger); border-radius: var(--radius-sm); background: var(--danger-soft); }
  `,
})
export class RacunarPage {
  private readonly api = inject(TestoviStudentaApi);
  private readonly nalog = inject(NalogApi);
  private readonly sesija = inject(SesijaStudenta);
  private readonly router = inject(Router);
  private readonly dokument = inject(DOCUMENT);

  protected readonly korak = signal<Korak>('provera');
  protected readonly ja = signal<StudentJa | null>(null);
  protected readonly zahtev = signal<ZahtevRacunara | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);
  private readonly pomak = signal(0);
  private readonly sada = signal(Date.now());
  protected readonly obnovaZa = computed(() => {
    const z = this.zahtev();
    const ms = z ? preostaloMs(z.isticeMs - OBNOVA_PRE_MS, this.pomak(), this.sada()) : null;
    return formatSata(ms ?? 0);
  });

  // „Imam kod“
  protected readonly indeks = signal('');
  protected readonly godina = signal<number>(predlogGodine(null));
  protected readonly student = computed<IndeksIGodina>(() => ({ indeks: this.indeks(), godina: this.godina() }));
  protected readonly prikaz = computed(() => prikazIndeksa(this.indeks(), this.godina()));
  protected readonly odNastavnika = signal(false);
  protected readonly maska = signal('');
  protected readonly porukaKoda = signal(PORUKA_KOD_POSLAT);
  protected readonly slanjeBroj = signal(0);
  protected readonly greskaKoda = signal<string | null>(null);

  private readonly platno = viewChild<ElementRef<HTMLCanvasElement>>('platno');
  private obnova = 0;
  private zahtevSub?: Subscription;
  private cekanjeSub?: Subscription;
  private poslednjeCekanje = 0;

  constructor() {
    effect(() => {
      const c = this.platno()?.nativeElement;
      const z = this.zahtev();
      if (c && z) {
        void toCanvas(c, new URL(`nalog/racunar/${z.token}`, this.dokument.baseURI).href, { width: 320, margin: 1 });
      }
    });
    const tik = setInterval(() => this.otkucaj(), 1_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tik);
      this.zahtevSub?.unsubscribe();
      this.cekanjeSub?.unsubscribe();
    });
    // `stanje` je javno (bez 401 na javnoj strani); `ja` se pita samo kad je neko već prijavljen na ovom računaru
    this.nalog.stanje().subscribe({
      next: st => {
        if (!st.prijavljen) {
          this.noviZahtev(true);
          return;
        }
        this.nalog.ja().subscribe({
          next: ja => {
            this.ja.set(ja);
            this.sesija.ja.set(ja);
            this.korak.set('prijavljen');
          },
          error: (e: unknown) => {
            if (status(e) !== 401) this.greska.set(porukaGreske(e));
            this.noviZahtev(true);
          },
        });
      },
      error: (e: unknown) => {
        this.greska.set(porukaGreske(e));
        this.noviZahtev(true);
      },
    });
  }

  protected idiNa(k: Korak): void {
    this.greskaKoda.set(null);
    this.korak.set(k);
  }

  protected nastavi(): void {
    void this.router.navigateByUrl('nalog/pocetna');
  }

  protected odjaviPaPrijavi(): void {
    if (this.salje()) return;
    this.salje.set(true);
    const dalje = () => {
      this.salje.set(false);
      this.ja.set(null);
      this.sesija.ja.set(null);
      this.noviZahtev(true);
    };
    this.nalog.odjavi().subscribe({ next: dalje, error: dalje });
  }

  /** Nov zahtev (QR + broj). `rucno`: student je tražio, brojač obnova kreće ispočetka. */
  protected noviZahtev(rucno: boolean): void {
    if (rucno) this.obnova = 0;
    this.zahtevSub?.unsubscribe();
    this.zahtevSub = this.api.zahtev().subscribe({
      next: z => {
        this.greska.set(null);
        this.pomak.set(pomakSata(z.serverVremeMs, Date.now()));
        this.zahtev.set(z);
        this.korak.set('qr');
      },
      error: (e: unknown) => {
        this.greska.set(porukaGreske(e));
        this.korak.set('stalo');
      },
    });
  }

  protected idiNaKod(): void {
    this.cekanjeSub?.unsubscribe();
    this.idiNa('indeks');
  }

  protected posaljiKod(s: IndeksIGodina): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.greskaKoda.set(null);
    this.nalog.posaljiKod(s).subscribe({
      next: odg => {
        this.salje.set(false);
        this.indeks.set(s.indeks);
        this.godina.set(s.godina);
        this.odNastavnika.set(false);
        this.maska.set(odg?.maska ?? '');
        this.porukaKoda.set(odg?.poruka || PORUKA_KOD_POSLAT);
        this.slanjeBroj.update(n => n + 1);
        this.korak.set('kod');
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(porukaGreske(e));
      },
    });
  }

  protected imamKod(s: IndeksIGodina): void {
    this.indeks.set(s.indeks);
    this.godina.set(s.godina);
    this.odNastavnika.set(true);
    this.maska.set('');
    this.korak.set('kod');
  }

  protected prijavi(kod: string): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.greskaKoda.set(null);
    this.nalog.prijavi(this.student(), kod, true).subscribe({
      next: () => this.prijavljen(),
      error: (e: unknown) => {
        this.salje.set(false);
        this.greskaKoda.set(porukaGreske(e));
      },
    });
  }

  private otkucaj(): void {
    this.sada.set(Date.now());
    const z = this.zahtev();
    if (this.korak() !== 'qr' || !z || this.dokument.visibilityState === 'hidden') return;
    const doIsteka = preostaloMs(z.isticeMs, this.pomak(), Date.now()) ?? 0;
    if (doIsteka <= OBNOVA_PRE_MS) {
      this.obnovi();
      return;
    }
    if (Date.now() - this.poslednjeCekanje >= CEKANJE_MS && (!this.cekanjeSub || this.cekanjeSub.closed)) {
      this.poslednjeCekanje = Date.now();
      this.cekanjeSub = this.api.cekaj().subscribe({
        next: c => {
          if (c.stanje === 'ODOBREN') {
            this.prijavljen();
          } else if (c.stanje === 'ISTEKAO') {
            this.obnovi();
          }
        },
        error: () => undefined, // sledeći upit za 3 s
      });
    }
  }

  private obnovi(): void {
    if (this.zahtevSub && !this.zahtevSub.closed) return;
    this.obnova++;
    if (this.obnova > NAJVISE_OBNOVA) {
      this.zahtev.set(null);
      this.korak.set('stalo');
      return;
    }
    this.noviZahtev(false);
  }

  private prijavljen(): void {
    this.cekanjeSub?.unsubscribe();
    this.korak.set('gotovo');
    void this.router.navigateByUrl('nalog/pocetna', { replaceUrl: true });
  }
}
