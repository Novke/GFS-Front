/**
 * Poruke pregledača kad dinamički `import()` (lenji chunk rute, `@defer`, dijalog) ne može da se učita, najčešće zato što je
 * kartica otvorena pre izdanja, a novi build više nema stare heširane fajlove (404):
 * Chromium "Failed to fetch dynamically imported module: <url>", Firefox "error loading dynamically imported module: <url>",
 * Safari "Importing a module script failed.".
 */
const PORUKE_UCITAVANJA = /dynamically imported module|importing a module script failed/i;

/** Koliko duboko se prate omotači (`cause`, `error`, `reason`, `rejection`): Angular i rxjs grešku umeju da umotaju. */
const MAX_DUBINA = 4;

/** Da li je greška neuspelo učitavanje lenjog modula (chunk-a). Ostale greške (HTTP, logika) nisu. */
export function jeGreskaUcitavanja(e: unknown, dubina = 0): boolean {
  if (e === null || typeof e !== 'object' || dubina > MAX_DUBINA) {
    return typeof e === 'string' && PORUKE_UCITAVANJA.test(e);
  }
  const o = e as { message?: unknown; cause?: unknown; error?: unknown; reason?: unknown; rejection?: unknown };
  if (typeof o.message === 'string' && PORUKE_UCITAVANJA.test(o.message)) {
    return true;
  }
  return [o.cause, o.error, o.reason, o.rejection].some(u => u !== undefined && u !== e && jeGreskaUcitavanja(u, dubina + 1));
}
