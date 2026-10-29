import { ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { CasApi } from '../data-access/cas.api';
import { CasIzvodjenje } from '../data-access/cas.models';
import { jeTabCas, putanjaPrijave, sledeciUpitTrakeMs, status } from '../data-access/portal.pravila';

export type TabNaloga = 'cas' | 'predmeti' | 'ja';

/** Tab za putanju: `/nalog/cas*` Čas, `/nalog/ja` Ja, sve ostalo pod ljuskom (predmeti, predmet, vežbanje, pregled) Predmeti. */
export function tabIzUrla(url: string): TabNaloga {
  if (jeTabCas(url)) {
    return 'cas';
  }
  return url.split(/[?#]/u, 1)[0] === '/nalog/ja' ? 'ja' : 'predmeti';
}

/**
 * Ljuska prijavljenog studenta (spec studentskog dela 12.1): donji tabovi **Čas · Predmeti · Ja** oko strana `cas`,
 * `cas/:token`, `predmeti`, `predmet/:id[/vezbanje/:tipId]`, `prezentacija/:id` i `ja`. Strana prijave (`/nalog`) i
 * `/nalog/moodle` su van nje.
 *
 * Traka **"Prezentacija je počela · Uđi"** stoji na tabovima Predmeti i Ja dok traje izvođenje predavanja na kome je student
 * čekiran (izvor `GET api/public/nalog/cas`, isti kao tab Čas). Traka je samo dugme: student usred vežbanja ili pregleda ne
 * gubi rad (sam ulazi samo tab Čas). Ljuska pita na 10 s ± 2 s dok je student na času, inače na 60 s, i odmah kad se
 * stranica vrati u prvi plan; skrivena stranica ne pita. Na tabu Čas ljuska ne pita i ne crta traku (Čas pita sam). 401 vodi
 * na prijavu sa povratkom na trenutnu stranu; 429 i greška mreže samo odlažu sledeći upit.
 */
@Component({
  selector: 'app-nalog-tabovi',
  imports: [MatButton, RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (traka(); as iz) {
      <div class="traka" role="status" data-traka>
        <span class="traka-tekst"><strong>Prezentacija je počela</strong>@if (iz.naziv) { · {{ iz.naziv }}}</span>
        <a mat-flat-button class="traka-dugme" [routerLink]="['/uzivo', iz.kod]" [queryParams]="{ sa: 'cas' }">Uđi</a>
      </div>
    }
    <div class="sadrzaj"><router-outlet /></div>
    <nav class="tabovi" aria-label="Nalog">
      <a routerLink="/nalog/cas" [class.aktivan]="tab() === 'cas'" [attr.aria-current]="tab() === 'cas' ? 'page' : null"
         data-tab="cas">
        <span class="ikona" aria-hidden="true">◉</span>Čas
      </a>
      <a routerLink="/nalog/predmeti" [class.aktivan]="tab() === 'predmeti'"
         [attr.aria-current]="tab() === 'predmeti' ? 'page' : null" data-tab="predmeti">
        <span class="ikona" aria-hidden="true">☰</span>Predmeti
      </a>
      <a routerLink="/nalog/ja" [class.aktivan]="tab() === 'ja'" [attr.aria-current]="tab() === 'ja' ? 'page' : null"
         data-tab="ja">
        <span class="ikona" aria-hidden="true">●</span>Ja
      </a>
    </nav>
  `,
  styles: `
    :host { display: block; padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
    .traka {
      position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; margin: 0 0 12px;
      padding: 10px 12px 10px 16px; border: 1px solid var(--ok); border-radius: var(--radius-sm); background: var(--ok-soft);
      color: var(--ink); box-shadow: var(--shadow);
    }
    .traka-tekst { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .traka-dugme { flex: none; min-height: 44px; }
    .tabovi {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 3; display: grid; grid-template-columns: repeat(3, 1fr);
      padding-bottom: env(safe-area-inset-bottom, 0px); border-top: 1px solid var(--line); background: var(--surface);
      box-shadow: 0 -2px 8px rgb(0 0 0 / 6%);
    }
    .tabovi a {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 60px;
      color: var(--ink-2); font-size: 14px; font-weight: 600; text-decoration: none;
    }
    .tabovi a.aktivan { color: var(--primary); box-shadow: inset 0 3px 0 var(--primary); }
    .tabovi a:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
    .ikona { font-size: 18px; line-height: 1; }
  `,
})
export class NalogTabovi {
  private readonly api = inject(CasApi);
  private readonly router = inject(Router);
  private readonly dokument = inject(DOCUMENT);

  private readonly url = signal(this.router.url);
  protected readonly tab = computed(() => tabIzUrla(this.url()));
  /** Izvođenje sa časa (samo dok čas traje); na tabu Čas nikad. */
  private readonly izvodjenje = signal<CasIzvodjenje | null>(null);
  protected readonly traka = computed(() => (this.tab() === 'cas' ? null : this.izvodjenje()));

  private naCasu = false;
  private zahtev: Subscription | null = null;
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  private broj429 = 0;
  private gotovo = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(destroyRef)).subscribe(e => {
      const pre = this.tab();
      this.url.set(e.urlAfterRedirects);
      if (this.tab() === 'cas') {
        this.stani();
        this.izvodjenje.set(null);
      } else if (pre === 'cas') {
        this.upit();
      }
    });
    const slusalac = () => {
      if (this.dokument.visibilityState === 'visible' && this.tab() !== 'cas') {
        this.upit();
      }
    };
    this.dokument.addEventListener('visibilitychange', slusalac);
    destroyRef.onDestroy(() => {
      this.gotovo = true;
      this.dokument.removeEventListener('visibilitychange', slusalac);
      this.stani();
    });
    if (this.tab() !== 'cas') {
      this.upit();
    }
  }

  private upit(): void {
    this.zaustaviTajmer();
    if (this.gotovo || this.tab() === 'cas' || (this.zahtev && !this.zahtev.closed) || this.dokument.hidden) {
      return;
    }
    this.zahtev = this.api.stanje().subscribe({
      next: s => {
        this.zahtev = null;
        this.broj429 = 0;
        const p = s?.predavanje ?? null;
        this.naCasu = !!p && !p.zavrseno;
        this.izvodjenje.set(this.naCasu && s?.izvodjenje?.kod ? s.izvodjenje : null);
        this.zakazi(sledeciUpitTrakeMs(this.naCasu, Math.random()));
      },
      error: (e: unknown) => {
        this.zahtev = null;
        if (status(e) === 401) {
          this.gotovo = true;
          void this.router.navigateByUrl(putanjaPrijave(this.router.url));
          return;
        }
        // 429: duže čekanje; mreža ili server: traka ostaje kakva je, sledeći upit redovno
        this.broj429 = status(e) === 429 ? this.broj429 + 1 : 0;
        this.zakazi(this.broj429 > 0 ? Math.min(120_000, 60_000 * this.broj429) : sledeciUpitTrakeMs(this.naCasu, Math.random()));
      },
    });
  }

  private zakazi(ms: number): void {
    this.zaustaviTajmer();
    if (!this.gotovo && this.tab() !== 'cas') {
      this.tajmer = setTimeout(() => this.upit(), ms);
    }
  }

  private stani(): void {
    this.zaustaviTajmer();
    this.zahtev?.unsubscribe();
    this.zahtev = null;
  }

  private zaustaviTajmer(): void {
    if (this.tajmer !== null) {
      clearTimeout(this.tajmer);
      this.tajmer = null;
    }
  }
}
