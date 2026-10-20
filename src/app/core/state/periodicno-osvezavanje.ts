import { NavigationEnd, Router } from '@angular/router';
import { filter, interval, Subscription } from 'rxjs';

/** Posle navigacije osvežava se najviše jednom u ovom razmaku. */
export const RAZMAK_NAVIGACIJA_MS = 15_000;
/** Periodično osvežavanje dok je tab vidljiv. */
export const PERIOD_MS = 60_000;

export interface PeriodicnoOsvezavanje {
  router: Router;
  document: Document;
  osvezi: () => void;
  /** Trenutak poslednjeg osvežavanja (`Date.now()`), za razmak posle navigacije. */
  poslednje: () => number;
}

/**
 * Isti ritam za sve brojače ljuske (`DashboardCountsStore`, `ObavestenjaStore`): posle navigacije najviše jednom u
 * {@link RAZMAK_NAVIGACIJA_MS} i na {@link PERIOD_MS} dok je tab vidljiv. Prvo učitavanje radi pozivalac; vraćena
 * pretplata se otkazuje kad osvežavanje više ne treba.
 */
export function periodicnoOsvezavanje(o: PeriodicnoOsvezavanje): Subscription {
  const veza = new Subscription();
  veza.add(
    o.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        filter(() => Date.now() - o.poslednje() >= RAZMAK_NAVIGACIJA_MS),
      )
      .subscribe(() => o.osvezi()),
  );
  veza.add(
    interval(PERIOD_MS)
      .pipe(filter(() => o.document.visibilityState === 'visible'))
      .subscribe(() => o.osvezi()),
  );
  return veza;
}
