import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Rezultat, RezultatTekst, TekstPrikaz, TipPitanja } from '../data-access/uzivo.models';
import { decimalni } from './format';
import { OpcijaOblikComponent, oblikOpcije } from './opcija-oblik';

const MAKS_OBLAK = 60;
const MAKS_LISTA = 50;
const VELICINA_MIN_EM = 1;
const VELICINA_MAX_EM = 3.2;

/**
 * Procenti po opciji iz broja glasova, zaokruženi metodom najvećeg ostatka tako da je zbir tačno 100 (bez glasova sve
 * nule). Ostatak dobijaju opcije sa najvećim razlomljenim delom; kod jednakih, ranija opcija.
 */
export function procenti(opcije: readonly number[]): number[] {
  const ukupno = opcije.reduce((a, b) => a + b, 0);
  if (ukupno <= 0) {
    return opcije.map(() => 0);
  }
  const tacno = opcije.map(b => (b * 100) / ukupno);
  const rezultat = tacno.map(t => Math.floor(t));
  let ostatak = 100 - rezultat.reduce((a, b) => a + b, 0);
  const redosled = tacno
    .map((t, i) => ({ i, razlomak: t - Math.floor(t) }))
    .sort((a, b) => b.razlomak - a.razlomak || a.i - b.i);
  for (let k = 0; ostatak > 0 && k < redosled.length; k++, ostatak--) {
    rezultat[redosled[k].i]++;
  }
  return rezultat;
}

/**
 * Procenti za stubiće. Kod "više tačnih" jedan učesnik bira više opcija, pa je smislen udeo učesnika koji su izabrali
 * opciju (`ukupno` = broj odgovora; zbir može preći 100); kod ostalih je to udeo u glasovima (zbir 100).
 */
export function procentiOpcija(tip: TipPitanja, brojevi: readonly number[], ukupno: number): number[] {
  if (tip === 'VISE_TACNIH') {
    return brojevi.map(b => (ukupno > 0 ? Math.min(100, Math.round((b * 100) / ukupno)) : 0));
  }
  return procenti(brojevi);
}

/** Veličina reči u oblaku (em): linearno od 1 (jedan odgovor) do 3.2 (najčešći, `max`). */
export function velicinaReci(broj: number, max: number): number {
  if (max <= 1) {
    return VELICINA_MIN_EM;
  }
  const b = Math.min(Math.max(broj, 1), max);
  const v = VELICINA_MIN_EM + ((VELICINA_MAX_EM - VELICINA_MIN_EM) * (b - 1)) / (max - 1);
  return Math.round(v * 100) / 100;
}

export interface RecOblaka {
  kljuc: string; tekst: string; broj: number; sakriven: boolean; tacan: boolean | null;
  /** 0 = najčešća. */
  rang: number;
  velicina: number;
}

/** Najčešćih `maks` reči, raspoređenih tako da je najčešća u sredini, a ređe naizmenično levo i desno od nje. */
export function oblakReci(tekstovi: readonly RezultatTekst[], maks = MAKS_OBLAK): RecOblaka[] {
  const sortirano = [...tekstovi].sort((a, b) => b.broj - a.broj).slice(0, maks);
  const max = sortirano.length ? sortirano[0].broj : 0;
  const raspored: RecOblaka[] = [];
  sortirano.forEach((t, rang) => {
    const rec: RecOblaka = {
      kljuc: t.kljuc, tekst: t.tekst, broj: t.broj, sakriven: t.sakriven, tacan: t.tacan, rang,
      velicina: velicinaReci(t.broj, max),
    };
    if (rang % 2 === 0) {
      raspored.push(rec);
    } else {
      raspored.unshift(rec);
    }
  });
  return raspored;
}

type Vrsta = 'opcije' | 'oblak' | 'lista' | 'broj' | 'skala';

function vrstaRezultata(tip: TipPitanja, tekstPrikaz: TekstPrikaz | null): Vrsta {
  switch (tip) {
    case 'KRATAK_TEKST': return tekstPrikaz === 'LISTA' ? 'lista' : 'oblak';
    case 'BROJ': return 'broj';
    case 'SKALA': return 'skala';
    default: return 'opcije';
  }
}

