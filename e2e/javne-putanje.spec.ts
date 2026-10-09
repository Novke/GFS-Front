import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// bez pregledača: proverava izraze nad pravim produkcionim buildom, pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import { DUGI_KES, DUGI_KES_IZRAZ, HESIRANA_GRANA, JAVNA_PUTANJA, JAVNI_IZRAZ } from './javne-putanje';

const KOREN = join(__dirname, '..', 'dist', 'gfs-front', 'browser');

/** Svi fajlovi builda kao `$uri` (`/main-AB12CD34.js`, `/assets/icons/home.svg`). */
function fajloviBuilda(dir = KOREN): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(u =>
    u.isDirectory() ? fajloviBuilda(join(dir, u.name)) : ['/' + relative(KOREN, join(dir, u.name)).split(sep).join('/')],
  );
}

const HESIRAN_FAJL = new RegExp(`^/(?:${HESIRANA_GRANA})`);

test.describe('javne putanje i keš nad produkcionim buildom', () => {
  const fajlovi = fajloviBuilda();

  test('svaki fajl builda osim index.html je javan (inače 401 na telefonu studenta)', () => {
    expect(fajlovi).toContain('/index.html');
    // lenji chunk-ovi Angular-a 22 (base64url heš, mala slova) moraju biti među proverenima
    const hesevi = fajlovi.map(f => /^\/chunk-([A-Za-z0-9_-]{8})\.js$/.exec(f)?.[1]).filter(h => h !== undefined);
    expect(hesevi.some(h => /[a-z_-]/.test(h))).toBe(true);
    const nisuJavni = fajlovi.filter(f => f !== '/index.html' && !JAVNA_PUTANJA.test(f));
    expect(nisuJavni).toEqual([]);
  });

  test('izraz sadrži granu za heširane fajlove; primeri iz Angular 22 builda prolaze', () => {
    expect(JAVNI_IZRAZ).toContain(`|${HESIRANA_GRANA})`);
    for (const f of ['/chunk-CtOh0Kox.js', '/chunk-CX-p9k8t.js', '/chunk-_fBU7IqW.js', '/main-4GOMCQ2O.js', '/styles-TI5ZISUJ.css']) {
      expect(HESIRAN_FAJL.test(f), f).toBe(true);
    }
  });

  test('zaključane putanje nisu javne i ne prolaze kao heširan fajl', () => {
    for (const p of ['/api/predmeti', '/api/ws', '/index.html', '/prezentacije', '/upis/x']) {
      expect(HESIRAN_FAJL.test(p), p).toBe(false);
    }
    for (const p of ['/api/predmeti', '/api/ws', '/index.html', '/prezentacije', '/', '/grupe/1', '/api/chunk-CtOh0Kox.js', '/api/publicx']) {
      expect(JAVNA_PUTANJA.test(p), p).toBe(false);
    }
    for (const p of ['/upis/x', '/uzivo', '/uzivo/123456', '/api/public/ws', '/api/public/upis/abc', '/assets/env.json']) {
      expect(JAVNA_PUTANJA.test(p), p).toBe(true);
    }
  });

  test('dugi keš: svi heširani fajlovi (koren i media/), nikad index.html, favicon ni assets/', () => {
    const hesirani = fajlovi.filter(f => /^\/[^/]+\.(js|css)$/.test(f) || f.startsWith('/media/'));
    expect(hesirani.length).toBeGreaterThan(10);
    expect(hesirani.filter(f => !DUGI_KES.test(f))).toEqual([]);
    const bezKesa = fajlovi.filter(f => f === '/index.html' || f === '/favicon.ico' || f.startsWith('/assets/'));
    expect(bezKesa.filter(f => DUGI_KES.test(f))).toEqual([]);
  });

  test('docker/nginx.conf koristi isti izraz za dugi keš', () => {
    const conf = readFileSync(join(__dirname, '..', 'docker', 'nginx.conf'), 'utf8');
    const izrazi = [...conf.matchAll(/location ~ "([^"]+)"/g)].map(m => m[1]);
    expect(izrazi).toEqual([DUGI_KES_IZRAZ]);
  });
});
