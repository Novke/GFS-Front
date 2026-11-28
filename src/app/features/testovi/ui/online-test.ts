import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription, filter, switchMap } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { OnlineTest } from '../data-access/online.models';
import { NAZIV_REZIMA, NAZIV_STANJA, TabOnline, formatPoena, podrazumevaniTab, vremeIzIso } from '../data-access/online.pravila';
import { ObjavaTesta } from './objava-testa';
import { OnlineKonzola } from './online-konzola';
import { OnlineOdgovori } from './online-odgovori';
import { OnlinePriprema } from './online-priprema';
import { OnlineRezultati } from './online-rezultati';

const TABOVI: { id: TabOnline; naziv: string }[] = [
  { id: 'priprema', naziv: 'Priprema' },
  { id: 'uzivo', naziv: 'Uživo' },
  { id: 'studenti', naziv: 'Studenti' },
  { id: 'zadaci', naziv: 'Po zadacima' },
];

/**
 * Online test na `/testovi/:id` (plan 6, spec 7-14): zaglavlje sa stanjem i dugmadima toka (Otvori ulaz [ulazni kod], Pokreni,
 * Završi smenu, Završi evidentiranje, objava) i četiri taba: **Priprema** (izvučeno po grupi), **Uživo** (konzola na 3 s),
 * **Studenti** (rezultati, primerak, ručni poeni), **Po zadacima** (grupisani odgovori i ispravke ključa). Projektor je posebna
 * strana (`/testovi/:id/projektor`). Greške akcija idu u traku poruka (interceptor).
 */
