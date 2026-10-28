import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { Izdanje } from './izdanje';

/** Ruta sa `data: { projekcija: true }` (projektor predavanja, QR za upis, publika uživo) se gleda sa platna: bez trake. */
function naProjekciji(s: ActivatedRouteSnapshot | null): boolean {
  for (let r = s; r; r = r.firstChild) {
    if (r.data['projekcija'] === true) return true;
  }
  return false;
}

/**
 * Traka "Dostupna je nova verzija" dok `Izdanje` zna za novije izdanje na serveru (u `AppComponent`, pa važi i za javne
 * strane i projektorski layout). Mora biti u početnom paketu: zastarela kartica posle izdanja ne može da učita nijedan
 * lenji chunk. Ne zove ništa sama; "Osveži" je obično osvežavanje, "Kasnije" je skriva do sledećeg novog izdanja.
 */
@Component({
  selector: 'app-izdanje-traka',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Status region postoji (prazan) od početka, da čitač ekrana pročita poruku kad se pojavi; samo kad se izdanje prati, pa
  // stranice bez oznake (ng serve, e2e) nemaju dodatni `role="status"`.
  template: `
    @if (izdanje.ucitano) {
      <div class="izdanje-traka" role="status" [class.vidljiva]="vidljiva()">
        @if (vidljiva()) {
          <span>Dostupna je nova verzija GFS-a.</span>
          <button mat-button type="button" class="izdanje-osvezi" (click)="izdanje.osvezi()">Osveži</button>
          <button mat-button type="button" (click)="skriveno.set(izdanje.novo())">Kasnije</button>
        }
      </div>
    }
  `,
  styles: `
    .izdanje-traka { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 900; }
    .vidljiva {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: calc(100vw - 32px);
      padding: 6px 8px 6px 16px; border-radius: var(--radius); box-shadow: var(--shadow);
      background: var(--snack-bg); color: var(--snack-ink);
    }
    .vidljiva button { --mat-button-text-label-text-color: var(--snack-link); }
    .izdanje-osvezi { font-weight: 600; }
  `,
})
export class IzdanjeTraka {
  protected readonly izdanje = inject(Izdanje);
  private readonly router = inject(Router);
  protected readonly skriveno = signal<string | null>(null);
  private readonly projekcija = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => naProjekciji(this.router.routerState.snapshot.root)),
    ),
    { initialValue: false },
  );
  protected readonly vidljiva = computed(() => {
    const novo = this.izdanje.novo();
    return novo !== null && novo !== this.skriveno() && !this.projekcija();
  });
}
