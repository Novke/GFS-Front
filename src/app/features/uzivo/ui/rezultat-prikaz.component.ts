import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PitanjeDetails, Rezultat, RezultatTekst, TipPitanja } from '../data-access/uzivo.models';
import { Cip, CipoviOdgovoraComponent, poredjajCipove } from './cipovi-odgovora.component';
import { decimalni, tacanBroj } from './format';
import { meriFormule } from './mera-formule';
import { OpcijaOblikComponent, oblikOpcije } from './opcija-oblik';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';

const MAKS_OBLAK = 60;
const MAKS_LISTA = 50;
/**
 * Čipova slobodnog unosa najviše toliko (tačni se ne odsecaju), ostatak je "+N drugih (M)". 30 staje na projektor 16:9 (vidi
 * `data-gustina`); konzola i pregled ih prelamaju u redove.
 */
export const MAKS_CIPOVA = 30;
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

type Vrsta = 'opcije' | 'oblak' | 'lista' | 'cipovi' | 'skala';

/** Šta prikaz uzima iz pitanja (rezultat to ne nosi): `PitanjeDetails` (projektor, konzola) i `PitanjeSnimak` (pregled). */
export type OpisPitanja = Pick<PitanjeDetails, 'tekstPrikaz' | 'jedinica' | 'prihvatljiviOdgovori' | 'brojTacno'>;

/**
 * Slobodan unos (broj, kratak tekst sa tačnim) su čipovi uvek; kratak tekst bez prihvatljivih odgovora (otvoreno mišljenje)
 * ostaje oblak ili lista po `tekstPrikaz` (tamo nema tačnog, a oblak bolje pokazuje šta razred misli).
 */
export function vrstaRezultata(tip: TipPitanja, pitanje: OpisPitanja | null): Vrsta {
  switch (tip) {
    case 'KRATAK_TEKST':
      if (pitanje?.prihvatljiviOdgovori?.length) return 'cipovi';
      return pitanje?.tekstPrikaz === 'LISTA' ? 'lista' : 'oblak';
    case 'BROJ': return 'cipovi';
    case 'SKALA': return 'skala';
    default: return 'opcije';
  }
}

/**
 * Čipovi slobodnog unosa (broj i kratak tekst sa tačnim), po istom pravilu kao Zadatak slajd: uneti odgovori sa brojem
 * učesnika, neutralni dok tačnost nije vidljiva (`rezultat.tacnih` `null`), posle toga tačni prvi (✓) i netačni (✗), a tačan
 * koji niko nije uneo dodaje se kao čip "niko" (vrednost iz pitanja). Broj se piše sa svim decimalama (`tacanBroj`): server
 * grupiše tačno iste vrednosti, pa bi zaokruživanje dva različita odgovora prikazalo kao isti.
 */
export function cipoviRezultata(r: Rezultat, pitanje: OpisPitanja | null): Cip[] {
  const poznato = r.tacnih !== null;
  const stanje = (tacan: boolean | null) => (!poznato || tacan === null ? null : tacan ? 'tacno' : 'netacno');
  const jedinica = pitanje?.jedinica ? ' ' + pitanje.jedinica : '';
  let cipovi: Cip[];
  let tacanTekst: string;
  if (r.tip === 'BROJ') {
    cipovi = (r.brojevi?.vrednosti ?? []).map(v => ({
      kljuc: String(v.vrednost), tekst: tacanBroj(v.vrednost) + jedinica, broj: v.broj, stanje: stanje(v.tacan), formula: false,
    }));
    const t = pitanje?.brojTacno;
    tacanTekst = t === null || t === undefined ? '' : tacanBroj(t) + jedinica;
  } else {
    cipovi = (r.tekstovi ?? []).map(t => ({
      kljuc: t.kljuc, tekst: t.tekst, broj: t.broj, stanje: stanje(t.tacan), formula: false, sakriven: t.sakriven,
    }));
    tacanTekst = (pitanje?.prihvatljiviOdgovori ?? []).join(', ');
  }
  // tačan koji niko nije uneo, samo kad ima odgovora (bez njih ostaje "Još nema odgovora.", i u konzoli pre prvog odgovora)
  if (poznato && tacanTekst && r.ukupno > 0 && !cipovi.some(c => c.stanje === 'tacno')) {
    cipovi.push({ kljuc: '\u0000tacno', tekst: tacanTekst, broj: 0, stanje: 'tacno', formula: false });
  }
  return poredjajCipove(cipovi);
}

