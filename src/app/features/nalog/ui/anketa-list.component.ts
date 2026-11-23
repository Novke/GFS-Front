import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { AnketaTrakeComponent } from '../../../shared/ui/anketa-trake.component';
import { glasovaTekst, odbrojavanje, preostaloMs } from '../../../shared/util/ankete';
import { AnketeStudentaApi } from '../data-access/ankete-studenta.api';
import { AnketaStudentu } from '../data-access/ankete-studenta.models';
import { izborZaSlanje } from '../data-access/ankete-studenta.pravila';
import { AnketeStudentaStore } from '../data-access/ankete-studenta.store';
import { odlaganjePosle429, sledeciUpitMs } from '../data-access/cas.pravila';
import { status } from '../data-access/portal.pravila';

/**
 * Donji list brze ankete (spec 6.3, maketa F): oznaka "Anketa · anonimno", odbrojavanje kad ima rok, pitanje i dugmad
 * odgovora (za više odgovora kućice i "Pošalji"); posle glasa "Glas je zabeležen ✓" i promena dok je otvorena; pokazan
 * rezultat kao trake. "Kasnije" sklanja list do sledeće nove ankete (kartica ostaje). Nije modalan: stranica ispod radi.
 *
 * `izvor="nalog"`: ljuska tabova (stoji iznad donjih tabova; podatke donose ljuska i tab Čas). `izvor="uzivo"`: telefon u
 * prezentaciji (`/uzivo/<kod>?sa=cas`): list sam pita `GET public/nalog/ankete` na 10 s ± 2 s, odmah kad se stranica vrati u
 * prvi plan (i na push, kroz store); 401 zaustavlja, 429 odlaže.
 */
