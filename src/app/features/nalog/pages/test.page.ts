import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, numberAttribute, signal, untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { NalogApi } from '../data-access/nalog.api';
import { PolaganjeStore } from '../data-access/polaganje.store';
import { putanjaPrijave } from '../data-access/portal.pravila';
import { TestoviStudentaApi } from '../data-access/testovi-studenta.api';
import {
  CEKAONICA_MS, formatPoena, formatSata, popunjenost, POSLE_ROKA_MS, preostaloMs, SAMOSTALNA_ODJAVA_MS, vremeIzIso,
} from '../data-access/testovi-studenta.pravila';
import { IzmenaPolja, TestZadatak } from '../ui/test-zadatak.component';

/**
 * Polaganje online testa (`nalog/test/:id`, van ljuske tabova, cela širina; spec online testova 11 i 17). Faze sa servera:
 * ULAZ (dugme „Uđi“, ulazni kod kad ga test traži), CEKANJE (čekaonica, pita na 5 s), U_TOKU (spisak zadataka levo, na telefonu
 * traka; zadatak desno; sat od `rokMs` po satu servera; „Predaj“ sa brojem praznih polja), PREDATO i ZAVRSEN („Predato u …“,
 * „Odjavi se sa ovog uređaja“; na RACUNAR sesiji sama odjava posle 2 min). Meki znaci: `visibilitychange` i `blur` prozora
 * šalju `dogadjaj` (napustio/vratio se). Nikakva povratna informacija o tačnosti. Zove samo `api/public/nalog/*` i slike.
 */
