import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ErrorHandler, Injector, afterNextRender, computed, effect, inject, signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, distinctUntilChanged, finalize, from, map, of, switchMap } from 'rxjs';
import { UzivoPutanje } from '../uzivo-putanje';
import { EditorStore, NijeSacuvano } from '../data-access/editor.store';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { greskePlatna } from '../data-access/platno-provera';
import { razlogGreske } from '../data-access/razlog-greske';
import { TIPOVI_PITANJA, opisTipa, oznakaSlajda, slajdUCmd } from '../data-access/slajd-pravila';
import { IzvodjenjeInfo, PokreniCmd, PrezentacijaDetails, SlajdCmd, SlajdDetails, UpdatePrezentacijaCmd, medijUrl } from '../data-access/uzivo.models';
import type { Tema } from '../data-access/platno.models';
import { kodSaRazmakom } from '../ui/format';
import { DIMENZIJE_SLIKE } from '../ui/dimenzije-slike';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { TEME, promenljiveTeme, vazecaTema } from '../ui/teme';
import { otvoriPokreni, pokretanjeBezDijaloga } from './pokreni.dialog';
import { SlajdFormaComponent } from './slajd-forma.component';
import { PlatnoEditorComponent } from '../editor-platna/platno-editor.component';
import { UvozPdfOtvarac } from './uvoz-pdf-otvarac';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';
import type { NazivIkone } from '../../../core/layout/icons';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';

const STATUS: Record<string, string> = { miruje: '', cuva: 'Čuva se…', sacuvano: 'Sačuvano' };

/**
 * Editor prezentacije (spec 6.3): levo lista slajdova (CDK drag-drop, meni po slajdu, "+ Info", "+ Pitanje", "+ Platno" (meni: Prazno, Naslov i tekst)), u sredini
 * forma izabranog slajda, desno živi pregled istom komponentom kao projektor (uvek dnevne boje, `rezim-dan uz-dan`). Ispod
 * 1200 px pregled ide ispod forme. PLATNO slajd: iznad forme je lenji editor platna (`@defer`), bez bočnog pregleda (koraci su u režimu "Pregled" editora, F18). Zaglavlje: naziv i opis (izmena na mestu), indikator čuvanja, Izvođenja, Dupliraj,
 * Obriši, Pokreni; traka za izvođenje u toku; podešavanja u panelu. Ctrl+S čuva odmah.
 */
