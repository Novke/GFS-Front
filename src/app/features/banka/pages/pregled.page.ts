import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, ElementRef, inject, Injector, input, untracked,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { JE_ID } from '../../../core/route-matchers';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { sRecju } from '../../../shared/util/mnozina';
import { svgUrl, VarijantaDetails } from '../data-access/banka.models';
import { filterPregleda, NAJVISE_PO_PREDMETU, PregledFilter, PregledNacrtaStore, upitPregleda } from '../data-access/pregled-nacrta.store';
import { OdgovoriPregledComponent } from '../ui/odgovori-pregled.component';
import { imeVarijante, prikazStatusa } from '../ui/varijanta-kartica.component';

type Radnja = 'odobri' | 'obrisi' | 'uredi' | 'preskoci' | 'nazad';

/** Prečice pregleda (`e.key` malim slovima; slovo i na ćiriličnom rasporedu, vidi `taster`). */
const PRECICE: Readonly<Record<string, Radnja>> = { o: 'odobri', delete: 'obrisi', u: 'uredi', arrowright: 'preskoci', arrowleft: 'nazad' };

/**
 * Taster za prečicu, malim slovima: `e.key`, osim slova van ASCII-ja (ćirilica: `о` na mestu `O`), koje se čita po fizičkom
 * tasteru (`e.code` = `KeyO`), kao u konzoli uživo.
 */
function taster(e: KeyboardEvent): string {
  const k = e.key;
  const slovo = k.length === 1 && k.charCodeAt(0) > 0x7f ? /^Key([A-Z])$/.exec(e.code)?.[1] : undefined;
  return (slovo ?? k).toLowerCase();
}

