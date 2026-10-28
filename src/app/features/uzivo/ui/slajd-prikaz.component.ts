import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, viewChild } from '@angular/core';
import { ServerskiSat } from '../data-access/sat';
import { Faza, NastavnickiZadatak, Rezultat, SlajdDetails, Tema, medijUrl } from '../data-access/uzivo.models';
import { kodSaRazmakom } from './format';
import { meriFormule } from './mera-formule';
import { renderMarkdown } from './markdown';
import { PitanjePlociceComponent } from './pitanje-plocice.component';
import { PlatnoPrikazComponent } from './platno-prikaz.component';
import { RezultatPrikazComponent } from './rezultat-prikaz.component';
import { TajmerComponent } from './tajmer.component';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';
import { promenljiveTeme, tamnaTema, vazecaTema } from './teme';
import { ZadatakPrikazComponent } from './zadatak-prikaz.component';

export interface TajmerUlaz { rokMs: number | null; preostaloMs: number | null; sat: ServerskiSat; }
export interface KodTraka { host: string; kod: string; }

/**
 * Slajd na 16:9 platnu — ista komponenta za projektor, umanjeni prikaz u konzoli i pregled u editoru. Domaćin je
 * `container-type: inline-size`, pa su sve veličine u `cqw` i slajd izgleda isto u svakoj širini; širinu daje roditelj.
 * INFO: naslov, Markdown, slika; uz `postepeno` su sakrivene stavke liste najvišeg nivoa sa indeksom ≥ `korak`.
 * PITANJE: tekst, slika, pločice opcija, tajmer i broj odgovora; uz `prikaziRezultat` rezultati zauzimaju mesto pločica.
 * Tekst pitanja i opcija može imati formule `$...$` (`app-tekst-formule`); INFO ih ne tumači.
 * ZADATAK: `app-zadatak-prikaz` (uputstvo po fazi, tajmer i broj odgovora, a uz `javniRezultat` mreža rezultata po
 * varijanti; bez stanja izvođenja, npr. pregled u editoru, statična kartica "Zadatak", naziv grupe i broj različitih).
 * PLATNO: `app-platno-prikaz` preko celog okvira (slojevi posle koraka `korak`, animacija prelaza `animacija`), bez
 * trake "host/uzivo · kod" (pokrila bi sadržaj uvezenog slajda; kasni studenti imaju QR).
 * Tema prezentacije: CSS promenljive `--uz-tema-*` na korenu `uz-platno` (pozadina, tekst, naslov, fontovi INFO i
 * PITANJE); kod tamne teme sadržaj dobija noćne tokene (`rezim-noc`), pa pločice i rezultati ostaju čitljivi.
 */
