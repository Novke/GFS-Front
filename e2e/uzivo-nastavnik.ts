import type { Page } from '@playwright/test';

import { type LazniBroker, lazniBroker } from './lazni-stomp';
import type { MockApi } from './mock-api';

/*
 * Zajedničko za e2e nastavničkog izvođenja (daljinski, konzola, axe): lažni nastavnički STOMP broker i lažni Wake Lock.
 */

/** Brojači lažnog Wake Lock-a (`window.__brava`). */
export interface BrojaciBrave {
  zahtevi: number;
  otpustanja: number;
}

/**
 * Lažni broker na `api/ws`: na pretplatu `/app/izvodjenja/{id}/nastavnik-pocetno` (svaka veza, i ponovna) šalje trenutni
 * snimak moka, kao `IzvodjenjeStompController`. Promene sa "laptopa" spec šalje sam: `broker.posalji('/topic/...', snimak)`.
 */
export function nastavnickiBroker(page: Page, mock: MockApi): Promise<LazniBroker> {
  return lazniBroker(page, 'api/ws', o =>
    o === `/app/izvodjenja/${mock.izvodjenje.id}/nastavnik-pocetno` ? mock.izvodjenje.stanje() : undefined);
}

/**
 * Lažni Screen Wake Lock pre učitavanja stranice (headless Chromium pravi zahtev odbija): svaki `request` daje novu bravu,
 * `window.__brava` broji zahteve i otpuštanja, a `poslednja.release()` pušta bravu kao pregledač (događaj `release`).
 * `navigator.vibrate` uvek uspe.
 */
export async function budanEkranStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Brava { released: boolean; type: 'screen'; release(): Promise<void>; addEventListener(t: string, f: () => void): void; removeEventListener(): void }
    const brojaci = { zahtevi: 0, otpustanja: 0, poslednja: null as Brava | null };
    (window as unknown as { __brava: typeof brojaci }).__brava = brojaci;
    const wakeLock = {
      request: async () => {
        brojaci.zahtevi++;
        const slusaoci: (() => void)[] = [];
        const brava: Brava = {
          released: false,
          type: 'screen',
          async release() {
            if (brava.released) return;
            brava.released = true;
            brojaci.otpustanja++;
            slusaoci.forEach(f => f());
          },
          addEventListener(t, f) {
            if (t === 'release') slusaoci.push(f);
          },
          removeEventListener() {
            // nije potrebno u testu
          },
        };
        brojaci.poslednja = brava;
        return brava;
      },
    };
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => wakeLock });
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: () => true });
  });
}

/** Trenutni brojači lažnog Wake Lock-a. */
export function brojaciBrave(page: Page): Promise<BrojaciBrave> {
  return page.evaluate(() => {
    const b = (window as unknown as { __brava: BrojaciBrave }).__brava;
    return { zahtevi: b.zahtevi, otpustanja: b.otpustanja };
  });
}

/** Postavlja `document.visibilityState` i šalje `visibilitychange` (kao gašenje i paljenje ekrana telefona). */
export function vidljivost(page: Page, stanje: 'hidden' | 'visible'): Promise<void> {
  return page.evaluate(v => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, stanje);
}
