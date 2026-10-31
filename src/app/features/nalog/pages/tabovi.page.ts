import { ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { postaviManifest } from '../../../core/pwa/manifest';
import { CasApi } from '../data-access/cas.api';
import { CasIzvodjenje, CasUToku } from '../data-access/cas.models';
import { opisUToku } from '../data-access/cas.pravila';
import { jeTabCas, putanjaPrijave, sledeciUpitTrakeMs, status } from '../data-access/portal.pravila';
import { ZvonoNaloga } from '../ui/zvono-naloga.component';

export type TabNaloga = 'pocetna' | 'cas' | 'predmeti' | 'ja';

/**
 * Tab za putanju: `/nalog/pocetna` Početna, `/nalog/cas*` Čas, `/nalog/ja` Ja, sve ostalo pod ljuskom (predmeti, predmet,
 * vežbanje, pregled) Predmeti.
 */
export function tabIzUrla(url: string): TabNaloga {
  if (jeTabCas(url)) {
    return 'cas';
  }
  const putanja = url.split(/[?#]/u, 1)[0];
  return putanja === '/nalog/pocetna' ? 'pocetna' : putanja === '/nalog/ja' ? 'ja' : 'predmeti';
}

/**
 * Ljuska prijavljenog studenta (spec studentskog dela 12.1): donji tabovi **Početna · Čas · Predmeti · Ja** oko strana
 * `pocetna`, `cas`, `cas/:token`, `predmeti`, `predmet/:id[/vezbanje/:tipId]`, `prezentacija/:id` i `ja`. Strana prijave
 * (`/nalog`) i `/nalog/moodle` su van nje.
 *
 * **Zvono** (`ZvonoNaloga`, spec „Aplikacija i obaveštenja“ 6.8) stoji u desnom uglu zaglavlja kartice na svakom tabu. Ljuska
 * postavlja studentski manifest aplikacije (ikonica otvara nalog; `core/pwa/manifest`).
 *
 * Traka na svim tabovima osim Čas (izvor `GET api/public/nalog/cas`, isti kao tab Čas):
 * - **"Prezentacija je počela · Uđi"** dok traje izvođenje predavanja na kome je student čekiran. Traka je samo dugme:
 *   student usred vežbanja ili pregleda ne gubi rad (sam ulazi samo tab Čas).
 * - **"Predavanje je u toku · Čekiraj se"** dok traje današnje predavanje njegove grupe na kome nije čekiran (`uToku`);
 *   dugme vodi na tab Čas (QR).
 * Tab Čas tada nosi tačku. Ljuska pita na 10 s ± 2 s dok je student na času, 30 s dok je predavanje grupe u toku, inače na
 * 60 s, i odmah kad se stranica vrati u prvi plan; skrivena stranica ne pita. Na tabu Čas ljuska ne pita i ne crta traku
 * (Čas pita sam). 401 vodi na prijavu sa povratkom na trenutnu stranu; 429 i greška mreže samo odlažu sledeći upit.
 */
@Component({
  selector: 'app-nalog-tabovi',
  imports: [MatButton, RouterLink, RouterOutlet, ZvonoNaloga],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (traka(); as iz) {
      <div class="traka" role="status" data-traka>
        <span class="traka-tekst"><strong>Prezentacija je počela</strong>@if (iz.naziv) { · {{ iz.naziv }}}</span>
        <a mat-flat-button class="traka-dugme" [routerLink]="['/uzivo', iz.kod]" [queryParams]="{ sa: 'cas' }">Uđi</a>
      </div>
    } @else if (trakaUToku(); as u) {
      <div class="traka u-toku" role="status" data-traka-u-toku>
        <span class="traka-tekst"><strong>Predavanje je u toku</strong>@if (u.opis) { · {{ u.opis }}}</span>
        <a mat-flat-button class="traka-dugme" routerLink="/nalog/cas">Čekiraj se</a>
      </div>
    }
    <div class="sadrzaj">
      <div class="zvono-mesto"><app-zvono-naloga /></div>
      <router-outlet />
    </div>
    <nav class="tabovi" aria-label="Nalog">
      <a routerLink="/nalog/pocetna" [class.aktivan]="tab() === 'pocetna'"
         [attr.aria-current]="tab() === 'pocetna' ? 'page' : null" data-tab="pocetna">
        <span class="ikona" aria-hidden="true">⌂</span>Početna
      </a>
      <a routerLink="/nalog/cas" [class.aktivan]="tab() === 'cas'" [attr.aria-current]="tab() === 'cas' ? 'page' : null"
         data-tab="cas">
        <span class="ikona" aria-hidden="true">◉@if (tackaCas()) {<span class="tacka" data-tacka></span>}</span>Čas
        @if (tackaCas()) { <span class="vizuelno-skriveno">(čas je u toku)</span> }
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
    .traka.u-toku { border-color: var(--warn); background: var(--warn-soft); }
    .traka-tekst { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    /* zvono stoji u desnom uglu zaglavlja kartice naloga (NalogOkvir: max 480 px, razmak odozgo clamp(0, 4vh, 48px)) */
    .sadrzaj { position: relative; --nalog-zaglavlje-desno: 68px; }
    .zvono-mesto { position: absolute; z-index: 4; top: calc(clamp(0px, 4vh, 48px) + 24px); right: max(10px, calc((100% - 480px) / 2 + 10px)); }
    .traka-dugme { flex: none; min-height: 44px; }
    .tabovi {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 3; display: grid; grid-template-columns: repeat(4, 1fr);
      padding-bottom: env(safe-area-inset-bottom, 0px); border-top: 1px solid var(--line); background: var(--surface);
      box-shadow: 0 -2px 8px rgb(0 0 0 / 6%);
    }
    .tabovi a {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 60px;
      color: var(--ink-2); font-size: 14px; font-weight: 600; text-decoration: none;
    }
    .tabovi a.aktivan { color: var(--primary); box-shadow: inset 0 3px 0 var(--primary); }
    .tabovi a:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
    .ikona { position: relative; font-size: 18px; line-height: 1; }
    .tacka {
      position: absolute; top: -2px; right: -8px; width: 9px; height: 9px; border: 2px solid var(--surface);
      border-radius: 50%; background: var(--danger);
    }
    .vizuelno-skriveno {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0);
      white-space: nowrap; border: 0;
    }
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
  /** Predavanje grupe u toku na kome student nije čekiran; na tabu Čas nikad. */
  private readonly uToku = signal<CasUToku | null>(null);
  protected readonly traka = computed(() => (this.tab() === 'cas' ? null : this.izvodjenje()));
  protected readonly trakaUToku = computed(() => {
    const u = this.tab() === 'cas' ? null : this.uToku();
    return u ? { opis: opisUToku(u) } : null;
  });
  /** Tačka na tabu Čas: tamo se nešto dešava (prezentacija ili predavanje u toku); na samom tabu Čas ne. */
  protected readonly tackaCas = computed(() => this.traka() !== null || this.trakaUToku() !== null);

  private naCasu = false;
  private zahtev: Subscription | null = null;
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  private broj429 = 0;
  private gotovo = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    postaviManifest(this.dokument, 'student');
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(destroyRef)).subscribe(e => {
      const pre = this.tab();
      this.url.set(e.urlAfterRedirects);
      if (this.tab() === 'cas') {
        this.stani();
        this.izvodjenje.set(null);
        this.uToku.set(null);
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
        this.uToku.set(this.naCasu ? null : s?.uToku ?? null);
        this.zakazi(sledeciUpitTrakeMs(this.naCasu, Math.random(), this.uToku() !== null));
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
        this.zakazi(this.broj429 > 0
          ? Math.min(120_000, 60_000 * this.broj429)
          : sledeciUpitTrakeMs(this.naCasu, Math.random(), this.uToku() !== null));
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