/**
 * Rezultati pitanja bez biblioteke za grafikone (spec 2.14): stubići za opcije, oblak ili lista za kratak tekst,
 * medijana i najčešće vrednosti za broj, raspodela i prosek za skalu. Tačno se ističe znakom ✓ i rečju, ne samo bojom.
 * `tekstPrikaz` i `jedinica` dolaze iz pitanja (rezultat ih ne nosi).
 */
@Component({
  selector: 'app-rezultat-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OpcijaOblikComponent],
  host: { class: 'uz-rez', '[class.uz-rez--kompaktno]': 'kompaktno()' },
  template: `
    @switch (vrsta()) {
      @case ('opcije') {
        <ul class="uz-rez-opcije" [style.--uz-n]="opcije().length">
          @for (o of opcije(); track o.id) {
            <li class="uz-rez-opcija" [class.uz-rez-opcija--tacna]="o.tacna" [class.uz-rez-opcija--prigusena]="o.prigusena"
                [style.--uz-boja]="o.boja">
              <app-opcija-oblik class="uz-rez-opcija-oblik" [indeks]="o.indeks" />
              <span class="uz-rez-opcija-tekst">
                @if (o.tacna) { <span class="uz-tacno-znak">✓ tačno</span> }
                {{ o.tekst }}
              </span>
              <span class="uz-rez-opcija-vrednost">{{ o.broj }} · {{ o.procenat }} %</span>
              <span class="uz-rez-traka" aria-hidden="true"><span class="uz-rez-ispuna" [style.--uz-udeo]="o.procenat + '%'"></span></span>
            </li>
          }
        </ul>
      }
      @case ('oblak') {
        @if (oblak().length) {
          <ul class="uz-rez-oblak">
            @for (w of oblak(); track w.kljuc) {
              <li class="uz-rez-rec" [class.uz-rez-rec--vrh]="w.rang < 3" [class.uz-rez-rec--tacna]="w.tacan === true"
                  [class.uz-rez-rec--sakrivena]="w.sakriven" [style.font-size.em]="w.velicina">
                @if (w.tacan === true) { <span class="uz-tacno-znak" aria-hidden="true">✓</span> }
                {{ w.tekst }}<span class="uz-sr">, {{ w.broj }} puta{{ w.tacan === true ? ', tačno' : '' }}{{ w.sakriven ? ', sakriveno' : '' }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="uz-prazno">Još nema odgovora.</p>
        }
      }
      @case ('lista') {
        @if (lista().length) {
          <ol class="uz-rez-lista">
            @for (t of lista(); track t.kljuc) {
              <li class="uz-rez-lista-red" [class.uz-rez-lista-red--tacna]="t.tacan === true"
                  [class.uz-rez-lista-red--sakriven]="t.sakriven">
                <span class="uz-rez-lista-tekst">
                  @if (t.tacan === true) { <span class="uz-tacno-znak">✓ tačno</span> }
                  {{ t.tekst }}
                  @if (t.sakriven) { <span class="uz-oznaka-sakriveno">sakriveno</span> }
                </span>
                <span class="uz-rez-lista-broj">{{ t.broj }}</span>
              </li>
            }
          </ol>
        } @else {
          <p class="uz-prazno">Još nema odgovora.</p>
        }
      }
      @case ('broj') {
        @if (brojevi(); as b) {
          <div class="uz-rez-broj">
            <div class="uz-rez-kljucni">
              <p class="uz-rez-podatak">
                <span class="uz-rez-oznaka">Medijana</span>
                <span class="uz-rez-velika">{{ b.medijana }}{{ jedinica() ? ' ' + jedinica() : '' }}</span>
              </p>
              @if (b.uOdstupanju !== null) {
                <p class="uz-rez-podatak">
                  <span class="uz-rez-oznaka">U odstupanju</span>
                  <span class="uz-rez-velika">{{ b.uOdstupanju }}/{{ rezultat().ukupno }}</span>
                </p>
              }
            </div>
            @if (b.najcesce.length) {
              <ul class="uz-rez-najcesce" aria-label="Najčešći odgovori">
                @for (n of b.najcesce; track n.vrednost) {
                  <li class="uz-rez-najcesce-red">
                    <span class="uz-rez-najcesce-vrednost">{{ n.vrednost }}{{ jedinica() ? ' ' + jedinica() : '' }}</span>
                    <span class="uz-rez-traka" aria-hidden="true"><span class="uz-rez-ispuna" [style.--uz-udeo]="n.sirina + '%'"></span></span>
                    <span class="uz-rez-najcesce-broj">{{ n.broj }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        } @else {
          <p class="uz-prazno">Još nema odgovora.</p>
        }
      }
      @case ('skala') {
        @if (skala(); as s) {
          <div class="uz-rez-skala">
            <ol class="uz-rez-skala-stubici">
              @for (k of s.kolone; track k.vrednost) {
                <li class="uz-rez-skala-kolona" [attr.aria-label]="k.vrednost + ': ' + k.broj">
                  <span class="uz-rez-skala-broj" aria-hidden="true">{{ k.broj }}</span>
                  <span class="uz-rez-skala-stub" aria-hidden="true"><span class="uz-rez-ispuna" [style.--uz-udeo]="k.visina + '%'"></span></span>
                  <span class="uz-rez-skala-vrednost" aria-hidden="true">{{ k.vrednost }}</span>
                </li>
              }
            </ol>
            <p class="uz-rez-prosek">Prosek: <strong>{{ s.prosek }}</strong></p>
          </div>
        } @else {
          <p class="uz-prazno">Još nema odgovora.</p>
        }
      }
    }
  `,
})
export class RezultatPrikazComponent {
  readonly rezultat = input.required<Rezultat>();
  readonly kompaktno = input<boolean>(false);
  /** Iz pitanja: kratak tekst kao oblak (podrazumevano) ili lista. */
  readonly tekstPrikaz = input<TekstPrikaz | null>(null);
  /** Iz pitanja: jedinica za broj (npr. "m"). */
  readonly jedinica = input<string | null>(null);

