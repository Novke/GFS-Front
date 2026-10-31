#!/usr/bin/env node
// Označava produkcioni build izdanjem (Dockerfile, posle `ng build`): `node scripts/oznaci-izdanje.mjs <dist/.../browser>`.
// Izdanje = prvih 16 heksa SHA-256 od index.html bez oznake. index.html nabraja heširane početne fajlove (main, chunk-ovi,
// stilovi), pa se izdanje menja tačno kad se menja front, a isti izvor dvaput izgrađen daje isto izdanje (ponovljen deploy
// bez izmene fronta ne nudi "novu verziju"). Upisuje:
//   - <meta name="gfs-izdanje" content="..."> u index.html (izdanje koje kartica učitava; `core/izdanje/izdanje.ts`),
//   - assets/izdanje.json {"izdanje": "..."} (izdanje koje server trenutno služi; assets/ ide bez keša, nginx `location /`).
// Ponovljeno pokretanje nad istim folderom daje isti rezultat.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const META = /\s*<meta name="gfs-izdanje" content="[^"]*">/g;
const CHARSET = /<meta charset="[^"]*">/i;

export function oznaci(folder) {
  const putanjaIndeksa = join(folder, 'index.html');
  const html = readFileSync(putanjaIndeksa, 'utf8').replace(META, '');
  if (!CHARSET.test(html)) {
    throw new Error(`${putanjaIndeksa}: nema <meta charset>, ne znam gde da upišem izdanje`);
  }
  const izdanje = createHash('sha256').update(html).digest('hex').slice(0, 16);
  writeFileSync(putanjaIndeksa, html.replace(CHARSET, m => `${m}\n  <meta name="gfs-izdanje" content="${izdanje}">`));
  writeFileSync(join(folder, 'assets', 'izdanje.json'), `${JSON.stringify({ izdanje })}\n`);
  return izdanje;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('upotreba: node scripts/oznaci-izdanje.mjs <folder builda>');
    process.exit(2);
  }
  console.log(`izdanje ${oznaci(folder)}`);
}
