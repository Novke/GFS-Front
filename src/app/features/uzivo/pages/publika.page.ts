import { ChangeDetectionStrategy, Component, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';
import { ispravanIndeks } from '../data-access/izvodjenje-pravila';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { TasterAkcija } from '../tastatura';
import { PROZOR_KONZOLE, PROZOR_PUBLIKE, otvoriIliFokusiraj } from '../ui/monitor';
import { otvoriPomoc } from './pomoc-precice.dialog';
import { TastaturaIzvodjenja, prebaciCeoEkran } from './precice';
import { PublikaScenaComponent } from './publika-scena.component';

/** Drugi `R` u ovom roku ponavlja pitanje. */
const PONOVI_ROK_MS = 2000;

/**
 * Šta scena prikazuje: aktivno izvođenje uvek svoj snimak; posle "Završi" ostaje poslednji prikaz KRAJ (postolje ili
 * "Hvala!"), da pobednici ne nestanu sa platna (bez čuvanja server do tada obriše i učesnike). Završeno izvođenje
 * otvoreno iz nekog drugog prikaza (ili tek učitano) nema scenu.
 */
export function scenaPosle(s: NastavnickoStanje | null, prethodna: NastavnickoStanje | null): NastavnickoStanje | null {
  if (!s) return null;
  if (s.izvodjenje.status !== 'ZAVRSENO') return s;
  return prethodna?.prikaz === 'KRAJ' && prethodna.izvodjenje.id === s.izvodjenje.id ? prethodna : null;
}

/**
 * Prikaz za publiku (spec 6.4): ceo prozor, scena 16:9 centrirana sa crnim ivicama (letterbox), uvek dnevne boje.
 * Vodi se tastaturom ili daljinskim (iste prečice kao konzola); komande koje u ovoj fazi ne važe se tiho preskaču, da
 * projektor ne prikazuje greške. Indikator veze u uglu samo dok veza nije uspostavljena (i samo kad ima stanja: za
 * nepostojeće izvođenje se veza i ne otvara).
 */
@Component({
  selector: 'app-publika',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [IzvodjenjeStore],
  imports: [PublikaScenaComponent],
  host: {
    class: 'uz-pub',
    lang: 'sr-Latn',
    '[class.uz-pub--beo]': 'store.stanje()?.ekran === "BEO"',
    '(document:keydown)': 'tastatura($event)',
    '(document:keyup)': 'tast.pusten($event)',
  },
  template: `
    @if (store.stanje()) {
      @if (scena(); as sc) {
        <app-publika-scena class="uz-pub-scena" [stanje]="sc" [joinLink]="store.joinLink()" [sat]="store.sat()" />
      } @else {
        <div class="uz-pub-poruka rezim-dan uz-dan"><p>Izvođenje je završeno. Hvala!</p></div>
      }
    } @else if (store.greska(); as g) {
      <div class="uz-pub-poruka rezim-dan uz-dan" role="alert"><p>{{ g }}</p></div>
    } @else {
      <div class="uz-pub-poruka rezim-dan uz-dan" role="status"><p>Učitavanje…</p></div>
    }
    @if (store.stanje() && store.veza() !== 'povezan') {
      <p class="uz-pub-veza" role="status">
        {{ store.veza() === 'prekinut' ? 'Veza prekinuta, povezujem…' : 'Povezivanje…' }}
      </p>
    }
    @if (tast.gotoUnos() !== null) {
      <p class="uz-pub-natpis" role="status">Idi na: <strong>{{ tast.gotoUnos() || '_' }}</strong></p>
    } @else if (ponoviCeka()) {
      <p class="uz-pub-natpis" role="status">Pritisni R ponovo da ponoviš pitanje</p>
    }
  `,
})
export class PublikaPage {
  protected readonly store = inject(IzvodjenjeStore);
  private readonly dialog = inject(MatDialog);
  protected readonly tast = new TastaturaIzvodjenja();
  protected readonly ponoviCeka = signal(false);
  protected readonly scena = linkedSignal<NastavnickoStanje | null, NastavnickoStanje | null>({
    source: this.store.stanje,
    computation: (s, prethodno) => scenaPosle(s, prethodno?.value ?? null),
  });
  private ponoviTajmer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    window.name = PROZOR_PUBLIKE;
    inject(ActivatedRoute).paramMap.pipe(
      map(p => Number(p.get('id'))), filter(id => id > 0), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(id => this.store.init(id));
    inject(DestroyRef).onDestroy(() => {
      this.tast.unisti();
      clearTimeout(this.ponoviTajmer);
    });
  }

  protected tastatura(e: KeyboardEvent): void {
    const s = this.store.stanje();
    const a = this.tast.akcija(e, s?.brojSlajdova ?? 0, this.dialog.openDialogs.length > 0);
    if (a) this.izvrsi(a);
  }

  private izvrsi(a: TasterAkcija): void {
    if ('lokalno' in a) {
      switch (a.lokalno) {
        case 'CEO_EKRAN': prebaciCeoEkran(); break;
        case 'KONZOLA': otvoriIliFokusiraj(this.store.konzolaLink(), PROZOR_KONZOLE); break;
        case 'POMOC': otvoriPomoc(this.dialog, 'publika'); break;
      }
      return;
    }
    if (!this.store.dozvoljene().has(a.komanda)) return;
    if (a.komanda === 'IDI_NA' && !ispravanIndeks(a.vrednost, this.store.stanje()?.brojSlajdova ?? 0)) return;
    if (a.komanda === 'PONOVI') {
      if (!this.ponoviCeka()) {
        this.ponoviCeka.set(true);
        clearTimeout(this.ponoviTajmer);
        this.ponoviTajmer = setTimeout(() => this.ponoviCeka.set(false), PONOVI_ROK_MS);
        return;
      }
      clearTimeout(this.ponoviTajmer);
      this.ponoviCeka.set(false);
    } else if (this.ponoviCeka()) {
      clearTimeout(this.ponoviTajmer);
      this.ponoviCeka.set(false);
    }
    this.store.komanda(a.komanda, a.vrednost);
  }
}
