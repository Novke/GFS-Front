// Dijalog uvoza iz PowerPointa (spec 7.1, 7.7). Učitava se samo lenjo (`pages/uvoz-pptx-otvarac.ts`), zajedno sa
// modulima uvoza i `fflate`-om; nijedan drugi fajl ga ne uvozi statički.
import { hasModifierKey } from '@angular/cdk/keycodes';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, ElementRef, ErrorHandler,
  inject, Injector, signal, untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { NavigationStart, Router } from '@angular/router';
import { filter, finalize, Observable, Subject, Subscription } from 'rxjs';

import { RegistarCuvanja, SesijaCuvanja } from '../../../core/state/registar-cuvanja';
import { NotificationStore } from '../../../core/state/notification.store';
import { kopirajTekst } from '../../../shared/util/kopiraj';
import { sRecju } from '../../../shared/util/mnozina';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { MAX_SLAJDOVA } from '../data-access/slajd-pravila';
import type { PrezentacijaDetails } from '../data-access/uzivo.models';
import { GreskaUvoza, PRIHVACENI_FAJLOVI, proveriImeFajla } from './ime-fajla';
import { GRANICE_PAKETA } from './paket';
import { izvestajKaoTekst, praznaStatistika, saberi, type Statistika, type Upozorenje } from './izvestaj';
import {
  GreskaSlanja, izaberiSlajdove, porukaVelicineTela, posaljiUvoz, velicinaTela, type IzborUvoza, type Napredak,
} from './slanje';
import { pretvoriPptx, type RezultatUvoza, type UvezenSlajd } from './uvoz';

/** Host atribut `data-oznaka` dijaloga: niz ostaje u lenjom chunk-u (e2e proverava da ga glavni bundle nema). */
export const OZNAKA_UVOZA = 'gfs-uvoz-pptx';

/**
 * Ishod zatvaranja kad je slanje imalo nepoznat ishod (server je možda upisao slajdove): pozivalac ponovo čita
 * prezentaciju (editor) ili listu (nova prezentacija). Isti niz je u `pages/uvoz-pptx-otvarac.ts` (bez uvoza ovog fajla).
 */
export const OSVEZI_PREZENTACIJU = 'osvezi';
/** Cela prezentacija posle uvoza, `OSVEZI_PREZENTACIJU`, ili `undefined` (otkazano, greška bez upisa). */
export type IshodUvoza = PrezentacijaDetails | typeof OSVEZI_PREZENTACIJU | undefined;

export interface UvozPptxPodaci {
  prezentacijaId: number;
  /** Slajdova u prezentaciji pre uvoza (granica 200). */
  brojSlajdova: number;
  /** Izabrani slajd u editoru: mesto "Posle slajda R"; `null` = samo na kraj. */
  izabraniId: number | null;
  izabraniRb: number | null;
  /** Fajl je već izabran (nova prezentacija iz PowerPointa): dijalog odmah kreće sa analizom. */
  fajl?: File | null;
  /** Prezentacija je upravo napravljena za ovaj uvoz: bez ijednog uvezenog slajda se briše. */
  nova?: boolean;
}

/**
 * Otvara dijalog uvoza; emituje {@link IshodUvoza}. `disableClose` je uvek uključen (klik van dijaloga ne gubi analizu), a
 * Escape ide kroz isti put kao dugmad stanja: pre slanja "Otkaži" (nova prezentacija se briše), tokom slanja ništa, u
 * izveštaju i grešci "Zatvori". `closeOnNavigation` CDK čita samo pri otvaranju, pa je isključen; "nazad" u pregledaču
 * (`popstate`) dijalog obrađuje sam kao Escape, a tokom slanja ga ignoriše, pa se slanje nikad ne prekida usred
 * `POST slajdovi/uvoz`.
 */