/** Gustina čipova za veličinu slova na projektoru: do 4, do 12, do 20, više. */
export function gustinaCipova(n: number): 'malo' | 'srednje' | 'mnogo' | 'vrlo' {
  return n <= 4 ? 'malo' : n <= 12 ? 'srednje' : n <= 20 ? 'mnogo' : 'vrlo';
}

/** "Tačno 7 od 12 · 58 %" kad je tačnost vidljiva i ima odgovora, inače `null`. */
export function tacnihTekst(r: Rezultat): string | null {
  if (r.tacnih === null || r.tacnih === undefined || r.ukupno <= 0) return null;
  return `Tačno ${r.tacnih} od ${r.ukupno} · ${Math.round((r.tacnih * 100) / r.ukupno)} %`;
}

/**
 * Rezultati pitanja bez biblioteke za grafikone (spec 2.14): stubići za opcije, čipovi unetih odgovora za broj i kratak tekst
 * sa tačnim, oblak ili lista za otvoren kratak tekst, raspodela i prosek za skalu. Kad je tačnost vidljiva, red "Tačno x od y ·
 * N %" (`tacnihTekst`). Tačno se ističe znakom ✓ i rečju, ne samo bojom. Iz pitanja (`OpisPitanja`) dolaze način prikaza
 * kratkog teksta, jedinica i tačan odgovor za čip "niko".
 */
@Component({
  selector: 'app-rezultat-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [CipoviOdgovoraComponent, OpcijaOblikComponent, TekstFormuleComponent],
  host: { class: 'uz-rez', '[class.uz-rez--kompaktno]': 'kompaktno()', '[class.uz-rez--sa-tacnih]': '!!tacnih()' },
  template: `
    @if (tacnih(); as t) {
      <p class="uz-rez-tacnih"><span class="uz-tacno-znak" aria-hidden="true">✓</span>{{ t }}</p>
    }
    @switch (vrsta()) {
      @case ('opcije') {
        <ul class="uz-rez-opcije" [style.--uz-n]="opcije().length">
          @for (o of opcije(); track o.id) {
            <li class="uz-rez-opcija" [class.uz-rez-opcija--tacna]="o.tacna" [class.uz-rez-opcija--prigusena]="o.prigusena"
                [style.--uz-boja]="o.boja">
              <app-opcija-oblik class="uz-rez-opcija-oblik" [indeks]="o.indeks" />
              <!-- značka je van bloka formule (flex red): kad stigne uživo, blok formule se suzi, pa ga merenje vidi -->
              <span class="uz-rez-opcija-tekst">
                <!-- razmak kao tekst: Angular briše čvor sa samim razmakom između dva elementa -->
                @if (o.tacna) {<span class="uz-tacno-znak">✓ tačno</span>{{ ' ' }}}
                <app-tekst-formule class="uz-rez-opcija-formula" [tekst]="o.tekst" />
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
      @case ('cipovi') {
        @if (cipovi().length) {
          <app-cipovi-odgovora class="uz-rez-cipovi" [attr.data-gustina]="gustina()" [cipovi]="cipovi()" [maks]="maksCipova" />
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
  /** Iz pitanja: način prikaza kratkog teksta, jedinica broja, prihvatljivi odgovori i tačna vrednost (`OpisPitanja`). */
  readonly pitanje = input<OpisPitanja | null>(null);
  /** Red "Tačno x od y · N %"; pregled izvođenja ga ima u zaglavlju runde, pa ga ovde gasi. */
  readonly prikaziTacnih = input<boolean>(true);

  protected readonly maksCipova = MAKS_CIPOVA;
  protected readonly vrsta = computed(() => vrstaRezultata(this.rezultat().tip, this.pitanje()));
  protected readonly tacnih = computed(() => (this.prikaziTacnih() ? tacnihTekst(this.rezultat()) : null));
  protected readonly cipovi = computed(() => (this.vrsta() === 'cipovi' ? cipoviRezultata(this.rezultat(), this.pitanje()) : []));
  protected readonly gustina = computed(() => gustinaCipova(Math.min(this.cipovi().length, MAKS_CIPOVA + 1)));

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
