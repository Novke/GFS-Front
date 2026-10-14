/*
 * Jedino mesto u frontu sa izrazima putanja koje odlučuju o pristupu i kešu (bez uvoza: koristi ga i
 * `e2e/staticki-server.ts`, koji Node pokreće direktno).
 *
 * JAVNI_IZRAZ mora biti isti kao javne putanje na serveru: `staging public gfs '<izraz>'` (box alat, `public.map` na
 * stejdžingu) i zakomentarisana javna linija u šablonima wrapper-a `deploy/nginx/` (`map $gfs_auth`, `map $gfs_public_key`).
 * Kad se menja ovde, menja se i tamo (i obrnuto). Sve što ne odgovara izrazu traži basic-auth (401), i statički fajl:
 * lenji chunk koji ne odgovara bi na telefonu studenta dao 401 i javna stranica se ne bi pokrenula.
 */

/**
 * Grana za heširane build fajlove u korenu (application builder, Angular 17+): `main-4GOMCQ2O.js`, `styles-TI5ZISUJ.css`,
 * a lenji chunk-ovi imaju base64url heš sa malim slovima, `_` i `-`: `chunk-CtOh0Kox.js`, `chunk-_fBU7IqW.js`,
 * `chunk-CX-p9k8t.js`.
 */
export const HESIRANA_GRANA = String.raw`[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$`;

/** Javne putanje (izraz nad `$uri`), kopija serverskog izraza; grana starog webpack builder-a ostaje radi starih linkova. */
// jedan red, doslovno kao na serveru (lakše poređenje); spec proverava da sadrži HESIRANA_GRANA
export const JAVNI_IZRAZ = String.raw`^/(uzivo(/|$)|upis(/|$)|api/public(/|$)|assets/|media/|favicon\.ico$|[A-Za-z0-9_.-]+\.[0-9a-f]{8,}\.(js|css|woff2?)$|[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$)`;

export const JAVNA_PUTANJA = new RegExp(JAVNI_IZRAZ);

/**
 * Dugi keš (`immutable`) u `docker/nginx.conf`: samo heširani fajlovi u korenu i u `media/` (fontovi i slike iz CSS-a).
 * Nepostojeći takav fajl je 404, nikad `index.html`. `assets/` nikad ne odgovara (imena tamo nisu heširana).
 * Izvor u nginx.conf mora biti isti string (proverava `javne-putanje.spec.ts`).
 */
export const DUGI_KES_IZRAZ = String.raw`^/(media/)?[A-Za-z0-9_.-]+(\.[0-9a-f]{8,}|-[A-Za-z0-9_-]{8})\.(js|css|woff2?|png|jpe?g|gif|svg|ico)$`;

export const DUGI_KES = new RegExp(DUGI_KES_IZRAZ);
