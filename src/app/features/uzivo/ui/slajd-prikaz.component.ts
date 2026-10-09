import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, viewChild } from '@angular/core';
import { ServerskiSat } from '../data-access/sat';
import { Faza, Rezultat, SlajdDetails, medijUrl } from '../data-access/uzivo.models';
import { kodSaRazmakom } from './format';
import { renderMarkdown } from './markdown';
import { PitanjePlociceComponent } from './pitanje-plocice.component';
import { RezultatPrikazComponent } from './rezultat-prikaz.component';
import { TajmerComponent } from './tajmer.component';

export interface TajmerUlaz { rokMs: number | null; preostaloMs: number | null; sat: ServerskiSat; }
export interface KodTraka { host: string; kod: string; }

/**
 * Slajd na 16:9 platnu — ista komponenta za projektor, umanjeni prikaz u konzoli i pregled u editoru. Domaćin je
 * `container-type: inline-size`, pa su sve veličine u `cqw` i slajd izgleda isto u svakoj širini; širinu daje roditelj.
 * INFO: naslov, Markdown, slika; uz `postepeno` su sakrivene stavke liste najvišeg nivoa sa indeksom ≥ `korak`.
 * PITANJE: tekst, slika, pločice opcija, tajmer i broj odgovora; uz `prikaziRezultat` rezultati zauzimaju mesto pločica.
 */
@Component({
  selector: 'app-slajd-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PitanjePlociceComponent, RezultatPrikazComponent, TajmerComponent],
  host: { class: 'uz-okvir' },
  template: `
    <article class="uz-platno uz-slajd" [class.uz-slajd--pitanje]="slajd().tip === 'PITANJE'">
      @if (slajd().tip === 'INFO') {
        @if (slajd().naslov) { <h1 class="uz-slajd-naslov">{{ slajd().naslov }}</h1> }
        <div class="uz-slajd-telo" [class.uz-slajd-telo--dve]="!!html() && !!slajd().slika">
          @if (html()) { <div #sadrzaj class="uz-md uz-slajd-md" [innerHTML]="html()"></div> }
          @if (slajd().slika; as slika) { <img class="uz-slajd-slika" [src]="url(slika.id)" [alt]="slika.naziv"> }
        </div>
      } @else if (slajd().pitanje; as p) {
        <header class="uz-pitanje-zaglavlje">
          <div class="uz-md uz-pitanje-tekst" [innerHTML]="pitanjeHtml()"></div>
          @if (aktivanTajmer(); as t) {
            <app-tajmer class="uz-slajd-tajmer" [rokMs]="t.rokMs" [preostaloMs]="t.preostaloMs" [sat]="t.sat"
                        [ukupnoMs]="p.vremeSekunde ? p.vremeSekunde * 1000 : null" />
          }
        </header>
        <div class="uz-pitanje-telo" [class.uz-pitanje-telo--slika]="!!p.slika && !prikazanRezultat()">
          @if (prikazanRezultat(); as r) {
            <app-rezultat-prikaz class="uz-slajd-rezultat" [rezultat]="r" [tekstPrikaz]="p.tekstPrikaz" [jedinica]="p.jedinica" />
          } @else {
            @if (p.slika; as slika) { <img class="uz-slajd-slika" [src]="url(slika.id)" [alt]="slika.naziv"> }
            <app-pitanje-plocice [pitanje]="p" [tacne]="tacne()" />
          }
        </div>
      }
      @if (kodTraka() || slajd().tip === 'PITANJE') {
        <footer class="uz-slajd-podnozje">
          @if (kodTraka(); as t) {
            <span class="uz-kod-traka">{{ t.host }}/uzivo · kod <strong>{{ kod(t.kod) }}</strong></span>
          }
          <span class="uz-slajd-status">
            @if (faza() === 'ZATVORENO') { <span class="uz-cip uz-cip--zatvoreno">Zatvoreno</span> }
            @if (brojOdgovora() !== null) { <span class="uz-slajd-odgovori">Odgovora: <strong>{{ brojOdgovora() }}</strong></span> }
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
  readonly tajmer = input<TajmerUlaz | null>(null);
  readonly kodTraka = input<KodTraka | null>(null);

  private readonly sadrzaj = viewChild<ElementRef<HTMLElement>>('sadrzaj');

  protected readonly url = medijUrl;
  protected readonly kod = kodSaRazmakom;
  protected readonly html = computed(() => (this.slajd().tip === 'INFO' ? renderMarkdown(this.slajd().sadrzaj) : ''));
  protected readonly pitanjeHtml = computed(() => renderMarkdown(this.slajd().pitanje?.tekst));
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
