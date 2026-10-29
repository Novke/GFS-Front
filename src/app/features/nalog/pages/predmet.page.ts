import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription, forkJoin } from 'rxjs';

import { DatumPipe } from '../../../shared/util/datum.pipe';
import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import {
  MojZadatak, OcenaStudenta, PredmetStudenta, PrezentacijaStudenta, PrisustvoStudenta, TemaVezbanja,
} from '../data-access/portal.models';
import {
  KarticaPredmeta, idIzRute, karticaIzUpita, opisAktivnosti, poeni, predlogOcene, putanjaPrijave, status, ucinak, zvezdice,
} from '../data-access/portal.pravila';
import { MojZadatakKartica } from '../ui/moj-zadatak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';

interface Materijali { prezentacije: PrezentacijaStudenta[]; teme: TemaVezbanja[] }
interface Istorija { prisustvo: PrisustvoStudenta; zadaci: MojZadatak[] }

/** Stanje jedne kartice: `null` dok se učitava, greška ili podaci. */
type Ucitano<T> = { podaci: T } | { greska: string } | null;

const KARTICE: { id: KarticaPredmeta; naziv: string }[] = [
  { id: 'materijali', naziv: 'Materijali' },
  { id: 'istorija', naziv: 'Istorija' },
  { id: 'ocena', naziv: 'Ocena' },
];

/**
 * Strana predmeta (`/nalog/predmet/:id[?k=materijali|istorija|ocena]`, spec studentskog dela 12.2): sve što student sme da
 * vidi, u tri kartice. Kartica se učitava tek kad se otvori (i jednom po poseti strane).
 * - **Materijali:** prezentacije održane grupama studenta (samo videni slajdovi, posle kraja izvođenja; strana pregleda) i
 *   "Zadaci za vežbanje" (tipovi otvoreni grupi, po temi; broj po nivou i sopstveni učinak).
 * - **Istorija:** prisustvo po predavanju (bez bodova i napomena) i "Moji zadaci sa časa".
 * - **Ocena:** ništa dok nastavnik ne objavi predloge; posle objave sopstveni snimak (predlog, delovi, testovi).
 * Naziv predmeta i 404 daje `GET predmeti` (predmet koji student ne sluša: "Predmet nije pronađen."). Samo
 * `api/public/nalog/*`; 401 vodi na prijavu sa povratkom ovde.
 */
