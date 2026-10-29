import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: meri pravi produkcioni build (kao `lenji-editor.spec.ts`), pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import {
  dinamickiUvozi, fajlSa, jsFajlovi, skripteIndeksa, sopstvenoZatvorenje, statickiUvozi, tekst, zatvorenje, zbir, zbirGzip,
} from './chunkovi';
import { zabranjeniJavno } from './nizovi-editora';

/**
 * Pregled održane prezentacije na nalogu studenta (`/nalog/prezentacija/:id`, spec studentskog portala 6.2): zaseban lenji
 * chunk, van početnog paketa, bez celog `mathlive`-a, ProseMirror-a i koda editora (formule u tekstu i dalje idu kroz lenji
 * `mathlive/ssr`, kao na telefonu u Uživo). Niz `NIZ_PREGLEDA` postoji samo u šablonu stranice.
 *
 * Izmereno 2026-10-29 (vrh `feature/studentski-portal-2` posle integracije sa najavom): sopstveno zatvorenje stranice
 * posle početnog paketa 89 772 B (30 966 B gzip): stranica ~9,7 kB, kartica zadatka ~6,2 kB i deljeni `app-slajd-prikaz`
 * sa prikazom platna (~53 kB, isti chunk koji koriste projektor i konzola). Granica: izmereno + 10 %.
 */
const NIZ_PREGLEDA = 'Slajdovi sa časa';
const IZMERENO_PREGLED = 89_772;
const IZMERENO_PREGLED_GZIP = 30_966;
const BUDZET_PREGLEDA = Math.floor(IZMERENO_PREGLED * 1.1);
const BUDZET_PREGLEDA_GZIP = Math.floor(IZMERENO_PREGLED_GZIP * 1.1);

function zapisi(opis: string, bajtova: number, gzip?: number): void {
  const vrednost = gzip === undefined ? `${bajtova} B` : `${bajtova} B (${gzip} B gzip)`;
  test.info().annotations.push({ type: 'velicina', description: `${opis}: ${vrednost}` });
}

test.describe('pregled prezentacije na nalogu: lenji chunk u budžetu, bez editora (produkcioni build)', () => {
  const js = jsFajlovi();
  const pocetno = zatvorenje(skripteIndeksa());

  test('niz provere je pravi: postoji samo u šablonu stranice pregleda i u tačno jednom JS fajlu', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'nalog', 'pages', 'pregled-prezentacije.page.ts'), 'utf8');
    expect(src).toContain(NIZ_PREGLEDA);
    expect(js.filter(f => tekst(f).includes(NIZ_PREGLEDA)), 'JS fajlovi sa nizom pregleda').toHaveLength(1);
  });

  test('stranica pregleda: samo dinamički uvoz, van početnog paketa, sopstveno zatvorenje u budžetu, bez editora i celog mathlive-a', () => {
    const pregled = fajlSa(NIZ_PREGLEDA, js);
    expect(pocetno.has(pregled), 'pregled u početnom zatvorenju').toBe(false);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(pregled)), 'statički uvoz pregleda').toEqual([]);
    expect(js.some(u => dinamickiUvozi(tekst(u)).includes(pregled)), 'nema dinamičkog import()-a pregleda').toBe(true);

    const sopstveno = sopstvenoZatvorenje([pregled], pocetno);
    zapisi('pregled prezentacije (sopstveno zatvorenje posle početnog)', zbir(sopstveno), zbirGzip(sopstveno));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_PREGLEDA);
    expect(zbirGzip(sopstveno)).toBeLessThanOrEqual(BUDZET_PREGLEDA_GZIP);

    const sporni = [...sopstveno, ...pocetno]
      .map(f => ({ f, nizovi: zabranjeniJavno(tekst(f)) }))
      .filter(x => x.nizovi.length);
    expect(sporni, 'editor platna, ProseMirror, editor formule ili ceo mathlive u zatvorenju pregleda').toEqual([]);
  });
});
