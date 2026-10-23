import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { catchError, concatMap, EMPTY, finalize, map, Observable, of, Subject, switchMap, tap } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { NivoComponent } from '../../../shared/ui/nivo.component';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { BankaApi } from '../data-access/banka.api';
import {
  GrupaDetails, OdgovorPolja, PODRAZUMEVANI_NIVO, Polje, PrilogCmd, RenderDeo, RenderProbaCmd, VarijantaCmd, VarijantaDetails,
} from '../data-access/banka.models';
import { razlogBanke, TIHO, UPIS } from '../data-access/greske';
import { odgovorPopunjen, prazanOdgovor } from '../data-access/polja';
import { PromeneNivoa } from '../data-access/promene-nivoa';
import { PorukaPosleCuvanja } from '../data-access/poruka-posle-cuvanja';
import {
  PRAZAN_PREGLED, panelResenja, panelZadatka, pregledUzivo, SacuvanRender, SadrzajPregleda, vazecaGreska,
} from '../data-access/render-proba';
import { LatexEditorComponent } from '../ui/latex-editor.component';
import { OdgovoriFormaComponent } from '../ui/odgovori-forma.component';
import { greskePriloga, PriloziComponent } from '../ui/prilozi.component';
import { SvgPregledComponent } from '../ui/svg-pregled.component';
import { imeVarijante, prikazStatusa } from '../ui/varijanta-kartica.component';