@Component({
  selector: 'app-predmet-page',
  imports: [DatumPipe, MatButton, MatProgressSpinner, MojZadatakKartica, NalogOkvir, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir [naslov]="predmet()?.naziv ?? 'Predmet'">
      <a class="nazad" routerLink="/nalog/predmeti">← Svi predmeti</a>
      @if (nemaPredmeta()) {
        <h2>Predmet</h2>
        <p class="poruka info" role="alert" data-nema>Predmet nije pronađen.</p>
      } @else if (greskaPredmeta(); as g) {
        <h2>Predmet</h2>
        <p class="poruka opasnost" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitajPredmet()">Pokušaj ponovo</button>
      } @else if (predmet(); as p) {
        <nav class="kartice" aria-label="Delovi predmeta">
          @for (k of kartice; track k.id) {
            <a [routerLink]="[]" [queryParams]="{ k: k.id === 'materijali' ? null : k.id }" [replaceUrl]="true"
               [class.aktivna]="kartica() === k.id" [attr.aria-current]="kartica() === k.id ? 'page' : null"
               [attr.data-kartica]="k.id">{{ k.naziv }}</a>
          }
        </nav>
        @switch (kartica()) {
          @case ('materijali') {
            <h2>Materijali</h2>
            @if (materijali(); as m) {
              @if ('greska' in m) {
                <p class="poruka opasnost" role="alert">{{ m.greska }}</p>
              } @else {
                <section aria-labelledby="naslov-prez">
                  <h3 id="naslov-prez">Prezentacije sa časova</h3>
                  @if (m.podaci.prezentacije.length === 0) {
                    <p class="prazno">Još nema. Prezentacija se pojavi ovde posle časa na kome je prikazana.</p>
                  } @else {
                    <ul class="lista">
                      @for (pr of m.podaci.prezentacije; track pr.id) {
                        <li>
                          <a class="stavka" [routerLink]="['/nalog/prezentacija', pr.id]" [attr.data-prezentacija]="pr.id">
                            <span class="naziv">{{ pr.naziv }}</span>
                            <span class="opis">{{ pr.odrzana | datum: 'kratko' }} · slajdova: {{ pr.slajdova }}</span>
                          </a>
                        </li>
                      }
                    </ul>
                  }
                </section>
                <section aria-labelledby="naslov-vezbanje">
                  <h3 id="naslov-vezbanje">Zadaci za vežbanje</h3>
                  @if (m.podaci.teme.length === 0) {
                    <p class="prazno">Još nema. Tip zadatka se otvori za vežbanje posle časa na kome ste ga radili.</p>
                  } @else {
                    @for (t of m.podaci.teme; track $index) {
                      <h4>{{ t.naziv }}</h4>
                      <ul class="lista">
                        @for (tip of t.tipovi; track tip.tipId) {
                          <li>
                            <a class="stavka" [routerLink]="['/nalog/predmet', p.id, 'vezbanje', tip.tipId]" [attr.data-tip]="tip.tipId">
                              <span class="naziv">{{ tip.naziv }}</span>
                              @if (tip.putanja.length) { <span class="opis">{{ tip.putanja.join(' › ') }}</span> }
                              <span class="opis">
                                @for (n of [1, 2, 3]; track n) {
                                  @if (tip.poNivou[n - 1]) {
                                    <span class="nivo"><span aria-hidden="true">{{ zvezdice(n) }}</span><span class="citac">nivo {{ n }}:</span> {{ tip.poNivou[n - 1] }}</span>
                                  }
                                }
                                @if (tip.papir) { · na papiru }
                              </span>
                              <span class="opis">{{ ucinak(tip) }}</span>
                            </a>
                          </li>
                        }
                      </ul>
                    }
                  }
                </section>
              }
            } @else {
              <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
            }
          }
          @case ('istorija') {
            <h2>Istorija</h2>
            @if (istorija(); as i) {
              @if ('greska' in i) {
                <p class="poruka opasnost" role="alert">{{ i.greska }}</p>
              } @else {
                <section aria-labelledby="naslov-prisustvo">
                  <h3 id="naslov-prisustvo">Prisustvo</h3>
                  <p class="zbir" data-prisustvo>Prisutan na {{ i.podaci.prisustvo.prisutan }} od {{ i.podaci.prisustvo.ukupno }}</p>
                  @if (i.podaci.prisustvo.predavanja.length) {
                    <ul class="lista">
                      @for (pr of i.podaci.prisustvo.predavanja; track pr.id) {
                        <li class="predavanje" [class.odsutan]="!pr.aktivnost" [attr.data-predavanje]="pr.id">
                          <span class="naziv">{{ pr.datum | datum: 'kratko' }} · čas {{ pr.redniBroj }}@if (pr.tema) { · {{ pr.tema }}}</span>
                          @if (!pr.svojaGrupa && pr.grupa) { <span class="opis">sa grupom {{ pr.grupa }}</span> }
                          <span class="opis aktivnost">{{ aktivnost(pr.aktivnost) }}</span>
                        </li>
                      }
                    </ul>
                  }
                </section>
                <section aria-labelledby="naslov-moji">
                  <h3 id="naslov-moji">Moji zadaci sa časa</h3>
                  @if (i.podaci.zadaci.length === 0) {
                    <p class="prazno">Još nema. Ovde su zadaci koje si dobio na času, posle kraja prezentacije.</p>
                  } @else {
                    <div class="zadaci">
                      @for (z of i.podaci.zadaci; track z.rundaId) {
                        <app-moj-zadatak [zadatak]="z" [predmetId]="p.id" />
                      }
                    </div>
                  }
                </section>
              }
            } @else {
              <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
            }
          }
          @case ('ocena') {
            <h2>Ocena</h2>
            @if (ocena(); as o) {
              @if ('greska' in o) {
                <p class="poruka opasnost" role="alert">{{ o.greska }}</p>
              } @else if (!o.podaci.objavljeno || !o.podaci.ocena) {
                <p class="prazno" data-nije-objavljeno>Ocena još nije objavljena. Nastavnik objavljuje predloge ocena kad budu spremni.</p>
              } @else {
                @let s = o.podaci.ocena;
                <p class="ocena" data-ocena>Predlog ocene: <strong>{{ predlog(o.podaci) }}</strong></p>
                <p class="opis">Objavljeno {{ o.podaci.objavljenoU | datum: 'sa-vremenom' }}</p>
                <dl class="delovi">
                  <dt>Aktivnost</dt><dd>{{ poeni(s.poeniAktivnost) }}</dd>
                  <dt>Domaći</dt><dd>{{ poeni(s.poeniDomaci) }}</dd>
                  <dt>Predispitne obaveze</dt><dd>{{ poeni(s.poeniPredispitne) }}</dd>
                  @for (t of s.testovi; track $index) {
                    <dt>{{ t.naziv }}</dt><dd>{{ poeni(t.poeni) }}</dd>
                  }
                  <dt class="ukupno">Ukupno</dt><dd class="ukupno">{{ poeni(s.ukupno) }}</dd>
                </dl>
              }
            } @else {
              <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
            }
          }
        }
      } @else {
        <h2>Predmet</h2>
        <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 12px; font-size: 18px; }
    h3 { margin: 18px 0 8px; font-size: 16px; }
    h4 { margin: 12px 0 6px; font-size: 15px; color: var(--ink-2); }
    .nazad { display: inline-flex; align-items: center; min-height: 44px; margin: -8px 0 4px; color: var(--primary); font-weight: 600; }
    .kartice { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 0 16px; border: 1px solid var(--line);
      border-radius: 999px; overflow: hidden; }
    .kartice a { display: flex; align-items: center; justify-content: center; min-height: 44px; color: var(--ink);
      font-weight: 600; text-decoration: none; }
    .kartice a + a { border-left: 1px solid var(--line); }
    .kartice a.aktivna { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .kartice a:focus-visible, .stavka:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .prazno { margin: 0; color: var(--ink-2); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.info { border-color: var(--line); }
    .lista { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .stavka, .predavanje { display: flex; flex-direction: column; gap: 2px; min-height: 44px; padding: 10px 12px;
      border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); text-decoration: none; }
    .stavka:hover { border-color: var(--primary); }
    .naziv { font-weight: 600; overflow-wrap: anywhere; }
    .opis { color: var(--ink-2); font-size: 14px; overflow-wrap: anywhere; }
    .nivo + .nivo::before { content: ' · '; }
    .citac { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .odsutan .aktivnost { color: var(--danger); }
    .zbir { margin: 0 0 8px; font-weight: 600; }
    .zadaci { display: flex; flex-direction: column; gap: 12px; }
    .ocena { margin: 0; font-size: 18px; }
    .ocena strong { font-size: 28px; }
    .delovi { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 14px 0 0; }
    .delovi dt { color: var(--ink-2); overflow-wrap: anywhere; }
    .delovi dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .delovi .ukupno { padding-top: 6px; border-top: 1px solid var(--line); color: var(--ink); font-weight: 700; }
  `,
})
export class PredmetPage {
  /** `:id` iz rute i `?k=` (kartica), `withComponentInputBinding`. */
  readonly id = input<string | null | undefined>(null);
  readonly k = input<string | null | undefined>(null);

  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  protected readonly kartice = KARTICE;
  protected readonly kartica = computed(() => karticaIzUpita(this.k()));
  private readonly predmetId = computed(() => idIzRute(this.id()));
  protected readonly predmet = signal<PredmetStudenta | null>(null);
  protected readonly nemaPredmeta = signal(false);
  protected readonly greskaPredmeta = signal<string | null>(null);
  protected readonly materijali = signal<Ucitano<Materijali>>(null);
  protected readonly istorija = signal<Ucitano<Istorija>>(null);
  protected readonly ocena = signal<Ucitano<OcenaStudenta>>(null);

  protected readonly zvezdice = zvezdice;
  protected readonly ucinak = ucinak;
  protected readonly aktivnost = opisAktivnosti;
  protected readonly poeni = poeni;
  protected readonly predlog = predlogOcene;

  private readonly zahtevi: Subscription[] = [];
  /** Kartice koje su već tražene za ovaj predmet (svaka jednom po poseti). */
  private readonly trazeno = new Set<KarticaPredmeta>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtevi.forEach(z => z.unsubscribe()));
    // nov predmet (ista komponenta, drugi :id): sve ispočetka
    effect(() => {
      this.predmetId();
      untracked(() => this.ucitajPredmet());
    });
    effect(() => {
      const k = this.kartica();
      const p = this.predmet();
      if (p) {
        untracked(() => this.ucitajKarticu(p.id, k));
      }
    });
  }

  protected ucitajPredmet(): void {
    this.zahtevi.forEach(z => z.unsubscribe());
    this.zahtevi.length = 0;
    this.trazeno.clear();
    this.predmet.set(null);
    this.materijali.set(null);
    this.istorija.set(null);
    this.ocena.set(null);
    this.greskaPredmeta.set(null);
    const id = this.predmetId();
    this.nemaPredmeta.set(id === null);
    if (id === null) {
      return;
    }
    this.zahtevi.push(this.api.predmeti().subscribe({
      next: lista => {
        const p = (lista ?? []).find(x => x.id === id) ?? null;
        this.nemaPredmeta.set(p === null);
        this.predmet.set(p);
      },
      error: (e: unknown) => this.neuspeh(e, g => this.greskaPredmeta.set(g)),
    }));
  }

  private ucitajKarticu(id: number, k: KarticaPredmeta): void {
    if (this.trazeno.has(k)) {
      return;
    }
    this.trazeno.add(k);
    switch (k) {
      case 'materijali':
        this.ucitaj(forkJoin({ prezentacije: this.api.prezentacije(id), teme: this.api.vezbanje(id) }), this.materijali);
        break;
      case 'istorija':
        this.ucitaj(forkJoin({ prisustvo: this.api.prisustvo(id), zadaci: this.api.mojiZadaci(id) }), this.istorija);
        break;
      case 'ocena':
        this.ucitaj(this.api.ocena(id), this.ocena);
        break;
    }
  }

  private ucitaj<T>(izvor: Observable<T>, cilj: { set(v: Ucitano<T>): void }): void {
    this.zahtevi.push(izvor.subscribe({
      next: podaci => cilj.set({ podaci }),
      error: (e: unknown) => this.neuspeh(e, g => cilj.set({ greska: g })),
    }));
  }

  /** 401: prijava; 404: predmet nije (više) dostupan; ostalo poruka u kartici. */
  private neuspeh(e: unknown, prikazi: (g: string) => void): void {
    const s = status(e);
    if (s === 401) {
      void this.router.navigateByUrl(putanjaPrijave(this.router.url));
    } else if (s === 404) {
      this.predmet.set(null);
      this.nemaPredmeta.set(true);
    } else {
      prikazi(porukaGreske(e));
    }
  }
}