@Component({
  selector: 'app-anketa-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnketaTrakeComponent],
  host: { '[class.al--uzivo]': "izvor() === 'uzivo'" },
  template: `
    @if (store.list(); as a) {
      <section class="al" aria-labelledby="anketa-list-pitanje" data-anketa-list [attr.data-anketa-id]="a.id">
        <div class="al-grip" aria-hidden="true"></div>
        <div class="al-cipovi">
          <span class="al-cip">Anketa</span><span class="al-cip al-cip--siv">anonimno</span>
          @if (a.publika === 'GRUPA') { <span class="al-cip al-cip--siv">cela grupa</span> }
          @if (a.otvorena && preostalo(a); as p) { <span class="al-cip al-cip--rok" data-anketa-rok>{{ p }}</span> }
          @if (!a.otvorena) { <span class="al-cip al-cip--siv">zatvorena</span> }
        </div>
        <h2 id="anketa-list-pitanje" class="al-pitanje">{{ a.pitanje }}</h2>
        @if (a.viseOdgovora) {
          <fieldset class="al-odgovori" [disabled]="!a.otvorena || store.salje() !== null">
            <legend class="al-sr">Izaberi jedan ili više odgovora</legend>
            @for (o of a.opcije; track $index; let i = $index) {
              <label class="al-glas al-kucica" [class.al-glas--izabran]="izabrano(a).includes(i)">
                <input type="checkbox" [checked]="izabrano(a).includes(i)" (change)="store.izaberi(a, i)" data-anketa-odgovor>
                <span>{{ o }}</span>
              </label>
            }
          </fieldset>
          @if (a.otvorena) {
            <button type="button" class="al-posalji" [disabled]="!zaSlanje(a) || store.salje() !== null" (click)="posalji(a)" data-anketa-posalji>
              {{ a.mojGlas ? 'Promeni glas' : 'Pošalji' }}
            </button>
          }
        } @else {
          <div class="al-odgovori" role="group" aria-labelledby="anketa-list-pitanje">
            @for (o of a.opcije; track $index; let i = $index) {
              <button type="button" class="al-glas" [class.al-glas--izabran]="izabrano(a).includes(i)" [attr.aria-pressed]="izabrano(a).includes(i)"
                      [disabled]="!a.otvorena || store.salje() !== null" (click)="store.glasaj(a, [i])" data-anketa-odgovor>{{ o }}</button>
            }
          </div>
        }
        @if (a.rezultat; as r) {
          <div class="al-rezultat" data-anketa-rezultat>
            <p class="al-rezultat-naslov">Rezultat · {{ glasova(r.brojGlasalo) }}</p>
            <app-anketa-trake [opcije]="a.opcije" [glasovi]="r.glasovi" [brojGlasalo]="r.brojGlasalo" />
          </div>
        }
        <p class="al-stanje" role="status" data-anketa-stanje>
          @if (store.greska(); as g) {
            <span class="al-greska">{{ g }}</span>
          } @else if (store.salje() === a.id) {
            Šaljem…
          } @else if (!a.otvorena) {
            Anketa je zatvorena.
          } @else if (a.mojGlas) {
            Glas je zabeležen ✓ · možeš da ga promeniš dok je otvoreno
          }
        </p>
        <div class="al-dno">
          <button type="button" class="al-skloni" (click)="store.skloni()" data-anketa-skloni>{{ a.mojGlas || !a.otvorena ? 'Zatvori' : 'Kasnije' }}</button>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      position: fixed; left: 0; right: 0; bottom: calc(60px + env(safe-area-inset-bottom, 0px)); z-index: 5; display: flex;
      justify-content: center; pointer-events: none;
    }
    :host(.al--uzivo) { bottom: 0; }
    .al {
      pointer-events: auto; width: min(100%, 480px); max-height: min(78dvh, 640px); overflow: auto; padding: 8px 16px 12px;
      border: 1px solid var(--line); border-bottom: 0; border-radius: 18px 18px 0 0; background: var(--surface); color: var(--ink);
      box-shadow: 0 -6px 24px rgb(0 0 0 / 18%);
    }
    :host(.al--uzivo) .al { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
    .al-grip { width: 40px; height: 4px; margin: 0 auto 10px; border-radius: 2px; background: var(--line); }
    .al-cipovi { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .al-cip { padding: 2px 10px; border-radius: 999px; background: var(--primary-soft); color: var(--primary-soft-ink); font-size: 13px; font-weight: 600; }
    .al-cip--siv { background: var(--surface-2); color: var(--ink-2); }
    .al-cip--rok { background: var(--warn-soft); color: var(--ink); font-variant-numeric: tabular-nums; }
    .al-pitanje { margin: 0 0 12px; font-size: 20px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
    .al-odgovori { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; border: 0; min-width: 0; }
    .al-glas {
      display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 14px; border: 2px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; text-align: left;
      cursor: pointer; overflow-wrap: anywhere; touch-action: manipulation;
    }
    .al-glas--izabran { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-soft-ink); font-weight: 600; }
    .al-glas:disabled, .al-odgovori:disabled .al-glas { cursor: default; }
    .al-glas:focus-visible, .al-kucica:focus-within { outline: 3px solid var(--focus); outline-offset: 2px; }
    .al-kucica input { width: 20px; height: 20px; margin: 0; accent-color: var(--primary); }
    .al-posalji, .al-skloni {
      min-height: 44px; padding: 0 18px; border-radius: 999px; font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation;
    }
    .al-posalji { width: 100%; margin-top: 10px; border: 0; background: var(--primary); color: var(--primary-ink); }
    .al-posalji:disabled { opacity: .5; cursor: default; }
    .al-skloni { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
    .al-rezultat { margin-top: 14px; }
    .al-rezultat-naslov { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .al-stanje { min-height: 1.4em; margin: 10px 0 0; font-size: 13px; color: var(--muted); text-align: center; }
    .al-greska { color: var(--danger); }
    .al-dno { display: flex; justify-content: flex-end; margin-top: 8px; }
    .al-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class AnketaListComponent implements OnInit {
  readonly izvor = input<'nalog' | 'uzivo'>('nalog');

  protected readonly store = inject(AnketeStudentaStore);
  private readonly api = inject(AnketeStudentaApi);
  private readonly dokument = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  /** Lokalni sat za odbrojavanje (svake sekunde, samo dok list postoji). */
  private readonly sada = signal(Date.now());
  private readonly prikazanRok = computed(() => this.store.list()?.rokMs ?? null);

  constructor() {
    const t = setInterval(() => {
      if (this.prikazanRok() !== null) {
        this.sada.set(Date.now());
      }
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  ngOnInit(): void {
    if (this.izvor() === 'uzivo') {
      this.pratiAnkete();
    }
  }

  protected izabrano(a: AnketaStudentu): number[] {
    return (a.viseOdgovora ? this.store.izbor()[a.id] : undefined) ?? a.mojGlas ?? [];
  }

  protected zaSlanje(a: AnketaStudentu): number[] | null {
    return izborZaSlanje(this.izabrano(a), a);
  }

  protected posalji(a: AnketaStudentu): void {
    const izbor = this.zaSlanje(a);
    if (izbor) {
      this.store.glasaj(a, izbor);
    }
  }

  protected preostalo(a: AnketaStudentu): string | null {
    const ms = preostaloMs(a.rokMs, a.sadaMs, this.store.primljenoMs(), this.sada());
    return ms === null ? null : odbrojavanje(ms);
  }

  protected glasova(n: number): string {
    return glasovaTekst(n);
  }

  /** Telefon u prezentaciji: `GET ankete` na 10 s ± 2 s i odmah po povratku u prvi plan; 401 zaustavlja, 429 odlaže. */
  private pratiAnkete(): void {
    let zahtev: Subscription | null = null;
    let tajmer: ReturnType<typeof setTimeout> | null = null;
    let gotovo = false;
    let broj429 = 0;
    const zakazi = (ms: number) => {
      if (tajmer !== null) {
        clearTimeout(tajmer);
      }
      tajmer = gotovo ? null : setTimeout(upit, ms);
    };
    const upit = () => {
      if (gotovo || this.dokument.visibilityState === 'hidden' || (zahtev && !zahtev.closed)) {
        return;
      }
      zahtev = this.api.ankete().subscribe({
        next: l => {
          broj429 = 0;
          this.store.primi(l);
          zakazi(sledeciUpitMs(Math.random()));
        },
        error: (e: unknown) => {
          if (status(e) === 401) {
            gotovo = true; // nije prijavljen student: list ostaje prazan
            return;
          }
          broj429 = status(e) === 429 ? broj429 + 1 : 0;
          zakazi(broj429 > 0 ? odlaganjePosle429(broj429) : sledeciUpitMs(Math.random()));
        },
      });
    };
    const vidljivost = () => {
      if (this.dokument.visibilityState === 'visible') {
        upit();
      }
    };
    this.dokument.addEventListener('visibilitychange', vidljivost);
    this.destroyRef.onDestroy(() => {
      gotovo = true;
      this.dokument.removeEventListener('visibilitychange', vidljivost);
      if (tajmer !== null) {
        clearTimeout(tajmer);
      }
      zahtev?.unsubscribe();
    });
    upit();
  }
}
