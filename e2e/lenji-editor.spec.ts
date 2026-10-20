import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// bez pregledača: meri pravi produkcioni build (odluka 7 plana editora), pa ne treba `page` ni mok iz `./fixture`
import { expect, test } from '@playwright/test';

import {
  dinamickiUvozi, fajlSa, jsFajlovi, potpunoZatvorenje, skripteIndeksa, sopstvenoZatvorenje, statickiUvozi, stiloviIndeksa, tekst, zatvorenje,
  zbir, zbirGzip,
} from './chunkovi';
import { NIZ_EDITORA, NIZ_FORMULE_EDITORA, NIZ_MATHLIVE, NIZ_PROSEMIRROR, NIZOVI_EDITORA, nizoviEditora } from './nizovi-editora';

/**
 * Budžeti odluke 7: početno <= 785 000 B (rast <= 5 kB), fajl stranice editora, sopstveno zatvorenje editora. Od 4b (F12:
 * uređivač teksta uvodi ProseMirror, ~208 kB) editor platna ima budžet 4b: <= 450 000 B i <= 140 000 B gzip.
 * Prijava (F1, 2026-10-19): početno je bilo 784 657 B, sesija nastavnika mora biti u početnom paketu (čuvar ljuske i svih
 * nastavničkih ruta, `SesijaStore`, `AuthApi`, provera 401 u interceptoru) i dodaje 3 247 B (787 904 B); dijalog isteka i
 * preusmerenje (`core/auth/istek-sesije`) su lenji chunk. Budžet je zato podignut za 5 kB, na 790 000 B.
 */
const BUDZET_POCETNO = 790_000;
const BUDZET_STRANICA = 215_000;
const BUDZET_EDITOR_4B = 450_000;
const BUDZET_EDITOR_4B_GZIP = 140_000;
/** Sopstveno zatvorenje `mathlive/ssr` (statički prikaz formula, F15) minus početno, stranica i editor. */
const BUDZET_MATHLIVE_SSR = 380_000;
/** Dijalog formule (F16) sa celim `mathlive`-om koji dinamički uvozi, minus početno, stranica i editor (odluka 7). */
const BUDZET_DIJALOG_FORMULE = 900_000;
/** Niz koji ima samo ceo `mathlive` (`<math-field>`, dijalog formule F16), a ne `mathlive/ssr`. */
const NIZ_MATH_FIELD = 'math-field';
/** Niz koji postoji samo u šablonu stranice editora prezentacije (zaglavlje). */
const NIZ_STRANICE = 'uz-ed-zaglavlje';
/**
 * Niz koji ima samo rxjs `fromEvent` (5d): operator koji niko u aplikaciji ne koristi esbuild ne pakuje, a čim ga koristi i
 * lenji kod, ide u deljeni rxjs chunk početnog paketa (F14: +638 B zbog `uvoz-pdf/slanje-pdf.ts`). Lenji kod koristi
 * `new Observable` sa `addEventListener`.
 */