export function otvoriUvozPptx(dialog: MatDialog, podaci: UvozPptxPodaci): Observable<IshodUvoza> {
  return dialog.open<UvozPptxDialog, UvozPptxPodaci, Exclude<IshodUvoza, undefined>>(UvozPptxDialog, {
    data: podaci, width: '640px', maxWidth: '95vw', disableClose: true, closeOnNavigation: false,
    // fokus postavlja dijalog sam (i početni): CDK-ov autoFocus stiže tek posle animacije otvaranja i na sporom
    // računaru bi oteo fokus stanju koje je u međuvremenu već stiglo (brza analiza malog fajla)
    autoFocus: false,
  }).afterClosed();
}

type Faza = 'izbor' | 'analiza' | 'pregled' | 'slanje' | 'izvestaj' | 'greska';

interface Stavka { kljuc: string; slajd: number | null; poruka: string; greska: boolean; }

const PRVIH = 20;
const OTKAZANO = 'Uvoz je otkazan; nijedan slajd nije dodat.';
const NEOCEKIVANO_CITANJE = 'Fajl nije pročitan zbog neočekivane greške. Proveri da li se otvara u PowerPointu i pokušaj ponovo.';
const NEOCEKIVANO_SLANJE = 'Uvoz nije uspeo zbog neočekivane greške. Osveži prezentaciju pre novog pokušaja.';
const PREVELIK_FAJL = 'Fajl je veći od 500 MB. U PowerPointu komprimuj medije (Datoteka > Informacije) ili ga podeli, pa uvezi ponovo.';
const NEPOZNAT_ISHOD_NOVA = 'Server nije potvrdio uvoz. Slajdovi su možda ipak dodati u novu prezentaciju: proveri listu prezentacija pre novog pokušaja.';

const slajdova = (n: number) => sRecju(n, 'slajd', 'slajda', 'slajdova');
const animacija = (n: number) => sRecju(n, 'animacija', 'animacije', 'animacija');
const beleski = (n: number) => sRecju(n, 'beleška', 'beleške', 'beležaka');
const zbir = (m: Readonly<Record<string, number>>) => Object.values(m).reduce((a, b) => a + b, 0);
const ukupno = (slajdovi: readonly UvezenSlajd[]): Statistika =>
  slajdovi.reduce((a, s) => saberi(a, s.statistika), praznaStatistika());

/** Greške slajdova i upozorenja, redom slajdova (ceo fajl prvi); ista poruka za isti slajd jednom. */
function stavke(r: RezultatUvoza, u: (slajd: number | null) => boolean, dodatna: readonly Upozorenje[] = []): Stavka[] {
  const sve = [
    ...r.greske.filter(g => u(g.slajd)).map(g => ({ slajd: g.slajd as number | null, poruka: g.poruka, greska: true })),
    ...[...r.upozorenja.filter(x => u(x.slajd)), ...dodatna].map(x => ({ slajd: x.slajd, poruka: x.poruka, greska: false })),
  ];
  return sve
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.slajd ?? 0) - (b.s.slajd ?? 0) || a.i - b.i)
    .map(({ s, i }) => ({ ...s, kljuc: `${i}` }));
}

/** Makrotaska: zoneless raspored iscrta stanje pre sinhronog posla koji sledi (otvaranje zip-a). */
const sledeciTask = () => new Promise<void>(r => setTimeout(r));

/**
 * Uvoz iz PowerPointa: izbor fajla -> analiza u pregledaču (traka po slajdu) -> pregled (brojevi, greške i upozorenja,
 * opseg i mesto) -> slanje (slike pa slajdovi, sesija u `RegistarCuvanja`) -> izveštaj (kopiranje); greška u bilo kom
 * koraku ima svoje stanje. Fokus prelazi na glavni element svakog novog stanja; napredak je u `role="status"`.
 */