@Component({
  selector: 'app-online-test',
  imports: [
    ErrorPanel, FormsModule, MatButton, MatCheckbox, MatIcon, ObjavaTesta, OnlineKonzola, OnlineOdgovori, OnlinePriprema,
    OnlineRezultati, PageHeader, RouterLink, SkeletonRows, StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (test(); as t) {
      <app-page-header [naslov]="t.tipTesta + ' · ' + datum(t.datum)" [podnaslov]="t.predmet + ' · ' + t.grupa + ' · ' + opis()">
        <div kontekst class="kontekst">
          <app-status-chip tekst="Online" ton="info" />
          <app-status-chip [tekst]="nazivStanja()" [ton]="t.stanje === 'U_TOKU' ? 'uToku' : t.stanje === 'ZAVRSEN' ? 'ok' : 'neutral'" data-stanje />
          @if (t.pregledan) { <app-status-chip tekst="Evidentiran" ton="ok" /> }
          @if (t.smena.ulazniKod; as kod) { <span class="kod" data-ulazni-kod>Ulazni kod: <strong>{{ kod }}</strong></span> }
        </div>
        <div akcije class="akcije">
          <a matButton="outlined" [routerLink]="['/testovi', t.testId, 'projektor']" target="_blank" data-projektor>
            <mat-icon svgIcon="tv" aria-hidden="true" />Projektor
          </a>
          @switch (t.stanje) {
            @case ('PRIPREMA') {
              <button matButton type="button" [disabled]="radi()" (click)="obrisi()" data-obrisi>
                <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
              </button>
              <mat-checkbox [(ngModel)]="ulazniKod" data-sa-kodom>Ulazni kod</mat-checkbox>
              <button matButton="filled" type="button" [disabled]="radi()" (click)="otvoriUlaz()" data-otvori-ulaz>
                <mat-icon svgIcon="lock_open" aria-hidden="true" />Otvori ulaz
              </button>
            }
            @case ('ULAZ') {
              <button matButton="filled" type="button" [disabled]="radi()" (click)="pokreni()" data-pokreni>
                <mat-icon svgIcon="play_arrow" aria-hidden="true" />Pokreni
              </button>
            }
            @case ('U_TOKU') {
              <button matButton="filled" type="button" class="destruktivno" [disabled]="radi()" (click)="zavrsi()" data-zavrsi-smenu>
                <mat-icon svgIcon="stop_circle" aria-hidden="true" />Završi smenu
              </button>
            }
            @case ('ZAVRSEN') {
              <button matButton type="button" [disabled]="radi()" (click)="obrisi()" data-obrisi>
                <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
              </button>
              @if (!t.pregledan) {
                <button matButton="filled" type="button" [disabled]="radi()" (click)="zavrsiEvidentiranje()" data-zavrsi-evidentiranje>
                  <mat-icon svgIcon="check" aria-hidden="true" />Završi evidentiranje
                </button>
              }
            }
          }
        </div>
      </app-page-header>

      @if (t.upozorenja.length) {
        <ul class="upozorenja" data-upozorenja>
          @for (u of t.upozorenja; track $index) { <li>{{ u }}</li> }
        </ul>
      }

      @if (t.stanje === 'ZAVRSEN') {
        <app-objava-testa [testId]="t.testId" [online]="true" [objavljeno]="t.objavljeno" [tacni]="t.objavaTacni"
                          (promena)="ucitaj()" />
      }

      <nav class="tabovi" aria-label="Delovi testa">
        @for (tb of tabovi; track tb.id) {
          <button type="button" class="tab" [class.aktivan]="tab() === tb.id" [attr.aria-current]="tab() === tb.id ? 'page' : null"
                  [attr.data-tab]="tb.id" (click)="izabranTab.set(tb.id)">{{ tb.naziv }}</button>
        }
      </nav>

      @switch (tab()) {
        @case ('priprema') { <app-online-priprema [test]="t" (promena)="test.set($event)" /> }
        @case ('uzivo') { <app-online-konzola [testId]="t.testId" [stanjeTesta]="t.stanje" (promenaStanja)="ucitaj()" /> }
        @case ('studenti') { <app-online-rezultati [test]="t" /> }
        @case ('zadaci') { <app-online-odgovori [testId]="t.testId" /> }
      }
    } @else if (greska(); as g) {
      <app-error-panel naslov="Online test nije učitan." [poruka]="g" (ponovo)="ucitaj()" />
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .kontekst { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .kod { font-family: var(--font-mono); }
    .akcije { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .destruktivno { --mat-button-filled-container-color: var(--mat-sys-error); --mat-button-filled-label-text-color: var(--mat-sys-on-error); }
    .upozorenja { margin: 0 0 12px; padding: 10px 12px 10px 28px; border: 1px solid var(--warn); border-radius: var(--radius-sm);
      background: var(--warn-soft); }
    .tabovi { display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0; border-bottom: 1px solid var(--line); }
    .tab { min-height: 44px; padding: 0 16px; border: 0; border-bottom: 3px solid transparent; background: none; color: var(--ink-2);
      font: inherit; font-weight: 600; cursor: pointer; }
    .tab.aktivan { border-bottom-color: var(--primary); color: var(--primary); }
    .tab:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
  `,
})
export class OnlineTestPrikaz {
  readonly testId = input.required<number>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly tabovi = TABOVI;
  protected readonly test = signal<OnlineTest | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly radi = signal(false);
  protected ulazniKod = false;
  protected readonly izabranTab = signal<TabOnline | null>(null);
  protected readonly tab = computed<TabOnline>(() => this.izabranTab() ?? podrazumevaniTab(this.test()?.stanje ?? 'PRIPREMA'));
  protected readonly nazivStanja = computed(() => NAZIV_STANJA[this.test()?.stanje ?? 'PRIPREMA']);
  protected readonly opis = computed(() => {
    const t = this.test();
    if (!t) return '';
    const raspodela = t.rezim === 'GRUPE' ? `${t.brojGrupa} ${t.brojGrupa === 1 ? 'grupa' : 'grupe'}` : NAZIV_REZIMA.POJEDINACNO.toLowerCase();
    const pocetak = t.smena.pokrenuta ? ` · počeo u ${vremeIzIso(t.smena.pokrenuta)}` : '';
    return `${t.trajanjeMin} min · ${formatPoena(t.maxPoena)} poena · ${raspodela} · ${t.studenti} studenata${pocetak}`;
  });
  protected readonly datum = formatDatum;
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      this.testId();
      untracked(() => this.ucitaj());
    });
  }

  ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.online(this.testId(), { tiho: true }).subscribe({
      next: t => {
        this.test.set(t);
        this.greska.set(null);
      },
      error: () => this.greska.set('Proveri vezu i pokušaj ponovo.'),
    });
  }

  private akcija(o: Observable<OnlineTest>): void {
    this.radi.set(true);
    o.subscribe({
      next: t => {
        this.test.set(t);
        this.radi.set(false);
        this.izabranTab.set(null);
      },
      error: () => this.radi.set(false),
    });
  }

  protected otvoriUlaz(): void {
    this.akcija(this.api.otvoriUlaz(this.testId(), this.ulazniKod));
  }

  protected pokreni(): void {
    const t = this.test();
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Pokrenuti test?',
      tekst: `Sat kreće za sve (${t?.trajanjeMin ?? ''} min). Studenti koji su ušli odmah vide zadatke; kasniji ulaze do kraja smene.`,
      potvrdi: 'Pokreni',
    }).pipe(filter(Boolean)).subscribe(() => this.akcija(this.api.pokreni(this.testId())));
  }

  protected zavrsi(): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Završiti smenu?',
      tekst: 'Svi koji još rade biće predati sa onim što je sačuvano. Posle toga niko ne može da menja odgovore.',
      potvrdi: 'Završi smenu',
      destruktivno: true,
    }).pipe(filter(Boolean)).subscribe(() => this.akcija(this.api.zavrsi(this.testId())));
  }

  protected zavrsiEvidentiranje(): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Završiti evidentiranje?',
      tekst: 'Poeni ulaze u ocenjivanje. Ručno pregledani zadaci moraju imati poene.',
      potvrdi: 'Završi evidentiranje',
    }).pipe(
      filter(Boolean),
      switchMap(() => {
        this.radi.set(true);
        return this.api.zavrsiEvidentiranje(this.testId());
      }),
    ).subscribe({ next: () => { this.radi.set(false); this.ucitaj(); }, error: () => this.radi.set(false) });
  }

  /** Brisanje (iz zaglavlja papirnog testa ga nema): samo pre ulaza. */
  protected obrisi(): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati test?',
      tekst: this.test()?.stanje === 'ZAVRSEN'
        ? 'Brišu se test, radovi studenata i njihovi poeni (i iz predloga ocene). Ovo se ne može vratiti.'
        : 'Test i izvučeni zadaci se brišu.',
      potvrdi: 'Obriši', destruktivno: true,
    })
      .pipe(filter(Boolean), switchMap(() => this.api.obrisiTest(this.testId())))
      .subscribe(() => void this.router.navigate(['/testovi']));
  }
}
