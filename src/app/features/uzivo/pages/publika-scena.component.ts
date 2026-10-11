import { ChangeDetectionStrategy, Component, computed, effect, input, linkedSignal } from '@angular/core';
import { StanjePrelaza, animacijaPrelaza } from '../data-access/platno-koraci';
import { ServerskiSat } from '../data-access/sat';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { bezProtokola, kodSaRazmakom } from '../ui/format';
import { PostoljeComponent } from '../ui/postolje.component';
import { PrijavaEkranComponent } from '../ui/prijava-ekran.component';
import { QrKodComponent } from '../ui/qr-kod.component';
import { RangListaComponent } from '../ui/rang-lista.component';
import { KodTraka, SlajdPrikazComponent, TajmerUlaz } from '../ui/slajd-prikaz.component';
import { vazecaTema } from '../ui/teme';

/** `<host><base>` bez protokola i kose crte na kraju (za traku "host/uzivo · kod"). */
export function hostAplikacije(base: string = document.baseURI): string {
  return bezProtokola(new URL('.', base).href);
}

/**
 * Ono što projektor prikazuje, na 16:9 platnu (širinu daje roditelj): prijava, slajd, kraj (postolje ili "Hvala!"),
 * pa slojevi rang-liste (`L`), QR-a (`Q`) i crnog/belog ekrana. Ista komponenta je prikaz za publiku i umanjeni
 * "trenutni" prikaz u konzoli, pa nastavnik vidi tačno ono što vidi sala. Rezultat i rang-lista (i postolje) su javne
 * projekcije sa servera (`javniRezultat`, `javnaRangLista`: isto što telefoni dobijaju u `JavnoStanje`, bez sakrivenih
 * tekstova, tačnosti i poena trenutne runde pre `C`); nastavnički `rezultat` i `rangLista` se ovde nikad ne prikazuju.
 * Animacija PLATNO slajda (`animiraj`, samo prozor publike): scena pamti prethodni snimak i pita `animacijaPrelaza`;
 * prvi snimak (kasno otvoren prozor, ponovo učitana stranica), skok i korak nazad crtaju krajnje stanje bez animacije.
 * Prethodni snimak se pamti za svaki prikaz (i prijavu i kraj), ne samo dok je na ekranu slajd.
 */
@Component({
  selector: 'app-publika-scena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostoljeComponent, PrijavaEkranComponent, QrKodComponent, RangListaComponent, SlajdPrikazComponent],
  host: { class: 'uz-scena rezim-dan uz-dan' },
  template: `
    @let s = stanje();
    @switch (s.prikaz) {
      @case ('PRIJAVA') {
        <app-prijava-ekran [kod]="s.izvodjenje.kod" [link]="joinLink()" [imena]="imena()" [broj]="s.ucesnici.length" />
      }
      @case ('SLAJD') {
        @if (s.trenutniSlajd; as sl) {
          <app-slajd-prikaz [slajd]="sl" [korak]="s.korak" [postepeno]="sl.postepeno" [faza]="s.faza"
                            [rezultat]="rezultat()" [prikaziRezultat]="s.rezultatiPrikazani" [tacanPrikazan]="s.tacanPrikazan"
                            [brojOdgovora]="brojOdgovora()" [tajmer]="tajmer()" [kodTraka]="kodTraka()"
                            [tema]="tema()" [animacija]="animacija()" />
        } @else {
          <div class="uz-okvir"><section class="uz-platno uz-scena-poruka"><p>Slajd više ne postoji.</p></section></div>
        }
      }
      @case ('KRAJ') {
        <div class="uz-okvir">
          <section class="uz-platno uz-scena-kraj">
            @if (s.takmicenje && s.javnaRangLista?.length) {
              <h1 class="uz-scena-naslov">Pobednici</h1>
              <app-postolje class="uz-scena-postolje" [stavke]="s.javnaRangLista ?? []" />
            } @else {
              <h1 class="uz-scena-hvala">Hvala!</h1>
              <p class="uz-scena-podnaslov">{{ s.izvodjenje.prezentacija.naziv }}</p>
            }
          </section>
        </div>
      }
    }
    @if (s.rangListaPrikazana && s.prikaz !== 'KRAJ') {
      <div class="uz-okvir uz-scena-sloj">
        <section class="uz-platno uz-scena-rang" aria-label="Rang-lista">
          <h1 class="uz-scena-naslov">Rang-lista</h1>
          <app-rang-lista [stavke]="s.javnaRangLista ?? []" />
        </section>
      </div>
    }
    @if (s.qrPrikazan) {
      <div class="uz-okvir uz-scena-sloj">
        <section class="uz-platno uz-scena-qr" aria-label="QR kod za prijavu">
          <app-qr-kod class="uz-scena-qr-kod" [tekst]="joinLink()" [velicina]="900" />
          <div class="uz-scena-qr-info">
            <p class="uz-scena-qr-link">{{ host() }}/uzivo</p>
            <p class="uz-scena-qr-kod-tekst">{{ kod() }}</p>
          </div>
        </section>
      </div>
    }
    @if (s.ekran !== 'NORMALAN') {
      <div class="uz-scena-ekran" [class.uz-scena-ekran--beo]="s.ekran === 'BEO'"
           [attr.aria-label]="s.ekran === 'BEO' ? 'Beo ekran' : 'Crn ekran'" role="img">
        @if (umanjeno()) { <span>{{ s.ekran === 'BEO' ? 'Beo ekran' : 'Crn ekran' }}</span> }
      </div>
    }
  `,
})
export class PublikaScenaComponent {
  readonly stanje = input.required<NastavnickoStanje>();
  readonly joinLink = input.required<string>();
  readonly sat = input<ServerskiSat | null>(null);
  /** Umanjen prikaz u konzoli: crn/beo ekran dobija natpis da se zna šta je na projektoru. */
  readonly umanjeno = input<boolean>(false);
  /** Pušta animacije koraka PLATNO slajda (prozor publike); umanjeni prikaz u konzoli crta samo krajnje stanje. */
  readonly animiraj = input<boolean>(false);
  /**
   * Broj prekida veze (raste kad veza padne). Snimak posle ponovnog povezivanja se ne poredi sa snimkom pre prekida:
   * korak ili slajd napred tokom prekida crta se kao krajnje stanje, bez animacije (spec 5).
   */
  readonly epohaVeze = input<number>(0);