@Component({
  selector: 'app-uvoz-pptx-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule],
  host: { 'data-oznaka': OZNAKA_UVOZA, class: 'uz-uv' },
  template: `
    <h2 mat-dialog-title>Uvoz iz PowerPointa</h2>
    <mat-dialog-content class="uz-uv-telo">
      @switch (faza()) {
        @case ('izbor') {
          <div class="uz-uv-izbor" data-faza="izbor">
            <mat-icon class="uz-uv-izbor-ikona" aria-hidden="true" svgIcon="upload_file" />
            <input #polje class="uz-uv-fajl" type="file" [accept]="prihvaceniFajlovi" tabindex="-1" aria-hidden="true"
                   (change)="izabran(polje)">
            <button mat-flat-button type="button" data-fokus (click)="polje.click()">Izaberi .pptx fajl</button>
            <p class="uz-ed-napomena">Fajl se čita u tvom pregledaču; na server idu samo slike i gotovi slajdovi.</p>
          </div>
        }
        @case ('analiza') {
          <div class="uz-uv-napredak" data-faza="analiza">
            <p class="uz-uv-fajl-ime">{{ imeFajla() }}</p>
            @if (analiza(); as a) {
              <mat-progress-bar mode="determinate" [value]="a.uradjeno / a.ukupno * 100" aria-label="Čitanje fajla" />
            } @else {
              <mat-progress-bar mode="indeterminate" aria-label="Čitanje fajla" />
            }
            <p class="uz-uv-status" role="status" tabindex="-1" data-fokus>{{ tekstAnalize() }}</p>
          </div>
        }
        @case ('pregled') {
          @if (rezultat(); as r) {
            <div class="uz-uv-pregled" data-faza="pregled">
              <p class="uz-uv-fajl-ime">{{ r.imeFajla }}</p>
              <p class="uz-uv-zbir" tabindex="-1" data-fokus>{{ sazetak() }}</p>
              @if (r.ukupnoSlajdova !== r.slajdovi.length) {
                <p class="uz-ed-napomena">U fajlu je {{ slajdova(r.ukupnoSlajdova) }}; uvoze se samo oni koji su pročitani i nisu skriveni.</p>
              }
              @if (stavkePregleda().length) {
                <section class="uz-uv-odeljak" aria-labelledby="uz-uv-napomene">
                  <h3 class="uz-uv-naslov" id="uz-uv-napomene">{{ naslovListe(stavkePregleda()) }}</h3>
                  <ul class="uz-uv-lista">
                    @for (s of stavkePregleda().slice(0, prvih); track s.kljuc) {
                      <li class="uz-uv-stavka" [class.uz-uv-stavka--greska]="s.greska">
                        <span class="uz-uv-slajd">{{ s.slajd === null ? 'Ceo fajl' : 'Slajd ' + s.slajd }}</span>
                        <span>{{ s.poruka }}</span>
                      </li>
                    }
                  </ul>
                  @if (stavkePregleda().length > prvih) {
                    <p class="uz-ed-napomena">i još {{ stavkePregleda().length - prvih }} (sve su u izveštaju posle uvoza)</p>
                  }
                </section>
              }
              @if (r.slajdovi.length) {
                <div class="uz-uv-odeljak">
                  <span class="uz-uv-naslov" id="uz-uv-opseg">Slajdovi</span>
                  <mat-radio-group class="uz-ed-izbori" aria-labelledby="uz-uv-opseg" [value]="svi() ? 'svi' : 'deo'"
                                   (change)="svi.set($event.value === 'svi')">
                    <mat-radio-button value="svi">Svi slajdovi</mat-radio-button>
                    <mat-radio-button value="deo">Od - do</mat-radio-button>
                  </mat-radio-group>
                  @if (!svi()) {
                    <div class="uz-uv-opseg">
                      <mat-form-field subscriptSizing="dynamic">
                        <mat-label>Od</mat-label>
                        <input matInput type="number" aria-label="Od slajda" [min]="granice().od" [max]="granice().do" step="1"
                               [value]="od()" (input)="od.set(broj(poljeOd))" #poljeOd>
                      </mat-form-field>
                      <mat-form-field subscriptSizing="dynamic">
                        <mat-label>Do</mat-label>
                        <input matInput type="number" aria-label="Do slajda" [min]="granice().od" [max]="granice().do" step="1"
                               [value]="do()" (input)="do.set(broj(poljeDo))" #poljeDo>
                      </mat-form-field>
                      <span class="uz-ed-napomena">redni brojevi u PowerPointu, {{ granice().od }}-{{ granice().do }}</span>
                    </div>
                  }
                </div>
                @if (data.izabraniId !== null && data.izabraniRb !== null) {
                  <div class="uz-uv-odeljak">
                    <span class="uz-uv-naslov" id="uz-uv-mesto">Mesto</span>
                    <mat-radio-group class="uz-ed-izbori" aria-labelledby="uz-uv-mesto" [value]="mesto()" (change)="mesto.set($event.value)">
                      <mat-radio-button value="posle">Posle slajda {{ data.izabraniRb }}</mat-radio-button>
                      <mat-radio-button value="kraj">Na kraj</mat-radio-button>
                    </mat-radio-group>
                  </div>
                } @else if (data.brojSlajdova > 0) {
                  <p class="uz-ed-napomena">Slajdovi se dodaju na kraj prezentacije.</p>
                }
              }
              @if (prepreka(); as p) {
                <p class="uz-uv-prepreka" id="uz-uv-prepreka">{{ p }}</p>
              } @else {
                <p class="uz-ed-napomena">Uvozi se: {{ slajdova(izabrani().length) }}.</p>
              }
            </div>
          }
        }
        @case ('slanje') {
          <div class="uz-uv-napredak" data-faza="slanje">
            @if (slanje(); as n) {
              @if (n.faza === 'slike') {
                <mat-progress-bar mode="determinate" [value]="n.ukupno ? n.poslato / n.ukupno * 100 : 100" aria-label="Slanje slika" />
              } @else {
                <mat-progress-bar mode="indeterminate" aria-label="Pravljenje slajdova" />
              }
            } @else {
              <mat-progress-bar mode="indeterminate" aria-label="Priprema slika" />
            }
            <p class="uz-uv-status" role="status" tabindex="-1" data-fokus>{{ tekstSlanja() }}</p>
            <p class="uz-ed-napomena">Ne zatvaraj karticu dok uvoz traje.</p>
          </div>
        }
        @case ('izvestaj') {
          @if (izvestaj(); as iz) {
            <div class="uz-uv-izvestaj" data-faza="izvestaj">
              <p class="uz-uv-zbir uz-uv-zbir--uspeh" tabindex="-1" data-fokus>
                <mat-icon aria-hidden="true" svgIcon="check_circle" />Uvezeno slajdova: {{ iz.slajdova }}
              </p>
              <p>Slojevi: {{ iz.slojevi }} · Animacije: {{ iz.animacije }} (koraci: {{ iz.koraci }}) · Beleške: {{ iz.beleske }}</p>
              @if (iz.stavke.length) {
                <section class="uz-uv-odeljak" aria-labelledby="uz-uv-upozorenja">
                  <h3 class="uz-uv-naslov" id="uz-uv-upozorenja">{{ naslovListe(iz.stavke) }}</h3>
                  <ul class="uz-uv-lista">
                    @for (s of iz.stavke; track s.kljuc) {
                      <li class="uz-uv-stavka" [class.uz-uv-stavka--greska]="s.greska">
                        <span class="uz-uv-slajd">{{ s.slajd === null ? 'Ceo fajl' : 'Slajd ' + s.slajd }}</span>
                        <span>{{ s.poruka }}</span>
                      </li>
                    }
                  </ul>
                </section>
              } @else {
                <p class="uz-ed-napomena">Bez upozorenja.</p>
              }
              @if (tekstIzvestaja(); as t) {
                <mat-form-field class="uz-uv-tekst">
                  <mat-label>Tekst izveštaja</mat-label>
                  <textarea matInput readonly rows="8" [value]="t" #tekstPolje></textarea>
                  <mat-hint>Kopiranje nije dozvoljeno; tekst je izabran, kopiraj ga sa Ctrl+C.</mat-hint>
                </mat-form-field>
              }
            </div>
          }
        }
        @case ('greska') {
          @if (greska(); as g) {
            <div class="uz-uv-greska" data-faza="greska">
              <p class="uz-uv-poruka" role="alert">
                <mat-icon aria-hidden="true" svgIcon="error" />
                <span>{{ g.poruka }}</span>
              </p>
              @if (brisanje()) {
                <mat-progress-bar mode="indeterminate" aria-label="Brisanje prazne prezentacije" />
              }
            </div>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @switch (faza()) {
        @case ('pregled') {
          <button mat-button type="button" (click)="otkazi()">Otkaži</button>
          <button mat-flat-button type="button" [disabled]="!!prepreka()"
                  [attr.aria-describedby]="prepreka() ? 'uz-uv-prepreka' : null" (click)="uvezi()">Uvezi</button>
        }
        @case ('slanje') {
          <button mat-button type="button" [disabled]="slanje()?.faza === 'slajdovi'" (click)="otkaziSlanje()">Otkaži</button>
        }
        @case ('izvestaj') {
          <button mat-button type="button" (click)="kopiraj()"><mat-icon svgIcon="content_copy" />Kopiraj izveštaj</button>
          <button mat-flat-button type="button" (click)="zatvori()">{{ data.nova ? 'Otvori prezentaciju' : 'Zatvori' }}</button>
        }
        @case ('greska') {
          <!-- poruka je role="alert" (najavljuje se sama); fokus ide na prvu akciju -->
          @if (greska()?.ponovo === 'pregled') {
            <button mat-button type="button" data-fokus (click)="nazadNaPregled()">Pokušaj ponovo</button>
          } @else if (greska()?.ponovo === 'izbor') {
            <button mat-button type="button" data-fokus (click)="faza.set('izbor')">Izaberi drugi fajl</button>
          }
          <button mat-flat-button type="button" data-fokus [disabled]="brisanje()" disabledInteractive (click)="zatvori()">Zatvori</button>
        }
        @default {
          <button mat-button type="button" (click)="otkazi()">Otkaži</button>
        }
      }
    </mat-dialog-actions>
  `,
})
export class UvozPptxDialog {
  protected readonly data = inject<UvozPptxPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UvozPptxDialog, Exclude<IshodUvoza, undefined>>>(MatDialogRef);
  private readonly api = inject(PrezentacijeApi);
  private readonly registar = inject(RegistarCuvanja);
  private readonly obavestenja = inject(NotificationStore);
  private readonly greske = inject(ErrorHandler);
  private readonly dokument = inject(DOCUMENT);
  private readonly koren = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly prvih = PRVIH;
  protected readonly prihvaceniFajlovi = PRIHVACENI_FAJLOVI;
  protected readonly slajdova = slajdova;
  protected readonly faza = signal<Faza>('izbor');
  protected readonly imeFajla = signal('');
  protected readonly analiza = signal<{ uradjeno: number; ukupno: number } | null>(null);
  protected readonly rezultat = signal<RezultatUvoza | null>(null);
  protected readonly svi = signal(true);
  protected readonly od = signal(1);
  protected readonly do = signal(1);
  protected readonly mesto = signal<'posle' | 'kraj'>(this.data.izabraniId !== null ? 'posle' : 'kraj');
  protected readonly slanje = signal<Napredak | null>(null);
  protected readonly greska = signal<{ poruka: string; ponovo: 'pregled' | 'izbor' | null } | null>(null);
  protected readonly brisanje = signal(false);
  protected readonly tekstIzvestaja = signal<string | null>(null);
  private readonly ishod = signal<{ prezentacija: PrezentacijaDetails; upozorenja: Upozorenje[]; izbor: IzborUvoza } | null>(null);