@Component({
  selector: 'app-test-page',
  imports: [RouterLink, TestZadatak],
  providers: [PolaganjeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:visibilitychange)': 'vidljivost()',
    '(window:blur)': 'napusti()',
    '(window:focus)': 'vrati()',
    '(window:beforeunload)': 'preIzlaska($event)',
  },
  template: `
    @let p = store.polaganje();
    <div class="strana">
      <header class="vrh">
        <div class="naslov">
          <p class="nad">{{ p?.predmet ?? 'Online test' }}</p>
          <h1>{{ p?.naziv ?? 'Test' }}</h1>
          @if (p) { <p class="ko" data-ko>{{ p.ime }} {{ p.prezime }} · {{ p.indeks }}@if (p.grupaTesta) { · grupa {{ p.grupaTesta }} }</p> }
        </div>
        @if (p?.faza === 'U_TOKU') {
          <div class="sat" [class.malo]="malo()" role="timer" aria-live="off" [attr.aria-label]="'Preostalo vreme ' + sat()" data-sat>
            {{ sat() }}
          </div>
        }
      </header>

      @if (store.greska(); as g) {
        <p class="baner greska" role="alert" data-greska>{{ g }}</p>
      }

      @if (!p) {
        @if (store.ucitava()) { <p class="tiho">Učitavam test…</p> }
        @else if (store.greska()) {
          <p><a routerLink="/nalog/pocetna" class="dugme">Nazad na nalog</a></p>
        }
      } @else {
        @switch (p.faza) {
          @case ('ULAZ') {
            <section class="kartica" data-ulaz>
              <h2>Ulaz u test</h2>
              <p>Trajanje: {{ trajanje() }} min · najviše {{ poeni(p.maxPoena) }}. Kad uđeš, sačekaj da nastavnik pokrene test.</p>
              <form class="ulaz" (submit)="$event.preventDefault(); udji()">
                @if (trebaKod()) {
                  <label for="ulazni-kod">Ulazni kod sa table</label>
                  <input id="ulazni-kod" class="unos kod" inputmode="numeric" autocomplete="off" maxlength="8"
                         [value]="kod()" (input)="kod.set($any($event.target).value)" data-kod />
                }
                <button type="submit" class="dugme glavno" [disabled]="salje()" data-udji>Uđi u test</button>
              </form>
            </section>
          }
          @case ('CEKANJE') {
            <section class="kartica" data-cekaonica>
              <h2>Čekaonica</h2>
              <p>Ušao si. Test počinje kad ga nastavnik pokrene; ova strana se sama osvežava.</p>
              <p class="tiho">Ne zatvaraj stranu.</p>
            </section>
          }
          @case ('U_TOKU') {
            @if (store.zakljucano()) {
              <div class="baner upozorenje" role="alert" data-drugi-uredjaj>
                <p>Test je otvoren na drugom uređaju. Ovde ništa ne može da se sačuva.</p>
                <button type="button" class="dugme glavno" [disabled]="salje()" (click)="nastaviOvde()" data-nastavi-ovde>Nastavi ovde</button>
              </div>
            }
            @if (store.imaGresku() && !store.zakljucano()) {
              <p class="baner greska" role="alert" data-nesacuvano>
                Neki odgovori nisu sačuvani. Ne zatvaraj stranu; pokušavam ponovo, a uneto ostaje i ako se strana osveži.
              </p>
            }
            <div class="rad">
              <nav class="spisak" aria-label="Zadaci">
                @for (z of store.zadaciTesta(); track z.zadatakId; let i = $index) {
                  @let st = stanjeZadatka(z.zadatakId);
                  <button type="button" class="stavka" [class.aktivna]="i === izabran()" [attr.aria-current]="i === izabran() ? 'step' : null"
                          [attr.data-stavka]="z.rb" (click)="izabran.set(i)">
                    <span class="rb">{{ z.rb }}</span>
                    <span class="sz" [attr.data-popunjenost]="st">{{ oznakaPopunjenosti(st) }}</span>
                  </button>
                }
              </nav>
              <main class="zadatak">
                @if (trenutni(); as z) {
                  @let s = store.zadaci()[z.zadatakId];
                  <app-test-zadatak [zadatak]="z" [uneto]="s?.uneto ?? {}" [status]="s?.status ?? 'cisto'" [poruka]="s?.poruka ?? null"
                                    [sacuvano]="s?.sacuvano ?? null" [zakljucano]="store.zakljucano()" (izmena)="unesi(z.zadatakId, $event)" />
                  <div class="kretanje">
                    <button type="button" class="dugme" [disabled]="izabran() === 0" (click)="izabran.set(izabran() - 1)">Prethodni</button>
                    @if (izabran() < store.zadaciTesta().length - 1) {
                      <button type="button" class="dugme" (click)="izabran.set(izabran() + 1)" data-sledeci>Sledeći</button>
                    }
                  </div>
                }
              </main>
            </div>
            <footer class="dno">
              <span class="tiho">{{ store.cuvaSe() ? 'Čuvam…' : store.imaGresku() ? 'Nije sve sačuvano.' : 'Sve je sačuvano.' }}</span>
              <button type="button" class="dugme glavno" [disabled]="store.predaje() || store.zakljucano()" (click)="predaj()" data-predaj>
                Predaj test
              </button>
            </footer>
          }
          @default {
            <section class="kartica" data-predato>
              @if (p.predato) {
                <h2>Predato u {{ vreme(p.predato) }}</h2>
                <p>Tvoji odgovori su sačuvani. Rezultate ćeš videti kad ih nastavnik objavi.</p>
              } @else {
                <h2>Test je završen</h2>
                <p>Vreme je isteklo; važe odgovori koji su bili sačuvani. Rezultate ćeš videti kad ih nastavnik objavi.</p>
              }
              @if (p.racunar) {
                <p class="tiho" data-sama-odjava>Ovaj računar se sam odjavljuje za {{ odjavaZa() }}.</p>
              }
              <div class="akcije">
                <button type="button" class="dugme glavno" [disabled]="salje()" (click)="odjavi()" data-odjavi>Odjavi se sa ovog uređaja</button>
                @if (!p.racunar) { <a routerLink="/nalog/pocetna" class="dugme">Nazad na nalog</a> }
              </div>
            </section>
          }
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .strana { display: flex; flex-direction: column; gap: 16px; max-width: 1100px; margin: 0 auto; padding: 16px; }
    .vrh { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 20px;
      border-radius: var(--radius); background: var(--hero-bg); color: var(--hero-ink); }
    .naslov { min-width: 0; }
    .nad { margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .8; }
    h1 { margin: 0; color: inherit; font-size: 22px; overflow-wrap: anywhere; }
    .ko { margin: 6px 0 0; opacity: .9; }
    .sat { flex: none; padding: 6px 12px; border-radius: 8px; background: var(--surface); color: var(--ink);
      font-family: var(--font-mono); font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .sat.malo { background: var(--warn-soft); color: var(--warn-ink, var(--ink)); }
    .kartica { display: flex; flex-direction: column; gap: 12px; max-width: 560px; padding: 20px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); }
    .kartica h2 { margin: 0; font-size: 20px; }
    .kartica p { margin: 0; }
    .ulaz { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .unos { min-height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
      color: var(--ink); font: inherit; font-size: 20px; }
    .kod { width: 10ch; font-family: var(--font-mono); letter-spacing: .2em; }
    .tiho { margin: 0; color: var(--ink-2); }
    .baner { margin: 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px; }
    .baner.greska { border-color: var(--danger); background: var(--danger-soft); color: var(--ink); }
    .baner.upozorenje { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
      border-color: var(--warn); background: var(--warn-soft); }
    .baner.upozorenje p { margin: 0; }
    .rad { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: start; }
    .spisak { display: flex; flex-direction: column; gap: 6px; position: sticky; top: 8px; }
    .stavka { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; padding: 0 10px;
      border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
    .stavka.aktivna { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .stavka:focus-visible, .dugme:focus-visible, .unos:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .rb { font-weight: 700; font-family: var(--font-mono); }
    .sz { font-size: 13px; color: var(--ink-2); }
    .sz[data-popunjenost='popunjeno'] { color: var(--ok); font-weight: 600; }
    .zadatak { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 16px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); }
    .kretanje, .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .dno { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .dugme { display: inline-flex; align-items: center; min-height: 48px; padding: 0 16px; border: 1px solid var(--line);
      border-radius: 8px; background: var(--surface); color: var(--primary); font: inherit; font-weight: 600; text-decoration: none;
      cursor: pointer; }
    .dugme.glavno { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
    .dugme:disabled { opacity: 0.6; cursor: default; }
    @media (max-width: 720px) {
      .strana { padding: 8px; }
      .rad { grid-template-columns: minmax(0, 1fr); }
      .spisak { flex-direction: row; overflow-x: auto; position: static; padding-bottom: 4px; }
      .stavka { flex: none; flex-direction: column; justify-content: center; gap: 0; min-width: 56px; padding: 4px 8px; }
      .sat { font-size: 22px; }
    }
  `,
})
export class TestPage {
  /** `:id` iz rute (`withComponentInputBinding`). */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly store = inject(PolaganjeStore);
  private readonly api = inject(TestoviStudentaApi);
  private readonly nalog = inject(NalogApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dokument = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly izabran = signal(0);
  protected readonly kod = signal('');
  protected readonly salje = signal(false);
  protected readonly trebaKod = signal(false);
  protected readonly trajanje = signal<number | null>(null);
  private readonly sada = signal(Date.now());
  private napustioMs: number | null = null;
  private potvrdaOtvorena = false;
  private osvezenoPosleRoka = false;
  private krajOdjave: number | null = null;
  private zahtev?: Subscription;

  protected readonly trenutni = computed(() => this.store.zadaciTesta()[this.izabran()] ?? null);
  private readonly preostalo = computed(() => {
    const p = this.store.polaganje();
    return p ? preostaloMs(p.rokMs, this.store.pomak(), this.sada()) : null;
  });
  protected readonly sat = computed(() => {
    const ms = this.preostalo();
    return ms === null ? '—' : formatSata(ms);
  });
  protected readonly malo = computed(() => (this.preostalo() ?? Infinity) <= 5 * 60_000);
  protected readonly odjavaZa = computed(() => formatSata(Math.max(0, (this.krajOdjaveSignal() ?? 0) - this.sada())));
  private readonly krajOdjaveSignal = signal<number | null>(null);

  protected readonly vreme = (iso: string) => vremeIzIso(iso, false);
  protected readonly poeni = (p: number) => `${formatPoena(p)} ${p === 1 ? 'poen' : 'poena'}`;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.store.ucitaj(id));
    });
    effect(() => {
      if (this.store.odjavljen()) {
        void this.router.navigateByUrl(putanjaPrijave(this.router.url));
      }
    });
    // ulazni kod i trajanje (PolaganjeStudenta ih nema): iz spiska otvorenih testova
    effect(() => {
      if (this.store.faza() === 'ULAZ') {
        const id = this.id();
        this.zahtev?.unsubscribe();
        this.zahtev = this.api.testovi().subscribe({
          next: l => {
            const t = l.find(x => x.testId === id);
            this.trebaKod.set(t?.trebaKod ?? false);
            this.trajanje.set(t?.trajanjeMin ?? null);
          },
          error: () => undefined,
        });
      }
    });
    // samostalna odjava računara posle predaje
    effect(() => {
      const p = this.store.polaganje();
      if (p?.racunar && (p.faza === 'PREDATO' || p.faza === 'ZAVRSEN') && this.krajOdjave === null) {
        this.krajOdjave = Date.now() + SAMOSTALNA_ODJAVA_MS;
        this.krajOdjaveSignal.set(this.krajOdjave);
      }
    });
    const tik = setInterval(() => this.otkucaj(), 1_000);
    const cekaonica = setInterval(() => {
      const f = this.store.faza();
      if ((f === 'CEKANJE' || f === 'ULAZ') && this.dokument.visibilityState !== 'hidden') {
        this.store.osvezi();
      }
    }, CEKAONICA_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(tik);
      clearInterval(cekaonica);
      this.zahtev?.unsubscribe();
    });
  }

  private otkucaj(): void {
    this.sada.set(Date.now());
    const ms = this.preostalo();
    if (this.store.faza() === 'U_TOKU' && ms === 0 && !this.osvezenoPosleRoka) {
      // server prima izmene još 10 s posle roka; posle toga pročitaj kraj
      this.osvezenoPosleRoka = true;
      void this.store.sacuvajSve();
      setTimeout(() => this.store.osvezi(), POSLE_ROKA_MS);
    }
    if (this.krajOdjave !== null && Date.now() >= this.krajOdjave && !this.salje()) {
      this.krajOdjave = Number.POSITIVE_INFINITY;
      this.odjavi();
    }
  }

  protected stanjeZadatka(zadatakId: number) {
    const z = this.store.zadaciTesta().find(x => x.zadatakId === zadatakId);
    return z ? popunjenost(z, this.store.zadaci()[zadatakId]?.uneto) : 'prazno';
  }

  protected oznakaPopunjenosti(s: string): string {
    return s === 'popunjeno' ? 'urađen' : s === 'zapoceto' ? 'započet' : 'prazan';
  }

  protected unesi(zadatakId: number, i: IzmenaPolja): void {
    this.store.unesi(zadatakId, i.kljuc, i.vrednost);
  }

  protected async udji(): Promise<void> {
    if (this.salje()) return;
    this.salje.set(true);
    const g = await this.store.udji(this.trebaKod() ? this.kod().trim() || null : null, false);
    this.salje.set(false);
    if (g) patchGreska(this.store, g);
  }

  protected async nastaviOvde(): Promise<void> {
    if (this.salje()) return;
    this.salje.set(true);
    const g = await this.store.udji(this.kod().trim() || null, true);
    this.salje.set(false);
    if (g) patchGreska(this.store, g);
  }

  protected predaj(): void {
    if (this.potvrdaOtvorena || this.store.predaje()) return;
    this.potvrdaOtvorena = true;
    const n = this.store.prazno();
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Predati test?',
      tekst: n === 0
        ? 'Sva polja su popunjena. Posle predaje odgovori ne mogu da se menjaju.'
        : `Prazno je još ${n} ${n === 1 ? 'polje' : 'polja'}. Posle predaje odgovori ne mogu da se menjaju.`,
      potvrdi: 'Predaj',
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async da => {
      this.potvrdaOtvorena = false;
      if (!da) return;
      const g = await this.store.predaj();
      if (g) patchGreska(this.store, g);
    });
  }

  protected odjavi(): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.nalog.odjavi().subscribe({
      next: () => this.odjavljen(),
      error: () => this.odjavljen(),
    });
  }

  private odjavljen(): void {
    const racunar = this.store.polaganje()?.racunar ?? false;
    void this.router.navigateByUrl(racunar ? 'r' : 'nalog', { replaceUrl: true, state: { info: 'Odjavljen si sa ovog uređaja.' } });
  }

  // ------------------------------------------------------------------------------------------- meki znaci

  protected vidljivost(): void {
    if (this.dokument.visibilityState === 'hidden') {
      this.napusti();
    } else {
      this.vrati();
      this.store.osvezi();
    }
  }

  protected napusti(): void {
    if (this.napustioMs !== null || this.store.faza() !== 'U_TOKU') return;
    this.napustioMs = Date.now();
    this.store.dogadjaj('NAPUSTIO', null);
  }

  protected vrati(): void {
    if (this.napustioMs === null) return;
    const trajanje = Date.now() - this.napustioMs;
    this.napustioMs = null;
    this.store.dogadjaj('VRATIO', trajanje);
  }

  /** Neposlato pri zatvaranju taba: pregledač pita (vrednosti su i u sessionStorage). */
  protected preIzlaska(e: BeforeUnloadEvent): void {
    if (this.store.faza() === 'U_TOKU' && (this.store.cuvaSe() || this.store.imaGresku())) {
      e.preventDefault();
    }
  }
}

function patchGreska(store: InstanceType<typeof PolaganjeStore>, poruka: string): void {
  store.postaviGresku(poruka);
}