const NIZ_FROM_EVENT = 'Invalid event target';
/** Niz koji ima samo modul pretvaranja INFO -> PLATNO (`OPISI_GUBITAKA.VEZE`, 5c). */
const NIZ_PRETVARANJA = 'Veze postaju običan tekst';
/** Niz koji ima samo dijalog izbora grupe Zadatak slajda (prazna banka, FE-2). */
const NIZ_IZBORA_GRUPE = 'Banka ovog predmeta još nema grupa za predavanja.';

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

  test('nizovi provere su pravi: OZNAKA_EDITORA_PLATNA i niz rxjs fromEvent', () => {
    const oznake = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'editor-platna', 'oznake.ts'), 'utf8');
    expect(oznake).toContain(`export const OZNAKA_EDITORA_PLATNA = '${NIZ_EDITORA}';`);
    expect(readFileSync(join(__dirname, '..', 'node_modules', 'rxjs', 'dist', 'esm', 'internal', 'observable', 'fromEvent.js'), 'utf8'))
      .toContain(NIZ_FROM_EVENT);
  });

  test('početno zatvorenje nema kod editora i staje u budžet', () => {
    expect([...pocetno].some(f => /^main-[A-Za-z0-9_-]+\.js$/.test(f)), 'main-*.js u index.html').toBe(true);
    expect(stilovi.length, 'globalni stilovi u index.html').toBeGreaterThan(0);
    const sporni = [...pocetno].map(f => ({ f, nizovi: nizoviEditora(tekst(f)) })).filter(x => x.nizovi.length);
    expect(sporni).toEqual([]);
    expect([...pocetno].filter(f => tekst(f).includes(NIZ_FROM_EVENT)), 'rxjs fromEvent u početnom zatvorenju').toEqual([]);
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

  test('pretvaranje u platno (5c): samo dinamički uvoz iz stranice, van početnog zatvorenja i zatvorenja stranice', () => {
    const izvor = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'data-access', 'pretvori-u-platno.ts'), 'utf8');
    expect(izvor).toContain(`VEZE: '${NIZ_PRETVARANJA}`);
    const pretvaranje = fajlSa(NIZ_PRETVARANJA, js);
    const stranica = fajlSa(NIZ_STRANICE, js);
    expect(js.filter(f => tekst(f).includes(NIZ_PRETVARANJA)), 'niz pretvaranja samo u jednom chunk-u').toEqual([pretvaranje]);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(pretvaranje)), `${pretvaranje}: statički uvoz`).toEqual([]);
    expect(dinamickiUvozi(tekst(stranica)), 'stranica ga uvozi dinamički').toContain(pretvaranje);
    expect(new Set([...pocetno, ...zatvorenje([stranica])]).has(pretvaranje)).toBe(false);
    zapisi('fajl chunk-a pretvaranja u platno', zbir([pretvaranje]));
  });

  test('izbor grupe Zadatak slajda (FE-2): samo dinamički uvoz (`IzborGrupeOtvarac`), van početnog zatvorenja i zatvorenja stranice', () => {
    const izvor = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'pages', 'izbor-grupe.dialog.ts'), 'utf8');
    expect(izvor).toContain(NIZ_IZBORA_GRUPE);
    const dijalog = fajlSa(NIZ_IZBORA_GRUPE, js);
    const stranica = fajlSa(NIZ_STRANICE, js);
    const uStranici = new Set([...pocetno, ...zatvorenje([stranica])]);
    expect(js.filter(f => tekst(f).includes(NIZ_IZBORA_GRUPE)), 'niz izbora grupe samo u jednom chunk-u').toEqual([dijalog]);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(dijalog)), `${dijalog}: statički uvoz`).toEqual([]);
    expect([...uStranici].filter(f => dinamickiUvozi(tekst(f)).includes(dijalog)).length, 'stranica ga uvozi dinamički').toBeGreaterThan(0);
    expect(uStranici.has(dijalog)).toBe(false);
    zapisi('fajl chunk-a izbora grupe zadataka', zbir([dijalog]));
  });

  test('editor platna: samo dinamički uvoz, sopstveno zatvorenje (sa ProseMirror-om) staje u budžet 4b', () => {
    const editor = fajlSa(NIZ_EDITORA, js);
    // jedini statički uvoznik sme biti lenji dijalog formule (F16): builder kod koji dijalog deli sa editorom (izbor boje,
    // brojčano polje, pravila formule) ostavlja u chunk-u editora, a dijalog se ionako učitava tek iz editora (dinamički)
    const dijalog = fajlSa(NIZ_FORMULE_EDITORA, js);
    expect(js.filter(u => u !== dijalog && statickiUvozi(tekst(u)).includes(editor)), `${editor}: statički uvoz`).toEqual([]);
    expect(js.some(u => dinamickiUvozi(tekst(u)).includes(editor)), `${editor}: nema dinamičkog import()-a`).toBe(true);

    const stranica = fajlSa(NIZ_STRANICE, js);
    const vecUcitano = new Set([...pocetno, ...zatvorenje([stranica])]);
    expect(vecUcitano.has(editor), 'editor nije u početnom zatvorenju ni u zatvorenju stranice').toBe(false);
    const sopstveno = sopstvenoZatvorenje([editor], vecUcitano);
    zapisi('editor (sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
    zapisi('fajl chunk-a editora', zbir([editor]));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_EDITOR_4B);
    expect(zbirGzip(sopstveno)).toBeLessThanOrEqual(BUDZET_EDITOR_4B_GZIP);
    // ProseMirror je u sopstvenom zatvorenju editora (lenj), a MathLive nije (dolazi tek sa dijalogom formule, F15/F16)
    expect([...sopstveno].some(f => tekst(f).includes(NIZ_PROSEMIRROR)), 'ProseMirror u zatvorenju editora').toBe(true);
    expect([...sopstveno].filter(f => tekst(f).includes(NIZ_MATHLIVE))).toEqual([]);
    // svi nizovi editora (i budući, 4b) su van početnog zatvorenja i fajla stranice
    expect(NIZOVI_EDITORA.filter(n => [...pocetno, stranica].some(f => tekst(f).includes(n)))).toEqual([]);
  });

  test('mathlive/ssr (formule na projektoru, konzoli i u editoru): samo dinamički uvoz, sopstveni chunk u budžetu', () => {
    const ssrFajlovi = js.filter(f => tekst(f).includes(NIZ_MATHLIVE) && !tekst(f).includes(NIZ_MATH_FIELD));
    expect(ssrFajlovi.length, 'tačno jedan chunk sa mathlive/ssr').toBe(1);
    const [ssr] = ssrFajlovi;
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(ssr)), `${ssr}: statički uvoz`).toEqual([]);
    expect(js.some(u => dinamickiUvozi(tekst(u)).includes(ssr)), `${ssr}: nema dinamičkog import()-a`).toBe(true);

    const stranica = fajlSa(NIZ_STRANICE, js);
    const editor = fajlSa(NIZ_EDITORA, js);
    const vecUcitano = new Set([...pocetno, ...zatvorenje([stranica])]);
    const ucitano = new Set([...vecUcitano, ...sopstvenoZatvorenje([editor], vecUcitano)]);
    expect(ucitano.has(ssr), 'mathlive/ssr nije u početnom zatvorenju, stranici ni editoru').toBe(false);
    const sopstveno = sopstvenoZatvorenje([ssr], ucitano);
    zapisi('mathlive/ssr (sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_MATHLIVE_SSR);
  });

  test('dijalog formule: samo dinamički uvoz iz editora, ceo mathlive tek iz dijaloga, sopstveno zatvorenje u budžetu', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'editor-platna', 'formula', 'formula.dialog.ts'), 'utf8');
    expect(src).toContain(`export const OZNAKA_FORMULE_EDITORA = '${NIZ_FORMULE_EDITORA}';`);
    const dijalog = fajlSa(NIZ_FORMULE_EDITORA, js);
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(dijalog)), `${dijalog}: statički uvoz`).toEqual([]);
    const stranica = fajlSa(NIZ_STRANICE, js);
    const editor = fajlSa(NIZ_EDITORA, js);
    const vecUcitano = new Set([...pocetno, ...zatvorenje([stranica])]);
    const sopstvenoEditor = sopstvenoZatvorenje([editor], vecUcitano);
    expect(sopstvenoEditor.has(dijalog), 'dijalog nije u zatvorenju editora').toBe(false);
    // dinamički ga uvozi samo editor (otvarač formule), nikad početno ni stranica
    const uvoznici = js.filter(u => dinamickiUvozi(tekst(u)).includes(dijalog));
    expect(uvoznici.length, `${dijalog}: nema dinamičkog import()-a`).toBeGreaterThan(0);
    expect(uvoznici.filter(u => !sopstvenoEditor.has(u))).toEqual([]);
    // ono što otvaranje dijaloga na kraju učita (statički i dinamički uvozi: mathlive se uvozi dinamički iz dijaloga);
    // ograda (Note -> F19): fajlovi koji su već učitani (početno, stranica, editor) se ne broje i ne prate dalje, jer
    // dijalog statički uvozi deljeni chunk editora, a lenji uvozi editora (npr. mathlive/ssr) nisu deo dijaloga
    const ucitano = new Set([...vecUcitano, ...sopstvenoEditor]);
    const sopstveno = [...potpunoZatvorenje([dijalog], ucitano)];
    // bez ograde (zatvorenje pa filter) bi se kroz chunk editora brojali i njegovi lenji chunk-ovi: zapisuje se radi poređenja
    const bezOgrade = [...potpunoZatvorenje([dijalog])].filter(f => !ucitano.has(f));
    zapisi('dijalog formule bez ograde (i lenji chunk-ovi editora, samo za poređenje)', zbir(bezOgrade));
    // od čega je razlika (ime, veličina i nizovi po kojima se fajl prepoznaje): nijedan fajl razlike nije kod dijaloga
    const razlika = bezOgrade.filter(f => !sopstveno.includes(f)).sort((a, b) => zbir([b]) - zbir([a]));
    test.info().annotations.push({
      type: 'velicina',
      description: `razlika bez ograde: ${razlika.map(f => `${f} ${zbir([f])} B${nizoviEditora(tekst(f)).length ? ` [${nizoviEditora(tekst(f)).join(', ')}]` : ''}`).join('; ')}`,
    });
    expect(razlika.filter(f => tekst(f).includes(NIZ_FORMULE_EDITORA))).toEqual([]);
    expect(bezOgrade.filter(f => !sopstveno.includes(f)).every(f => !tekst(f).includes(NIZ_MATH_FIELD)),
      'razlika bez ograde nije ceo mathlive').toBe(true);
    expect(sopstveno.every(f => bezOgrade.includes(f))).toBe(true);
    zapisi('dijalog formule (sa mathlive, sopstveno zatvorenje)', zbir(sopstveno), zbirGzip(sopstveno));
    zapisi('fajl chunk-a dijaloga formule', zbir([dijalog]));
    expect(zbir(sopstveno)).toBeLessThanOrEqual(BUDZET_DIJALOG_FORMULE);
    const ceo = sopstveno.filter(f => tekst(f).includes(NIZ_MATHLIVE) && tekst(f).includes(NIZ_MATH_FIELD));
    expect(ceo.length, 'ceo mathlive (math-field) u zatvorenju dijaloga').toBe(1);
    // ceo mathlive nije statički uvezen ni iz dijaloga ni iz čega drugog (tek dinamički, posle otvaranja)
    expect(js.filter(u => statickiUvozi(tekst(u)).includes(ceo[0])), `${ceo[0]}: statički uvoz`).toEqual([]);
    expect(tekst(dijalog).includes(NIZ_MATHLIVE), 'fajl dijaloga nema MathLive').toBe(false);
  });

  test('izvori statičkog prikaza formula ne sadrže niz MathLive-a (odluka 26: niz prepoznaje samo biblioteku)', () => {
    const ui = join(__dirname, '..', 'src', 'app', 'features', 'uzivo', 'ui');
    for (const f of ['formula-markup.ts', 'formula-ucitavanje.ts', 'formula-prikaz.component.ts', 'formula-sanitizer.ts', 'formula-komande.ts']) {
      expect(readFileSync(join(ui, f), 'utf8').includes(NIZ_MATHLIVE), f).toBe(false);
    }
  });
});
