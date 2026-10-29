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
import {
  blokVremena, DANI, danIDatum, danUNedelji, isoDatum, lokalniDatum, MESECI_KRATKO, relativniDan,
} from '../../../shared/util/termin';
import { RasporedApi } from '../data-access/raspored.api';
import { DANA_TERMINA, PromenaTerminaOdgovor, TerminInfo } from '../data-access/raspored.models';
import { imeStudenta, iznadPraga, odIliDanas, poDatumu, pomeriOd } from '../data-access/raspored.pravila';
import { tekstZaWhatsApp, VrstaPromene } from '../data-access/whatsapp';
import { OtkazivanjeDialog } from '../ui/otkazivanje.dialog';
import { VracanjeDialog } from '../ui/vracanje.dialog';
import { WhatsAppDialog } from '../ui/whatsapp.dialog';

type Status = 'ucitavanje' | 'greska' | 'ok';

const kljuc = (t: Pick<TerminInfo, 'stavkaId' | 'datum'>) => `${t.stavkaId}:${t.datum}`;

/**
 * Naredni termini (`/raspored/termini?od=<datum>`, i `/raspored` vodi ovde; spec najave odsustva, odeljak 7): termini svih
 * perioda za 4 nedelje od `od` (podrazumevano danas), po danu. Kartica dana ima blok datuma levo (dan, krupan broj, mesec);
 * red termina vreme u svom uglu, predmet i grupu, krupan broj studenata koji ne dolaze (istaknut iznad praga; klik
 * rasklapa ko ne dolazi i zašto), predavanje tog dana, i desno „Otkaži čas“ / „Vrati čas“ dok termin nije počeo.
 * Obaveštenje „Mnogo najava odsustva“ i nastavnički mejl vode ovde sa `od` = datum termina. Posle otkazivanja ili vraćanja
 * termina poruka o uspehu nudi „WhatsApp“, a red termina dugme „Pošalji u WhatsApp“ dok se ne napusti stranica (spec
 * aplikacije i obaveštenja, odeljak 7).
 */