  private prekidAnalize: AbortController | null = null;
  private pretplataSlanja: Subscription | null = null;
  private obrisana = false;
  /** Slanje je završeno sa nepoznatim ishodom: zatvaranje traži osvežavanje (`OSVEZI_PREZENTACIJU`). */
  private nepoznatIshod = false;

  /** Redni brojevi uvezenih slajdova (PowerPoint): granice opsega "Od - do". */
  protected readonly granice = computed(() => {
    const ind = this.rezultat()?.slajdovi.map(s => s.indeks) ?? [];
    return ind.length ? { od: Math.min(...ind), do: Math.max(...ind) } : { od: 1, do: 1 };
  });
  private readonly izbor = computed<IzborUvoza>(() => {
    const g = this.granice();
    return {
      od: this.svi() ? g.od : this.od(), do: this.svi() ? g.do : this.do(),
      posle: this.mesto() === 'posle' ? this.data.izabraniId : null,
    };
  });
  protected readonly izabrani = computed(() => {
    const r = this.rezultat();
    return r ? izaberiSlajdove(r, this.izbor()) : [];
  });
  /** Zašto "Uvezi" nije moguće (prikazuje se ispod izbora), ili `null`. */
  protected readonly prepreka = computed(() => {
    const r = this.rezultat();
    if (!r?.slajdovi.length) return 'U fajlu nema nijednog slajda koji može da se uveze.';
    const { od, do: doS, posle } = this.izbor();
    if (!Number.isInteger(od) || !Number.isInteger(doS)) {
      return `Upiši ceo broj od ${this.granice().od} do ${this.granice().do} u oba polja.`;
    }
    const n = this.izabrani().length;
    if (n === 0) return 'Izabrani opseg nema nijedan slajd.';
    if (this.data.brojSlajdova + n > MAX_SLAJDOVA) {
      return `Prezentacija bi imala više od ${MAX_SLAJDOVA} slajdova (ima ${this.data.brojSlajdova}, uvozi se ${n}). Izaberi manji opseg.`;
    }
    return porukaVelicineTela(velicinaTela(this.izabrani(), posle));
  });
  protected readonly sazetak = computed(() => {
    const r = this.rezultat();
    if (!r) return '';
    const s = ukupno(r.slajdovi);
    return `${slajdova(r.slajdovi.length)} · ${animacija(zbir(s.animacije))} · ${beleski(s.beleske)}`;
  });
  protected readonly stavkePregleda = computed(() => {
    const r = this.rezultat();
    return r ? stavke(r, () => true) : [];
  });
  protected readonly tekstAnalize = computed(() => {
    const a = this.analiza();
    return a ? `Čitam slajd ${Math.min(a.uradjeno + 1, a.ukupno)} od ${a.ukupno}` : 'Otvaram fajl…';
  });
  protected readonly tekstSlanja = computed(() => {
    const n = this.slanje();
    if (!n) return 'Pripremam slike…';
    return n.faza === 'slike' ? `Slike ${n.poslato} od ${n.ukupno}` : 'Pravim slajdove…';
  });
  protected readonly izvestaj = computed(() => {
    const r = this.rezultat();
    const i = this.ishod();
    if (!r || !i) return null;
    const uvezeni = izaberiSlajdove(r, i.izbor);
    const s = ukupno(uvezeni);
    return {
      slajdova: uvezeni.length, slojevi: zbir(s.slojevi), animacije: zbir(s.animacije), koraci: s.koraci, beleske: s.beleske,
      stavke: stavke(r, x => x === null || (x >= i.izbor.od && x <= i.izbor.do), i.upozorenja),
    };
  });

