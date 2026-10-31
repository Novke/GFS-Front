import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// bez pregledača: `scripts/oznaci-izdanje.mjs` (Dockerfile) nad malim lažnim buildom
import { expect, test } from '@playwright/test';

const INDEKS = (main: string) =>
  `<!doctype html>\n<html lang="sr-Latn">\n<head>\n  <meta charset="utf-8">\n  <title>GFS</title>\n</head>\n<body><script src="${main}" type="module"></script></body>\n</html>\n`;

function build(main: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'gfs-izdanje-'));
  mkdirSync(join(folder, 'assets'));
  writeFileSync(join(folder, 'index.html'), INDEKS(main));
  return folder;
}

const oznaci = (folder: string) => execFileSync('node', ['scripts/oznaci-izdanje.mjs', folder], { encoding: 'utf8' });
const meta = (folder: string) => /<meta name="gfs-izdanje" content="([0-9a-f]{16})">/.exec(readFileSync(join(folder, 'index.html'), 'utf8'))?.[1];
const json = (folder: string) => JSON.parse(readFileSync(join(folder, 'assets', 'izdanje.json'), 'utf8')) as { izdanje: string };

test.describe('oznaci-izdanje.mjs', () => {
  const folderi: string[] = [];
  test.afterAll(() => folderi.forEach(f => rmSync(f, { recursive: true, force: true })));
  const novi = (main: string) => {
    const f = build(main);
    folderi.push(f);
    return f;
  };

  test('upisuje isto izdanje u meta (posle charset-a) i u assets/izdanje.json', () => {
    const f = novi('main-AAAAAAAA.js');
    expect(oznaci(f)).toMatch(/^izdanje [0-9a-f]{16}\n$/);
    expect(meta(f)).toBe(json(f).izdanje);
    expect(readFileSync(join(f, 'index.html'), 'utf8')).toContain(`<meta charset="utf-8">\n  <meta name="gfs-izdanje" content="${meta(f)}">`);
  });

  test('ponovljeno pokretanje: isti rezultat, jedna oznaka', () => {
    const f = novi('main-AAAAAAAA.js');
    oznaci(f);
    const prvi = readFileSync(join(f, 'index.html'), 'utf8');
    oznaci(f);
    expect(readFileSync(join(f, 'index.html'), 'utf8')).toBe(prvi);
    expect(prvi.match(/gfs-izdanje/g)).toHaveLength(1);
  });

  test('isti build daje isto izdanje, drugi heš glavnog fajla drugo', () => {
    const a = novi('main-AAAAAAAA.js');
    const b = novi('main-AAAAAAAA.js');
    const c = novi('main-BBBBBBBB.js');
    [a, b, c].forEach(oznaci);
    expect(meta(a)).toBe(meta(b));
    expect(meta(c)).not.toBe(meta(a));
  });

  test('Dockerfile označava build posle ng build-a, pre kopiranja u nginx', () => {
    const d = readFileSync('Dockerfile', 'utf8');
    const build = d.indexOf('npx ng build');
    const oznaka = d.indexOf('RUN node scripts/oznaci-izdanje.mjs dist/gfs-front/browser');
    expect(build).toBeGreaterThan(-1);
    expect(oznaka).toBeGreaterThan(build);
    expect(d.indexOf('COPY --from=build')).toBeGreaterThan(oznaka);
  });
});
