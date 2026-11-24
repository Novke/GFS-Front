import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { FajlCasa, FajloviCasa, ispravanKod, oznakaVrste, urlFajlaCasa, velicinaFajla } from '../../../shared/util/fajlovi';
import { FajloviCasaApi } from '../fajlovi.api';

/** Koliko često se spisak osvežava dok je kartica vidljiva (novi slajd = novi fajl). */
export const OSVEZI_MS = 20_000;

export const PORUKA_NEVAZI = 'Kod ne važi. Proveri broj sa table.';
const PORUKA_OGRANICENJE = 'Previše pogrešnih kodova. Pokušaj ponovo za 15 minuta.';
const PORUKA_VEZA = 'Server nije dostupan. Proveri vezu i pokušaj ponovo.';

type Ishod =
  | { vrsta: 'spisak'; podaci: FajloviCasa }
  | { vrsta: 'nevazi' }
  | { vrsta: 'ogranicenje'; poruka: string }
  | { vrsta: 'greska' };

function ishodGreske(e: unknown): Ishod {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 404) return { vrsta: 'nevazi' };
    if (e.status === 429) {
      const reason = (e.error as { reason?: unknown } | null)?.reason;
      return { vrsta: 'ogranicenje', poruka: typeof reason === 'string' && reason.trim() ? reason : PORUKA_OGRANICENJE };
    }
  }
  return { vrsta: 'greska' };
}

/** `2026-11-20` -> `20.11.2026.`; sve drugo se ne prikazuje. */
export function datumZaPrikaz(datum: string | null): string | null {
  const m = datum ? /^(\d{4})-(\d{2})-(\d{2})/.exec(datum) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}.` : null;
}

/**
 * Javna stranica `f` i `f/:kod` (student na računaru u učionici, bez prijave, bez ljuske): kod sa table (4 cifre) otvara
 * spisak fajlova časa za preuzimanje. Sme da zove samo `api/public/fajlovi/*` (ESLint `gfs/javna-ruta-uvozi`). Dok je kartica
 * vidljiva, spisak se osvežava na 20 s (i odmah kad kartica ponovo postane vidljiva); pogrešan kod (404) i ograničenje
 * (429) zaustavljaju osvežavanje i vraćaju polje za unos. Osvežavanje je `effect` sa `onCleanup` (bez rxjs operatora).
 */