  constructor() {
    // Escape i navigacija (dijalog je disableClose i ne zatvara se navigacijom): isti put kao dugmad, nikad usred slanja.
    this.ref.keydownEvents().pipe(filter(e => e.key === 'Escape' && !hasModifierKey(e)), takeUntilDestroyed())
      .subscribe(e => {
        e.preventDefault();
        this.izlaz();
      });
    // samo "nazad/napred" u pregledaču: modal blokira klikove, a programska ili guard-om otkazana navigacija ne otkazuje uvoz
    inject(Router).events.pipe(
      filter((e): e is NavigationStart => e instanceof NavigationStart && e.navigationTrigger === 'popstate'),
      takeUntilDestroyed(),
    ).subscribe(() => this.izlaz());
    inject(DestroyRef).onDestroy(() => {
      this.prekidAnalize?.abort();
      this.pretplataSlanja?.unsubscribe();
    });

    // fokus na glavni element novog stanja (dugme koje je imalo fokus nestaje), i na početni izbor
    effect(() => {
      this.faza();
      untracked(() => afterNextRender(() => this.fokusiraj(), { injector: this.injector }));
    });

    if (this.data.fajl) void this.analiziraj(this.data.fajl);
  }

  protected broj(polje: HTMLInputElement): number {
    return polje.value.trim() === '' ? Number.NaN : Number(polje.value);
  }

