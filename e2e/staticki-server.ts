/*
 * Statički server za e2e: služi produkcioni build (`dist/gfs-front/browser`) po istim pravilima kao nginx u kontejneru
 * (`docker/nginx.conf`): postojeći fajl ide kakav jeste; heširan fajl (`main-AB12CD34.js`, `chunk-CtOh0Kox.js`) koji ne
 * postoji je 404 (`try_files $uri =404`, isti izraz `DUGI_KES` iz `javne-putanje.ts`); sve ostalo je `index.html` (SPA
 * fallback, `try_files $uri $uri/ /index.html`). `/api/*` i `assets/env.json` ovde nikad ne stižu: presreće ih mok u
 * pregledaču (`e2e/mock-api.ts`). Pokreće ga `playwright.config.ts` (webServer), bez zavisnosti.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/staticki-server.ts [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

import { DUGI_KES } from './javne-putanje.ts';

const KOREN = resolve('dist/gfs-front/browser');
const PORT = Number(process.argv[2] ?? process.env['E2E_PORT'] ?? 4300);
const INDEX = join(KOREN, 'index.html');

const TIPOVI: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(INDEX)) {
  console.error(`Nema ${INDEX}: prvo pokreni "npx ng build" (e2e testira produkcioni build).`);
  process.exit(1);
}

/** Fajl unutar korena za putanju zahteva, ili `null` (nema ga, direktorijum, ili putanja izlazi iz korena). */
function fajl(putanja: string): string | null {
  let dekodirana: string;
  try {
    dekodirana = decodeURIComponent(putanja);
  } catch {
    return null;
  }
  const pun = resolve(KOREN, '.' + dekodirana);
  if (pun !== KOREN && !pun.startsWith(KOREN + sep)) {
    return null;
  }
  return existsSync(pun) && statSync(pun).isFile() ? pun : null;
}

createServer((req, res) => {
  const putanja = new URL(req.url ?? '/', 'http://localhost').pathname;
  const postojeci = fajl(putanja);
  if (!postojeci && DUGI_KES.test(putanja)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nema fajla.');
    return;
  }
  const pronadjen = postojeci ?? INDEX;
  res.writeHead(200, {
    'Content-Type': TIPOVI[extname(pronadjen)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(pronadjen).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`e2e: dist na http://127.0.0.1:${PORT}`));