/** Granice varijante kao na serveru (`BankaPP.proveriVarijantu`). */
export const MAX_NAZIV_VARIJANTE = 120;
export const MAX_TEKST_VARIJANTE = 20_000;
/** Id poruke greške u pregledu dela; editor tog dela ga stavlja u `aria-describedby`. */
const ID_GRESKE: Record<RenderDeo, string> = { tekst: 'bk-ve-greska-tekst', resenje: 'bk-ve-greska-resenje' };
/** Indeks kartice (`mat-tab-group`) po delu. */
const KARTICA: Record<RenderDeo, number> = { tekst: 0, resenje: 1 };
/** Pregled nacrta (`/banka/pregled`, sa upitom ili bez): jedino odredište `?povratak` posle čuvanja. */
const PREGLED_NACRTA = /^\/banka\/pregled(?:\?[^\\#]*)?$/;

/**
 * `?povratak` iz pregleda nacrta ("Uredi" šalje URL pregleda sa `od=<id>`) ako je baš putanja pregleda, inače `null` (tada se
 * posle čuvanja ide u banku kao i bez njega): spoljni URL, druga stranica aplikacije ili putanja sa `..` se ne poštuju.
 */
export function povratakNaPregled(url: string | undefined): string | null {
  return url !== undefined && PREGLED_NACRTA.test(url) ? url : null;
}

/** Sadržaj forme kako ide u `VarijantaCmd` (naziv bez razmaka na krajevima, prazno rešenje `null`, odgovori po šemi). */
interface Sadrzaj {
  naziv: string | null;
  tekst: string;
  resenje: string | null;
  odgovori: Record<string, OdgovorPolja>;
  prilozi: PrilogCmd[];
}

interface GreskaUcitavanja {
  nePostoji: boolean;
  poruka: string;
}

/** Zahtev učitavanja: varijanta (izmena) ili grupa iz `?grupa` (nova). */
type Zahtev = { varijantaId: number } | { grupaId: number };
type Ucitano = { g: GrupaDetails; v: VarijantaDetails | null; greska: null } | { g: null; v: null; greska: GreskaUcitavanja };
type Zauzeto = 'cuva' | 'renderuje';

/** Kao `prazanUNull` u `VarijantaService`: prazno (i od samih razmaka) je `null`, ostalo ostaje kako je (linije se ne pomeraju). */
function prazanUNull(s: string): string | null {
  return s.trim() === '' ? null : s;
}

/** Odgovor svakog polja šeme (prazan kad ga nema), sa svim svojstvima istim redom: oblik za komandu i za poređenje. */
function poSemi(polja: readonly Polje[], odgovori: Readonly<Record<string, OdgovorPolja>>): Record<string, OdgovorPolja> {
  return Object.fromEntries(polja.map(p => {
    const o = odgovori[p.kljuc] ?? prazanOdgovor(p);
    return [p.kljuc, { broj: o.broj ?? null, prihvatljivi: o.prihvatljivi ?? null, tacna: o.tacna ?? null, tacne: o.tacne ?? null }];
  }));
}

/** Prilozi bez obzira na redosled (server ih vodi po imenu). */
const kljucPriloga = (prilozi: readonly PrilogCmd[]) =>
  JSON.stringify(prilozi.map(p => [p.ime, p.medijId]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));

function sadrzajVarijante(v: VarijantaDetails | null, polja: readonly Polje[]): Sadrzaj {
  return {
    naziv: v?.naziv ?? null,
    tekst: v?.tekst ?? '',
    resenje: v?.resenje ?? null,
    odgovori: poSemi(polja, v?.odgovori ?? {}),
    prilozi: (v?.prilozi ?? []).map(p => ({ ime: p.ime, medijId: p.medij.id })),
  };
}

/** "rešenje, linija 2: Undefined control sequence \foo" za poruke o neuspelom renderu sačuvane varijante. */
function opisGreske(v: VarijantaDetails): string {
  const g = v.renderGreska;
  if (!g) {
    return 'render još nije gotov';
  }
  const deo = v.renderDeo === 'resenje' ? 'rešenje, ' : v.renderDeo === 'tekst' ? 'tekst, ' : '';
  return g.linija === null ? `${deo}${g.poruka}` : `${deo}linija ${g.linija}: ${g.poruka}`;
}

/** Ishod uspelog `POST`/`PUT` (i, uz "Sačuvaj i odobri", `odobri`). */
interface IshodCuvanja {
  varijanta: VarijantaDetails;
  odobrena: boolean;
  /** Razlog odbijenog odobravanja (posle uspelog čuvanja). */
  greskaOdobravanja: string | null;
}

/**
 * Poruka posle uspelog čuvanja i da li je sve uspelo (`uspeh`: render OK i, uz odobravanje, odobrena; tada nazad u banku),
 * inače korisnik ostaje na varijanti. `aktivnaPre`: server aktivnu varijantu sa neuspelim renderom vraća u nacrt.
 */
function porukaCuvanja(i: IshodCuvanja, odobri: boolean, aktivnaPre: boolean, promenjena: boolean): { uspeh: boolean; poruka: string } {
  const v = i.varijanta;
  const kaoNacrt = v.status === 'NACRT' ? ' kao nacrt' : '';
  if (v.renderStatus !== 'OK') {
    if (aktivnaPre && v.status === 'NACRT') {
      return { uspeh: false, poruka: `Izmene su sačuvane. Render nije uspeo, varijanta je vraćena u nacrt (${opisGreske(v)}).` };
    }
    const razlogRendera = `render nije uspeo (${opisGreske(v)})`;
    return {
      uspeh: false,
      poruka: odobri ? `Varijanta je sačuvana${kaoNacrt}, ali nije odobrena: ${razlogRendera}.` : `Varijanta je sačuvana${kaoNacrt}, ali ${razlogRendera}.`,
    };
  }
  if (odobri && !i.odobrena) {
    return { uspeh: false, poruka: `Varijanta je sačuvana${kaoNacrt}, ali nije odobrena: ${i.greskaOdobravanja ?? 'pokušaj ponovo.'}` };
  }
  if (i.odobrena) {
    return { uspeh: true, poruka: promenjena ? 'Varijanta je sačuvana i odobrena.' : 'Varijanta je odobrena.' };
  }
  return { uspeh: true, poruka: kaoNacrt ? 'Varijanta je sačuvana kao nacrt.' : 'Varijanta je sačuvana.' };
}

/**
 * Editor varijante banke (`/banka/varijante/nova?grupa=` i `/banka/varijante/:id`). Tri kolone na širokom ekranu: LaTeX
 * (kartice Tekst i Rešenje, svaka sa svojim `app-latex-editor`), živi pregled (`pregledUzivo` nad `render-proba`, zadatak i
 * rešenje jedno ispod drugog) i tačni odgovori po šemi grupe sa prilozima. Grupa (`BankaApi.grupa`) daje predmet za
 * render-probu, šemu polja, putanju i težinu; nova varijanta u grupi bez težine se ne može sačuvati (server: 409), pa to
 * stranica kaže odmah, sa vezom na grupu.
 *
 * Čuvanje (`POST`/`PUT`, renderuje sinhrono, do minut) drži formu onemogućenom uz traku napretka; dok se prilog otprema, ne
 * čuva se. "Sačuvaj i odobri" posle uspelog rendera zove `odobri`. Svako čuvanje čiji render nije uspeo (ili odobravanje
 * odbijeno) ostavlja korisnika na varijanti, sa porukom u traci i istaknutom linijom u kartici dela sa greškom
 * (`renderGreska` + `renderDeo`); nova varijanta tada prelazi na svoj editor (bez novog unosa u istoriji), a poruku mu
 * jednokratno predaje `PorukaPosleCuvanja` (samo u memoriji, ne u istoriji pregledača). Samo uspeo render vodi nazad na `/banka` sa grupom
 * (ili, kad je editor otvoren iz pregleda nacrta, na `?povratak`, vidi `povratakNaPregled`). Klodova varijanta ima u zaglavlju
 * oznaku "Claude" uz status. Greška sačuvanog rendera važi dok je ulaz rendera
 * (tekst, rešenje, prilozi) isti kao sačuvani; živi pregled ima prednost čim stigne. Dok je taj ulaz isti kao sačuvani,
 * pregled je sačuvan render (SVG-ovi varijante, bez render-probe); proba kreće tek posle prve izmene ili na Ctrl+Enter.
 * Izmenjeno = drugačije od poslednjeg stanja sa servera; napuštanje tada pita (ruter kroz `unsavedChangesGuard`, zatvaranje
 * kartice i osvežavanje kroz `beforeunload`).
 */
@Component({
  selector: 'app-varijanta-editor-page',
  imports: [
    EmptyState, ErrorPanel, FormErrorBanner, LatexEditorComponent, MatButton, MatFormField, MatHint, MatIcon, MatInput, MatLabel,
    MatProgressBar, MatTab, MatTabGroup, MatTabLabel, NivoComponent, OdgovoriFormaComponent, PageHeader, PriloziComponent, ReactiveFormsModule,
    RouterLink, SkeletonRows, StatusChip, SvgPregledComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'preIzlaska($event)' },
  styleUrl: './varijanta-editor.page.css',
  template: `
    @if (greskaUcitavanja(); as gr) {
      <app-page-header [naslov]="jeNova() ? 'Nova varijanta' : 'Varijanta'" />
      @if (gr.nePostoji) {
        <app-empty-state [naslov]="jeNova() ? 'Grupa nije pronađena' : 'Varijanta nije pronađena'" ikona="quiz"
          tekst="Možda je obrisana; ostale grupe i varijante su u banci zadataka.">
          <a matButton="outlined" routerLink="/banka"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Banka zadataka</a>
        </app-empty-state>
      } @else {
        <app-error-panel [naslov]="jeNova() ? 'Grupa nije učitana.' : 'Varijanta nije učitana.'" [poruka]="gr.poruka" (ponovo)="ucitaj()" />
      }
    } @else if (bezGrupe()) {
      <app-page-header naslov="Nova varijanta" />
      <app-empty-state naslov="Izaberi grupu" ikona="quiz" tekst="Nova varijanta se pravi iz grupe zadataka: u banci izaberi grupu, pa „Nova varijanta“.">
        <a matButton="outlined" routerLink="/banka"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Banka zadataka</a>
      </app-empty-state>
    } @else if (detaljiGrupe(); as g) {
      @let v = osnova();
      <app-page-header [naslov]="v ? imeVarijante(v) : 'Nova varijanta'">
        <div kontekst class="bk-ve-kontekst">
          <nav aria-label="Putanja grupe" data-putanja>
            <ol class="bk-ve-putanja">
              @for (p of g.putanja; track p.id) {
                <li><a class="bk-ve-veza" routerLink="/banka" [queryParams]="{ predmet: g.predmetId, namena: g.namena, grupa: p.id }">{{ p.naziv }}</a></li>
              }
            </ol>
          </nav>
          <gfs-nivo [nivo]="nivo()" izbor [onemoguceno]="zauzeto() !== null" (promena)="promeniNivo($event)" data-nivo-varijante />
          @if (v) {
            @let s = prikazStatusa(v.status);
            <app-status-chip [tekst]="s.tekst" [ton]="s.ton" [ikona]="s.ikona" />
            @if (v.izvor === 'CLAUDE') {
              <span class="oznaka" title="Varijantu je napravio Claude" data-izvor>Claude</span>
            }
          }
        </div>
        <div akcije class="bk-ve-akcije">
          <button matButton type="button" disabledInteractive [disabled]="!izmenjeno() || zauzeto() !== null || otpremaPriloga()"
            (click)="odbaci()" data-odbaci>Odbaci izmene</button>
          @if (v) {
            <button matButton="outlined" type="button" disabledInteractive [disabled]="!mozeRenderovati()" (click)="renderujPonovo()" data-renderuj>
              <mat-icon svgIcon="refresh" aria-hidden="true" />Renderuj ponovo
            </button>
          }
          @if (v && v.status !== 'NACRT') {
            <button matButton="filled" type="button" disabledInteractive [disabled]="!mozeNacrt()" (click)="sacuvaj(false)" data-sacuvaj>Sačuvaj</button>
          } @else {
            <button matButton="outlined" type="button" disabledInteractive [disabled]="!mozeNacrt()" (click)="sacuvaj(false)" data-sacuvaj>
              Sačuvaj kao nacrt
            </button>
          }
          @if (v?.status !== 'AKTIVNA') {
            <button matButton="filled" type="button" disabledInteractive [disabled]="!mozeOdobriti()" (click)="sacuvaj(true)" data-sacuvaj-odobri>
              <mat-icon svgIcon="task_alt" aria-hidden="true" />Sačuvaj i odobri
            </button>
          }
        </div>
      </app-page-header>

      <app-form-error-banner [poruka]="greska()" />
      @if (bezTezine()) {
        <p class="bk-ve-upozorenje" data-bez-tezine>
          <mat-icon svgIcon="info" aria-hidden="true" />
          <span>Grupa „{{ g.naziv }}“ nema težinu, pa još ne prima varijante.
            <a class="bk-ve-veza" [routerLink]="['/banka/grupe', g.id]">Zadaj težinu grupe</a>, pa se vrati ovde.</span>
        </p>
      }
      @if (zauzeto(); as z) {
        <mat-progress-bar class="bk-ve-napredak" mode="indeterminate" [attr.aria-label]="z === 'cuva' ? 'Čuvanje varijante' : 'Renderovanje varijante'" />
      }
      <!-- živa oblast je uvek u DOM-u (menja se samo tekst), da bi čitač ekrana najavio početak čuvanja -->
      <p class="bk-ve-status" role="status" data-status>{{ tekstZauzeca() }}</p>
      @if (zauzeto() === null && nedostaje().length > 0) {
        <p class="bk-ve-nedostaje" data-nedostaje>Za čuvanje nedostaje: {{ nedostaje().join(', ') }}.</p>
      }

      <div class="bk-ve-mreza" [attr.aria-busy]="zauzeto() !== null">
        <section class="lista-kartica bk-ve-kolona" aria-labelledby="bk-ve-naslov-izvora">
          <h2 id="bk-ve-naslov-izvora" class="bk-ve-podnaslov">LaTeX</h2>
          <mat-form-field appearance="outline" class="bk-ve-naziv">
            <mat-label>Naziv (opciono)</mat-label>
            <input matInput [formControl]="forma.controls.naziv" [maxlength]="maxNaziv" autocomplete="off" data-naziv />
            <mat-hint>Samo za tebe, u banci; bez naziva je „Zadatak {{ v?.rb ?? 'N' }}“</mat-hint>
          </mat-form-field>
          <mat-tab-group class="bk-ve-kartice" mat-stretch-tabs="false" preserveContent [selectedIndex]="kartica()"
            (selectedIndexChange)="kartica.set($event)">
            <mat-tab>
              <ng-template mat-tab-label>Tekst@if (panelZ().stanje === 'greska') {<span class="bk-ve-greska-kartice">&nbsp;· greška</span>}</ng-template>
              <app-latex-editor #edTekst data-deo="tekst" oznaka="LaTeX zadatka" [formControl]="forma.controls.tekst"
                [greskaLinija]="linijaGreske().tekst" [opisId]="opisGreske().tekst" (pregled)="odmah.next()" />
            </mat-tab>
            <mat-tab>
              <ng-template mat-tab-label>Rešenje@if (panelR().stanje === 'greska') {<span class="bk-ve-greska-kartice">&nbsp;· greška</span>}</ng-template>
              <app-latex-editor #edResenje data-deo="resenje" oznaka="LaTeX rešenja (opciono)" [formControl]="forma.controls.resenje"
                [greskaLinija]="linijaGreske().resenje" [opisId]="opisGreske().resenje" (pregled)="odmah.next()" />
            </mat-tab>
          </mat-tab-group>
        </section>

        <section class="lista-kartica bk-ve-kolona bk-ve-pregledi" aria-labelledby="bk-ve-naslov-pregleda">
          <h2 id="bk-ve-naslov-pregleda" class="bk-ve-podnaslov">Pregled</h2>
          @let pz = panelZ();
          <app-svg-pregled naslov="Zadatak" [svg]="pz.svg" [stanje]="pz.stanje" [greska]="pz.greska" [praznaPoruka]="pz.prazno"
            [greskaId]="idGreske.tekst" />
          @let pr = panelR();
          <app-svg-pregled naslov="Rešenje" [svg]="pr.svg" [stanje]="pr.stanje" [greska]="pr.greska" [praznaPoruka]="pr.prazno"
            [greskaId]="idGreske.resenje" />
        </section>

        <div class="bk-ve-kolona bk-ve-desno">
          <section class="lista-kartica bk-ve-odeljak" aria-labelledby="bk-ve-naslov-odgovora">
            <h2 id="bk-ve-naslov-odgovora" class="bk-ve-podnaslov">Tačni odgovori</h2>
            <app-odgovori-forma [polja]="g.polja" [odgovori]="odgovori()" [onemoguceno]="zauzeto() !== null" (odgovoriPromena)="odgovori.set($event)" />
          </section>
          <section class="lista-kartica bk-ve-odeljak" aria-labelledby="bk-ve-naslov-priloga">
            <h2 id="bk-ve-naslov-priloga" class="bk-ve-podnaslov">Prilozi</h2>
            <app-prilozi [prilozi]="prilozi()" [postojeci]="v?.prilozi ?? []" [onemoguceno]="zauzeto() !== null"
              (priloziPromena)="prilozi.set($event)" (ubaci)="ubaci($event)" (otpremaUToku)="otpremaPriloga.set($event)" />
          </section>
        </div>
      </div>
    } @else {
      <app-page-header [naslov]="jeNova() ? 'Nova varijanta' : 'Varijanta'" />
      <app-skeleton-rows [redovi]="6" />
    }
  `,
})
export class VarijantaEditorPage implements NemaNesacuvanih {
  private readonly api = inject(BankaApi);
  private readonly router = inject(Router);
  private readonly obavestenja = inject(NotificationStore);
  private readonly mrvice = inject(BreadcrumbService);

  /** Id iz putanje (izmena) ili `undefined` (nova); matcher rute propušta samo ceo pozitivan broj. */
  readonly id = input<string>();
  /** `?grupa=` nove varijante. */
  readonly grupa = input<string>();
  /** `?povratak=`: URL pregleda nacrta na koji se ide posle uspelog čuvanja (`povratakNaPregled`). */
  readonly povratak = input<string>();

  protected readonly imeVarijante = imeVarijante;
  protected readonly prikazStatusa = prikazStatusa;
  protected readonly idGreske = ID_GRESKE;
  protected readonly maxNaziv = MAX_NAZIV_VARIJANTE;

  protected readonly jeNova = computed(() => this.id() === undefined);
  private readonly zahtev = computed<Zahtev | null>(() => {
    if (!this.jeNova()) {
      return JE_ID.test(this.id() ?? '') ? { varijantaId: Number(this.id()) } : null;
    }
    return JE_ID.test(this.grupa() ?? '') ? { grupaId: Number(this.grupa()) } : null;
  });
  protected readonly bezGrupe = computed(() => this.jeNova() && this.zahtev() === null);

  /** Grupa varijante (predmet za render-probu, šema, putanja, težina). */
  protected readonly detaljiGrupe = signal<GrupaDetails | null>(null);
  /** Poslednje stanje varijante sa servera (`null` za novu dok nije sačuvana): osnova za izmene i grešku rendera. */
  protected readonly osnova = signal<VarijantaDetails | null>(null);
  protected readonly greskaUcitavanja = signal<GreskaUcitavanja | null>(null);
  /** Razlog neuspelog čuvanja ili rendera, u traci ispod zaglavlja. */
  protected readonly greska = signal<string | null>(null);
  protected readonly zauzeto = signal<Zauzeto | null>(null);
  /** Izabrana kartica (0 Tekst, 1 Rešenje). */
  protected readonly kartica = signal(0);
  protected readonly odgovori = signal<Record<string, OdgovorPolja>>({});
  protected readonly prilozi = signal<PrilogCmd[]>([]);
  /** Prilog se otprema: dotle se ne čuva (posle čuvanja forma preuzima priloge iz odgovora, pa bi se novi izgubio). */
  protected readonly otpremaPriloga = signal(false);
  /**
   * Nivo varijante (1-3). Nova varijanta ga šalje u komandi kreiranja (podrazumevano 2); sačuvana ga menja odmah kroz `PATCH`
   * (`promeniNivo`), ne kroz `PUT` ni "Sačuvaj" (nivo nije sadržaj: ne renderuje, ne vraća u nacrt i nije "nesačuvana izmena").
   */
  protected readonly nivo = signal<number>(PODRAZUMEVANI_NIVO);
  /** Promene nivoa sačuvane varijante u letu; zahtevi idu redom i ne otkazuju se odlaskom sa stranice ({@link PromeneNivoa}). */
  private readonly nivoi = new PromeneNivoa();
  private readonly nivoRed = new Subject<{ id: number; nivo: number }>();
  /** Ctrl+Enter u editoru: pregled odmah. */
  protected readonly odmah = new Subject<void>();

  protected readonly forma = new FormGroup({
    naziv: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_NAZIV_VARIJANTE)] }),
    tekst: new FormControl('', { nonNullable: true }),
    resenje: new FormControl('', { nonNullable: true }),
  });
  /** Svaki događaj forme kao signal (forma nije signal, a `computed` i OnPush šablon treba da vide promenu). */
  private readonly promenaForme = toSignal(this.forma.events, { initialValue: null });
  private readonly vrednost = computed(() => {
    this.promenaForme();
    return this.forma.getRawValue();
  });

  private readonly edTekst = viewChild<LatexEditorComponent>('edTekst');
  private readonly edResenje = viewChild<LatexEditorComponent>('edResenje');

  private readonly polja = computed(() => this.detaljiGrupe()?.polja ?? []);
  private readonly sadrzaj = computed<Sadrzaj>(() => {
    const v = this.vrednost();
    return {
      naziv: v.naziv.trim() === '' ? null : v.naziv.trim(),
      tekst: v.tekst,
      resenje: prazanUNull(v.resenje),
      odgovori: poSemi(this.polja(), this.odgovori()),
      prilozi: this.prilozi(),
    };
  });
  private readonly sacuvanSadrzaj = computed(() => sadrzajVarijante(this.osnova(), this.polja()));
  protected readonly izmenjeno = computed(() => {
    const [a, b] = [this.sadrzaj(), this.sacuvanSadrzaj()];
    return a.naziv !== b.naziv || a.tekst !== b.tekst || a.resenje !== b.resenje
      || JSON.stringify(a.odgovori) !== JSON.stringify(b.odgovori) || kljucPriloga(a.prilozi) !== kljucPriloga(b.prilozi);
  });
  /** Ulaz rendera (tekst, rešenje, prilozi) je isti kao sačuvani, pa sačuvana greška rendera važi za njega. */
  private readonly istiUlazRendera = computed(() => {
    const [a, b] = [this.sadrzaj(), this.sacuvanSadrzaj()];
    return a.tekst === b.tekst && a.resenje === b.resenje && kljucPriloga(a.prilozi) === kljucPriloga(b.prilozi);
  });
  private readonly sacuvanaGreska = computed(() => {
    const v = this.osnova();
    return v?.renderGreska && this.istiUlazRendera() ? { greska: v.renderGreska, deo: v.renderDeo } : null;
  });

  /**
   * Sačuvan render koji važi za sadržaj forme (ulaz rendera isti kao sačuvani): uspeo (SVG-ovi sačuvane varijante) ili
   * neuspeo sa greškom u tekstu (prikazuje se sačuvana greška); inače (izmena, render još čeka, greška samo u rešenju, gde
   * proba daje i SVG zadatka) `null`, pa pregled ide kroz render-probu.
   */
  private readonly sacuvanRender = computed<SacuvanRender | null>(() => {
    const v = this.osnova();
    if (!v || !this.istiUlazRendera()) {
      return null;
    }
    if (v.renderStatus === 'OK' && v.svgId) {
      return { svgId: v.svgId, resenjeSvgId: v.resenjeSvgId };
    }
    return v.renderStatus === 'GRESKA' && v.renderGreska && v.renderDeo !== 'resenje' ? 'greska' : null;
  });
  /**
   * Sadržaj za živi pregled: komanda probe (predmet grupe, tekst, rešenje i prilozi ispravnog imena, jer bi server probu sa
   * lošim imenom odbio) i sačuvan render; bez teksta `null`. Otvorena varijanta ne troši probu dok se ne izmeni.
   */
  private readonly sadrzajPregleda = computed<SadrzajPregleda | null>(() => {
    const g = this.detaljiGrupe();
    const s = this.sadrzaj();
    if (!g || s.tekst.trim() === '') {
      return null;
    }
    const greske = greskePriloga(s.prilozi);
    const cmd: RenderProbaCmd = { predmetId: g.predmetId, tekst: s.tekst, resenje: s.resenje, prilozi: s.prilozi.filter((_, i) => greske[i] === null) };
    return { cmd, sacuvan: this.sacuvanRender() };
  });
  protected readonly pregled = toSignal(pregledUzivo(toObservable(this.sadrzajPregleda), this.api, this.odmah), { initialValue: PRAZAN_PREGLED });
  private readonly greskaDela = computed(() => vazecaGreska(this.pregled(), this.sacuvanaGreska()));
  protected readonly panelZ = computed(() => panelZadatka(this.pregled(), this.greskaDela()));
  protected readonly panelR = computed(() => {
    const s = this.sadrzaj();
    return panelResenja(this.pregled(), this.greskaDela(), s.tekst.trim() !== '', s.resenje !== null);
  });
  /** Istaknuta linija i opis greške editora: samo dok pregled tog dela pokazuje grešku (pa id poruke postoji). */
  protected readonly linijaGreske = computed(() => ({
    tekst: this.panelZ().stanje === 'greska' ? (this.panelZ().greska?.linija ?? null) : null,
    resenje: this.panelR().stanje === 'greska' ? (this.panelR().greska?.linija ?? null) : null,
  }));
  protected readonly opisGreske = computed(() => ({
    tekst: this.panelZ().stanje === 'greska' ? ID_GRESKE.tekst : null,
    resenje: this.panelR().stanje === 'greska' ? ID_GRESKE.resenje : null,
  }));

  protected readonly bezTezine = computed(() => this.jeNova() && this.detaljiGrupe()?.tezina === null);
  /** Šta fali da bi server primio varijantu (tekst, potpuni odgovori po šemi, ispravna imena priloga). */
  protected readonly nedostaje = computed(() => {
    const s = this.sadrzaj();
    const razlozi: string[] = [];
    if (s.tekst.trim() === '') {
      razlozi.push('tekst zadatka');
    } else if ([...s.tekst].length > MAX_TEKST_VARIJANTE) {
      razlozi.push('kraći tekst zadatka (najviše 20 000 znakova)');
    }
    if (s.resenje !== null && [...s.resenje].length > MAX_TEKST_VARIJANTE) {
      razlozi.push('kraće rešenje (najviše 20 000 znakova)');
    }
    for (const p of this.polja()) {
      if (!odgovorPopunjen(p, s.odgovori[p.kljuc])) {
        razlozi.push(`odgovor za polje „${p.oznaka}“`);
      }
    }
    if (greskePriloga(s.prilozi).some(g => g !== null)) {
      razlozi.push('ispravna imena priloga');
    }
    if (this.otpremaPriloga()) {
      razlozi.push('kraj otpremanja priloga');
    }
    return razlozi;
  });
  private readonly mozeSlati = computed(() => !!this.detaljiGrupe() && this.zauzeto() === null && !this.bezTezine() && this.nedostaje().length === 0);
  protected readonly mozeNacrt = computed(() => this.mozeSlati() && (this.jeNova() || this.izmenjeno()));
  protected readonly mozeOdobriti = computed(() => this.mozeSlati() && this.osnova()?.status !== 'AKTIVNA');
  protected readonly tekstZauzeca = computed(() => {
    const z = this.zauzeto();
    return z === null ? '' : `${z === 'cuva' ? 'Čuva se i renderuje…' : 'Renderuje se…'} Renderovanje može potrajati do minut.`;
  });
  protected readonly mozeRenderovati = computed(() => !!this.osnova() && !this.izmenjeno() && this.zauzeto() === null);

  private readonly zahtevi = new Subject<Zahtev>();
  private unisten = false;
  private readonly porukePosleCuvanja = inject(PorukaPosleCuvanja);
  /** Poruka koju je editor nove varijante predao ovom (neuspeo render posle prvog čuvanja); u traku tek posle učitavanja te varijante. */
  private predataPoruka: { varijantaId: number; poruka: string } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.unisten = true));

    this.zahtevi
      .pipe(
        switchMap(z => this.ucitano(z)),
        takeUntilDestroyed(),
      )
      .subscribe(u => {
        if (u.greska) {
          this.greskaUcitavanja.set(u.greska);
          return;
        }
        this.detaljiGrupe.set(u.g);
        this.postaviOsnovu(u.v);
        this.postaviFormu(u.v, u.g.polja);
        this.kartica.set(u.v?.renderGreska && u.v.renderDeo === 'resenje' ? KARTICA.resenje : KARTICA.tekst);
        if (u.v && this.predataPoruka?.varijantaId === u.v.id) {
          this.greska.set(this.predataPoruka.poruka);
          this.predataPoruka = null;
        }
      });

    effect(() => {
      this.zahtev();
      untracked(() => this.ucitaj());
    });

    // bez `takeUntilDestroyed`: izbor nivoa ne sme da se izgubi ako korisnik odmah napusti stranicu
    this.nivoRed
      .pipe(concatMap(({ id, nivo }) => this.api.promeniNivo(id, nivo, TIHO).pipe(
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
      )))
      .subscribe();
  }

  /** Izbor nivoa: nova varijanta ga samo pamti za kreiranje; sačuvana ga odmah šalje (optimistično, na grešku se vraća). */
  protected promeniNivo(nivo: number | null): void {
    const v = this.osnova();
    if (nivo === null || nivo === this.nivo()) {
      return;
    }
    if (!v) {
      this.nivo.set(nivo);
      return;
    }
    this.nivoi.pocni(v.id, this.nivo());
    this.postaviNivo(v.id, nivo);
    this.nivoRed.next({ id: v.id, nivo });
  }

  private postaviNivo(id: number, nivo: number): void {
    if (this.osnova()?.id === id) {
      this.nivo.set(nivo);
      this.osnova.update(o => o && { ...o, nivo });
    }
  }

  /** Za `unsavedChangesGuard`: izmene, ili čuvanje u toku (njegov ishod se vidi samo ovde). */
  imaNesacuvanihIzmena(): boolean {
    return this.izmenjeno() || this.zauzeto() === 'cuva';
  }

  /** Zatvaranje kartice ili osvežavanje: pregledač pita "Napustiti sajt?" pod istim uslovom kao `unsavedChangesGuard`. */
  protected preIzlaska(e: BeforeUnloadEvent): void {
    if (this.imaNesacuvanihIzmena()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  tekstNapustanja(): string {
    return this.zauzeto() === 'cuva'
      ? 'Čuvanje je u toku. Ako napustiš stranicu, varijanta se ipak čuva, a ishod rendera vidiš u banci zadataka.'
      : 'Imaš nesačuvane izmene varijante. Ako napustiš stranicu, izmene se gube.';
  }

  /** Učitava iznova (nova putanja, "Pokušaj ponovo"): staro stanje se briše odmah, pa se nikad ne vidi tuđe. */
  protected ucitaj(): void {
    const z = this.zahtev();
    this.detaljiGrupe.set(null);
    this.osnova.set(null);
    this.nivo.set(PODRAZUMEVANI_NIVO);
    this.greskaUcitavanja.set(null);
    this.greska.set(null);
    // `app-prilozi` nestaje sa grupom: otpremanje u letu više ne javlja kraj
    this.otpremaPriloga.set(false);
    if (z && 'varijantaId' in z) {
      const poruka = this.porukePosleCuvanja.preuzmi(z.varijantaId);
      if (poruka) {
        this.predataPoruka = { varijantaId: z.varijantaId, poruka };
      }
    }
    if (z) {
      this.zahtevi.next(z);
    }
  }

  protected odbaci(): void {
    const g = this.detaljiGrupe();
    if (g && this.izmenjeno() && this.zauzeto() === null && !this.otpremaPriloga()) {
      this.postaviFormu(this.osnova(), g.polja);
      this.greska.set(null);
    }
  }

  /**
   * `\includegraphics[width=\linewidth]{ime}` na kursor editora izabrane kartice: omot je `varwidth=84mm`, pa slika bez širine
   * veća od telefona izlazi iz okvira.
   */
  protected ubaci(ime: string): void {
    const editor = this.kartica() === KARTICA.resenje ? this.edResenje() : this.edTekst();
    editor?.ubaci(`\\includegraphics[width=\\linewidth]{${ime}}`);
  }

  /**
   * `POST` (nova, izvor RUCNO) ili `PUT` (izmena; "Sačuvaj i odobri" bez izmena preskače `PUT` kad je render već uspeo), pa
   * za `odobri` i uspeo render `POST .../odobri`. Odgovor je nova osnova i forma ga preuzima (forma je za vreme čuvanja
   * onemogućena, pa se ništa otkucano ne gubi).
   */
  protected sacuvaj(odobri: boolean): void {
    const g = this.detaljiGrupe();
    if (!g || !(odobri ? this.mozeOdobriti() : this.mozeNacrt())) {
      return;
    }
    const v = this.osnova();
    const s = this.sadrzaj();
    const cmd: VarijantaCmd = { naziv: s.naziv, tekst: s.tekst, resenje: s.resenje, odgovori: s.odgovori, prilozi: s.prilozi };
    const sacuvana$: Observable<VarijantaDetails> = !v
      ? this.api.kreirajVarijantu(g.id, { ...cmd, izvor: 'RUCNO', nivo: this.nivo() }, TIHO)
      : this.izmenjeno() || v.renderStatus !== 'OK' ? this.api.izmeniVarijantu(v.id, cmd, TIHO) : of(v);
    const promenjena = !v || this.izmenjeno();
    const aktivnaPre = v?.status === 'AKTIVNA';
    this.zauzmi('cuva');
    sacuvana$
      .pipe(switchMap(sacuvana => (odobri && sacuvana.renderStatus === 'OK'
        ? this.api.odobri(sacuvana.id, TIHO).pipe(
          map(odobrena => ({ varijanta: odobrena, odobrena: true, greskaOdobravanja: null })),
          catchError((e: unknown) => of({ varijanta: sacuvana, odobrena: false, greskaOdobravanja: razlogBanke(e, UPIS) })),
        )
        : of<IshodCuvanja>({ varijanta: sacuvana, odobrena: false, greskaOdobravanja: null }))))
      .subscribe({
        next: ishod => {
          this.oslobodi();
          this.posleCuvanja(g, !v, ishod, porukaCuvanja(ishod, odobri, aktivnaPre, promenjena));
        },
        error: (e: unknown) => {
          this.oslobodi();
          const poruka = e instanceof HttpErrorResponse && e.status === 503
            ? `${razlogBanke(e)} Varijanta nije sačuvana, pokušaj ponovo za koji minut.`
            : razlogBanke(e, UPIS);
          if (this.unisten) {
            this.obavestenja.greska(`Varijanta nije sačuvana: ${poruka}`);
          } else {
            this.greska.set(poruka);
          }
        },
      });
  }

  /** `POST banka/varijante/{id}/render` (samo sačuvana varijanta bez izmena): nov ishod je nova osnova. */
  protected renderujPonovo(): void {
    const v = this.osnova();
    if (!v || !this.mozeRenderovati()) {
      return;
    }
    this.zauzmi('renderuje');
    this.api.render(v.id, TIHO).subscribe({
      next: nova => {
        this.oslobodi();
        if (this.unisten) {
          return;
        }
        this.postaviOsnovu(nova);
        if (nova.renderStatus === 'OK') {
          this.obavestenja.uspeh('Varijanta je ponovo renderovana.');
        } else {
          this.greska.set(`Render nije uspeo (${opisGreske(nova)}).`);
          this.izaberiKarticu(nova);
        }
      },
      error: (e: unknown) => {
        this.oslobodi();
        this.greska.set(e instanceof HttpErrorResponse && e.status === 503 ? `${razlogBanke(e)} Pokušaj ponovo za koji minut.` : razlogBanke(e));
      },
    });
  }

  private ucitano(z: Zahtev): Observable<Ucitano> {
    const nePostoji = (e: unknown) => e instanceof HttpErrorResponse && e.status === 404;
    const ucitavanje$: Observable<Ucitano> = 'varijantaId' in z
      ? this.api.varijanta(z.varijantaId, TIHO).pipe(switchMap(v => this.api.grupa(v.grupaId, TIHO).pipe(map(g => ({ g, v, greska: null })))))
      : this.api.grupa(z.grupaId, TIHO).pipe(map(g => ({ g, v: null, greska: null })));
    return ucitavanje$.pipe(catchError((e: unknown) => of({ g: null, v: null, greska: { nePostoji: nePostoji(e), poruka: razlogBanke(e) } })));
  }

  /**
   * Posle uspelog čuvanja: uspeh (render OK, odobrena ako je traženo) vodi nazad u banku na grupu (ili na pregled nacrta iz
   * `?povratak`); inače korisnik ostaje na
   * varijanti sa porukom u traci (fokus na nju), karticom dela sa greškom i istaknutom linijom. Nova varijanta tada prelazi na
   * svoj editor (`replaceUrl`, poruku mu predaje `PorukaPosleCuvanja`), jer postoji kao nacrt. Ako je korisnik otišao,
   * ishod je samo obaveštenje.
   */
  private posleCuvanja(g: GrupaDetails, nova: boolean, ishod: IshodCuvanja, p: { uspeh: boolean; poruka: string }): void {
    const v = ishod.varijanta;
    if (this.unisten) {
      if (p.uspeh) {
        this.obavestenja.uspeh(p.poruka);
      } else {
        this.obavestenja.greska(p.poruka);
      }
      return;
    }
    this.postaviOsnovu(v);
    this.postaviFormu(v, g.polja);
    if (p.uspeh) {
      this.obavestenja.uspeh(p.poruka);
      // sa "nova" bez novog unosa: Nazad ne sme da otvori praznu formu (izgleda kao da čuvanje nije uspelo)
      const povratak = povratakNaPregled(this.povratak());
      if (povratak) {
        void this.router.navigateByUrl(povratak, { replaceUrl: nova });
      } else {
        void this.router.navigate(['/banka'], { queryParams: { predmet: g.predmetId, namena: g.namena, grupa: g.id }, replaceUrl: nova });
      }
    } else if (nova) {
      this.porukePosleCuvanja.ostavi(v.id, p.poruka);
      void this.router.navigate(['/banka/varijante', v.id], { replaceUrl: true });
    } else {
      this.greska.set(p.poruka);
      this.izaberiKarticu(v);
    }
  }

  private izaberiKarticu(v: VarijantaDetails): void {
    if (v.renderDeo) {
      this.kartica.set(KARTICA[v.renderDeo]);
    }
  }

  private zauzmi(z: Zauzeto): void {
    this.zauzeto.set(z);
    this.greska.set(null);
    this.forma.disable();
  }

  private oslobodi(): void {
    this.zauzeto.set(null);
    this.forma.enable();
  }

  private postaviOsnovu(v: VarijantaDetails | null): void {
    // odgovor drugog poziva (PUT, render) ne nosi nivo koji je korisnik upravo izabrao, pa dok `PATCH` traje ostaje izabrani
    const prikaz = v && this.nivoi.imaUToku(v.id) ? { ...v, nivo: this.nivo() } : v;
    this.osnova.set(prikaz);
    if (v) {
      this.nivo.set(prikaz?.nivo ?? PODRAZUMEVANI_NIVO);
      this.mrvice.postavi(imeVarijante(v));
    }
  }

  private postaviFormu(v: VarijantaDetails | null, polja: readonly Polje[]): void {
    const s = sadrzajVarijante(v, polja);
    this.forma.reset({ naziv: s.naziv ?? '', tekst: s.tekst, resenje: s.resenje ?? '' });
    this.odgovori.set(s.odgovori);
    this.prilozi.set(s.prilozi);
  }
}
