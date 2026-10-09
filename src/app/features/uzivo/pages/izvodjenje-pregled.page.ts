import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppRoutes } from '../../../app.routes';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { opisVeze } from '../data-access/izvodjenje-pravila';
import { razlogGreske } from '../data-access/razlog-greske';
import { IzvodjenjeRezultati, RezultatPitanja, medijUrl } from '../data-access/uzivo.models';
import { RangListaComponent } from '../ui/rang-lista.component';
import { RezultatPrikazComponent } from '../ui/rezultat-prikaz.component';
import { renderMarkdown } from '../ui/markdown';

/** "Odgovora 23 · tačnih 61 %"; bez procenta kad pitanje nema tačan odgovor ili niko nije odgovorio. */
export function procenatTacnihTekst(p: Pick<RezultatPitanja, 'brojOdgovora' | 'procenatTacnih'>): string {
  const odgovora = `Odgovora ${p.brojOdgovora}`;
  return p.procenatTacnih === null || p.procenatTacnih === undefined ? odgovora : `${odgovora} · tačnih ${p.procenatTacnih} %`;
}

export interface OznakaRunde {
  /** Redni broj runde istog slajda (1, 2, ...). */
  runda: number;
  /** Koliko rundi je taj slajd imao. */
  ukupno: number;
}

/**
 * Runde istog slajda (nastavnik je pitanje ponovio) dobijaju "1. runda", "2. runda"; slajd sa jednom rundom nema oznaku
 * (`ukupno` = 1). Slajd je isti po `slajdId`, a kad slajda više nema, po `pitanjeId` iz snimka. Niz je poravnat sa ulazom.
 */
export function oznakeRundi(pitanja: readonly RezultatPitanja[]): OznakaRunde[] {
  const kljuc = (p: RezultatPitanja) => (p.slajdId ?? p.pitanje.slajdId) ?? `pitanje-${p.pitanje.pitanjeId}`;
  const ukupno = new Map<number | string, number>();
  for (const p of pitanja) {
    ukupno.set(kljuc(p), (ukupno.get(kljuc(p)) ?? 0) + 1);
  }
  // `redniBroj` na serveru je broj runde unutar slajda, pa se runde broje po redosledu (pitanja su po redu otvaranja).
  const vidjeno = new Map<number | string, number>();
  return pitanja.map(p => {
    const k = kljuc(p);
    const runda = (vidjeno.get(k) ?? 0) + 1;
    vidjeno.set(k, runda);
    return { runda, ukupno: ukupno.get(k) ?? 1 };
  });
}

/** Pregled sačuvanog izvođenja posle časa (spec 6.2): pitanja po redu otvaranja sa rezultatima i rang-lista. */
@Component({
  selector: 'app-izvodjenje-pregled',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, RangListaComponent, RezultatPrikazComponent],
  template: `
    <main class="uz-ed-strana uz-pr">
      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }

      @if (podaci(); as r) {
        <header class="uz-pr-zaglavlje">
          <a mat-icon-button [routerLink]="'/' + rute.prezentacijaIzvodjenja(r.izvodjenje.prezentacija.id)"
             aria-label="Nazad na izvođenja">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <div class="uz-pr-naslovi">
            <h1>{{ r.izvodjenje.prezentacija.naziv }}</h1>
            <p class="uz-pr-meta">
              <span>{{ r.izvodjenje.pocetak | date: 'd.M.yyyy. HH:mm' }}</span>
              <span>{{ veza() }}</span>
              <span>Učesnika: {{ r.izvodjenje.brojUcesnika }}</span>
            </p>
          </div>
          @if (r.izvodjenje.status === 'AKTIVNO') {
            <a mat-flat-button [routerLink]="'/' + rute.izvodjenjeKonzola(r.izvodjenje.id)">Nastavi</a>
          }
        </header>

        @if (!r.izvodjenje.cuvanje) {
          <section class="uz-ed-prazno-stanje">
            <mat-icon aria-hidden="true">visibility_off</mat-icon>
            <h2>Rezultati ovog izvođenja nisu čuvani.</h2>
            <p>Odgovori studenata postoje samo tokom izvođenja.</p>
          </section>
        } @else {
          @if (r.izvodjenje.status === 'AKTIVNO') {
            <p class="uz-ed-napomena">Izvođenje je još u toku, rezultati se menjaju.</p>
          }
          @for (k of kartice(); track k.p.rundaId; let i = $index) {
            <section class="uz-dan uz-pr-karta" [attr.aria-labelledby]="'pitanje-' + k.p.rundaId">
              <header class="uz-pr-karta-zaglavlje">
                <h2 [id]="'pitanje-' + k.p.rundaId">Pitanje {{ i + 1 }}</h2>
                @if (k.p.rbSlajda) {
                  <span class="uz-ed-napomena">slajd {{ k.p.rbSlajda }}</span>
                }
                @if (k.oznaka.ukupno > 1) {
                  <span class="uz-cip uz-cip--jos">{{ k.oznaka.runda }}. runda</span>
                }
              </header>
              <div class="uz-pr-sadrzaj">
                <div class="uz-md uz-pr-tekst" [innerHTML]="k.html"></div>
                @if (k.p.pitanje.slikaId; as slika) {
                  <img class="uz-pr-slika" [src]="url(slika)" alt="Slika uz pitanje">
                }
                <app-rezultat-prikaz [rezultat]="k.p.rezultat" [tekstPrikaz]="k.p.pitanje.tekstPrikaz"
                                     [jedinica]="k.p.pitanje.jedinica" />
              </div>
              <p class="uz-pr-podnozje">
                {{ tekst(k.p) }}
                @if (k.oznaka.ukupno > 1 && takmicenje() && k.oznaka.runda < k.oznaka.ukupno) {
                  <span class="uz-ed-napomena">Za poene važi samo poslednja runda.</span>
                }
              </p>
            </section>
          } @empty {
            <section class="uz-ed-prazno-stanje">
              <mat-icon aria-hidden="true">quiz</mat-icon>
              <h2>U ovom izvođenju nije bilo pitanja.</h2>
            </section>
          }

          @if (takmicenje()) {
            <section class="uz-dan uz-pr-karta" aria-labelledby="pr-rang">
              <header class="uz-pr-karta-zaglavlje"><h2 id="pr-rang">Rang-lista</h2></header>
              <div class="uz-pr-sadrzaj"><app-rang-lista [stavke]="r.rangLista" /></div>
            </section>
          }
        }
      } @else if (!greska()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje pregleda" />
      }
    </main>
  `,
})
export class IzvodjenjePregledPage {
  private readonly api = inject(IzvodjenjaApi);

  protected readonly rute = AppRoutes;
  protected readonly podaci = signal<IzvodjenjeRezultati | null>(null);
  protected readonly greska = signal<string | null>(null);

  protected readonly url = medijUrl;
  protected readonly tekst = procenatTacnihTekst;
  protected readonly veza = computed(() => {
    const r = this.podaci();
    return r ? opisVeze(r.izvodjenje) : '';
  });
  protected readonly takmicenje = computed(() => this.podaci()?.takmicenje ?? false);
  protected readonly kartice = computed(() => {
    const pitanja = this.podaci()?.pitanja ?? [];
    const oznake = oznakeRundi(pitanja);
    return pitanja.map((p, i) => ({ p, oznaka: oznake[i], html: renderMarkdown(p.pitanje.tekst) }));
  });

  constructor() {
    const id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    this.api.rezultati(id).subscribe({
      next: r => this.podaci.set(r),
      error: e => this.greska.set(razlogGreske(e, 'Pregled nije učitan.')),
    });
  }
}
