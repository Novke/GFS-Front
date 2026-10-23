import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, ElementRef, inject, Injector, input, signal,
  untracked, viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, EMPTY, filter, finalize, map, Observable, of, Subject, switchMap, tap } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { sRecju } from '../../../shared/util/mnozina';
import { BankaApi } from '../data-access/banka.api';
import {
  GrupaCmd, GrupaDetails, MAX_NAZIV_GRUPE, MAX_OPIS_GRUPE, MAX_UPUTSTVO_GRUPE, Polje, TEZINE, VarijantaInfo,
} from '../data-access/banka.models';
import { razlogBanke, TIHO, UPIS } from '../data-access/greske';
import { PromeneNivoa } from '../data-access/promene-nivoa';
import { BrojaciSeme, istaPolja, normalizujPolja, posledicePromene, proveriPolja } from '../data-access/polja';
import { potvrdiUkljucivanje, pretakIskljucenja } from '../ui/iskljucene-teme.component';
import { PoljaEditorComponent } from '../ui/polja-editor.component';
import { imeVarijante, VarijantaKarticaComponent } from '../ui/varijanta-kartica.component';

type RadnjaStatusa = 'odobri' | 'arhiviraj' | 'vratiUNacrt';

/** Kao `prazanUNull` na serveru: tekst bez razmaka na krajevima, prazan je `null`. */
function prazanUNull(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

/** `required` i za naziv od samih razmaka (server ga skida i odbija). */
function neprazan(c: AbstractControl<string>): ValidationErrors | null {
  return (c.value ?? '').trim() === '' ? { required: true } : null;
}

interface GreskaUcitavanja {
  nePostoji: boolean;
  poruka: string;
}

/**
 * Detalj grupe banke (`/banka/grupe/:id`): naziv, težina (1-5), opis, uputstvo za Claude-a i šema polja odgovora
 * (`app-polja-editor`), ispod kartice varijanti grupe sa istim radnjama kao na `/banka`. Unutrašnji čvor (ima podgrupe)
 * menja samo naziv i opis. "Sačuvaj" šalje `PUT banka/grupe/{id}` (puna zamena; `polja` je cela lista samo kad se šema
 * promenila, inače `null`, pa server ne dira odgovore varijanti), greška ide u traku iznad forme (`LOCAL_ERRORS`). Pre
 * čuvanja stranica pokazuje šta nova šema radi varijantama (`posledicePromene`). Izmenjeno = drugačije od poslednjeg stanja
 * sa servera (`osnova`), posle normalizacije kao na serveru; napuštanje tada pita (`unsavedChangesGuard`, a zatvaranje kartice i
 * osvežavanje `beforeunload`).
 *
 * Varijante se učitavaju same (`BankaApi.varijante`, bez `BankaStore`-a, koji pripada `/banka`) i ponovo posle svake radnje i
 * svakog čuvanja (nova šema menja statuse); brojači aktivnih i varijanti za zaključavanje tipa, obaveznu težinu i upozorenja
 * dolaze iz te liste čim stigne.
 *
 * Isključena grupa (sopstvena tema ili tema pretka, Klod je ne nudi) ima u zaglavlju oznaku "Isključeno" i "Uključi": posle
 * potvrde (za temu pretka imenuje pretka i kaže da se uključuje celo njegovo podstablo) `DELETE iskljucene-teme/{iskljucenjeId}`,
 * pa novo čitanje grupe, iz kog stižu samo `iskljucena` i `iskljucenjeId` (forma i osnova izmena ostaju, otkucano se ne gubi;
 * pretku sa svojom temom grupa ostaje isključena).
 */
@Component({
  selector: 'app-grupa-detalj-page',
  imports: [
    EmptyState, ErrorPanel, FormErrorBanner, MatButton, MatError, MatFormField, MatHint, MatIcon, MatInput, MatLabel, MatOption,
    MatProgressSpinner, MatSelect, MatTooltip, PageHeader, PoljaEditorComponent, ReactiveFormsModule, RouterLink, SkeletonRows,
    VarijantaKarticaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'preIzlaska($event)' },
  styleUrl: './grupa-detalj.page.css',
  template: `
    @if (greskaUcitavanja(); as gr) {
      <app-page-header naslov="Grupa zadataka" />
      @if (gr.nePostoji) {
        <app-empty-state naslov="Grupa nije pronađena" ikona="quiz" tekst="Grupa je možda obrisana; ostale grupe su u banci zadataka.">
          <a matButton="outlined" routerLink="/banka"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Banka zadataka</a>
        </app-empty-state>
      } @else {
        <app-error-panel naslov="Grupa nije učitana." [poruka]="gr.poruka" (ponovo)="ucitaj(grupaId())" />
      }
    } @else if (osnova(); as g) {
      <app-page-header [naslov]="g.naziv" [podnaslov]="g.list ? 'Šema odgovora, težina i uputstvo za nove varijante' : 'Grupa sa podgrupama'">
        <nav kontekst aria-label="Putanja grupe" data-putanja>
          <ol class="bk-gd-putanja">
            @for (p of g.putanja; track p.id) {
              <li>
                <a class="bk-gd-veza" routerLink="/banka" [queryParams]="{ predmet: g.predmetId, namena: g.namena, grupa: p.id }">{{ p.naziv }}</a>
              </li>
            }
          </ol>
        </nav>
        @if (g.iskljucena) {
          <div kontekst class="bk-gd-iskljuceno" data-iskljuceno>
            <span class="oznaka">Isključeno</span>
            <span class="bk-gd-iskljuceno-tekst">Klod ovu temu ne nudi.</span>
            <button matButton type="button" disabledInteractive [disabled]="ukljucuje()" (click)="ukljuciTemu()" data-ukljuci>Uključi</button>
          </div>
        }
      </app-page-header>

      <form class="lista-kartica bk-gd-forma" [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate aria-labelledby="bk-gd-naslov-forme">
        <h2 id="bk-gd-naslov-forme" class="sr-only">Podaci grupe</h2>
        <app-form-error-banner [poruka]="greska()" />
        <div class="bk-gd-red">
          <mat-form-field appearance="outline" class="bk-gd-naziv">
            <mat-label>Naziv</mat-label>
            <input matInput formControlName="naziv" [maxlength]="maxNaziv" autocomplete="off" data-naziv />
            @if (poruka('naziv', 'Naziv'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          @if (g.list) {
            <mat-form-field appearance="outline" class="bk-gd-tezina">
              <mat-label>Težina tipa</mat-label>
              <mat-select formControlName="tezina" data-tezina>
                @if (brojaci().brojVarijanti === 0) {
                  <mat-option [value]="null">Bez težine</mat-option>
                }
                @for (t of tezine; track t) {
                  <mat-option [value]="t">{{ t }}</mat-option>
                }
              </mat-select>
              <mat-hint>Od 1 do 5, zajednička svim varijantama grupe</mat-hint>
              @if (forma.controls.tezina.hasError('required')) {
                <mat-error>Grupa ima varijante, pa mora imati težinu.</mat-error>
              }
            </mat-form-field>
          }
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Opis (opciono)</mat-label>
          <textarea matInput rows="3" formControlName="opis" [maxlength]="maxOpis" data-opis></textarea>
          @if (poruka('opis', 'Opis'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>
        @if (g.list) {
          <mat-form-field appearance="outline">
            <mat-label>Uputstvo za Claude-a (opciono)</mat-label>
            <textarea matInput rows="4" formControlName="uputstvo" [maxlength]="maxUputstvo" data-uputstvo></textarea>
            <mat-hint>Claude ovo čita kao uputstvo za nove varijante: stil, opseg brojeva, šta izbegavati</mat-hint>
            @if (poruka('uputstvo', 'Uputstvo'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>

          <section class="bk-gd-sema" aria-labelledby="bk-gd-naslov-seme">
            <h2 id="bk-gd-naslov-seme" class="bk-gd-podnaslov">Šema odgovora</h2>
            <p class="bk-gd-objasnjenje">Polja koja student popunjava; svaka varijanta grupe ima tačan odgovor za svako polje.</p>
            <app-polja-editor [polja]="polja()" [sacuvanaPolja]="g.polja" [tipZakljucan]="brojaci().brojAktivnih > 0"
              (poljaPromena)="polja.set($event)" />
          </section>
        } @else {
          <p class="bk-gd-objasnjenje">Grupa ima podgrupe: težina, uputstvo i šema odgovora se zadaju u svakoj podgrupi.</p>
        }

        <div class="bk-gd-posledice" role="status" data-posledice>
          @for (p of posledice(); track p) {
            <p class="bk-gd-upozorenje"><mat-icon svgIcon="info" aria-hidden="true" /><span>{{ p }}</span></p>
          }
        </div>

        <div class="bk-gd-akcije">
          <button matButton type="button" disabledInteractive [disabled]="!izmenjeno() || cuva()" (click)="odbaci()" data-odbaci>Odbaci izmene</button>
          <!-- disabledInteractive: klik i fokus i na onemogućenom dugmetu otkrivaju greške (zašto se ne čuva) -->
          <button matButton="filled" type="submit" disabledInteractive [disabled]="!mozeSacuvati()" (focus)="otkrijGreske()" data-sacuvaj>
            @if (cuva()) {
              <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
            }
            Sačuvaj
          </button>
        </div>
      </form>

      @if (g.list) {
        <section class="lista-kartica bk-gd-varijante" aria-labelledby="bk-gd-naslov-varijanti" [attr.aria-busy]="varijante() === null && !greskaVarijanti()">
          <header class="bk-gd-zaglavlje">
            <h2 id="bk-gd-naslov-varijanti" class="bk-gd-podnaslov">Varijante</h2>
            @if (opisVarijanti(); as o) {
              <span class="bk-gd-brojac">{{ o }}</span>
            }
            @if (g.tezina !== null) {
              <a matButton="filled" routerLink="/banka/varijante/nova" [queryParams]="{ grupa: g.id }" data-nova-varijanta>
                <mat-icon svgIcon="add" aria-hidden="true" />Nova varijanta
              </a>
            } @else {
              <button matButton="filled" type="button" disabled disabledInteractive matTooltip="Prvo zadaj težinu grupe" data-nova-varijanta>
                <mat-icon svgIcon="add" aria-hidden="true" />Nova varijanta
              </button>
            }
          </header>
          @if (greskaVarijanti(); as m) {
            <app-error-panel naslov="Varijante grupe nisu učitane." [poruka]="m" (ponovo)="osveziVarijante()" />
          } @else if (varijante(); as lista) {
            @if (lista.length === 0) {
              <app-empty-state naslov="Grupa još nema varijanti" ikona="quiz"
                tekst="Varijanta je jedan zadatak u LaTeX-u sa tačnim odgovorom za svako polje šeme." />
            } @else {
              <ul class="bk-gd-mreza" aria-label="Varijante grupe">
                @for (v of lista; track v.id) {
                  <li>
                    <app-varijanta-kartica [varijanta]="v" [zauzeto]="zauzeto()" (odobri)="promeniStatus(v, 'odobri')"
                      (arhiviraj)="promeniStatus(v, 'arhiviraj')" (vratiUNacrt)="promeniStatus(v, 'vratiUNacrt')"
                      (dupliraj)="dupliraj(v)" (obrisi)="obrisi(v)" (nivoPromena)="promeniNivo(v, $event)" />
                  </li>
                }
              </ul>
            }
          } @else {
            <app-skeleton-rows [redovi]="3" />
          }
        </section>
      }
    } @else {
      <app-page-header naslov="Grupa zadataka" />
      <app-skeleton-rows [redovi]="6" />
    }
  `,
})
export class GrupaDetaljPage implements NemaNesacuvanih {
  private readonly api = inject(BankaApi);
  private readonly obavestenja = inject(NotificationStore);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly poljaEditor = viewChild(PoljaEditorComponent);

  /** Id iz putanje (`withComponentInputBinding`; matcher rute propušta samo ceo pozitivan broj). */
  readonly id = input<string>();
  protected readonly grupaId = computed(() => (JE_ID.test(this.id() ?? '') ? Number(this.id()) : null));

  protected readonly tezine = TEZINE;
  protected readonly maxNaziv = MAX_NAZIV_GRUPE;
  protected readonly maxOpis = MAX_OPIS_GRUPE;
  protected readonly maxUputstvo = MAX_UPUTSTVO_GRUPE;

  /** Poslednje stanje grupe sa servera (GET, posle čuvanja odgovor `PUT`-a): osnova za izmene, "Odbaci" i upozorenja. */
  protected readonly osnova = signal<GrupaDetails | null>(null);
  protected readonly greskaUcitavanja = signal<GreskaUcitavanja | null>(null);
  /** Varijante grupe (lista); `null` dok prvo učitavanje traje. Osvežavanje zadržava staru listu do odgovora. */
  protected readonly varijante = signal<VarijantaInfo[] | null>(null);
  protected readonly greskaVarijanti = signal<string | null>(null);
  /** Šema u formi (kontrolisani `app-polja-editor`). */
  protected readonly polja = signal<Polje[]>([]);
  protected readonly cuva = signal(false);
  /** Razlog neuspelog čuvanja, u traci iznad forme. */
  protected readonly greska = signal<string | null>(null);
  /** Uključivanje teme je u toku (dvostruka potvrda ne šalje dva `DELETE`-a). */
  protected readonly ukljucuje = signal(false);
  /** Dupliranja i brisanja varijanti u letu: dok nije 0, ta dugmad čekaju (ponovljen zahtev pravi duplikat ili 404). */
  private readonly zauzetih = signal(0);
  /** Promene nivoa u letu: zahtevi idu redom (važi poslednji klik), a prikaz se vraća na potvrđeni nivo ({@link PromeneNivoa}). */
  private readonly nivoi = new PromeneNivoa();
  private readonly nivoRed = new Subject<{ id: number; nivo: number }>();
  protected readonly zauzeto = computed(() => this.zauzetih() > 0);

  protected readonly forma = new FormGroup({
    naziv: new FormControl('', { nonNullable: true, validators: [Validators.required, neprazan, Validators.maxLength(MAX_NAZIV_GRUPE)] }),
    tezina: new FormControl<number | null>(null),
    opis: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_OPIS_GRUPE)] }),
    uputstvo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_UPUTSTVO_GRUPE)] }),
  });
  /**
   * Svaki događaj forme (vrednost, ispravnost, dodir) kao signal: forma nije signal, a OnPush šablon i `computed` treba da vide
   * promenu. Događaj je uvek nov objekat, pa se ne gubi ni izmena posle koje je status isti kao pre.
   */
  private readonly promenaForme = toSignal(this.forma.events, { initialValue: null });
  private readonly vrednost = computed(() => {
    this.promenaForme();
    return this.forma.getRawValue();
  });

  /** Brojači za zaključavanje tipa, obaveznu težinu i upozorenja: iz liste varijanti čim stigne (prati radnje nad karticama). */
  protected readonly brojaci = computed<BrojaciSeme>(() => {
    const lista = this.varijante();
    const g = this.osnova();
    return lista
      ? { brojVarijanti: lista.length, brojAktivnih: lista.filter(v => v.status === 'AKTIVNA').length }
      : { brojVarijanti: g?.brojVarijanti ?? 0, brojAktivnih: g?.brojAktivnih ?? 0 };
  });
  protected readonly semaIzmenjena = computed(() => {
    const g = this.osnova();
    return !!g?.list && !istaPolja(this.polja(), g.polja);
  });
  protected readonly izmenjeno = computed(() => {
    const g = this.osnova();
    if (!g) {
      return false;
    }
    const v = this.vrednost();
    return v.naziv.trim() !== g.naziv || prazanUNull(v.opis) !== g.opis
      || (g.list && (v.tezina !== g.tezina || prazanUNull(v.uputstvo) !== g.uputstvo || this.semaIzmenjena()));
  });
  private readonly ispravno = computed(() => {
    this.promenaForme();
    return this.forma.valid && (!this.osnova()?.list || proveriPolja(this.polja()) === null);
  });
  protected readonly mozeSacuvati = computed(() => this.izmenjeno() && this.ispravno() && !this.cuva());
  protected readonly posledice = computed(() => {
    const g = this.osnova();
    return g?.list ? posledicePromene(g.polja, this.polja(), this.brojaci()) : [];
  });
  protected readonly opisVarijanti = computed(() => {
    const lista = this.varijante();
    if (!lista?.length) {
      return null;
    }
    const aktivnih = lista.filter(v => v.status === 'AKTIVNA').length;
    return [sRecju(lista.length, 'varijanta', 'varijante', 'varijanti'), aktivnih ? sRecju(aktivnih, 'aktivna', 'aktivne', 'aktivnih') : null]
      .filter(Boolean).join(', ');
  });

  private readonly zahtevGrupe = new Subject<number>();
  private readonly zahtevVarijanti = new Subject<number>();
  /** Obrisana kartica: njen indeks, za fokus na karticu koja dođe na njeno mesto. */
  private nestajeKartica: { id: number; indeks: number } | null = null;

  constructor() {
    this.nivoRed
      .pipe(
        concatMap(({ id, nivo }) => this.api.promeniNivo(id, nivo, TIHO).pipe(
          tap(v => this.nivoi.potvrdi(id, v.nivo)),
          catchError((e: unknown) => {
            this.obavestenja.greska(razlogBanke(e, UPIS));
            return EMPTY;
          }),
          finalize(() => {
            const prikaz = this.nivoi.zavrsi(id);
            if (prikaz !== null) {
              this.postaviNivo(id, prikaz);
            }
          }),
        )),
      )
      .subscribe(); // bez `takeUntilDestroyed`: izbor nivoa ne sme da se izgubi ako korisnik odmah napusti stranicu

    this.zahtevGrupe
      .pipe(
        switchMap(id => this.api.grupa(id, TIHO).pipe(
          map(g => ({ g, greska: null })),
          catchError((e: unknown) => of({ g: null, greska: { nePostoji: e instanceof HttpErrorResponse && e.status === 404, poruka: razlogBanke(e) } })),
        )),
        takeUntilDestroyed(),
      )
      .subscribe(({ g, greska }) => {
        if (!g) {
          this.greskaUcitavanja.set(greska);
          return;
        }
        this.postaviOsnovu(g);
        this.postaviFormu(g);
        if (g.list) {
          this.osveziVarijante();
        }
      });

    this.zahtevVarijanti
      .pipe(
        switchMap(id => this.api.varijante(id, undefined, TIHO).pipe(
          map(lista => ({ id, lista, greska: null })),
          catchError((e: unknown) => of({ id, lista: null, greska: razlogBanke(e) })),
        )),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, lista, greska }) => {
        if (id === this.osnova()?.id) {
          this.varijante.set(lista ?? this.varijante());
          this.greskaVarijanti.set(greska);
        }
      });

    effect(() => {
      const id = this.grupaId();
      untracked(() => this.ucitaj(id));
    });

    // težina je obavezna listu sa varijantama (server: 400)
    effect(() => {
      const obavezna = !!this.osnova()?.list && this.brojaci().brojVarijanti > 0;
      untracked(() => {
        const c = this.forma.controls.tezina;
        if (c.hasValidator(Validators.required) !== obavezna) {
          c.setValidators(obavezna ? Validators.required : null);
          c.updateValueAndValidity();
        }
      });
    });

    // obrisana kartica: fokus na karticu na njenom mestu (ili "Nova varijanta"), ali samo ako je fokus nestao
    effect(() => {
      const lista = this.varijante();
      untracked(() => {
        const k = this.nestajeKartica;
        if (!k || !lista || lista.some(v => v.id === k.id)) {
          return;
        }
        this.nestajeKartica = null;
        afterNextRender(() => {
          const aktivni = this.document.activeElement;
          if (!aktivni || aktivni === this.document.body) {
            const veze = this.host.nativeElement.querySelectorAll<HTMLElement>('app-varijanta-kartica .bk-kartica-veza');
            (veze[Math.min(k.indeks, veze.length - 1)] ?? this.host.nativeElement.querySelector<HTMLElement>('[data-nova-varijanta]'))?.focus();
          }
        }, { injector: this.injector });
      });
    });
  }

  /** Za `unsavedChangesGuard` (`canDeactivate`) i `beforeunload`. */
  imaNesacuvanihIzmena(): boolean {
    return this.izmenjeno();
  }

  /** Zatvaranje kartice ili osvežavanje sa nesačuvanim izmenama: pregledač pita "Napustiti sajt?". */
  protected preIzlaska(e: BeforeUnloadEvent): void {
    if (this.imaNesacuvanihIzmena()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  /** Grupa iznova (nov id iz putanje, "Pokušaj ponovo"): sve staro se briše odmah, pa se nikad ne vidi tuđe. */
  protected ucitaj(id: number | null): void {
    this.osnova.set(null);
    this.greskaUcitavanja.set(null);
    this.varijante.set(null);
    this.greskaVarijanti.set(null);
    this.greska.set(null);
    if (id !== null) {
      this.zahtevGrupe.next(id);
    }
  }

  protected osveziVarijante(): void {
    const g = this.osnova();
    if (g?.list) {
      this.zahtevVarijanti.next(g.id);
    }
  }

  /**
   * Pokušaj čuvanja (klik ili fokus na "Sačuvaj", i kad je onemogućeno): sve greške forme i šeme postaju vidljive, i one iz
   * polja koja korisnik još nije napustio, da se vidi zašto se ne čuva.
   */
  protected otkrijGreske(): void {
    this.forma.markAllAsTouched();
    this.poljaEditor()?.otkrijGreske();
  }

  protected poruka(ime: 'naziv' | 'opis' | 'uputstvo', labela: string): string | null {
    this.promenaForme();
    const c = this.forma.controls[ime];
    return c.touched || c.dirty ? porukaValidacije(c.errors, labela) : null;
  }

  protected odbaci(): void {
    const g = this.osnova();
    if (g && this.izmenjeno() && !this.cuva()) {
      this.postaviFormu(g);
      this.greska.set(null);
    }
  }

  /**
   * `PUT banka/grupe/{id}`: naziv i opis uvek, težina i uputstvo lista (unutrašnji čvor šalje sačuvane), `polja` cela
   * normalizovana lista samo kad se šema promenila. Posle uspeha odgovor je nova osnova; forma prima njegove vrednosti samo
   * ako je ostala kakva je poslata (kucanje za vreme čuvanja ostaje), a varijante se učitavaju ponovo.
   */
  protected sacuvaj(): void {
    const g = this.osnova();
    if (!g || !this.mozeSacuvati()) {
      this.otkrijGreske();
      return;
    }
    const v = this.forma.getRawValue();
    const polja = this.polja();
    const cmd: GrupaCmd = {
      naziv: v.naziv.trim(),
      opis: prazanUNull(v.opis),
      tezina: g.list ? v.tezina : g.tezina,
      uputstvo: g.list ? prazanUNull(v.uputstvo) : g.uputstvo,
      polja: this.semaIzmenjena() ? normalizujPolja(polja) : null,
    };
    this.cuva.set(true);
    this.greska.set(null);
    this.api
      .izmeniGrupu(g.id, cmd, TIHO)
      .pipe(finalize(() => this.cuva.set(false)))
      .subscribe({
        next: nova => {
          this.obavestenja.uspeh('Grupa je sačuvana.');
          // stranica je u međuvremenu prešla na drugu grupu (ista komponenta, nov id): njeno stanje se ne dira
          if (this.osnova()?.id !== nova.id) {
            return;
          }
          const isto = JSON.stringify(this.forma.getRawValue()) === JSON.stringify(v) && this.polja() === polja;
          this.postaviOsnovu(nova);
          if (isto) {
            this.postaviFormu(nova);
          }
          this.osveziVarijante();
        },
        error: (e: unknown) => {
          if (this.osnova()?.id === g.id) {
            this.greska.set(razlogBanke(e, UPIS));
          } else {
            this.obavestenja.greska(`Grupa „${cmd.naziv}“ nije sačuvana: ${razlogBanke(e, UPIS)}`);
          }
        },
      });
  }

  /**
   * "Uključi" isključenu grupu: prvo teme predmeta (`GET predmeti/{id}/iskljucene-teme`), da se vidi čija je tema `iskljucenjeId`;
   * kad je pretkova, potvrda imenuje pretka i kaže da se uključuje celo njegovo podstablo. Posle potvrde `DELETE` te teme, pa
   * grupa iznova; iz odgovora se preuzima samo isključenje. Kad oznaka nestane (sa dugmetom koje je imalo fokus), fokus ide na
   * naziv grupe. Dok se teme čitaju, dugme čeka (`ukljucuje`); neuspelo čitanje je poruka greške, bez potvrde.
   */
  protected ukljuciTemu(): void {
    const g = this.osnova();
    const temaId = g?.iskljucenjeId ?? null;
    if (!g || temaId === null || this.ukljucuje()) {
      return;
    }
    this.ukljucuje.set(true);
    this.api
      .iskljuceneTeme(g.predmetId, TIHO)
      .pipe(
        map(teme => pretakIskljucenja(g, teme.find(t => t.id === temaId))),
        catchError((e: unknown) => {
          this.obavestenja.greska(razlogBanke(e));
          return EMPTY;
        }),
        finalize(() => this.ukljucuje.set(false)),
        // stranica zatvorena dok se teme čitaju: bez potvrde na drugoj stranici
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(pretak => {
        if (this.osnova()?.id === g.id) {
          this.potvrdiIUkljuci(g, temaId, pretak);
        }
      });
  }

  private potvrdiIUkljuci(g: GrupaDetails, temaId: number, pretak: string | null): void {
    potvrdiUkljucivanje(this.dialog, pretak)
      .pipe(
        filter(ok => ok && !this.ukljucuje()),
        switchMap(() => {
          this.ukljucuje.set(true);
          return this.api.ukljuciTemu(temaId, TIHO).pipe(
            tap(() => this.obavestenja.uspeh('Tema je ponovo uključena; Klod je opet može nuditi.')),
            catchError((e: unknown) => {
              this.obavestenja.greska(razlogBanke(e, UPIS));
              return EMPTY;
            }),
            switchMap(() => this.api.grupa(g.id, TIHO).pipe(catchError((e: unknown) => {
              this.obavestenja.greska(razlogBanke(e));
              return EMPTY;
            }))),
            finalize(() => this.ukljucuje.set(false)),
          );
        }),
      )
      .subscribe(nova => {
        if (this.osnova()?.id !== nova.id) {
          return; // stranica je u međuvremenu prešla na drugu grupu
        }
        this.osnova.update(o => o && { ...o, iskljucena: nova.iskljucena, iskljucenjeId: nova.iskljucenjeId });
        afterNextRender(() => {
          const aktivni = this.document.activeElement;
          if (!aktivni || aktivni === this.document.body) {
            this.host.nativeElement.querySelector<HTMLElement>('input[data-naziv]')?.focus();
          }
        }, { injector: this.injector });
      });
  }

  protected promeniStatus(v: VarijantaInfo, radnja: RadnjaStatusa): void {
    this.radnja(this.api[radnja](v.id, TIHO));
  }

  /**
   * Nivo varijante (`PATCH`): kartica odmah pokazuje novi, a kad zahtev padne vraća se poslednji potvrđeni i javlja razlog. Lista se
   * ne učitava iznova (nivo ne menja ni status ni brojače), pa fokus ostaje na izabranom nivou.
   */
  protected promeniNivo(v: VarijantaInfo, nivo: number): void {
    const trenutni = this.varijante()?.find(x => x.id === v.id);
    if (!trenutni || trenutni.nivo === nivo) {
      return;
    }
    this.nivoi.pocni(v.id, trenutni.nivo);
    this.postaviNivo(v.id, nivo);
    this.nivoRed.next({ id: v.id, nivo });
  }

  private postaviNivo(id: number, nivo: number): void {
    this.varijante.update(l => l && l.map(x => (x.id === id ? { ...x, nivo } : x)));
  }

  protected dupliraj(v: VarijantaInfo): void {
    if (!this.zauzeto()) {
      this.radnja(this.api.dupliraj(v.id, TIHO), true);
    }
  }

  protected obrisi(v: VarijantaInfo): void {
    if (this.zauzeto()) {
      return;
    }
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati varijantu „${imeVarijante(v)}“?`,
      tekst: ['Varijanta i njen render se brišu trajno.', 'Varijanta korišćena na času se ne briše; nju arhiviraj.'],
      potvrdi: 'Obriši varijantu',
      destruktivno: true,
    })
      // dijalog vraća fokus na stavku menija, koje više nema: fokus na dugme menija kartice (posle brisanja ga efekat prebacuje dalje)
      .pipe(tap(() => this.vratiFokus(v.id)), filter(Boolean))
      .subscribe(() => {
        this.nestajeKartica = { id: v.id, indeks: (this.varijante() ?? []).findIndex(x => x.id === v.id) };
        this.radnja(this.api.obrisiVarijantu(v.id, TIHO), true);
      });
  }

  /** Radnja nad varijantom: posle uspeha varijante iznova, greška u `NotificationStore`; `zauzima` = neidempotentna. */
  private radnja(poziv: Observable<unknown>, zauzima = false): void {
    if (zauzima) {
      this.zauzetih.update(n => n + 1);
    }
    poziv
      .pipe(finalize(() => {
        if (zauzima) {
          this.zauzetih.update(n => n - 1);
        }
      }))
      .subscribe({ next: () => this.osveziVarijante(), error: (e: unknown) => this.obavestenja.greska(razlogBanke(e, UPIS)) });
  }

  /** Fokus je pao na body posle dijaloga iz menija kartice: na dugme menija te kartice. */
  private vratiFokus(varijantaId: number): void {
    const aktivni = this.document.activeElement;
    if (!aktivni || aktivni === this.document.body) {
      this.host.nativeElement.querySelector<HTMLElement>(`app-varijanta-kartica[data-varijanta="${varijantaId}"] [data-meni]`)?.focus();
    }
  }

  private postaviOsnovu(g: GrupaDetails): void {
    this.osnova.set(g);
    this.mrvice.postavi(g.naziv);
  }

  private postaviFormu(g: GrupaDetails): void {
    this.forma.reset({ naziv: g.naziv, tezina: g.tezina, opis: g.opis ?? '', uputstvo: g.uputstvo ?? '' });
    this.polja.set(g.polja);
  }
}
