import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import {
  blokVremena, danIDatum, DANI_KRATKO, danUNedelji, isoDatum, lokalniDatum, MESECI_KRATKO, zaKoliko,
} from '../../../shared/util/termin';
import { kljucTermina, MAX_RAZLOG, StudentskiTermin } from '../data-access/casovi.models';
import { CasoviStore } from '../data-access/casovi.store';
import { bojePredmeta } from './kalendar-casova';
import { KalendarCasova } from './kalendar-casova.component';

/**
 * „Naredni časovi“ (spec najave odsustva, odeljak 4), kao kalendar: gore sledeći čas na koji student ide, ispod mesec sa
 * obojenim danima (boja predmeta, crveno otkazan, prugasto „neću doći“), a dodir na dan otvara njegove termine. Izabran je
 * prvi dan sa terminom, pa se otkazan čas koji je prvi na redu vidi odmah. Po terminu: „Neću doći“ jednim dodirom, razlog po
 * želji, „Ipak dolazim“, i „Nema časa“ sa napomenom nastavnika. **Samostalna:** sama daje svoj store i sama učitava
 * (`api/public/nalog/casovi`), bez ulaza i izlaza, pa se može premestiti na drugu stranicu ili u tab bez izmena. Dok se
 * učitava i kad student nema nijedan čas u rasporedu ne prikazuje ništa.
 */