  protected izabran(polje: HTMLInputElement): void {
    const f = polje.files?.[0];
    polje.value = '';
    if (f) void this.analiziraj(f);
  }

  private async analiziraj(f: File): Promise<void> {
    this.imeFajla.set(f.name);
    const poruka = proveriImeFajla(f.name);
    if (poruka) {
      this.neuspeh(poruka, 'izbor');
      return;
    }
    if (f.size > GRANICE_PAKETA.fajl) {
      this.neuspeh(PREVELIK_FAJL, 'izbor');
      return;
    }
    this.analiza.set(null);
    this.rezultat.set(null);
    this.faza.set('analiza');
    const prekid = new AbortController();
    this.prekidAnalize = prekid;
    try {
      await sledeciTask();
      if (prekid.signal.aborted) return;
      const bajtovi = new Uint8Array(await f.arrayBuffer());
      if (prekid.signal.aborted) return;
      const r = await pretvoriPptx(bajtovi, f.name, {
        napredak: (uradjeno, ukupno) => this.analiza.set({ uradjeno, ukupno }), prekid: prekid.signal,
      });
      if (prekid.signal.aborted) return;
      const ind = r.slajdovi.map(s => s.indeks);
      this.od.set(ind.length ? Math.min(...ind) : 1);
      this.do.set(ind.length ? Math.max(...ind) : 1);
      this.svi.set(true);
      this.rezultat.set(r);
      this.faza.set('pregled');
    } catch (e) {
      if (prekid.signal.aborted) return;
      if (!(e instanceof GreskaUvoza)) this.greske.handleError(e);
      this.neuspeh(e instanceof GreskaUvoza ? e.message : NEOCEKIVANO_CITANJE, 'izbor');
    } finally {
      if (this.prekidAnalize === prekid) this.prekidAnalize = null;
    }
  }