@Component({
  selector: 'app-fajlovi-casa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // bez Angular Material i formi: ova lenja ruta ne sme da povuče deljeni kod u početni paket (budžet 800 kB)
  styles: `
    :host { display: block; }
    h1 { margin: 0 0 4px; font-size: 1.6rem; }
    .podnaslov { margin: 0 0 20px; color: var(--muted); }
    .unos { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
    .unos label { display: grid; gap: 4px; font-weight: 600; }
    .unos input { width: 11rem; box-sizing: border-box; padding: 10px 12px; font-family: var(--font-mono); font-size: 1.6rem;
      letter-spacing: 0.15em; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
    .unos input[aria-invalid='true'] { border-color: var(--danger); }
    .greska-polja { margin: 0; color: var(--danger); font-size: 0.875rem; font-weight: 400; }
    .dugme { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; font: inherit;
      font-weight: 600; color: var(--primary-ink); background: var(--primary); border: 0; border-radius: 8px; cursor: pointer;
      text-decoration: none; }
    .dugme[aria-disabled='true'] { cursor: progress; }
    .dugme-sporedno { color: var(--primary); background: transparent; }
    .dugme:focus-visible, .unos input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .poruka { margin: 0 0 16px; padding: 10px 14px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-weight: 600; }
    .upozorenje { margin: 12px 0 0; color: var(--muted); font-size: 0.9rem; }
    .grupa { margin: 20px 0 0; }
    .grupa h2 { margin: 0 0 8px; font-size: 1.05rem; color: var(--ink-2); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .fajl { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding: 12px 14px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
    .ime { font-weight: 600; overflow-wrap: anywhere; }
    .meta { color: var(--muted); font-size: 0.875rem; }
    .prazno { color: var(--muted); }
    .nazad { margin-top: 20px; }
  `,
  template: `
    @if (podaci(); as p) {
      <h1>{{ p.predmet }}</h1>
      <p class="podnaslov">{{ podnaslov() }}</p>
      @if (!veza()) { <p class="upozorenje" role="status" data-bez-veze>{{ vezaPoruka }}</p> }
      @if (!p.fajlovi.length) {
        <p class="prazno" data-nema-fajlova>Za sada nema fajlova. Nov fajl se pojavi čim nastavnik pređe na slajd uz koji ga ima.</p>
      }
      @for (g of grupe(); track g.naziv) {
        <section class="grupa">
          @if (grupe().length > 1) { <h2>{{ g.naziv }}</h2> }
          <ul class="lista">
            @for (f of g.fajlovi; track f.id) {
              <li class="fajl" data-fajl>
                <div>
                  <div class="ime">{{ f.naziv }}</div>
                  <div class="meta">{{ vrsta(f) }} · {{ velicina(f) }}</div>
                </div>
                <a class="dugme" [href]="url(f)" download [attr.aria-label]="'Preuzmi ' + f.naziv">Preuzmi</a>
              </li>
            }
          </ul>
        </section>
      }
      <p class="nazad"><a class="dugme dugme-sporedno" href="f" (click)="drugiBroj($event)">Drugi broj</a></p>
    } @else {
      <h1>Fajlovi sa časa</h1>
      <p class="podnaslov">Upiši broj sa table.</p>
      @if (poruka(); as m) { <p class="poruka" role="alert" data-poruka>{{ m }}</p> }
      <form class="unos" (submit)="otvori($event)" novalidate>
        <label>
          Broj sa table
          <input [value]="polje()" (input)="polje.set($any($event.target).value)" inputmode="numeric" maxlength="4" autocomplete="off"
                 [attr.aria-invalid]="greskaPolja() ? 'true' : null" data-kod-polje>
          @if (greskaPolja(); as g) { <span class="greska-polja">{{ g }}</span> }
        </label>
        <button class="dugme" type="submit" [attr.aria-disabled]="ucitava() ? 'true' : null" data-kod-dugme>Prikaži fajlove</button>
      </form>
      @if (ucitava()) { <p class="upozorenje" role="status">Učitavanje…</p> }
    }
  `,
})
export class FajloviCasaPage {
  private readonly api = inject(FajloviCasaApi);
  private readonly router = inject(Router);

  /** Iz rute `f/:kod` (withComponentInputBinding); na `f` nema ga. */
  readonly kod = input<string | undefined>(undefined);

  protected readonly polje = signal('');
  protected readonly greskaPolja = signal<string | null>(null);
  protected readonly podaci = signal<FajloviCasa | null>(null);
  protected readonly poruka = signal<string | null>(null);
  protected readonly ucitava = signal(false);
  /** Poslednje osvežavanje nije uspelo (mreža), a stari spisak je još na ekranu. */
  protected readonly veza = signal(true);
  protected readonly vezaPoruka = PORUKA_VEZA;
  /** Isti kod ukucan ponovo posle greške: ruta se ne menja, pa ovo ponovo pokreće učitavanje. */
  private readonly pokusaj = signal(0);

  protected readonly vrsta = (f: FajlCasa) => oznakaVrste(f.vrsta);
  protected readonly velicina = (f: FajlCasa) => velicinaFajla(f.velicina);
  protected readonly url = (f: FajlCasa) => urlFajlaCasa(this.podaci()?.kod ?? this.kod() ?? '', f.id);
  protected readonly podnaslov = computed(() => {
    const p = this.podaci();
    if (!p) return '';
    return [p.tema, datumZaPrikaz(p.datum)].filter(Boolean).join(' · ');
  });
  /** Fajlovi po prezentaciji (redosled sa servera). */
  protected readonly grupe = computed(() => {
    const m = new Map<string, FajlCasa[]>();
    for (const f of this.podaci()?.fajlovi ?? []) m.set(f.prezentacija, [...(m.get(f.prezentacija) ?? []), f]);
    return [...m].map(([naziv, fajlovi]) => ({ naziv, fajlovi }));
  });