@Component({
  selector: 'app-naredni-casovi',
  imports: [KalendarCasova, MatButton, MatProgressSpinner],
  providers: [CasoviStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.status() === 'greska') {
      <section class="kartica" aria-labelledby="naslov-casova" data-naredni-casovi>
        <h3 id="naslov-casova">Naredni časovi</h3>
        <p class="greska" role="alert">{{ store.greska() }}</p>
        <button type="button" matButton="outlined" (click)="store.ucitaj()">Pokušaj ponovo</button>
      </section>
    } @else if (store.status() === 'ok' && store.termini().length > 0) {
      <section class="kartica" aria-labelledby="naslov-casova" data-naredni-casovi>
        <h3 id="naslov-casova">Naredni časovi</h3>
        @if (sledeci(); as s) {
          <div class="sledeci" data-sledeci-cas>
            <p class="listic">
              <span>{{ danKratko(s.datum) }}</span>
              <strong>{{ brojDana(s.datum) }}</strong>
              <span>{{ mesecKratko(s.datum) }}</span>
            </p>
            <div class="sledeci-tekst">
              <p class="nadnaslov">Sledeći čas · {{ koliko(s.datum) }}</p>
              <p class="sledeci-predmet">{{ s.predmet }}</p>
              <p class="sledeci-vreme">{{ blok(s) }}</p>
            </div>
          </div>
        }

        <app-kalendar-casova [termini]="termini()" [boje]="boje()" [izabrani]="izabrani()" [danas]="danas"
                             (izabran)="izabranDan.set($event)" />

        <div class="detalj" data-dan-detalj>
          <h4 aria-live="polite" data-dan-naslov>{{ naslovDana() }}<span>{{ kolikoIzabrani() }}</span></h4>
          <ul class="termini">
            @for (t of terminiDana(); track kljuc(t)) {
              @let k = kljuc(t);
              @let opis = t.predmet + ', ' + kada(t);
              <li [attr.data-termin]="k" [class.otkazan]="t.otkazan" [class.najavljeno]="t.najavljeno && !t.otkazan"
                  [style.--boja]="boje().get(t.predmet)">
                <p class="predmet">
                  {{ t.predmet }}
                  @if (!t.svojaGrupa) {
                    <span class="grupa">grupa {{ t.grupa }}</span>
                  }
                </p>
                <p class="vreme">{{ blok(t) }}</p>
                @if (t.otkazan) {
                  <p class="stanje nema" data-nema-casa>
                    <strong>Nema časa.</strong>
                    @if (t.napomena) {
                      {{ t.napomena }}
                    }
                  </p>
                } @else if (t.najavljeno) {
                  <p class="stanje" data-najavljeno>
                    <strong>Javljeno da nećeš doći.</strong>
                    @if (t.razlog) {
                      <span class="razlog">Razlog: {{ t.razlog }}</span>
                    }
                  </p>
                  @if (uredjuje() === k) {
                    <label class="polje">
                      <span>Razlog (nije obavezno)</span>
                      <textarea rows="2" [maxLength]="maxRazlog" [value]="razlog()" (input)="razlog.set(tekst($event))"
                                data-razlog></textarea>
                    </label>
                    <div class="akcije">
                      <button type="button" matButton="filled" [disabled]="store.salje() !== null" (click)="sacuvajRazlog(t)"
                              data-sacuvaj-razlog>Sačuvaj</button>
                      <button type="button" matButton (click)="uredjuje.set(null)">Odustani</button>
                    </div>
                  } @else {
                    <div class="akcije">
                      <button type="button" matButton="outlined" [disabled]="store.salje() !== null"
                              [attr.aria-label]="'Ipak dolazim: ' + opis" (click)="store.povuci(t)" data-ipak-dolazim>
                        @if (store.salje() === k) {
                          <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
                        }
                        Ipak dolazim
                      </button>
                      <button type="button" matButton [attr.aria-label]="(t.razlog ? 'Izmeni razlog: ' : 'Dodaj razlog: ') + opis"
                              (click)="urediRazlog(t)" data-dodaj-razlog>{{ t.razlog ? 'Izmeni razlog' : 'Dodaj razlog' }}</button>
                    </div>
                  }
                } @else {
                  <div class="akcije">
                    <button type="button" matButton="outlined" [disabled]="store.salje() !== null"
                            [attr.aria-label]="'Neću doći: ' + opis" (click)="store.najavi(t, null)" data-necu-doci>
                      @if (store.salje() === k) {
                        <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
                      }
                      Neću doći
                    </button>
                  </div>
                }
                @if (store.poruka(); as p) {
                  @if (p.kljuc === k) {
                    <p class="poruka" [class.greska]="p.greska" [attr.role]="p.greska ? 'alert' : 'status'">{{ p.tekst }}</p>
                  }
                }
              </li>
            }
          </ul>
          <p class="uvod">Ako nećeš doći, javi ovde pre početka časa. Nastavnik vidi ko je javio.</p>
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .kartica { margin: 0 0 16px; }
    h3 { margin: 0 0 10px; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    p { margin: 0; }

    .sledeci { display: flex; gap: 14px; margin: 0 0 14px; padding: 14px; border-radius: var(--radius);
      background: var(--hero-bg); color: var(--hero-ink); }
    .listic { flex: none; display: flex; flex-direction: column; justify-content: center; width: 66px; padding: 8px 0;
      border-radius: var(--radius); background: color-mix(in srgb, var(--hero-ink) 12%, transparent); text-align: center; }
    .listic span { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .listic strong { font-size: 30px; line-height: 1.1; }
    .sledeci-tekst { min-width: 0; align-self: center; }
    .nadnaslov { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
    .sledeci-predmet { margin: 3px 0 4px; font-size: 18px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    .sledeci-vreme { font-family: var(--font-mono); font-size: 15px; }

    .detalj { margin-top: 12px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
    h4 { margin: 0; padding: 10px 14px; background: var(--surface-2); font-size: 14px; font-weight: 700; color: var(--ink-2); }
    h4 span { font-weight: 500; color: var(--muted); }
    .termini { margin: 0; padding: 0; list-style: none; }
    .termini li { padding: 12px 14px; border-left: 6px solid var(--boja); }
    .termini li + li { border-top: 1px solid var(--line); }
    .termini li.otkazan { border-left-color: var(--danger); background: var(--danger-soft); }
    .termini li.najavljeno { border-left-color: var(--warn); }
    .predmet { font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
    .grupa { margin-left: 6px; font-weight: 400; color: var(--muted); font-size: 13px; }
    .vreme { margin: 2px 0 10px; font-family: var(--font-mono); font-size: 16px; font-weight: 600; color: var(--ink-2); }
    .stanje { margin: 0 0 8px; overflow-wrap: anywhere; }
    .stanje strong { display: inline-block; margin-right: 4px; padding: 3px 9px; border-radius: 99px; font-size: 13px; }
    .nema { color: var(--danger); }
    .nema strong { background: var(--danger); color: var(--danger-ink); }
    .najavljeno .stanje strong { background: var(--warn-soft); color: var(--warn); }
    .razlog { display: block; margin-top: 4px; color: var(--ink-2); font-size: 14px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .akcije button { min-height: 44px; }
    .akcije mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .polje { display: flex; flex-direction: column; gap: 4px; margin: 0 0 8px; font-size: 14px; }
    .polje textarea { font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); resize: vertical; }
    .poruka { margin: 6px 0 0; font-size: 14px; color: var(--ok); }
    .poruka.greska, .greska { color: var(--danger); }
    .greska { margin: 0 0 8px; }
    .uvod { padding: 10px 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
  `,
})
export class NaredniCasovi {
  protected readonly store = inject(CasoviStore);
  protected readonly maxRazlog = MAX_RAZLOG;
  /** Termin čiji razlog se upravo menja (ključ), i tekst u polju. */
  protected readonly uredjuje = signal<string | null>(null);
  protected readonly razlog = signal('');
  protected readonly danas = isoDatum(new Date());
  /** Dan koji je student dodirnuo; bez njega (i kad taj dan nestane iz liste) izabran je prvi dan sa terminom. */
  protected readonly izabranDan = signal<string | null>(null);

  protected readonly termini = computed(() =>
    [...this.store.termini()].sort((a, b) => a.datum.localeCompare(b.datum) || a.pocetak.localeCompare(b.pocetak)));
  private readonly poDanu = computed(() => {
    const dani = new Map<string, StudentskiTermin[]>();
    this.termini().forEach(t => dani.set(t.datum, [...(dani.get(t.datum) ?? []), t]));
    return dani;
  });

  protected readonly boje = computed(() => bojePredmeta(this.termini().map(t => t.predmet)));
  /** Prvi čas na koji student ide: otkazan i onaj za koji je javio da neće doći se preskaču. */
  protected readonly sledeci = computed(() => this.termini().find(t => !t.otkazan && !t.najavljeno) ?? null);
  protected readonly izabrani = computed(() => {
    const dan = this.izabranDan();
    return dan && this.poDanu().has(dan) ? dan : this.termini()[0]?.datum ?? this.danas;
  });
  protected readonly terminiDana = computed(() => this.poDanu().get(this.izabrani()) ?? []);

  /** `Ponedeljak 2. 11.`. */
  protected readonly naslovDana = computed(() => {
    const d = danIDatum(this.izabrani());
    return d.charAt(0).toUpperCase() + d.slice(1);
  });
  protected readonly kolikoIzabrani = computed(() => {
    const k = this.koliko(this.izabrani());
    return k ? ` · ${k}` : '';
  });

  constructor() {
    this.store.ucitaj();
  }

  protected kljuc(t: StudentskiTermin): string {
    return kljucTermina(t);
  }

  protected koliko(iso: string): string {
    return zaKoliko(iso, this.danas);
  }

  /** `sutra, sreda 4. 11.` / `sreda 11. 11.`, za čitač ekrana. */
  protected kada(t: StudentskiTermin): string {
    const k = this.koliko(t.datum);
    return (k === 'danas' || k === 'sutra' ? k + ', ' : '') + danIDatum(t.datum);
  }

  protected blok(t: StudentskiTermin): string {
    return blokVremena(t.pocetak, t.kraj);
  }

  protected danKratko(iso: string): string {
    return DANI_KRATKO[danUNedelji(iso)];
  }

  protected brojDana(iso: string): number | undefined {
    return lokalniDatum(iso)?.getDate();
  }

  protected mesecKratko(iso: string): string {
    return MESECI_KRATKO[Number(iso.slice(5, 7)) - 1];
  }

  protected tekst(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected urediRazlog(t: StudentskiTermin): void {
    this.razlog.set(t.razlog ?? '');
    this.uredjuje.set(kljucTermina(t));
  }

  protected sacuvajRazlog(t: StudentskiTermin): void {
    this.uredjuje.set(null);
    this.store.najavi(t, this.razlog());
  }
}