  protected uvezi(): void {
    const r = this.rezultat();
    if (!r || this.faza() !== 'pregled' || this.prepreka()) return;
    const izbor = this.izbor();
    this.slanje.set(null);
    this.tekstIzvestaja.set(null);
    this.faza.set('slanje');

    const mirovanje = new Subject<void>();
    const sesija: SesijaCuvanja & { uToku: number } = {
      kljuc: `uvoz-${this.data.prezentacijaId}`, uToku: 1, mirovanje, nesacuvano: () => sesija.uToku,
    };
    this.registar.prijavi(sesija);
    this.pretplataSlanja = posaljiUvoz(this.data.prezentacijaId, r, izbor, { api: this.api }, n => this.slanje.set(n)).pipe(
      finalize(() => {
        sesija.uToku = 0;
        this.registar.odjavi(sesija);
        mirovanje.next();
        mirovanje.complete();
      }),
    ).subscribe({
      next: ({ prezentacija, upozorenja }) => {
        this.ishod.set({ prezentacija, upozorenja, izbor });
        this.faza.set('izvestaj');
      },
      error: (e: unknown) => {
        if (!(e instanceof GreskaSlanja)) this.greske.handleError(e);
        if (e instanceof GreskaSlanja && e.nepoznatIshod) {
          // slajdovi su možda upisani: bez ponovnog pokušaja i bez brisanja nove prezentacije; zatvaranje traži osvežavanje
          this.nepoznatIshod = true;
          this.faza.set('greska');
          this.greska.set({ poruka: this.data.nova ? NEPOZNAT_ISHOD_NOVA : e.message, ponovo: null });
          return;
        }
        this.neuspeh(e instanceof GreskaSlanja ? e.message : NEOCEKIVANO_SLANJE, 'pregled');
      },
    });
  }