  protected readonly vrsta = computed(() => vrstaRezultata(this.rezultat().tip, this.tekstPrikaz()));

  protected readonly opcije = computed(() => {
    const r = this.rezultat();
    const opcije = r.opcije ?? [];
    const p = procentiOpcija(r.tip, opcije.map(o => o.broj), r.ukupno);
    const imaTacnih = opcije.some(o => o.tacna === true);
    return opcije.map((o, i) => ({
      id: o.id, indeks: i, boja: oblikOpcije(i).boja, tekst: o.tekst, broj: o.broj, procenat: p[i],
      tacna: o.tacna === true, prigusena: imaTacnih && o.tacna !== true,
    }));
  });

  protected readonly oblak = computed(() => oblakReci(this.rezultat().tekstovi ?? []));
  protected readonly lista = computed(() => (this.rezultat().tekstovi ?? []).slice(0, MAKS_LISTA));

  protected readonly brojevi = computed(() => {
    const r = this.rezultat();
    const b = r.brojevi;
    if (!b || r.ukupno === 0 || b.medijana === null) {
      return null;
    }
    const max = Math.max(1, ...b.najcesce.map(n => n.broj));
    return {
      medijana: decimalni(b.medijana),
      uOdstupanju: b.uOdstupanju,
      najcesce: b.najcesce.slice(0, 10).map(n => ({ vrednost: decimalni(n.vrednost), broj: n.broj, sirina: (n.broj * 100) / max })),
    };
  });

  protected readonly skala = computed(() => {
    const r = this.rezultat();
    const s = r.skala;
    if (!s || r.ukupno === 0) {
      return null;
    }
    const max = Math.max(1, ...s.raspodela);
    return {
      kolone: s.raspodela.map((broj, i) => ({ vrednost: i + 1, broj, visina: (broj * 100) / max })),
      prosek: s.prosek === null ? '–' : decimalni(s.prosek),
    };
  });
}