  private readonly izvor = computed(() => ({ stanje: this.stanje(), epoha: this.epohaVeze() }));
  /**
   * Poslednji snimak (kao `StanjePrelaza`), epoha veze u kojoj je stigao i grupa za animaciju prelaza sa prethodnog
   * snimka na njega (ključ je `verzija`). Promena same epohe (veza pala, snimak isti) ne menja zapamćeni snimak ni
   * njegovu epohu, pa se prvi snimak posle ponovnog povezivanja ne poredi sa onim pre prekida.
   */
  private readonly prelaz = linkedSignal<
    { stanje: NastavnickoStanje; epoha: number },
    { stanje: StanjePrelaza; epoha: number; grupa: number | null }
  >({
    source: this.izvor,
    computation: ({ stanje: s, epoha }, prethodni) => {
      if (prethodni && prethodni.source.stanje === s) {
        return { ...prethodni.value, grupa: null };
      }
      const sada: StanjePrelaza = {
        verzija: s.verzija, prikaz: s.prikaz, indeks: s.indeks, slajdId: s.trenutniSlajd?.id ?? null,
        tip: s.trenutniSlajd?.tip ?? null, korak: s.korak,
      };
      const pre = prethodni && prethodni.value.epoha === epoha ? prethodni.value.stanje : null;
      return { stanje: sada, epoha, grupa: animacijaPrelaza(pre, sada) };
    },
  });
  protected readonly animacija = computed(() => {
    const p = this.prelaz();
    return this.animiraj() && p.grupa !== null ? { kljuc: p.stanje.verzija, grupa: p.grupa } : null;
  });
  protected readonly tema = computed(() => vazecaTema(this.stanje().tema));

  protected readonly host = computed(() => hostAplikacije());
  protected readonly kod = computed(() => kodSaRazmakom(this.stanje().izvodjenje.kod));
  protected readonly imena = computed(() => this.stanje().ucesnici.map(u => u.ime));
  protected readonly rezultat = computed(() => this.stanje().javniRezultat);
  protected readonly kodTraka = computed<KodTraka>(() => ({ host: this.host(), kod: this.stanje().izvodjenje.kod }));
  protected readonly brojOdgovora = computed(() => {
    const s = this.stanje();
    return s.trenutniSlajd?.tip === 'PITANJE' && s.runda && s.faza !== 'CEKA' ? s.brojOdgovora : null;
  });
  protected readonly tajmer = computed<TajmerUlaz | null>(() => {
    const s = this.stanje();
    const sat = this.sat();
    return s.faza === 'OTVORENO' && s.runda && sat ? { rokMs: s.runda.rokMs, preostaloMs: s.runda.preostaloMs, sat } : null;
  });

  constructor() {
    // `prelaz` je lenj (`linkedSignal`), a šablon ga čita samo u grani SLAJD: bez ovog čitanja snimak prijave ili kraja
    // nikad ne bi postao "prethodni", pa → sa prijave na prvi slajd ne bi pustio grupu 0. Efekat ga čita pri svakom
    // novom snimku ili epohi, bez obzira na prikaz.
    effect(() => {
      this.prelaz();
    });
  }
}
