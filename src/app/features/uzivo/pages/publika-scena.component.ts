import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { StanjePrelaza, animacijaPrelaza, napredNaSlajd } from '../data-access/platno-koraci';
import { PoteziCrteza } from '../data-access/potezi-crteza';
import { ServerskiSat } from '../data-access/sat';
import { Faza, NastavnickiZadatak, NastavnickoStanje, Prelaz, Rezultat, SlajdDetails } from '../data-access/uzivo.models';
import { bezProtokola, kodSaRazmakom } from '../ui/format';
import { smanjenoKretanje } from '../ui/kretanje';
import { PostoljeComponent } from '../ui/postolje.component';
import { kadroviPrelaza } from '../ui/prelaz-slajda';
import { PokretPrelaza, PrelazDirective } from '../ui/prelaz.directive';
import { PrijavaEkranComponent } from '../ui/prijava-ekran.component';
import { QrKodComponent } from '../ui/qr-kod.component';
import { RangListaComponent } from '../ui/rang-lista.component';
import { KodTraka, SlajdPrikazComponent, TajmerUlaz } from '../ui/slajd-prikaz.component';
import { vazecaTema } from '../ui/teme';

/** `<host><base>` bez protokola i kose crte na kraju (za traku "host/uzivo · kod"). */
export function hostAplikacije(base: string = document.baseURI): string {
  return bezProtokola(new URL('.', base).href);
}

/** Ulazi `SlajdPrikazComponent` za slajd iz jednog snimka (ulazni slajd i zapamćena slika odlaznog). */
export interface UlaziSlajda {
  slajd: SlajdDetails;
  korak: number;
  postepeno: boolean;
  faza: Faza | null;
  rezultat: Rezultat | null;
  prikaziRezultat: boolean;
  tacanPrikazan: boolean;
  brojOdgovora: number | null;
  /** Zadatak slajd (inače `null`): prikaz iz njega čita samo `javniRezultat`. */
  zadatak: NastavnickiZadatak | null;
  tajmer: TajmerUlaz | null;
  kodTraka: KodTraka;
}

/** Javne projekcije snimka za prikaz slajda (`javniRezultat`, nikad nastavnički `rezultat`; Zadatak: `zadatak.javniRezultat`). */
export function ulaziSlajda(s: NastavnickoStanje, sat: ServerskiSat | null, host: string): UlaziSlajda | null {
  const sl = s.trenutniSlajd;
  if (!sl) return null;
  return {
    slajd: sl, korak: s.korak, postepeno: sl.postepeno, faza: s.faza, rezultat: s.javniRezultat,
    prikaziRezultat: s.rezultatiPrikazani, tacanPrikazan: s.tacanPrikazan,
    brojOdgovora: (sl.tip === 'PITANJE' || sl.tip === 'ZADATAK') && s.runda && s.faza !== 'CEKA' ? s.brojOdgovora : null,
    zadatak: sl.tip === 'ZADATAK' ? s.zadatak ?? null : null,
    tajmer: s.faza === 'OTVORENO' && s.runda && sat ? { rokMs: s.runda.rokMs, preostaloMs: s.runda.preostaloMs, sat } : null,
    kodTraka: { host, kod: s.izvodjenje.kod },
  };
}

/** Prelaz koji je počeo sa snimkom `kljuc` (verzija): efekat ulaznog slajda i slika odlaznog (`null`: sa prijave). */
interface PrelazSlajda { kljuc: number; prelaz: Prelaz; odlazni: UlaziSlajda | null; }