  constructor() {
    // Praćenje koda bez rxjs operatora (ova lenja ruta ne sme da poveća početni paket): effect pokreće osvežavanje, a
    // `onCleanup` ga zaustavlja pri promeni koda ili unistenju stranice (`DestroyRef` effecta).
    effect(onCleanup => {
      const kod = this.kod();
      this.pokusaj();
      if (kod === undefined) {
        this.prikazi(null);
        return;
      }
      if (!ispravanKod(kod)) {
        this.prikazi({ vrsta: 'nevazi' }); // bez poziva: ne troši pokušaje na serveru
        return;
      }
      this.prati(kod, onCleanup);
    });
  }

  /** Odmah, pa na 20 s i čim kartica ponovo postane vidljiva; staje na 404 i 429. Jedan zahtev u letu. */
  private prati(kod: string, onCleanup: (f: () => void) => void): void {
    let unisten = false; // promena koda ili unistenje stranice: kasni odgovor se ignoriše
    let staje = false; // 404 ili 429: osvežavanje se ne nastavlja
    let uLetu = false;
    let pretplata: Subscription | null = null;
    const osvezi = () => {
      if (unisten || staje || uLetu || document.visibilityState !== 'visible') return;
      uLetu = true;
      pretplata = this.api.casa(kod).subscribe({
        next: podaci => {
          uLetu = false;
          if (!unisten) this.prikazi({ vrsta: 'spisak', podaci });
        },
        error: (e: unknown) => {
          uLetu = false;
          const ishod = ishodGreske(e);
          if (ishod.vrsta !== 'greska') staje = true;
          if (!unisten) this.prikazi(ishod);
        },
      });
    };
    const sat = setInterval(osvezi, OSVEZI_MS);
    document.addEventListener('visibilitychange', osvezi);
    onCleanup(() => {
      unisten = true;
      clearInterval(sat);
      document.removeEventListener('visibilitychange', osvezi);
      pretplata?.unsubscribe();
    });
    osvezi();
  }

  private prikazi(i: Ishod | null): void {
    this.ucitava.set(false);
    if (i === null) {
      this.podaci.set(null);
      this.poruka.set(null);
      return;
    }
    switch (i.vrsta) {
      case 'spisak':
        this.podaci.set(i.podaci);
        this.poruka.set(null);
        this.veza.set(true);
        break;
      case 'greska':
        // spisak koji je već na ekranu ostaje; bez njega je poruka uz polje (osvežavanje se i dalje pokušava)
        this.veza.set(false);
        if (!this.podaci()) this.poruka.set(PORUKA_VEZA);
        break;
      case 'nevazi':
        this.podaci.set(null);
        this.poruka.set(PORUKA_NEVAZI);
        this.polje.set('');
        break;
      case 'ogranicenje':
        this.podaci.set(null);
        this.poruka.set(i.poruka);
        break;
    }
  }

  protected otvori(e: Event): void {
    e.preventDefault(); // forma nije NgForm: bez ovoga bi pregledač ponovo učitao stranicu
    const unos = this.polje().replace(/\s+/g, '');
    if (!ispravanKod(unos)) {
      this.greskaPolja.set('Kod ima tačno 4 cifre.');
      return;
    }
    this.greskaPolja.set(null);
    if (unos === this.kod()) {
      this.ucitava.set(true);
      this.pokusaj.update(n => n + 1);
    } else {
      this.ucitava.set(true);
      void this.router.navigate(['/f', unos]);
    }
  }

  protected drugiBroj(e: Event): void {
    e.preventDefault();
    this.polje.set('');
    void this.router.navigate(['/f']);
  }
}