@Component({
  selector: 'app-termini-page',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Naredni termini" podnaslov="Časovi iz rasporeda, sa najavama odsustva studenata.">
      <a akcije matButton="outlined" routerLink="/raspored/periodi" data-periodi>
        <mat-icon svgIcon="edit" aria-hidden="true" />Uredi raspored
      </a>
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
            <a matButton="outlined" routerLink="/raspored/periodi">Uredi raspored</a>
          </app-empty-state>
        }
        @for (d of dani(); track d.datum) {
          <section class="dan" [class.danas]="d.datum === danas" [attr.aria-labelledby]="'dan-' + d.datum"
                   [attr.data-dan]="d.datum">
            <h2 class="kad" [id]="'dan-' + d.datum">
              <span class="sr-only">{{ naslovDana(d.datum) }}</span>
              <span class="kad-dan" aria-hidden="true">{{ danUBloku(d.datum) }}</span>
              <span class="kad-broj" aria-hidden="true">{{ brojDana(d.datum) }}</span>
              <span class="kad-mesec" aria-hidden="true">{{ mesec(d.datum) }}</span>
            </h2>
            <ul class="termini">
              @for (t of d.termini; track kljuc(t)) {
                <li class="termin" [attr.data-termin]="kljuc(t)" [class.otkazan]="t.otkazan">
                  <p class="vreme" data-vreme>
                    <span class="sr-only">{{ t.otkazan ? 'Otkazano: ' : '' }}</span>{{ blok(t) }}
                  </p>
                  <div class="sta">
                    <h3 class="predmet">{{ t.predmet.naziv }}</h3>
                    <p class="grupa">
                      <span data-grupa>{{ t.grupa.naziv }}</span>
                      @if (t.otkazan) {
                        <app-status-chip tekst="Otkazano" ton="danger" />
                      }
                      @if (t.predavanjeId) {
                        <a class="veza" [routerLink]="['/predavanja', t.predavanjeId]">Predavanje</a>
                      }
                    </p>
                    @if (t.otkazan && t.napomena) {
                      <p class="napomena">Napomena: {{ t.napomena }}</p>
                    }
                    @if (zaWhatsApp().get(kljuc(t)); as v) {
                      <button matButton type="button" class="wa" (click)="whatsapp(t, v)"
                              [attr.aria-label]="'Pošalji u WhatsApp: ' + opis(t)" data-wa>
                        <mat-icon svgIcon="send" aria-hidden="true" />Pošalji u WhatsApp
                      </button>
                    }
                  </div>
                  @if (t.najave.length > 0) {
                    <button type="button" class="odsutni" [class.iznad]="iznadPraga(t)" (click)="rasklopi(t)"
                            [attr.aria-expanded]="otvoren(t)" [attr.aria-controls]="'ko-' + kljuc(t)" data-broj-najava>
                      <span class="odsutni-broj">
                        <mat-icon svgIcon="person_remove" aria-hidden="true" /><span data-broj>{{ t.brojNajava }}</span>
                      </span>
                      <span class="odsutni-tekst">
                        ne dolazi<mat-icon class="strelica" svgIcon="expand_more" aria-hidden="true" />
                      </span>
                      @if (iznadPraga(t)) {
                        <span class="odsutni-prag">iznad praga {{ t.prag }}</span>
                      }
                      <span class="sr-only">, {{ otvoren(t) ? 'sakrij' : 'prikaži' }} imena</span>
                    </button>
                  } @else {
                    <p class="odsutni nula" data-broj-najava>
                      <span class="odsutni-broj">
                        <mat-icon svgIcon="person_remove" aria-hidden="true" /><span data-broj>{{ t.brojNajava }}</span>
                      </span>
                      <span class="odsutni-tekst">ne dolazi</span>
                    </p>
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
                                (click)="otkazi(t)" [attr.aria-label]="'Otkaži čas: ' + opis(t)" data-otkazi>
                          <mat-icon svgIcon="cancel" aria-hidden="true" />Otkaži čas
                        </button>
                      }
                    </div>
                  }
                  @if (t.najave.length > 0) {
                    <ul class="ko" [id]="'ko-' + kljuc(t)" [hidden]="!otvoren(t)" [attr.aria-label]="'Ko ne dolazi: ' + opis(t)">
                      @for (n of t.najave; track n.studentId) {
                        <li>
                          <a [routerLink]="['/studenti', n.studentId]">{{ ime(n) }}</a>
                          @if (n.razlog) {
                            <span class="razlog">{{ n.razlog }}</span>
                          }
                        </li>
                      }
                    </ul>
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

    /* Kartica dana: blok datuma levo, termini desno. */
    .dan { display: grid; grid-template-columns: 96px minmax(0, 1fr); border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); box-shadow: var(--shadow); overflow: hidden; }
    .kad { margin: 0; padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: var(--surface-2); color: var(--ink-2); border-right: 1px solid var(--line); font-weight: 400; }
    .kad-dan { font-size: 13px; font-weight: 600; line-height: 1.2; }
    .kad-broj { font-size: 34px; font-weight: 700; line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums;
      letter-spacing: -.02em; }
    .kad-mesec { font-size: 13px; line-height: 1.2; }
    .danas .kad { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .danas .kad-broj { color: var(--primary-soft-ink); }

    .termini { margin: 0; padding: 0; list-style: none; min-width: 0; }
    .termin { display: grid; align-items: start; gap: 4px 20px; padding: 14px 18px;
      grid-template-columns: 104px minmax(0, 1fr) auto auto;
      grid-template-areas: "vreme sta odsutni akcije" ". ko ko ko"; }
    .termin + .termin { border-top: 1px solid var(--line); }
    .vreme { grid-area: vreme; margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; color: var(--ink);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sta { grid-area: sta; min-width: 0; }
    .predmet { margin: 0; font-size: 17px; font-weight: 600; line-height: 24px; overflow-wrap: anywhere; }
    .grupa { margin: 2px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 14px;
      color: var(--ink-2); }
    .veza { font-size: 14px; }
    .napomena { margin: 6px 0 0; color: var(--ink-2); font-size: 14px; overflow-wrap: anywhere; }
    .otkazan .vreme, .otkazan .predmet { text-decoration: line-through; color: var(--muted); }
    .wa { margin-top: 6px; }

    /* Broj studenata koji ne dolaze: krupan broj sa ikonicom; iznad praga istaknut. */
    .odsutni { grid-area: odsutni; justify-self: end; margin: 0; min-width: 104px; padding: 6px 12px;
      display: flex; flex-direction: column; align-items: center; gap: 0; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font: inherit; text-align: center; }
    button.odsutni { cursor: pointer; }
    button.odsutni:hover { background: var(--surface-2); }
    .odsutni-broj { display: inline-flex; align-items: center; gap: 6px; font-size: 28px; font-weight: 700; line-height: 1.1;
      font-variant-numeric: tabular-nums; }
    .odsutni-broj mat-icon { width: 22px; height: 22px; font-size: 22px; color: var(--ink-2); }
    .odsutni-tekst { display: inline-flex; align-items: center; font-size: 13px; color: var(--ink-2); }
    .strelica { width: 18px; height: 18px; font-size: 18px; transition: transform .15s; }
    [aria-expanded="true"] .strelica { transform: rotate(180deg); }
    .odsutni-prag { font-size: 12px; font-weight: 600; }
    .odsutni.iznad { background: var(--warn-soft); border-color: var(--warn); color: var(--warn); }
    .odsutni.iznad .odsutni-broj mat-icon, .odsutni.iznad .odsutni-tekst { color: var(--warn); }
    .odsutni.nula { border-color: transparent; background: transparent; color: var(--muted); }
    .odsutni.nula .odsutni-broj mat-icon, .odsutni.nula .odsutni-tekst { color: var(--muted); }

    .akcije { grid-area: akcije; justify-self: end; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .destruktivno { --mat-button-outlined-label-text-color: var(--danger); }

    .ko { grid-area: ko; margin: 8px 0 0; padding: 10px 14px; list-style: none; border-radius: var(--radius-sm);
      background: var(--surface-2); display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
    .ko[hidden] { display: none; }
    .razlog { color: var(--ink-2); overflow-wrap: anywhere; }
    .razlog::before { content: ' · '; }
    @media (prefers-reduced-motion: reduce) { .strelica { transition: none; } }

    /* Telefon: uži blok datuma, vreme iznad predmeta, broj i akcije u redu ispod. */
    @media (max-width: 599.98px) {
      .dan { grid-template-columns: 64px minmax(0, 1fr); }
      .kad-broj { font-size: 26px; }
      .termin { padding: 12px; gap: 6px 12px; grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas: "vreme vreme" "sta sta" "odsutni akcije" "ko ko"; }
      .odsutni { justify-self: start; }
    }
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
  /** Termini otkazani ili vraćeni na ovoj stranici: nude „Pošalji u WhatsApp“ dok se stranica ne napusti. */
  protected readonly zaWhatsApp = signal<ReadonlyMap<string, VrstaPromene>>(new Map());
  /** Termini čija je lista „ko ne dolazi“ rasklopljena. */
  private readonly otvoreni = signal<ReadonlySet<string>>(new Set());
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

  /** Pun naziv dana za čitač ekrana: `Danas, sreda 6. 11.`, `Sutra, ...`, `Petak 8. 11.`. */
  protected naslovDana(datum: string): string {
    const d = danIDatum(datum);
    const r = relativniDan(datum, this.danas);
    return r ? `${r.charAt(0).toUpperCase()}${r.slice(1)}, ${d}` : d.charAt(0).toUpperCase() + d.slice(1);
  }

  /** Gornji red bloka datuma: `danas`, `sutra` ili dan u nedelji. */
  protected danUBloku(datum: string): string {
    return relativniDan(datum, this.danas) || DANI[danUNedelji(datum)];
  }

  protected brojDana(datum: string): string {
    return String(lokalniDatum(datum)?.getDate() ?? '');
  }

  protected mesec(datum: string): string {
    const d = lokalniDatum(datum);
    return d ? MESECI_KRATKO[d.getMonth()] : '';
  }

  protected otvoren(t: TerminInfo): boolean {
    return this.otvoreni().has(kljuc(t));
  }

  protected rasklopi(t: TerminInfo): void {
    const k = kljuc(t);
    this.otvoreni.update(s => {
      const novi = new Set(s);
      if (!novi.delete(k)) {
        novi.add(k);
      }
      return novi;
    });
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
          }), t.otkazan ? () => 'Napomena je sačuvana.' : o => `Čas je otkazan. ${tekstMejla(o, izbor.posaljiMejl)}`,
          t.otkazan ? undefined : 'OTKAZAN');
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
            o => `Čas se ipak održava. ${tekstMejla(o, izbor.posaljiMejl)}`, 'ODRZAVA');
        }
      });
  }

  /**
   * Zahtev nije tih: poruka servera (409 „Termin je već počeo.“) ide u snackbar, a lista se učitava iznova. Kad neki mejl
   * nije stavljen u red (`neposlato`), poruka je greška, da se ne previdi.
   */
  /** Otvara predlog poruke za WhatsApp grupu za termin otkazan ili vraćen na ovoj stranici. */
  protected whatsapp(t: TerminInfo, vrsta: VrstaPromene): void {
    WhatsAppDialog.otvori(this.dialog, tekstZaWhatsApp(t, vrsta, this.danas));
  }

  private posalji(t: TerminInfo, zahtev: Observable<PromenaTerminaOdgovor>, poruka: (o: PromenaTerminaOdgovor) => string,
                  wa?: VrstaPromene): void {
    const k = kljuc(t);
    this.salje.set(k);
    zahtev.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: o => {
        this.salje.set(null);
        this.termini.update(l => l.map(x => (kljuc(x) === k ? o.termin : x)));
        if (wa) {
          this.zaWhatsApp.update(m => new Map(m).set(k, wa));
        }
        if ((o.neposlato ?? 0) > 0) {
          this.poruke.greska(poruka(o));
        } else {
          this.poruke.uspeh(poruka(o), wa ? { label: 'WhatsApp', run: () => this.whatsapp(o.termin, wa) } : undefined);
        }
      },
      error: () => {
        this.salje.set(null);
        this.ucitaj();
      },
    });
  }
}

/**
 * Deo poruke o obaveštavanju posle otkazivanja ili vraćanja (`posaljiMejl` = izbor nastavnika u dijalogu, važi za mejl i
 * telefon): mejl, pa broj push poruka (`pushPoslato`, stariji server ga ne šalje).
 */
export function tekstMejla(o: PromenaTerminaOdgovor, posaljiMejl: boolean): string {
  if (!posaljiMejl) {
    return 'Mejl i obaveštenje na telefon nisu slati.';
  }
  const push = o.pushPoslato ?? 0;
  const naTelefon = push > 0 ? ` Obaveštenje na telefon: ${push}.` : '';
  return `${tekstSamoMejla(o)}${naTelefon}`;
}

function tekstSamoMejla(o: PromenaTerminaOdgovor): string {
  const neposlato = o.neposlato ?? 0;
  const poslat = o.obavesteno > 0 ? `Mejl je poslat: ${brojStudenataTekst(o.obavesteno)}.` : '';
  if (neposlato > 0) {
    return `${poslat} Mejl nije poslat: ${brojStudenataTekst(neposlato)} (red za slanje je pun ili slanje nije podešeno); javi im drugim putem.`.trim();
  }
  return poslat || 'Mejl nije poslat nikome.';
}