  /** "Otkaži" tokom slanja slika: odjava prekida slike u toku i `uvezi` se ne šalje. */
  protected otkaziSlanje(): void {
    if (this.faza() !== 'slanje' || this.slanje()?.faza === 'slajdovi') return;
    this.pretplataSlanja?.unsubscribe();
    this.pretplataSlanja = null;
    this.neuspeh(OTKAZANO, 'pregled');
  }

  /** "Otkaži" pre slanja: nova prezentacija se briše (uz poruku), inače se dijalog zatvara. */
  protected otkazi(): void {
    this.prekidAnalize?.abort();
    this.prekidAnalize = null;
    if (this.data.nova) this.neuspeh(OTKAZANO, null);
    else this.ref.close(undefined);
  }

  protected nazadNaPregled(): void {
    this.greska.set(null);
    this.faza.set('pregled');
  }

  protected zatvori(): void {
    if (this.brisanje()) return;
    if (this.faza() === 'izvestaj') this.ref.close(this.ishod()?.prezentacija);
    else this.ref.close(this.nepoznatIshod ? OSVEZI_PREZENTACIJU : undefined);
  }

  protected naslovListe(lista: readonly Stavka[]): string {
    return `${lista.some(x => x.greska) ? 'Greške i upozorenja' : 'Upozorenja'} (${lista.length})`;
  }

  protected async kopiraj(): Promise<void> {
    const r = this.rezultat();
    const i = this.ishod();
    if (!r || !i) return;
    const tekst = izvestajKaoTekst(r, { od: i.izbor.od, do: i.izbor.do }, i.upozorenja);
    if (await kopirajTekst(tekst, this.dokument)) {
      this.tekstIzvestaja.set(null);
      this.obavestenja.uspeh('Izveštaj je kopiran.');
      return;
    }
    this.tekstIzvestaja.set(tekst);
    afterNextRender(() => {
      const polje = this.koren.nativeElement.querySelector<HTMLTextAreaElement>('textarea[readonly]');
      polje?.focus();
      polje?.select();
    }, { injector: this.injector });
  }

  /** Escape ili navigacija: kao "Otkaži"/"Zatvori" trenutnog stanja; tokom slanja ništa. */
  private izlaz(): void {
    const f = this.faza();
    if (f === 'slanje') return;
    if (f === 'izvestaj' || f === 'greska') this.zatvori();
    else this.otkazi();
  }

  /**
   * Stanje greške. Nova prezentacija bez ijednog uvezenog slajda se briše jednom (poruka se dopunjuje ishodom brisanja),
   * pa se ne nudi ni ponovni pokušaj ni drugi fajl.
   */
  private neuspeh(poruka: string, ponovo: 'pregled' | 'izbor' | null): void {
    this.faza.set('greska');
    if (!this.data.nova) {
      this.greska.set({ poruka, ponovo });
      return;
    }
    this.greska.set({ poruka, ponovo: null });
    if (this.obrisana) return;
    this.obrisana = true;
    this.brisanje.set(true);
    const kraj = (dodatak: string) => {
      this.brisanje.set(false);
      this.greska.set({ poruka: `${poruka}${dodatak}`, ponovo: null });
    };
    this.api.obrisi(this.data.prezentacijaId).subscribe({
      complete: () => kraj(' Prazna prezentacija je obrisana.'),
      error: () => kraj(' Praznu prezentaciju obriši ručno.'),
    });
  }

  private fokusiraj(): void {
    this.koren.nativeElement.querySelector<HTMLElement>('[data-fokus]')?.focus();
  }
}
