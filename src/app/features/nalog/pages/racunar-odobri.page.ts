import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { porukaGreske } from '../data-access/nalog.pravila';
import { putanjaPrijave, status } from '../data-access/portal.pravila';
import { TestoviStudentaApi } from '../data-access/testovi-studenta.api';
import { PORUKA_ZAHTEV_ISTEKAO, RacunarZaOdobrenje } from '../data-access/testovi-studenta.models';
import { NalogOkvir } from '../ui/nalog-okvir.component';

/**
 * Odobrenje prijave računara sa telefona (`nalog/racunar/:token`, link iz QR-a na `/r`; plan 5.1): „Prijavi računar 4827 kao
 * Ana Kovač (GD5/2026)?“ → Potvrdi. Neprijavljen telefon (401) ide na `nalog?nazad=nalog/racunar/<token>` i vraća se ovde.
 * 410: zahtev je istekao ili iskorišćen; 403: ova sesija nije telefon sa kodom (npr. drugi računar).
 */
@Component({
  selector: 'app-racunar-odobri-page',
  imports: [MatButton, NalogOkvir, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Prijava računara">
      @if (greska(); as g) {
        <p class="poruka" role="alert" data-greska>{{ g }}</p>
        <a mat-stroked-button class="dugme" routerLink="/nalog/pocetna">Nazad na nalog</a>
      } @else if (gotovo()) {
        <h2>Računar je prijavljen</h2>
        <p data-odobreno>Računar {{ r()?.broj }} je sada prijavljen kao ti. Kad završiš, odjavi se na računaru.</p>
        <a mat-stroked-button class="dugme" routerLink="/nalog/pocetna">Nazad na nalog</a>
      } @else if (r(); as r) {
        <h2>Prijaviti računar?</h2>
        <p class="pitanje" data-pitanje>Prijavi računar <strong class="broj">{{ r.broj }}</strong> kao <strong>{{ r.ime }} {{ r.prezime }}</strong> ({{ r.indeks }})?</p>
        <p class="tiho">Proveri da je broj isti kao na ekranu računara ispred tebe.</p>
        <button mat-flat-button type="button" class="dugme" [disabled]="salje()" (click)="odobri()" data-potvrdi>Potvrdi</button>
        <a mat-button class="dugme" routerLink="/nalog/pocetna">Odustani</a>
      } @else {
        <p class="tiho" role="status">Učitavanje…</p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 8px; font-size: 20px; }
    .pitanje { margin: 0 0 8px; font-size: 18px; }
    .broj { font-family: var(--font-mono); font-size: 28px; letter-spacing: .1em; }
    .tiho { margin: 0 0 12px; color: var(--ink-2); }
    .dugme { width: 100%; min-height: 48px; margin-top: 8px; }
    .poruka { margin: 0 0 12px; padding: 12px 16px; border: 1px solid var(--danger); border-radius: var(--radius-sm); background: var(--danger-soft); }
  `,
})
export class RacunarOdobriPage {
  readonly token = input.required<string>();

  private readonly api = inject(TestoviStudentaApi);
  private readonly router = inject(Router);
  protected readonly r = signal<RacunarZaOdobrenje | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);
  protected readonly gotovo = signal(false);
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      const t = this.token();
      untracked(() => {
        this.zahtev?.unsubscribe();
        this.zahtev = this.api.racunar(t).subscribe({ next: r => this.r.set(r), error: (e: unknown) => this.neuspeh(e) });
      });
    });
  }

  protected odobri(): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.api.odobri(this.token()).subscribe({
      next: () => {
        this.salje.set(false);
        this.gotovo.set(true);
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.neuspeh(e);
      },
    });
  }

  private neuspeh(e: unknown): void {
    const s = status(e);
    if (s === 401) {
      void this.router.navigateByUrl(putanjaPrijave(this.router.url));
    } else if (s === 410) {
      this.greska.set(PORUKA_ZAHTEV_ISTEKAO);
    } else {
      this.greska.set(porukaGreske(e));
    }
  }
}