/** Omotač slajda u sceni (`.uz-scena-ulazni` ili `.uz-scena-odlazni`); `u` je `null` kad slajda više nema. */
interface Omotac {
  id: number | null; odlazni: boolean; pokret: PokretPrelaza | null;
  animacija: { kljuc: number; grupa: number } | null; u: UlaziSlajda | null;
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
 * Snimak ne nosi poteze crteža: scena ih traži za trenutni i sledeći slajd (`PoteziCrteza`, keš prozora) i prikazu daje
 * `trenutni()` (slajd sa potezima iz keša); dok potezi ne stignu ili posle greške CRTEZ se crta kao slika.
 * Prelaz slajda (faza 5, odluka 12, samo uz `animiraj` i bez smanjenog kretanja): za tačno jedan slajd napred
 * (`napredNaSlajd`) odlazni slajd (slika iz prethodnog snimka, sa svim njegovim ulazima) i ulazni se crtaju jedan preko
 * drugog u `uz-scena-slajdovi`, a omotači se animiraju (`PrelazDirective`, `kadroviPrelaza`). Grupa 0 PLATNO slajda
 * kreće tek posle prelaza: dok traje, ulazni se crta na koraku -1. Snimak koji ne menja prikaz, slajd ni korak prelaz ne
 * prekida; svaki drugi ga prekida (krajnje stanje), a nov prelaz ne počinje dok prethodni traje (brzo prelistavanje).
 */
@Component({
  selector: 'app-publika-scena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostoljeComponent, PrelazDirective, PrijavaEkranComponent, QrKodComponent, RangListaComponent, SlajdPrikazComponent],
  host: { class: 'uz-scena rezim-dan uz-dan' },
  // Prelaz slajda (faza 5): odlazni i ulazni u istoj ćeliji, ulazni iznad; bez prelaza samo ulazni (izgled isti). U
  // komponenti, ne u globalnom `uzivo-izvodjenje.css`: početni paket (i telefon) ga ne dobija (recenzija F17, Minor 3).
  styles: `
    .uz-scena-slajdovi { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
    .uz-scena-slajdovi > * { grid-area: 1 / 1; min-width: 0; }
    .uz-scena-ulazni { position: relative; z-index: 1; }
  `,
  template: `
    @let s = stanje();
    @switch (s.prikaz) {
      @case ('PRIJAVA') {
        <app-prijava-ekran [kod]="s.izvodjenje.kod" [link]="joinLink()" [imena]="imena()" [broj]="s.ucesnici.length" />
      }
      @case ('SLAJD') {
        <div class="uz-scena-slajdovi">
          <!-- track po id-ju slajda: slajd sa ekrana postaje odlazni u ISTOJ instanci (formule, slike i potezi ostaju nacrtani) -->
          @for (o of omotaci(); track o.id) {
            <div [class]="o.odlazni ? 'uz-scena-odlazni' : 'uz-scena-ulazni'" [attr.aria-hidden]="o.odlazni ? 'true' : null"
                 [appPrelaz]="o.pokret" [appPrelazZadrzi]="o.odlazni" (appPrelazKraj)="o.odlazni || krajPrelaza($event)">
              @if (o.u; as u) {
                <app-slajd-prikaz [slajd]="u.slajd" [korak]="u.korak" [postepeno]="u.postepeno" [faza]="u.faza"
                                  [rezultat]="u.rezultat" [prikaziRezultat]="u.prikaziRezultat" [tacanPrikazan]="u.tacanPrikazan"
                                  [brojOdgovora]="u.brojOdgovora" [zadatak]="u.zadatak" [tajmer]="u.tajmer" [kodTraka]="u.kodTraka"
                                  [tema]="tema()" [animacija]="o.animacija" />
              } @else {
                <div class="uz-okvir"><section class="uz-platno uz-scena-poruka"><p>Slajd više ne postoji.</p></section></div>
              }
            </div>
          }
        </div>
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

  private readonly potezi = inject(PoteziCrteza);
  /** Trenutni slajd sa potezima crteža iz keša; `prelaz`/`animacijaPrelaza` i dalje čitaju snimak (treba im id i tip). */
  protected readonly trenutni = computed(() => this.potezi.saPotezima(this.stanje().trenutniSlajd));

  private readonly izvor = computed(() => ({ stanje: this.stanje(), epoha: this.epohaVeze() }));
  /** Ključ (verzija) prelaza čiji je ulazni omotač javio kraj. */
  private readonly zavrsen = signal<number | null>(null);
  /**
   * Poslednji snimak (kao `StanjePrelaza`), epoha veze u kojoj je stigao, grupa za animaciju prelaza sa prethodnog
   * snimka na njega (ključ je `verzija`), ulazi slajda iz tog snimka (`slika`, za odlazni slajd sledećeg prelaza) i prelaz
   * slajda koji je počeo (`prelazSlajda`). Promena same epohe (veza pala, snimak isti) ne menja zapamćeni snimak ni
   * njegovu epohu, pa se prvi snimak posle ponovnog povezivanja ne poredi sa onim pre prekida; prelaz koji traje se tada
   * prekida. `zavrsen` se čita `untracked`: kraj prelaza ne sme ponovo da izračuna ovo (grana "isti snimak" bi obrisala
   * grupu 0 baš kad treba da krene).
   */
  private readonly prelaz = linkedSignal<
    { stanje: NastavnickoStanje; epoha: number },
    { stanje: StanjePrelaza; epoha: number; grupa: number | null; slika: UlaziSlajda | null; prelazSlajda: PrelazSlajda | null }
  >({
    source: this.izvor,
    computation: ({ stanje: s, epoha }, prethodni) => {
      if (prethodni && prethodni.source.stanje === s) {
        return { ...prethodni.value, grupa: null, prelazSlajda: null };
      }
      const sada: StanjePrelaza = {
        verzija: s.verzija, prikaz: s.prikaz, indeks: s.indeks, slajdId: s.trenutniSlajd?.id ?? null,
        tip: s.trenutniSlajd?.tip ?? null, korak: s.korak,
      };
      const pre = prethodni && prethodni.value.epoha === epoha ? prethodni.value.stanje : null;
      const slika = s.prikaz === 'SLAJD' ? ulaziSlajda(s, untracked(this.sat), untracked(this.host)) : null;
      const t = prethodni?.value.prelazSlajda;
      const tece = !!t && untracked(this.zavrsen) !== t.kljuc;
      // Nepovezan snimak usred prelaza (prijava učesnika, nov odgovor): isti prikaz, slajd i korak -> prelaz i grupa ostaju.
      if (tece && pre && sada.prikaz === pre.prikaz && sada.slajdId === pre.slajdId && sada.korak === pre.korak) {
        return { stanje: sada, epoha, grupa: prethodni!.value.grupa, slika, prelazSlajda: t };
      }
      // Prelaz se pravi samo kad će se zaista pustiti (inače bi "traje" važilo zauvek), i nikad usred drugog prelaza.
      const p = s.trenutniSlajd?.prelaz;
      const prelazSlajda = p && !tece && untracked(this.animiraj) && !smanjenoKretanje() && napredNaSlajd(pre, sada)
        ? { kljuc: s.verzija, prelaz: p, odlazni: pre?.prikaz === 'SLAJD' ? prethodni!.value.slika : null }
        : null;
      return { stanje: sada, epoha, grupa: animacijaPrelaza(pre, sada), slika, prelazSlajda };
    },
  });
  /** Prelaz koji upravo traje: samo prozor publike, dok ulazni omotač ne javi kraj. */
  private readonly prelazUToku = computed(() => {
    const t = this.prelaz().prelazSlajda;
    return t && this.animiraj() && this.zavrsen() !== t.kljuc ? t : null;
  });
  protected readonly ulazniPokret = computed<PokretPrelaza | null>(() => {
    const t = this.prelazUToku();
    return t ? { kljuc: t.kljuc, kadrovi: kadroviPrelaza(t.prelaz).ulazni, trajanjeMs: t.prelaz.trajanjeMs } : null;
  });
  protected readonly odlazni = computed(() => {
    const t = this.prelazUToku();
    if (!t?.odlazni) return null;
    const k = kadroviPrelaza(t.prelaz).odlazni;
    return {
      ...t.odlazni, slajd: this.potezi.saPotezima(t.odlazni.slajd) ?? t.odlazni.slajd,
      pokret: k ? { kljuc: t.kljuc, kadrovi: k, trajanjeMs: t.prelaz.trajanjeMs } : null,
    };
  });
  /** Grupa 0 kreće posle prelaza (odluka 12): dok traje, ključ animacije je null, a slajd se crta na koraku -1. */
  protected readonly animacija = computed(() => {
    const p = this.prelaz();
    return this.animiraj() && p.grupa !== null && !this.prelazUToku() ? { kljuc: p.stanje.verzija, grupa: p.grupa } : null;
  });
  protected readonly korakPrikaza = computed(() => (this.prelazUToku() && this.prelaz().grupa === 0 ? -1 : this.stanje().korak));
  /**
   * Omotači u sceni: bez prelaza samo ulazni, a dok prelaz traje [odlazni, ulazni]. `track` po id-ju slajda, pa slajd koji
   * je bio na ekranu postaje odlazni u istoj instanci prikaza: njegove formule, slike i potezi ostaju nacrtani i u prvom
   * kadru prelaza (nova instanca bi bar jedan kadar pokazala LaTeX izvor; recenzija F17, Minor 1).
   */
  protected readonly omotaci = computed<Omotac[]>(() => {
    const sl = this.trenutni(), u = this.ulazi();
    const ulazni: Omotac = {
      id: sl?.id ?? null, odlazni: false, pokret: this.ulazniPokret(), animacija: this.animacija(),
      u: sl && u ? { ...u, slajd: sl, korak: this.korakPrikaza(), postepeno: sl.postepeno, kodTraka: this.kodTraka() } : null,
    };
    const o = this.odlazni();
    return o ? [{ id: o.slajd.id, odlazni: true, pokret: o.pokret, animacija: null, u: o }, ulazni] : [ulazni];
  });
  protected readonly tema = computed(() => vazecaTema(this.stanje().tema));

  protected readonly host = computed(() => hostAplikacije());
  protected readonly kod = computed(() => kodSaRazmakom(this.stanje().izvodjenje.kod));
  protected readonly imena = computed(() => this.stanje().ucesnici.map(u => u.ime));
  /** Ulazi trenutnog slajda; `kodTraka` je poseban, da ne bude nov objekat sa svakim snimkom. */
  protected readonly ulazi = computed(() => ulaziSlajda(this.stanje(), this.sat(), this.host()));
  protected readonly kodTraka = computed<KodTraka>(() => ({ host: this.host(), kod: this.stanje().izvodjenje.kod }));

  protected krajPrelaza(kljuc: number): void {
    this.zavrsen.set(kljuc);
  }

  constructor() {
    // `prelaz` je lenj (`linkedSignal`), a šablon ga čita samo u grani SLAJD: bez ovog čitanja snimak prijave ili kraja
    // nikad ne bi postao "prethodni", pa → sa prijave na prvi slajd ne bi pustio grupu 0. Efekat ga čita pri svakom
    // novom snimku ili epohi, bez obzira na prikaz.
    effect(() => {
      this.prelaz();
    });
    // Konzola ima i umanjenu scenu i panel "Sledeće": ovde se traže trenutni i sledeći, panel samo čita keš.
    effect(() => {
      const s = this.stanje();
      this.potezi.ucitaj(s.trenutniSlajd);
      this.potezi.ucitaj(s.sledeciSlajd);
    });
  }
}
