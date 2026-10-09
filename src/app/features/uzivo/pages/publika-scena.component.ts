import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { javniRezultat } from '../data-access/izvodjenje-pravila';
import { ServerskiSat } from '../data-access/sat';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { bezProtokola, kodSaRazmakom } from '../ui/format';
import { PostoljeComponent } from '../ui/postolje.component';
import { PrijavaEkranComponent } from '../ui/prijava-ekran.component';
import { QrKodComponent } from '../ui/qr-kod.component';
import { RangListaComponent } from '../ui/rang-lista.component';
import { KodTraka, SlajdPrikazComponent, TajmerUlaz } from '../ui/slajd-prikaz.component';

const RANG_PUBLIKA = 5;

/** `<host><base>` bez protokola i kose crte na kraju (za traku "host/uzivo · kod"). */
export function hostAplikacije(base: string = document.baseURI): string {
  return bezProtokola(new URL('.', base).href);
}

/**
 * Ono što projektor prikazuje, na 16:9 platnu (širinu daje roditelj): prijava, slajd, kraj (postolje ili "Hvala!"),
 * pa slojevi rang-liste (`L`), QR-a (`Q`) i crnog/belog ekrana. Ista komponenta je prikaz za publiku i umanjeni
 * "trenutni" prikaz u konzoli, pa nastavnik vidi tačno ono što vidi sala. Rezultat je javni (bez sakrivenih tekstova,
 * tačnost tek posle `C`), kao `JavnoStanje` koje dobijaju telefoni.
 */
@Component({
  selector: 'app-publika-scena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostoljeComponent, PrijavaEkranComponent, QrKodComponent, RangListaComponent, SlajdPrikazComponent],
  host: { class: 'uz-scena uz-dan' },
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
                            [brojOdgovora]="brojOdgovora()" [tajmer]="tajmer()" [kodTraka]="kodTraka()" />
        } @else {
          <div class="uz-okvir"><section class="uz-platno uz-scena-poruka"><p>Slajd više ne postoji.</p></section></div>
        }
      }
      @case ('KRAJ') {
        <div class="uz-okvir">
          <section class="uz-platno uz-scena-kraj">
            @if (s.takmicenje && s.rangLista.length) {
              <h1 class="uz-scena-naslov">Pobednici</h1>
              <app-postolje class="uz-scena-postolje" [stavke]="s.rangLista" />
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
          <app-rang-lista [stavke]="vrhRang()" />
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

  protected readonly host = computed(() => hostAplikacije());
  protected readonly kod = computed(() => kodSaRazmakom(this.stanje().izvodjenje.kod));
  protected readonly imena = computed(() => this.stanje().ucesnici.map(u => u.ime));
  protected readonly vrhRang = computed(() => this.stanje().rangLista.slice(0, RANG_PUBLIKA));
  protected readonly rezultat = computed(() => javniRezultat(this.stanje().rezultat, this.stanje().tacanPrikazan));
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
}
