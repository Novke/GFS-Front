import { expect, vi } from 'vitest';

/**
 * Zamena za Angular `fakeAsync` pod Vitest-om (nema ProxyZone, pa `fakeAsync`/`tick` ne rade). Nije spec, nema `describe`.
 * Lažni sat (tajmeri i `Date`) važi samo unutar testa, kao `fakeAsync` zona: tajmeri iz `beforeEach` ostaju pravi.
 */

/** Pravi `setTimeout`, uhvaćen pri učitavanju modula, pre `vi.useFakeTimers()`. */
const praviSetTimeout = globalThis.setTimeout;

/** Kao `flushMicrotasks()`: isprazni red mikrozadataka (jedan pravi makrozadatak), lažni sat se ne pomera. */
export function isprazniMikrozadatke(): Promise<void> {
  return new Promise(kraj => praviSetTimeout(kraj, 0));
}

/** Kao `tick(ms)`: pomera lažni sat, okida dospele tajmere i prazni mikrozadatke između i posle njih. */
export async function pomeriSat(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await isprazniMikrozadatke();
}

/**
 * Kao `fakeAsync(telo)`: telo radi sa lažnim satom, na kraju se isprazne mikrozadaci i, kao kod `fakeAsync`, test pada
 * ako je neki tajmer ostao u redu.
 */
export function saLaznimSatom(telo: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    vi.useFakeTimers();
    try {
      await telo();
      await isprazniMikrozadatke();
      expect(vi.getTimerCount(), 'tajmer(i) su ostali u redu posle testa').toBe(0);
    } finally {
      vi.useRealTimers();
    }
  };
}
