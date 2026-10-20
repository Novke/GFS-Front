/*
 * Content-Security-Policy frontend kontejnera (bez uvoza: koristi ga i `e2e/staticki-server.ts`, koji Node pokreće direktno).
 *
 * Isti string stoji u `docker/nginx.conf` (`add_header` u `location /` i u lokaciji heširanih fajlova; proverava
 * `e2e/csp.spec.ts`). Ograničava samo slike i veze: slika sa drugog porekla (npr. iz Markdown-a slajda) se ne učitava,
 * `fetch`/XHR idu samo ka svom poreklu (`/api/`), WebSocket kroz `ws:`/`wss:` (uživo). Skripte, stilovi, fontovi i radnici
 * se namerno ne ograničavaju (MathLive, pdf.js, inline skripta teme u `index.html`). Nov izvor slika ili veza: ovde i u
 * nginx.conf zajedno.
 */
export const CSP = "img-src 'self' data: blob:; connect-src 'self' ws: wss:";