@Component({
  selector: 'app-slajd-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [
    PitanjePlociceComponent, PlatnoPrikazComponent, RezultatPrikazComponent, TajmerComponent, TekstFormuleComponent,
    ZadatakPrikazComponent,
  ],
  host: { class: 'uz-okvir' },
  template: `
    <article class="uz-platno uz-slajd" [class.uz-slajd--pitanje]="slajd().tip === 'PITANJE'" [class.rezim-noc]="tamna()"
             [style]="promenljive()">
      <!-- Nova instanca platna po slajdu (track id): animacija koja traje nikad ne prelazi na drugi slajd. -->
      @for (sl of platnoNiz(); track sl.id) {
        <app-platno-prikaz [platno]="sl.platno" [korak]="korak()" [animacija]="animacija()" />
      }
      @if (slajd().tip === 'INFO') {
        @if (slajd().naslov) { <h1 class="uz-slajd-naslov">{{ slajd().naslov }}</h1> }
        <div class="uz-slajd-telo" [class.uz-slajd-telo--dve]="!!html() && !!slajd().slika">
          @if (html()) { <div #sadrzaj class="uz-md uz-slajd-md" [innerHTML]="html()"></div> }
          @if (slajd().slika; as slika) { <img class="uz-slajd-slika" [src]="url(slika.id)" [alt]="slika.naziv"> }
        </div>
      } @else if (slajd().tip === 'ZADATAK') {
        <app-zadatak-prikaz [slajd]="slajd()" [zadatak]="zadatak()" [faza]="faza()" [brojOdgovora]="brojOdgovora()"
                            [odgovoriliOd]="odgovoriliOd()" [prikaziRezultat]="prikaziRezultat()" [tajmer]="tajmer()" />
      } @else if (slajd().pitanje; as p) {
        <header class="uz-pitanje-zaglavlje">
          <app-tekst-formule class="uz-md uz-pitanje-tekst" [tekst]="p.tekst" [markdown]="true" />
          @if (aktivanTajmer(); as t) {
            <app-tajmer class="uz-slajd-tajmer" [rokMs]="t.rokMs" [preostaloMs]="t.preostaloMs" [sat]="t.sat"
                        [ukupnoMs]="p.vremeSekunde ? p.vremeSekunde * 1000 : null" />
          }
        </header>
        <div class="uz-pitanje-telo" [class.uz-pitanje-telo--slika]="!!p.slika && !prikazanRezultat()">
          @if (prikazanRezultat(); as r) {
            <app-rezultat-prikaz class="uz-slajd-rezultat" [rezultat]="r" [pitanje]="p" />
          } @else {
            @if (p.slika; as slika) { <img class="uz-slajd-slika" [src]="url(slika.id)" [alt]="slika.naziv"> }
            <app-pitanje-plocice [pitanje]="p" [tacne]="tacne()" />
          }
        </div>
      }
      @if (traka() || slajd().tip === 'PITANJE') {
        <footer class="uz-slajd-podnozje">
          @if (traka(); as t) {
            <span class="uz-kod-traka">{{ t.host }}/uzivo · kod <strong>{{ kod(t.kod) }}</strong></span>
          }
          <span class="uz-slajd-status">
            @if (faza() === 'ZATVORENO') { <span class="uz-cip uz-cip--zatvoreno">Zatvoreno</span> }
            @if (brojOdgovora() !== null && slajd().tip !== 'ZADATAK') { <span class="uz-slajd-odgovori">Odgovora: <strong>{{ brojOdgovora() }}</strong></span> }
          </span>
        </footer>
      }
    </article>
  `,
})
export class SlajdPrikazComponent {
  readonly slajd = input.required<SlajdDetails>();
  /** Broj otkrivenih stavki liste (INFO sa postepenim otkrivanjem). */
  readonly korak = input<number>(0);
  readonly postepeno = input<boolean>(false);
  readonly faza = input<Faza | null>(null);
  readonly rezultat = input<Rezultat | null>(null);
  readonly prikaziRezultat = input<boolean>(false);
  readonly tacanPrikazan = input<boolean>(false);
  readonly brojOdgovora = input<number | null>(null);
  /** Zadatak slajd: imenilac "Odgovorilo x od y" (`null` bez runde). */
  readonly odgovoriliOd = input<number | null>(null);
  /** Nastavnički snimak Zadatak slajda (samo ZADATAK sa stanjem izvođenja); projektor iz njega čita samo `javniRezultat`. */
  readonly zadatak = input<NastavnickiZadatak | null>(null);
  readonly tajmer = input<TajmerUlaz | null>(null);
  readonly kodTraka = input<KodTraka | null>(null);
  /** Tema prezentacije (snimak bez teme, npr. stari server, daje NACRT). */
  readonly tema = input<Tema>('NACRT');
  /** Animacija prelaza za PLATNO (vidi `app-platno-prikaz`); null crta krajnje stanje koraka. */
  readonly animacija = input<{ kljuc: number; grupa: number } | null>(null);

  private readonly sadrzaj = viewChild<ElementRef<HTMLElement>>('sadrzaj');

  protected readonly url = medijUrl;
  private readonly vazeca = computed(() => vazecaTema(this.tema()));
  protected readonly promenljive = computed(() => promenljiveTeme(this.vazeca()));
  protected readonly tamna = computed(() => tamnaTema(this.vazeca()));
  /** [slajd] za PLATNO sa dokumentom, inače prazno; `track id` u šablonu daje novu instancu platna po slajdu. */
  protected readonly platnoNiz = computed(() => {
    const s = this.slajd();
    return s.tip === 'PLATNO' && s.platno ? [{ id: s.id, platno: s.platno }] : [];
  });
  protected readonly traka = computed(() => (this.slajd().tip === 'PLATNO' ? null : this.kodTraka()));
  protected readonly kod = kodSaRazmakom;
  protected readonly html = computed(() => (this.slajd().tip === 'INFO' ? renderMarkdown(this.slajd().sadrzaj) : ''));
  protected readonly prikazanRezultat = computed(() => (this.prikaziRezultat() ? this.rezultat() : null));
  protected readonly aktivanTajmer = computed(() => {
    const t = this.tajmer();
    return t && (t.rokMs !== null || t.preostaloMs !== null) ? t : null;
  });
  /** Id-jevi tačnih opcija kad je tačan odgovor prikazan (za broj i tekst prazan niz, vidi `app-pitanje-plocice`). */
  protected readonly tacne = computed(() => {
    const p = this.slajd().pitanje;
    if (!p || !this.tacanPrikazan()) {
      return null;
    }
    return p.opcije.filter(o => o.tacna).map(o => o.id);
  });

  constructor() {
    // Postepeno otkrivanje: posle svakog crtanja sakrij (visibility, da se raspored ne pomera) stavke liste najvišeg
    // nivoa od indeksa `korak` nadalje. Brojanje odgovara `brojStavki` na serveru (redovi liste bez uvlačenja).
    afterRenderEffect({
      write: () => {
        const el = this.sadrzaj()?.nativeElement;
        this.html();
        const sakrivaj = this.postepeno();
        const korak = this.korak();
        if (!el) {
          return;
        }
        el.querySelectorAll<HTMLElement>(':scope > ul > li, :scope > ol > li').forEach((li, i) => {
          li.style.visibility = sakrivaj && i >= korak ? 'hidden' : '';
        });
      },
    });
  }
}