/** Fokus je u polju za unos (tada slova i strelice pripadaju polju, ne pregledu). */
function uPolju(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * Fokus je u CDK overlay-u (npr. `mat-menu` teme u ljusci): tasteri pripadaju njemu, ne nacrtu iza. Vertikalni meni ne
 * obrađuje `←`/`→` niti sprečava slova, pa bi inače preskočili, odobrili ili obrisali nacrt ispod otvorenog menija.
 */
function uOverlayu(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest('.cdk-overlay-container') !== null;
}

const istiFilter = (a: PregledFilter, b: PregledFilter) => JSON.stringify(a) === JSON.stringify(b);

/** "linija 3: Undefined control sequence \foo" (ili samo poruka kad se linija ne zna). */
function opisGreske(v: VarijantaDetails): string {
  const g = v.renderGreska;
  return !g ? 'render nije uspeo' : g.linija === null ? g.poruka : `linija ${g.linija}: ${g.poruka}`;
}

/**
 * Pregled nacrta jedan po jedan (`/banka/pregled?predmet&izvor&serija&grupa&status&od`; podrazumevano svi nacrti, a link iz
 * MCP-a nosi samo seriju): na ekranu je jedan nacrt (putanja grupe, naziv, status, izvor, serija, SVG zadatka i rešenja,
 * tačni odgovori po polju), a kad je kopija Klodove izmene, i original pored, uz "Zamenjuje: …". Radnje i prečice: Odobri
 * (`O`), Obriši (`Delete`; potvrda za sve osim Klodovog nacrta koji nikad nije odobren), Uredi (`U`: editor varijante sa
 * `?povratak` na ovaj pregled sa `od=<id>`, pa se posle čuvanja vraća na isto mesto: isti nacrt, a posle "Sačuvaj i odobri"
 * sledeći), Preskoči (`→`) i Nazad (`←`); posle odobravanja i brisanja automatski sledeći. Prečice se ne obrađuju dok je
 * fokus u polju za unos ili u CDK overlay-u (meni), dok je otvoren dijalog i uz Ctrl/Alt/Meta. Uz seriju u filteru, pri vrhu
 * "Odbaci celu seriju" (potvrda bez broja: server briše sve neodobrene Klodove nacrte serije, ne samo ove iz filtera). Na
 * kraju liste "Nema više nacrta." sa vezom na banku. `PregledNacrtaStore` je ovde (feature store stranice); bez animacija
 * pod `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-pregled-page',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, NgTemplateOutlet, OdgovoriPregledComponent, PageHeader, RouterLink, SkeletonRows, StatusChip],
  providers: [PregledNacrtaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'tastatura($event)' },
  styleUrl: './pregled.page.css',
  template: `
    @let f = filterV();
    <app-page-header naslov="Pregled nacrta" podnaslov="Jedan po jedan: odobri, obriši ili uredi, pa sledeći.">
      @if (f.serija || f.izvor || f.status !== 'NACRT') {
        <div kontekst class="bk-pn-kontekst">
          @if (f.serija) {
            <span class="oznaka" data-filter-serija>Serija <code>{{ f.serija }}</code></span>
          }
          @if (f.izvor) {
            <span class="oznaka">{{ f.izvor === 'CLAUDE' ? 'Samo Klodove' : 'Samo ručne' }}</span>
          }
          @if (f.status !== 'NACRT') {
            <span class="oznaka">{{ prikazStatusa(f.status).tekst }}</span>
          }
        </div>
      }
      @if (f.serija) {
        <button akcije matButton="outlined" type="button" disabledInteractive [disabled]="store.radi() || store.ucitava()"
          (click)="odbaciSeriju()" data-odbaci-seriju>
          <mat-icon svgIcon="delete" aria-hidden="true" />Odbaci celu seriju
        </button>
      }
    </app-page-header>

    <p class="sr-only" role="status">{{ najava() }}</p>

    @if (store.skraceno() && !store.greska()) {
      <p class="bk-pn-napomena" data-skraceno>
        Učitano je najviše {{ najvise }} varijanti po predmetu, pa lista nije cela. Kad ove pregledaš, učitaj stranicu ponovo za ostale.
      </p>
    }

    @if (store.greska(); as g) {
      <app-error-panel naslov="Pregled nije učitan." [poruka]="g" (ponovo)="store.ucitajPonovo()" />
    } @else if (store.kraj()) {
      <section class="lista-kartica" aria-label="Kraj pregleda" data-kraj>
        <app-empty-state naslov="Nema više nacrta." ikona="task_alt" [tekst]="tekstKraja()">
          @if (store.ids().length > 0) {
            <button matButton="outlined" type="button" aria-keyshortcuts="ArrowLeft" (click)="nazad()">
              <mat-icon svgIcon="arrow_back" aria-hidden="true" />Nazad
            </button>
          }
          <a matButton="filled" routerLink="/banka" [queryParams]="vezaBanke()" data-fokus-kraj>Banka zadataka</a>
        </app-empty-state>
      </section>
    } @else {
      @if (store.napredak(); as n) {
        <div class="bk-pn-traka">
          <span class="bk-pn-broj" data-napredak>{{ n }}</span>
          <div class="bk-pn-bar" role="progressbar" aria-label="Napredak pregleda" aria-valuemin="1" [attr.aria-valuemax]="store.ids().length"
            [attr.aria-valuenow]="store.indeks() + 1" [attr.aria-valuetext]="n">
            <span [style.width.%]="procenat()"></span>
          </div>
        </div>
      }
      @let v = store.trenutna();
      <div class="bk-pn-akcije" role="group" aria-label="Radnje nad nacrtom" data-akcije>
        <button matButton type="button" aria-keyshortcuts="ArrowLeft" disabledInteractive [disabled]="store.indeks() === 0" (click)="nazad()">
          Nazad<kbd aria-hidden="true">←</kbd>
        </button>
        <button matButton type="button" aria-keyshortcuts="ArrowRight" disabledInteractive [disabled]="store.ids().length === 0" (click)="preskoci()">
          Preskoči<kbd aria-hidden="true">→</kbd>
        </button>
        <a matButton="outlined" aria-keyshortcuts="U" [routerLink]="v ? ['/banka/varijante', v.id] : null" [queryParams]="{ povratak: povratak() }" data-uredi>
          <mat-icon svgIcon="edit" aria-hidden="true" />Uredi<kbd aria-hidden="true">U</kbd>
        </a>
        <button matButton="outlined" type="button" class="bk-pn-obrisi" aria-keyshortcuts="Delete" disabledInteractive
          [disabled]="!v || store.radi()" (click)="obrisi()" data-obrisi>
          <mat-icon svgIcon="delete" aria-hidden="true" />Obriši<kbd aria-hidden="true">Del</kbd>
        </button>
        <button matButton="filled" type="button" class="bk-pn-odobri" aria-keyshortcuts="O" disabledInteractive [disabled]="!mozeOdobriti()"
          (click)="odobri()" data-odobri>
          <mat-icon svgIcon="task_alt" aria-hidden="true" />Odobri<kbd aria-hidden="true">O</kbd>
        </button>
      </div>

      @if (v) {
        @let o = store.original();
        <div class="bk-pn-mreza" [class.bk-pn-dve]="!!o">
          <article class="lista-kartica bk-pn-kolona" aria-labelledby="bk-pn-naziv" data-nacrt>
            <header class="bk-pn-glava">
              <ol class="bk-pn-putanja" aria-label="Putanja grupe" data-putanja>
                @for (p of v.putanja; track p.id) {
                  <li>{{ p.naziv }}</li>
                }
              </ol>
              <div class="bk-pn-naslov">
                <h2 id="bk-pn-naziv" data-naziv>{{ ime(v) }}</h2>
                @let s = prikazStatusa(v.status);
                <app-status-chip [tekst]="s.tekst" [ton]="s.ton" [ikona]="s.ikona" />
                @if (v.izvor === 'CLAUDE') {
                  <span class="oznaka" title="Varijantu je napravio Claude" data-izvor>Claude</span>
                } @else {
                  <span class="oznaka" data-izvor>Ručno</span>
                }
                @if (v.serija) {
                  <span class="oznaka" data-serija>Serija <code>{{ v.serija }}</code></span>
                }
              </div>
              @if (v.zamenjuje !== null) {
                <p class="bk-pn-zamenjuje" data-zamenjuje>Zamenjuje: {{ o ? ime(o) : '#' + v.zamenjuje }}</p>
              }
            </header>
            <ng-container *ngTemplateOutlet="sadrzaj; context: { $implicit: v, uz: '' }" />
          </article>
          @if (o) {
            <section class="lista-kartica bk-pn-kolona bk-pn-original" aria-labelledby="bk-pn-naziv-originala" data-original>
              <header class="bk-pn-glava">
                <p class="bk-pn-nadnaslov">Original</p>
                <div class="bk-pn-naslov">
                  <h2 id="bk-pn-naziv-originala">{{ ime(o) }}</h2>
                  @let so = prikazStatusa(o.status);
                  <app-status-chip [tekst]="so.tekst" [ton]="so.ton" [ikona]="so.ikona" />
                </div>
              </header>
              <ng-container *ngTemplateOutlet="sadrzaj; context: { $implicit: o, uz: ' (original)' }" />
            </section>
          }
        </div>
      } @else {
        <app-skeleton-rows [redovi]="6" />
      }
    }

    <ng-template #sadrzaj let-v let-uz="uz">
      <figure class="bk-pn-slika">
        <figcaption>Zadatak</figcaption>
        <div class="bk-pn-platno rezim-dan">
          @if (v.renderStatus === 'GRESKA' && v.renderDeo !== 'resenje') {
            <p class="bk-pn-greska"><mat-icon svgIcon="error" aria-hidden="true" />Greška u LaTeX-u ({{ opisGreske(v) }})</p>
          } @else if (v.svgId) {
            <img [src]="slika(v.svgId)" [alt]="'Zadatak' + uz + ': ' + ime(v)" />
          } @else {
            <span class="bk-pn-zamena">Nije renderovano</span>
          }
        </div>
      </figure>
      @if (v.resenje !== null) {
        <figure class="bk-pn-slika">
          <figcaption>Rešenje</figcaption>
          <div class="bk-pn-platno rezim-dan">
            @if (v.renderStatus === 'GRESKA' && v.renderDeo === 'resenje') {
              <p class="bk-pn-greska"><mat-icon svgIcon="error" aria-hidden="true" />Greška u LaTeX-u rešenja ({{ opisGreske(v) }})</p>
            } @else if (v.resenjeSvgId) {
              <img [src]="slika(v.resenjeSvgId)" [alt]="'Rešenje' + uz + ': ' + ime(v)" />
            } @else {
              <span class="bk-pn-zamena">Nije renderovano</span>
            }
          </div>
        </figure>
      } @else {
        <p class="bk-pn-zamena">Bez rešenja.</p>
      }
      <h3 class="bk-pn-podnaslov">Tačni odgovori</h3>
      <app-odgovori-pregled [polja]="v.polja" [odgovori]="v.odgovori" />
    </ng-template>
  `,
})
export class PregledPage {
  protected readonly store = inject(PregledNacrtaStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  /** Radnja stranice (taster ili dugme) je pokrenula promenu: samo tada prelaz u kraj (ili iz njega) sme da pomeri fokus. */
  private radnjaKorisnika = false;

  /** Query parametri (`withComponentInputBinding`). */
  readonly predmet = input<string>();
  readonly izvor = input<string>();
  readonly serija = input<string>();
  readonly grupa = input<string>();
  readonly status = input<string>();
  /** `?od=`: varijanta od koje pregled počinje (povratak iz editora, `pocetakPregleda`); menja samo početak, ne listu. */
  readonly od = input<string>();

  protected readonly ime = imeVarijante;
  protected readonly prikazStatusa = prikazStatusa;
  protected readonly opisGreske = opisGreske;
  protected readonly slika = svgUrl;
  protected readonly najvise = NAJVISE_PO_PREDMETU;

  protected readonly filterV = computed(
    () => filterPregleda({ predmet: this.predmet(), izvor: this.izvor(), serija: this.serija(), grupa: this.grupa(), status: this.status() }),
    { equal: istiFilter },
  );
  /** URL ovog pregleda sa `od` = prikazana varijanta: editor se posle čuvanja vraća tu (`?povratak`). */
  protected readonly povratak = computed(() => {
    const v = this.store.trenutna();
    return v
      ? this.router.serializeUrl(this.router.createUrlTree(['/banka/pregled'], { queryParams: { ...upitPregleda(this.filterV()), od: v.id } }))
      : null;
  });
  protected readonly vezaBanke = computed(() => {
    const p = this.filterV().predmet;
    return p === null ? {} : { predmet: p };
  });
  protected readonly procenat = computed(() => {
    const n = this.store.ids().length;
    return n === 0 ? 0 : ((this.store.indeks() + 1) / n) * 100;
  });
  protected readonly mozeOdobriti = computed(() => {
    const v = this.store.trenutna();
    return !!v && !this.store.radi() && v.status !== 'AKTIVNA' && v.renderStatus === 'OK';
  });
  protected readonly tekstKraja = computed(() => {
    const n = this.store.ids().length;
    return n > 0 ? `Preskočeno: ${sRecju(n, 'varijanta', 'varijante', 'varijanti')}. Nazad (←) vraća na poslednju.` : null;
  });
  /** Za čitač ekrana: koji je nacrt sada na ekranu (posle radnje stiže sledeći). */
  protected readonly najava = computed(() => {
    const v = this.store.trenutna();
    return this.store.kraj() ? 'Nema više nacrta.' : v ? `${this.store.napredak()}: ${imeVarijante(v)}` : '';
  });

  constructor() {
    effect(() => {
      const f = this.filterV();
      untracked(() => {
        const od = this.od();
        this.store.ucitaj(f, od !== undefined && JE_ID.test(od) ? Number(od) : null);
      });
    });

    // kraj liste posle radnje (dugmad nestaju) i povratak iz kraja (nestaje "Nazad" praznog stanja): fokus koji je pao na body
    // ide na vezu ka banci, odnosno na "Nazad" trake; lista koja se učitala prazna fokus ne pomera
    let bilo: boolean | null = null;
    effect(() => {
      const kraj = this.store.kraj();
      untracked(() => {
        if (bilo !== null && bilo !== kraj && this.radnjaKorisnika) {
          this.radnjaKorisnika = false;
          afterNextRender(() => {
            const aktivni = this.document.activeElement;
            if (!aktivni || aktivni === this.document.body) {
              this.host.nativeElement.querySelector<HTMLElement>(kraj ? '[data-fokus-kraj]' : '[data-akcije] button')?.focus();
            }
          }, { injector: this.injector });
        }
        bilo = kraj;
      });
    });
  }

  /**
   * Prečice (`O`, `Delete`, `U`, `→`, `←`); ne dok je fokus u polju ili u overlay-u (meni), dok je otvoren dijalog, uz
   * Ctrl/Alt/Meta ni ponovljen taster.
   */
  protected tastatura(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    const radnja = PRECICE[taster(e)];
    if (!radnja || this.dialog.openDialogs.length > 0 || uPolju(e.target) || uOverlayu(e.target)) {
      return;
    }
    e.preventDefault();
    this[radnja]();
  }

  protected odobri(): void {
    if (this.mozeOdobriti()) {
      this.radnjaKorisnika = true;
      this.store.odobri();
    }
  }

  /** Klodov nacrt koji nikad nije odobren se briše odmah; ručna (ili ikad odobrena) varijanta tek posle potvrde. */
  protected obrisi(): void {
    const v = this.store.trenutna();
    if (!v || this.store.radi()) {
      return;
    }
    if (v.izvor === 'CLAUDE' && v.status === 'NACRT' && !v.ikadOdobrena) {
      this.radnjaKorisnika = true;
      this.store.obrisi();
      return;
    }
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati varijantu „${imeVarijante(v)}“?`,
      tekst: ['Varijanta i njen render se brišu trajno.', 'Varijanta korišćena na času se ne briše; nju arhiviraj.'],
      potvrdi: 'Obriši varijantu',
      destruktivno: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => {
        if (this.store.trenutna()?.id === v.id) {
          this.radnjaKorisnika = true;
          this.store.obrisi();
        }
      });
  }

  protected uredi(): void {
    const v = this.store.trenutna();
    const povratak = this.povratak();
    if (v && povratak) {
      void this.router.navigate(['/banka/varijante', v.id], { queryParams: { povratak } });
    }
  }

  protected preskoci(): void {
    this.radnjaKorisnika = true;
    this.store.sledeca();
  }

  protected nazad(): void {
    this.radnjaKorisnika = true;
    this.store.prethodna();
  }

  /**
   * Potvrda bez broja nacrta: server briše **sve** Klodove nacrte serije koji nikad nisu odobreni (u svim predmetima i grupama,
   * bez obzira na filter pregleda i na granicu učitavanja), a lista ovde je sužena filterom i ne zna `ikadOdobrena`, pa bi
   * njen broj bio manji (ili veći) od onoga što se trajno briše. Tačan spisak stiže posle, u poruci (`porukaOdbacivanja`).
   */
  protected odbaciSeriju(): void {
    const serija = this.filterV().serija;
    if (!serija || this.store.radi() || this.store.ucitava()) {
      return;
    }
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Odbaciti seriju „${serija}“?`,
      tekst: [
        'Trajno se brišu svi Klodovi nacrti ove serije koji nikad nisu odobreni, u svim predmetima i grupama, ne samo oni u ovom '
          + 'pregledu, i Klodove grupe serije koje posle toga ostanu prazne.',
        'Odobrene i ručne varijante i grupe ostaju, kao i prezentacije serije.',
      ],
      potvrdi: 'Odbaci seriju',
      destruktivno: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.radnjaKorisnika = true;
        this.store.odbaciSeriju();
      });
  }
}
