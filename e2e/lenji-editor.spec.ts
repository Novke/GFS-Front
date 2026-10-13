import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: meri pravi produkcioni build (odluka 7 plana editora), pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import {
  dinamickiUvozi, fajlSa, jsFajlovi, skripteIndeksa, sopstvenoZatvorenje, statickiUvozi, stiloviIndeksa, tekst, zatvorenje,
  zbir, zbirGzip,
} from './chunkovi';
import { NIZ_EDITORA, NIZOVI_EDITORA, nizoviEditora } from './nizovi-editora';

/** Budžeti odluke 7 (deo 4a): početno <= 785 000 B (rast <= 5 kB), fajl stranice editora, sopstveno zatvorenje editora. */
const BUDZET_POCETNO = 785_000;
const BUDZET_STRANICA = 215_000;
const BUDZET_EDITOR_4A = 160_000;
/** Niz koji postoji samo u šablonu stranice editora prezentacije (zaglavlje). */
const NIZ_STRANICE = 'uz-ed-zaglavlje';

/** Izmerena vrednost ide u izveštaj testa (i u opis PR-a). */
function zapisi(opis: string, bajtova: number, gzip?: number): void {
  const vrednost = gzip === undefined ? `${bajtova} B` : `${bajtova} B (${gzip} B gzip)`;
  test.info().annotations.push({ type: 'velicina', description: `${opis}: ${vrednost}` });
}

test.describe('editor platna samo u lenjom chunk-u, budžeti (produkcioni build)', () => {
  const js = jsFajlovi();
  /** Početno: zatvorenje skripti iz index.html (modulepreload je samo nagoveštaj) plus globalni stilovi. */
  const pocetno = zatvorenje(skripteIndeksa());
  const stilovi = stiloviIndeksa();

  test('niz provere je pravi: OZNAKA_EDITORA_PLATNA', () => {
    const oznake = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'editor-platna', 'oznake.ts'), 'utf8');
    expect(oznake).toContain(`export const OZNAKA_EDITORA_PLATNA = '${NIZ_EDITORA}';`);
  });

  test('početno zatvorenje nema kod editora i staje u budžet', () => {
    expect([...pocetno].some(f => /^main-[A-Za-z0-9_-]+\.js$/.test(f)), 'main-*.js u index.html').toBe(true);
    expect(stilovi.length, 'globalni stilovi u index.html').toBeGreaterThan(0);
    const sporni = [...pocetno].map(f => ({ f, nizovi: nizoviEditora(tekst(f)) })).filter(x => x.nizovi.length);
    expect(sporni).toEqual([]);
    const sve = [...pocetno, ...stilovi];
    zapisi('početno (JS zatvorenje + stilovi)', zbir(sve), zbirGzip(sve));
    expect(zbir(sve)).toBeLessThanOrEqual(BUDZET_POCETNO);
  });

  test('fajl chunk-a stranice editora staje u budžet i nema kod editora platna', () => {
    const stranica = fajlSa(NIZ_STRANICE, js);
    zapisi('fajl stranice editora', zbir([stranica]));
    expect(zbir([stranica])).toBeLessThanOrEqual(BUDZET_STRANICA);
    expect(nizoviEditora(tekst(stranica))).toEqual([]);
  });

  test('editor platna: samo dinamički uvoz, sopstveno zatvorenje staje u budžet 4a', () => {
    const editor = fajlSa(NIZ_EDITORA, js);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(editor)), `${editor}: statički uvoz`).toEqual([]);
    expect(js.some(u => dinamickiUvozi(tekst(u)).includes(editor)), `${editor}: nema dinamičkog import()-a`).toBe(true);

    const stranica = fajlSa(NIZ_STRANICE, js);
    const vecUcitano = new Set([...pocetno, ...zatvorenje([stranica])]);
    expect(vecUcitano.has(editor), 'editor nije u početnom zatvorenju ni u zatvorenju stranice').toBe(false);
    const sopstveno = sopstvenoZatvorenje([editor], vecUcitano);
    zapisi('editor 4a (sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
    zapisi('fajl chunk-a editora', zbir([editor]));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_EDITOR_4A);
    // svi nizovi editora (i budući, 4b) su van početnog zatvorenja i fajla stranice
    expect(NIZOVI_EDITORA.filter(n => [...pocetno, stranica].some(f => tekst(f).includes(n)))).toEqual([]);
  });
});