@Component({
  selector: 'app-prezentacija-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EditorStore],
  imports: [
    CdkDrag, CdkDragHandle, CdkDropList, RouterLink, MatButtonModule, MatExpansionModule, MatIconModule, MatMenuModule,
    MatProgressBarModule, MatRadioModule, MatSlideToggleModule, SlajdFormaComponent, SlajdPrikazComponent,
    // samo u @defer bloku: kompajler pravi dinamički uvoz, editor platna je zaseban (lenj) chunk
    PlatnoEditorComponent,
  ],
  host: {
    '(document:keydown)': 'tastatura($event)',
    '(window:beforeunload)': 'preIzlaska($event)',
  },
  template: `
    @if (store.prezentacija(); as p) {
      <div class="uz-ed">
        <header class="uz-ed-zaglavlje">
          <a mat-icon-button [routerLink]="'/' + rute.prezentacije" [queryParams]="{ predmet: p.predmet.id }"
             aria-label="Nazad na prezentacije"><mat-icon svgIcon="arrow_back" /></a>
          <div class="uz-ed-naslovi">
            <input class="uz-ed-naziv" aria-label="Naziv prezentacije" maxlength="200" [value]="p.naziv"
                   (change)="sacuvajNaziv($any($event.target))" (keydown.enter)="$any($event.target).blur()">
            <input class="uz-ed-opis" aria-label="Opis prezentacije" maxlength="1000" placeholder="Dodaj opis…"
                   [value]="p.opis ?? ''" (change)="sacuvajOpis($any($event.target))" (keydown.enter)="$any($event.target).blur()">
            <span class="uz-ed-predmet">{{ p.predmet.naziv }}</span>
          </div>
          <span class="uz-ed-status" role="status" [class.uz-ed-status--greska]="store.cuvanje() === 'greska'">
            @if (store.cuvanje() === 'greska') { <mat-icon aria-hidden="true" svgIcon="error" /> }
            {{ statusTekst() }}
          </span>
          <div class="uz-ed-akcije">
            <a mat-button [routerLink]="'/' + rute.prezentacijaIzvodjenja(p.id)"><mat-icon svgIcon="history" />Izvođenja</a>
            <!-- disabledInteractive: dugme ostaje fokusabilno, pa CDK posle zatvaranja dijaloga vraća fokus na njega (ne na body) -->
            <button mat-button type="button" [disabled]="radi()" disabledInteractive (click)="duplirajPrezentaciju()">
              <mat-icon svgIcon="content_copy" />Dupliraj prezentaciju
            </button>
            <button mat-button type="button" [disabled]="radi()" disabledInteractive (click)="obrisiPrezentaciju()">
              <mat-icon svgIcon="delete" />Obriši
            </button>
            <button mat-flat-button type="button" [disabled]="radi()" disabledInteractive (click)="pokreni()">
              <mat-icon svgIcon="play_arrow" />Pokreni
            </button>
          </div>
        </header>

        @if (aktivno(); as a) {
          <div class="uz-ed-traka" role="status">
            <mat-icon aria-hidden="true" svgIcon="sensors" />
            <span>Izvođenje u toku · kod <strong>{{ kod(a.kod) }}</strong></span>
            <a mat-flat-button [routerLink]="'/' + rute.izvodjenjeKonzola(a.id)">Nastavi</a>
          </div>
        }

        <mat-expansion-panel class="uz-ed-podesavanja">
          <mat-expansion-panel-header>
            <mat-panel-title>Podešavanja</mat-panel-title>
            <mat-panel-description>{{ opisPodesavanja() }}</mat-panel-description>
          </mat-expansion-panel-header>
          <div class="uz-ed-podesavanja-telo">
            <mat-slide-toggle [checked]="p.takmicenje" (change)="podesi({ takmicenje: $event.checked })">
              Takmičenje: poeni za brzinu i rang-lista
            </mat-slide-toggle>
            <div class="uz-ed-grupa">
              <span class="uz-ed-oznaka-grupe" id="uz-ed-telefon">Telefon studenta</span>
              <mat-radio-group aria-labelledby="uz-ed-telefon" [value]="p.telefonPrikaz"
                               (change)="podesi({ telefonPrikaz: $event.value })">
                <mat-radio-button value="DUGMAD">Samo dugmad (pitanje je na projektoru)</mat-radio-button>
                <mat-radio-button value="PITANJE">Celo pitanje</mat-radio-button>
              </mat-radio-group>
            </div>
            <mat-slide-toggle [checked]="p.detaljiDozvoljeni" [disabled]="p.telefonPrikaz === 'PITANJE'"
                              (change)="podesi({ detaljiDozvoljeni: $event.checked })">
              Dozvoli „Detalje“: student u režimu dugmadi može da otvori tekst pitanja
            </mat-slide-toggle>
            <div class="uz-ed-grupa">
              <span class="uz-ed-oznaka-grupe" id="uz-ed-tema">Tema</span>
              <mat-radio-group aria-labelledby="uz-ed-tema" aria-describedby="uz-ed-tema-napomena" [value]="vazeca(p.tema)"
                               (change)="podesi({ tema: $event.value })">
                @for (t of teme; track t.tema) {
                  <mat-radio-button [value]="t.tema">
                    <span class="uz-ed-tema-naziv">{{ t.naziv }}</span>
                    <span class="uz-ed-uzorak" aria-hidden="true" [style]="promenljive(t.tema)">
                      <span class="uz-ed-uzorak-tekst"></span>
                      <span class="uz-ed-uzorak-naslov"></span>
                      <span class="uz-ed-uzorak-akcent"></span>
                    </span>
                  </mat-radio-button>
                }
              </mat-radio-group>
            </div>
            <!-- odluka 23: model nosi eksplicitne boje i fontove, pa tema ne prebojava postojeće slojeve -->
            <p class="uz-ed-napomena" id="uz-ed-tema-napomena">Tema menja izgled Info i Pitanje slajdova i podrazumevane
              boje i fontove novih slojeva platna; postojeći slojevi zadržavaju svoje boje i fontove.</p>
            <p class="uz-ed-napomena">Režim telefona i „Detalji“ menjaju se i uživo (tasteri M i D).</p>
          </div>
        </mat-expansion-panel>

        <div class="uz-ed-telo" [class.uz-ed-telo--platno]="store.izabrani()?.tip === 'PLATNO'">
          <nav class="uz-ed-lista" aria-label="Slajdovi">
            <ol class="uz-ed-slajdovi" cdkDropList (cdkDropListDropped)="spusteno($event)">
              @for (s of store.slajdovi(); track store.kljuc(s.id); let i = $index) {
                <li class="uz-ed-stavka" cdkDrag cdkDragLockAxis="y"
                    [class.uz-ed-stavka--izabrana]="s.id === store.izabraniId()">
                  <mat-icon class="uz-ed-rucka" cdkDragHandle aria-hidden="true" svgIcon="drag_indicator" />
                  <button class="uz-ed-stavka-dugme" type="button" (click)="store.izaberi(s.id)"
                          [attr.aria-current]="s.id === store.izabraniId() ? 'true' : null">
                    <span class="uz-ed-slicica rezim-dan uz-dan" aria-hidden="true" inert>
                      @defer (on viewport) {
                        <app-slajd-prikaz [slajd]="slicica(s)" [tema]="vazeca(p.tema)" [korak]="0" />
                      } @placeholder {
                        <span class="uz-ed-slicica-mesto"></span>
                      }
                    </span>
                    <span class="uz-ed-rb">{{ s.rb }}</span>
                    <mat-icon class="uz-ed-ikona" [attr.aria-label]="nazivTipa(s)" [svgIcon]="ikona(s)" />
                    <span class="uz-ed-oznaka">{{ oznaka(s) }}</span>
                    @if (store.neispravni().has(s.id) || s.id < 0) {
                      <mat-icon class="uz-ed-upozorenje" aria-label="Nije sačuvan" title="Nije sačuvan" svgIcon="error" />
                    }
                  </button>
                  <button mat-icon-button type="button" [matMenuTriggerFor]="meniSlajda" [matMenuTriggerData]="{ s, i }"
                          [attr.aria-label]="'Radnje za slajd ' + s.rb"><mat-icon svgIcon="more_vert" /></button>
                </li>
              }
            </ol>
            @if (!store.slajdovi().length) {
              <p class="uz-ed-napomena">Prezentacija još nema slajdova. Dodaj info slajd, pitanje ili platno.</p>
            }
            <div class="uz-ed-dodaj">
              <button mat-stroked-button type="button" (click)="store.dodaj('INFO')"><mat-icon svgIcon="add" />Info</button>
              <button mat-stroked-button type="button" [matMenuTriggerFor]="meniPitanja"><mat-icon svgIcon="add" />Pitanje</button>
              <button mat-stroked-button type="button" [matMenuTriggerFor]="meniPlatna"><mat-icon svgIcon="layers" />Platno</button>
              <button mat-stroked-button type="button" aria-label="Uvezi iz PowerPointa" title="Uvezi iz PowerPointa"
                      [disabled]="radi()" disabledInteractive (click)="uveziIzPowerPointa()"><mat-icon svgIcon="upload_file" />PowerPoint</button>
              <button mat-stroked-button type="button" aria-label="Uvezi iz PDF-a" title="Uvezi iz PDF-a"
                      [disabled]="radi()" disabledInteractive (click)="uveziIzPdf()"><mat-icon svgIcon="picture_as_pdf" />PDF</button>
            </div>
          </nav>

          <mat-menu #meniPitanja="matMenu">
            @for (t of tipovi; track t.tip) {
              <button mat-menu-item type="button" (click)="store.dodaj('PITANJE', t.tip)">
                <mat-icon [svgIcon]="t.ikona" />{{ t.naziv }}
              </button>
            }
          </mat-menu>
          <mat-menu #meniPlatna="matMenu">
            <button mat-menu-item type="button" (click)="store.dodaj('PLATNO')">Prazno</button>
            <button mat-menu-item type="button" (click)="store.dodaj('PLATNO', undefined, 'NASLOV_I_TEKST')">Naslov i tekst</button>
          </mat-menu>
          <mat-menu #meniSlajda="matMenu">
            <ng-template matMenuContent let-s="s" let-i="i">
              <button mat-menu-item type="button" (click)="store.dupliraj(s.id)"><mat-icon svgIcon="content_copy" />Dupliraj</button>
              <button mat-menu-item type="button" [disabled]="i === 0" (click)="store.pomeri(i, i - 1)">
                <mat-icon svgIcon="arrow_upward" />Pomeri gore
              </button>
              <button mat-menu-item type="button" [disabled]="i === store.slajdovi().length - 1" (click)="store.pomeri(i, i + 1)">
                <mat-icon svgIcon="arrow_downward" />Pomeri dole
              </button>
              <button mat-menu-item type="button" (click)="obrisiSlajd(s)"><mat-icon svgIcon="delete" />Obriši</button>
            </ng-template>
          </mat-menu>

          <section class="uz-ed-sredina" aria-label="Izabrani slajd">
            @for (s of izabraniNiz(); track store.kljuc(s.id) + ':' + s.tip) {
              <!-- jedna instanca editora po slajdu (track kljuc: ista i kad nacrt dobije pravi id); lenj chunk; promena tipa
                   (Pretvori u platno, Poništi) pravi novu formu i editor, jer forma gradi kontrole jednom -->
              @if (s.tip === 'PLATNO' && s.platno) {
                @defer (on immediate) {
                  <app-platno-editor [slajd]="s" [tema]="vazeca(p.tema)" />
                } @loading (after 150ms; minimum 300ms) {
                  <mat-progress-bar mode="indeterminate" aria-label="Učitavanje editora platna" />
                } @error {
                  <p class="uz-ed-greska" role="alert">Editor platna nije učitan. Osveži stranicu i pokušaj ponovo.</p>
                }
              }
              <app-slajd-forma [slajd]="s" (izmena)="izmenaForme(s.id, $event)" (pretvori)="pretvoriUPlatno(s)" (pregledPrelaza)="pregledajPrelaz(s)" />
            } @empty {
              <p class="uz-ed-napomena">Izaberi slajd levo ili dodaj nov.</p>
            }
          </section>

          <!-- PLATNO: bez bočnog pregleda, koraci i animacije su u režimu "Pregled" editora platna (F18) -->
          @if (store.izabrani(); as s) {
            @if (s.tip !== 'PLATNO') {
              <aside class="uz-ed-pregled" aria-label="Pregled slajda">
                <div class="rezim-dan uz-dan uz-ed-platno"><app-slajd-prikaz [slajd]="s" [tema]="vazeca(p.tema)" /></div>
                <p class="uz-ed-napomena">Ovako slajd izgleda na projektoru.</p>
              </aside>
            }
          }
        </div>
      </div>
    } @else if (store.greska(); as g) {
      <div class="uz-ed-strana">
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
        <a mat-button [routerLink]="'/' + rute.prezentacije"><mat-icon svgIcon="arrow_back" />Nazad na prezentacije</a>
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacije" />
    }
  `,
})
export class PrezentacijaEditorPage implements NemaNesacuvanih {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(PrezentacijeApi);
  private readonly izvodjenja = inject(IzvodjenjaApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly otvaracUvoza = inject(UvozPptxOtvarac);
  private readonly otvaracPdf = inject(UvozPdfOtvarac);
  private readonly greske = inject(ErrorHandler);
  private readonly registar = inject(RegistarCuvanja);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dimenzije = inject(DIMENZIJE_SLIKE);
  /** Pretvaranje je zaseban lenj chunk (odluka 21): stranica editora ne raste. */
  protected ucitajPretvaranje = () => import('../data-access/pretvori-u-platno');
  /** Ključevi (`kljuc`) slajdova čije pretvaranje u platno upravo traje (od klika do potvrde, odustajanja ili greške). */
  private readonly pretvaranja = new Set<number>();

  protected readonly rute = UzivoPutanje;
  protected readonly tipovi = TIPOVI_PITANJA;
  protected readonly kod = kodSaRazmakom;
  protected readonly oznaka = (s: SlajdDetails) => oznakaSlajda(s, 48);
  protected readonly teme = Object.values(TEME);
  private readonly slicice = new WeakMap<SlajdDetails, SlajdDetails>();
  /** Slajd za sličicu: PLATNO bez animacija (svi slojevi vidljivi), ostali isti objekat; keš po objektu slajda. */
  protected slicica(s: SlajdDetails): SlajdDetails {
    if (s.tip !== 'PLATNO' || !s.platno) return s;
    let k = this.slicice.get(s);
    if (!k) {
      k = { ...s, platno: { ...s.platno, animacije: [] } };
      this.slicice.set(s, k);
    }
    return k;
  }
  protected readonly vazeca = (t: Tema | null | undefined) => vazecaTema(t);
  protected readonly promenljive = promenljiveTeme;
  protected readonly aktivno = signal<IzvodjenjeInfo | null>(null);
  /** Traje radnja nad celom prezentacijom (pokretanje, dupliranje, brisanje, uvoz). */
  protected readonly radi = signal(false);
  protected readonly izabraniNiz = computed(() => {
    const s = this.store.izabrani();
    return s ? [s] : [];
  });
  protected readonly statusTekst = computed(() =>
    this.store.cuvanje() === 'greska' ? this.store.greska() ?? 'Greška pri čuvanju.' : STATUS[this.store.cuvanje()]);
  protected readonly opisPodesavanja = computed(() => {
    const p = this.store.prezentacija();
    if (!p) return '';
    const telefon = p.telefonPrikaz === 'PITANJE' ? 'telefon: celo pitanje'
      : `telefon: samo dugmad${p.detaljiDozvoljeni ? ', Detalji dozvoljeni' : ''}`;
    return `${p.takmicenje ? 'Takmičenje' : 'Bez takmičenja'} · ${telefon}`;
  });

  private readonly aktivnoZa = computed(() => {
    const p = this.store.prezentacija();
    return p?.aktivnoIzvodjenjeId ? p.id : null;
  });

  constructor() {
    this.route.paramMap.pipe(map(p => Number(p.get('id'))), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(id => {
        this.aktivno.set(null);
        if (id > 0) this.store.ucitaj(id);
      });
    effect(onCleanup => {
      const id = this.aktivnoZa();
      if (id === null) return;
      const pretplata = untracked(() => this.izvodjenja.lista(id, 'AKTIVNO'))
        .subscribe({ next: l => this.aktivno.set(l[0] ?? null), error: () => this.aktivno.set(null) });
      onCleanup(() => pretplata.unsubscribe());
    });
    // Poslednja mrvica: naziv prezentacije (prati i izmenu naziva u zaglavlju).
    effect(() => {
      const naziv = this.store.prezentacija()?.naziv;
      if (naziv) untracked(() => this.mrvice.postavi(naziv));
    });
  }

  /**
   * Nepotpuni slajdovi (novi i postojeći): store ih ne šalje, pa bi se napuštanjem izgubile njihove izmene. Ispravne izmene i
   * nacrte store šalje sam i posle napuštanja (i izmenu nacrta stiglu dok njegov POST traje), pa se ovde ne broje; ako
   * takav upis ne uspe kad editor više nije na ekranu, store to javlja globalnom porukom.
   */
  private nepotpuni(): { novi: number; postojeci: number } {
    const neispravni = this.store.neispravni();
    const lista = this.store.slajdovi().filter(s => neispravni.has(s.id));
    const novi = lista.filter(s => s.id < 0).length;
    return { novi, postojeci: lista.length - novi };
  }

  private nesacuvaniSlajdovi(): number {
    const { novi, postojeci } = this.nepotpuni();
    return novi + postojeci;
  }

  /** Dijalog uvoza upravo šalje (sesija `uvoz-<id>` ili `uvoz-pdf-<id>` u `RegistarCuvanja`): odakle je uvoz, ili `null`. */
  private uvozUToku(): string | null {
    const p = this.store.prezentacija();
    if (!p) return null;
    return this.registar.zauzet(`uvoz-${p.id}`) ? 'PowerPointa' : this.registar.zauzet(`uvoz-pdf-${p.id}`) ? 'PDF-a' : null;
  }

  /** Za `unsavedChangesGuard` (`canDeactivate`): potvrda kroz `ConfirmDialog` samo kad ima šta da se izgubi. */
  imaNesacuvanihIzmena(): boolean {
    return this.nesacuvaniSlajdovi() > 0 || !!this.uvozUToku();
  }

  tekstNapustanja(): string {
    const delovi: string[] = [];
    const uvoz = this.uvozUToku();
    if (uvoz) {
      delovi.push(`Uvoz iz ${uvoz} još traje i završiće se i ako napustiš editor. Prozor uvoza ostaje otvoren dok se uvoz ne završi.`);
    }
    const { novi, postojeci } = this.nepotpuni();
    if (novi + postojeci > 0) {
      const posledice: string[] = [];
      if (novi) posledice.push(novi === 1 ? 'novi slajd se ne pravi' : 'novi slajdovi se ne prave');
      if (postojeci) {
        const ostaje = postojeci === 1 ? 'ostaje u poslednjoj sačuvanoj verziji' : 'ostaju u poslednjoj sačuvanoj verziji';
        posledice.push(novi ? `a postojeći ${ostaje}` : `${postojeci === 1 ? 'slajd' : 'slajdovi'} ${ostaje}`);
      }
      delovi.push(`Nesačuvanih slajdova: ${novi + postojeci} (nisu potpuni, vidi upozorenja u listi). `
        + `Ako napustiš editor, ${posledice.join(', ')}.`);
    }
    return delovi.join(' ');
  }

  protected tastatura(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.store.sacuvajOdmah();
    }
  }

  /** Zatvaranje ili osvežavanje kartice: otvorena sesija editora platna prvo ide u dokument, pa se proverava šta je nesačuvano. */
  protected preIzlaska(e: BeforeUnloadEvent): void {
    this.store.isprazni();
    if (this.store.imaNesacuvano()) {
      this.store.sacuvajOdmah();
      e.preventDefault();
    }
  }

  /**
   * Izmena iz forme slajda. PLATNO: forma menja samo beleške, a dokument platna uvek ide iz store-a (forma pamti platno
   * iz trenutka pravljenja, a editor platna ga menja nezavisno od nje).
   */
  protected izmenaForme(id: number, cmd: SlajdCmd): void {
    const platno = cmd.tip === 'PLATNO' ? this.store.izabrani()?.platno ?? cmd.platno : cmd.platno;
    this.store.izmeniSlajd(id, { ...cmd, platno });
  }

  /**
   * INFO -> PLATNO (odluka 20): jedna izmena slajda; potvrda samo uz gubitke; "Poništi pretvaranje" je druga izmena istim
   * putem i vraća INFO komandu iz trenutka pretvaranja (sa beleškama otkucanim posle njega). Jedno pretvaranje po slajdu od
   * klika do ishoda (`pretvaranja`: drugi klik ne otvara drugi dijalog). Posle čekanja na chunk važi slajd iz store-a
   * (kucanje za to vreme, nacrt sa pravim id-jem); ako više nije INFO ili je editor napušten, ništa. Dokument koji
   * `proveriKaoServer` odbija se ne primenjuje (poruka sa razlogom). Fokus posle promene tipa ide na stavku slajda u listi,
   * a posle poništavanja na "Pretvori u platno" (forma i editor se prave ponovo, fokus bi pao na body).
   */
  protected async pretvoriUPlatno(s: SlajdDetails): Promise<void> {
    const k = this.store.kljuc(s.id);
    if (this.pretvaranja.has(k)) return;
    this.pretvaranja.add(k);
    const kraj = () => this.pretvaranja.delete(k);
    const nadji = () => this.store.slajdovi().find(x => this.store.kljuc(x.id) === k);
    const trenutni = () => {
      const t = nadji();
      return t?.tip === 'INFO' && !this.destroyRef.destroyed ? t : null;
    };
    let dalje = false;
    try {
      // merenje slike najviše 3 s (zahtev koji visi), pa 16:9
      const [modul, dim] = await Promise.all([
        this.ucitajPretvaranje(),
        s.slika ? Promise.race([this.dimenzije(medijUrl(s.slika.id)).catch(() => null), new Promise<null>(r => setTimeout(r, 3000, null))]) : null,
      ]);
      const t = trenutni();
      const p = this.store.prezentacija();
      if (!t || !p) return;
      const original = slajdUCmd(t);
      // veličina važi samo za sliku za koju je merena
      const d = t.slika?.id === s.slika?.id ? dim : null;
      const slika = t.slika && { id: t.slika.id, naziv: t.slika.naziv, sirina: d?.sirina ?? 1600, visina: d?.visina ?? 900 };
      const r = modul.infoUPlatno({ naslov: t.naslov, sadrzaj: t.sadrzaj, postepeno: t.postepeno, slika }, vazecaTema(p.tema));
      // dokument koji server ne bi primio (npr. > 400 stavki uz "Otkrivaj stavke") se ne pravi: INFO ostaje netaknut
      const odbijeno = greskePlatna(r.platno);
      if (odbijeno) {
        this.obavestenja.greska(`Slajd ne može da se pretvori u platno: ${odbijeno}`);
        return;
      }
      const nastavi$ = r.gubici.length === 0 ? of(true) : ConfirmDialog.otvori(this.dialog, {
        naslov: 'Pretvoriti slajd u platno?',
        tekst: ['Deo sadržaja se ne prenosi tačno:', ...r.gubici.map(g => modul.OPISI_GUBITAKA[g]), 'Posle pretvaranja možeš da poništiš.'],
        potvrdi: 'Pretvori',
      });
      dalje = true;
      nastavi$.pipe(finalize(kraj)).subscribe(da => {
        if (!da || !trenutni()) return;
        this.store.izmeniSlajd(t.id, {
          ...original, tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, postepeno: false, pitanje: null, platno: r.platno,
        });
        this.fokusiraj(k, '.uz-ed-stavka-dugme[aria-current="true"]');
        this.obavestenja.uspeh('Slajd je pretvoren u platno.', {
          label: 'Poništi pretvaranje',
          run: () => {
            // uništen store više ne čuva (sesija je zatvorena pri napuštanju)
            if (this.destroyRef.destroyed) {
              this.obavestenja.info('Editor je zatvoren, pa pretvaranje više ne može da se poništi.');
              return;
            }
            this.store.isprazni(); // otvoren tekst ili gest editora platna ide u dokument pre vraćanja (odluka 9c faze 4)
            // beleške i prelaz su isti u oba tipa: ostaje ono što je izmenjeno posle pretvaranja (PUT bez prelaza bi ga
            // obrisao, a forma platna ga menja); slika sa pravim nazivom do odgovora
            const sada = nadji();
            this.store.izmeniSlajd(t.id, {
              ...original, beleske: sada?.beleske ?? original.beleske, prelaz: sada ? sada.prelaz ?? null : original.prelaz,
            }, t.slika);
            this.fokusiraj(k, 'app-slajd-forma .uz-ed-pretvori');
          },
        }, { grupa: 'uzivo-pretvori' });
      });
    } catch (e) {
      // neučitan chunk ili izuzetak pretvaranja: INFO ostaje
      this.greske.handleError(e);
      this.obavestenja.greska('Pretvaranje nije uspelo. Osveži stranicu i pokušaj ponovo.');
    } finally {
      if (!dalje) kraj();
    }
  }

  /** Posle sledećeg crtanja fokus na `selektor` u stranici, ako je slajd `k` i dalje izabran (inače bi otišao na drugi). */
  private fokusiraj(k: number, selektor: string): void {
    afterNextRender(() => {
      const id = this.store.izabraniId();
      if (id !== null && this.store.kljuc(id) === k) this.host.nativeElement.querySelector<HTMLElement>(selektor)?.focus();
    }, { injector: this.injector });
  }

  protected ikona(s: SlajdDetails): NazivIkone {
    if (s.tip === 'PLATNO') return 'layers';
    return s.tip === 'PITANJE' && s.pitanje ? opisTipa(s.pitanje.tip).ikona : 'article';
  }

  protected nazivTipa(s: SlajdDetails): string {
    if (s.tip === 'PLATNO') return 'Platno';
    return s.tip === 'PITANJE' && s.pitanje ? `Pitanje: ${opisTipa(s.pitanje.tip).naziv}` : 'Info slajd';
  }

  protected spusteno(e: CdkDragDrop<unknown>): void {
    this.store.pomeri(e.previousIndex, e.currentIndex);
  }

  protected sacuvajNaziv(polje: HTMLInputElement): void {
    const p = this.store.prezentacija();
    if (!p) return;
    if (!polje.value.trim()) {
      polje.value = p.naziv;
      return;
    }
    this.podesi({ naziv: polje.value.trim() });
  }

  protected sacuvajOpis(polje: HTMLInputElement): void {
    this.podesi({ opis: polje.value.trim() || null });
  }

  protected podesi(izmena: Partial<UpdatePrezentacijaCmd>): void {
    const p = this.store.prezentacija();
    if (!p) return;
    this.store.izmeniPodesavanja({
      naziv: p.naziv, opis: p.opis, tema: p.tema, takmicenje: p.takmicenje, telefonPrikaz: p.telefonPrikaz,
      detaljiDozvoljeni: p.detaljiDozvoljeni, ...izmena,
    });
  }

  protected obrisiSlajd(s: SlajdDetails): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati slajd ${s.rb}?`, tekst: `„${oznakaSlajda(s)}“ biće obrisan.`, potvrdi: 'Obriši', destruktivno: true,
    }).subscribe(da => da && this.store.obrisi(s.id));
  }

  protected pokreni(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    this.radi.set(true);
    this.store.sacuvajSve().subscribe({
      next: () => {
        // tek posle čuvanja: nacrt koji je upravo postao pitanje se računa
        const bezDijaloga = pokretanjeBezDijaloga(this.route.snapshot.queryParamMap.get('predavanje'), this.store.brojPitanja());
        if (bezDijaloga) {
          this.pokreniSa(p.id, bezDijaloga);
          return;
        }
        otvoriPokreni(this.dialog, { prezentacijaId: p.id, naziv: p.naziv }).subscribe(i => {
          this.radi.set(false);
          if (i) this.uKonzolu(i);
        });
      },
      error: e => this.neuspeh(e, 'Izmene nisu sačuvane.', 'Pokretanje je zaustavljeno'),
    });
  }

  protected duplirajPrezentaciju(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    this.radi.set(true);
    this.store.sacuvajSve().subscribe({
      next: () => this.api.dupliraj(p.id).subscribe({
        next: kopija => {
          this.radi.set(false);
          this.obavestenja.uspeh(`Napravljena je kopija „${kopija.naziv}“.`);
          this.router.navigate(['/' + UzivoPutanje.prezentacija(kopija.id)]);
        },
        error: e => this.neuspeh(e, 'Dupliranje nije uspelo.'),
      }),
      error: e => this.neuspeh(e, 'Izmene nisu sačuvane.', 'Dupliranje je zaustavljeno'),
    });
  }

  protected obrisiPrezentaciju(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    const poruke = [`Prezentacija „${p.naziv}“ i svi njeni slajdovi biće trajno obrisani.`];
    if (p.brojIzvodjenja > 0) {
      poruke.push(`Brišu se i sačuvana izvođenja sa rezultatima: ${p.brojIzvodjenja}.`);
    }
    ConfirmDialog.otvori(this.dialog, { naslov: 'Obrisati prezentaciju?', tekst: poruke, potvrdi: 'Obriši', destruktivno: true }).subscribe(da => {
      if (!da) return;
      this.radi.set(true);
      this.api.obrisi(p.id).subscribe({
        next: () => {
          this.radi.set(false);
          this.obavestenja.uspeh('Prezentacija je obrisana.');
          this.router.navigate(['/' + UzivoPutanje.prezentacije], { queryParams: { predmet: p.predmet.id } });
        },
        error: e => this.neuspeh(e, 'Brisanje nije uspelo.'),
      });
    });
  }

  /** Uvoz iz PowerPointa (spec 7.7). */
  protected uveziIzPowerPointa(): void {
    this.uvezi(podaci => this.otvaracUvoza.otvori(this.dialog, podaci));
  }

  /** "Pregledaj prelaz" (F17): prethodni i izabrani slajd (lokalno, sa prelazom iz forme) u lenjom dijalogu. */
  /** Dvoklik (ili klik dok se chunk učitava) ne otvara drugi dijalog (recenzija F17, Minor 5). */
  private pregledSeOtvara = false;

  protected pregledajPrelaz(s: SlajdDetails): void {
    if (this.pregledSeOtvara || this.dialog.openDialogs.length) return;
    this.pregledSeOtvara = true;
    const l = this.store.slajdovi(), i = l.findIndex(x => x.id === s.id);
    import('./prelaz-pregled.dialog')
      .then(m => m.otvoriPregledPrelaza(this.dialog, { pre: l[i - 1] ?? null, slajd: l[i] ?? s, tema: vazecaTema(this.store.prezentacija()?.tema) }))
      .catch(() => this.obavestenja.greska('Pregled prelaza nije učitan. Osveži stranicu i pokušaj ponovo.'))
      .finally(() => (this.pregledSeOtvara = false));
  }

  /** Uvoz iz PDF-a (faza 5d): isti tok kao PowerPoint; dijalog i pdf.js su lenji chunk-ovi (`UvozPdfOtvarac`). */
  protected uveziIzPdf(): void {
    this.uvezi(podaci => this.otvaracPdf.otvori(this.dialog, { ...podaci, tema: vazecaTema(this.store.prezentacija()?.tema) }));
  }

  /**
   * Uvoz (PowerPoint, PDF): prvo `sacuvajSve` (nesačuvan ili neispravan slajd zaustavlja uvoz), pa lenjo učitan dijalog sa
   * izabranim slajdom kao mestom; rezultat (cela prezentacija) ide u store i fokus na prvi uvezen slajd, a nepoznat ishod
   * slanja (`'osvezi'`) ponovo učitava prezentaciju, pa lista nikad ne ostaje zastarela.
   */
  private uvezi(otvori: (podaci: { prezentacijaId: number; brojSlajdova: number; izabraniId: number | null; izabraniRb: number | null })
    => Promise<Observable<PrezentacijaDetails | 'osvezi' | undefined>>): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    this.radi.set(true);
    this.store.sacuvajSve().pipe(
      switchMap(() => {
        const s = this.store.izabrani();
        return from(otvori({
          prezentacijaId: p.id, brojSlajdova: this.store.slajdovi().length, izabraniId: s?.id ?? null, izabraniRb: s?.rb ?? null,
        }));
      }),
      switchMap(zatvaranje => zatvaranje),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: rezultat => {
        if (rezultat === 'osvezi') {
          // nepoznat ishod slanja: slajdovi su možda upisani, lista se čita ponovo sa servera (prikazana prezentacija
          // ostaje dok nova ne stigne, pa editor i fokus na dugmetu uvoza ostaju)
          this.store.ucitaj(p.id);
        } else if (rezultat) {
          this.store.primeniUvoz(rezultat);
          afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.uz-ed-stavka-dugme[aria-current="true"]')?.focus(),
            { injector: this.injector });
        }
      },
      error: e => {
        // `sacuvajSve` greši samo sa `NijeSacuvano`; ostalo je neuspelo učitavanje lenjog chunk-a (konzola + poruka)
        if (!(e instanceof NijeSacuvano)) this.greske.handleError(e);
        this.neuspeh(e, 'Dijalog uvoza nije učitan. Osveži stranicu i pokušaj ponovo.', 'Uvoz nije pokrenut');
      },
      complete: () => this.radi.set(false),
    });
  }

  private pokreniSa(prezentacijaId: number, cmd: PokreniCmd): void {
    this.izvodjenja.pokreni(prezentacijaId, cmd).subscribe({
      next: i => {
        this.radi.set(false);
        this.uKonzolu(i);
      },
      error: e => this.neuspeh(e, 'Pokretanje nije uspelo.'),
    });
  }

  private uKonzolu(i: IzvodjenjeInfo): void {
    this.router.navigate(['izvodjenja', i.id, 'konzola']);
  }

  /** `uvod` ide ispred poruke kad radnja nije ni počela jer izmene nisu sačuvane. */
  private neuspeh(e: unknown, poruka: string, uvod?: string): void {
    this.radi.set(false);
    const razlog = e instanceof NijeSacuvano ? e.message : razlogGreske(e, poruka);
    this.obavestenja.greska(uvod ? `${uvod}: ${razlog}` : razlog);
  }
}
