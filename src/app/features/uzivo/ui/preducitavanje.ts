import type { Tema } from '../data-access/platno.models';
import { SlajdDetails, medijUrl } from '../data-access/uzivo.models';
import { sacekajFontove, skupFontova, ucitajRezove } from './cekanje-fontova';
import { ModulFormule, resetujUcitavanjeFormula, ucitajFormule, ucitajStilFormula } from './formula-ucitavanje';
import { FONTOVI_PLATNA, fontoviPlatna } from './platno-fontovi';
import { imaFormulu } from './tekst-formule';
import { TEME, vazecaTema } from './teme';

/**
 * Unapred učitavanje slika i fontova slajda (spec 5: "bez učitavanja pri prelazu", "fontovi pre prikaza"). Publika i
 * konzola posle svakog snimka traže slike (i fontove) sledećeg slajda, pa prelaz ne čeka mrežu; mediji su `immutable` u
 * kešu pregledača. Prozor publike pre prvog prikaza čeka fontove (`sacekajFontove`, najviše 3 s), jer su `@font-face`
 * platna `font-display: block` i tekst bi do tada bio nevidljiv.
 */

/** URL-ovi svih slika slajda: INFO slika, slika pitanja; PLATNO pozadina, SLIKA, CRTEZ i slika izvora formule. */
export function slikeSlajda(s: SlajdDetails | null): string[] {
  if (!s) {
    return [];
  }
  const id: string[] = [];
  if (s.slika) id.push(s.slika.id);
  if (s.pitanje?.slika) id.push(s.pitanje.slika.id);
  const p = s.tip === 'PLATNO' ? s.platno : null;
  if (p) {
    if (p.pozadina.medijId) id.push(p.pozadina.medijId);
    for (const sloj of p.slojevi) {
      if (sloj.tip === 'SLIKA' || sloj.tip === 'CRTEZ') id.push(sloj.medijId);
      else if (sloj.tip === 'FORMULA' && sloj.slikaIzvora) id.push(sloj.slikaIzvora);
    }
  }
  return [...new Set(id)].map(medijUrl);
}

const ucitaneSlike = new Set<string>();

/** Pokreće preuzimanje slika (`new Image()`); svaki URL samo jednom po prozoru (neuspelo se pokušava ponovo). */
export function preducitajSlike(urls: string[]): void {
  for (const url of urls) {
    if (ucitaneSlike.has(url)) continue;
    ucitaneSlike.add(url);
    const slika = new Image();
    slika.decoding = 'async';
    slika.onerror = () => ucitaneSlike.delete(url);
    slika.src = url;
  }
}

const POZNATI = new Set(FONTOVI_PLATNA.map((f) => f.naziv));
const PODRAZUMEVANI = FONTOVI_PLATNA[0].naziv;

/** Font kojim se crta LaTeX izvor formule bez slike (`platno-prikaz`, faza 1). */
const FONT_FORMULE = 'Cousine';

/**
 * Fontovi koje prikaz koristi: naslov i telo teme (i teme NACRT) i za PLATNO slajdove `deo.font` (nepoznat ->
 * Carlito), uvek Carlito (podrazumevani font platna) i Cousine kad formula nema sliku izvora.
 */
export function fontoviZaPrikaz(tema: Tema | null | undefined, slajdovi: readonly (SlajdDetails | null)[]): Set<string> {
  const t = TEME[vazecaTema(tema)];
  const fontovi = new Set<string>([t.fontNaslova, t.fontTela]);
  for (const s of slajdovi) {
    if (s?.tip === 'PLATNO' && s.platno) {
      fontovi.add(PODRAZUMEVANI);
      for (const f of fontoviPlatna(s.platno)) fontovi.add(POZNATI.has(f) ? f : PODRAZUMEVANI);
      if (s.platno.slojevi.some((sloj) => sloj.tip === 'FORMULA' && !sloj.slikaIzvora)) fontovi.add(FONT_FORMULE);
    }
  }
  return fontovi;
}

/** Čekanje fontova je u `cekanje-fontova.ts` (bez uvoza); ovde se izvozi i dalje, za publiku i specove. */
export { sacekajFontove };

const trazeniFontovi = new Set<string>();

/** Pokreće učitavanje fontova bez čekanja; svaki font samo jednom po prozoru (odbijen se traži ponovo). */
export function preducitajFontove(fontovi: Iterable<string>): void {
  const skup = skupFontova();
  if (!skup) {
    return;
  }
  for (const f of fontovi) {
    if (trazeniFontovi.has(f)) continue;
    trazeniFontovi.add(f);
    void Promise.all(ucitajRezove(skup, f)).catch(() => trazeniFontovi.delete(f));
  }
}

/**
 * PLATNO slajd sa bar jednom formulom bez slike izvora (nju `platno-prikaz` crta MathLive-om, `formula-prikaz`) ili
 * pitanje sa formulom `$...$` u tekstu ili u nekoj opciji (`app-tekst-formule`). INFO ne tumači `$`. Tekst pitanja je
 * Markdown, ali za unapred učitavanje je dovoljno pravilo običnog teksta (jeftino posle svakog snimka): retka razlika
 * (`` `$x$` `` u kodu) samo učita modul bez potrebe, a obrnuto prikaz sam učita modul.
 */
export function imaFormuluZaCrtanje(s: SlajdDetails | null): boolean {
  if (s?.tip === 'PITANJE') {
    return !!s.pitanje && (imaFormulu(s.pitanje.tekst) || s.pitanje.opcije.some((o) => imaFormulu(o.tekst)));
  }
  return s?.tip === 'PLATNO' && !!s.platno?.slojevi.some((sloj) => sloj.tip === 'FORMULA' && !sloj.slikaIzvora);
}

/** `preducitajFormule` sa zadatim učitavačima (testovi); stranice zovu `preducitajFormule`. */
export function preducitajFormuleSa(
  ucitaj: () => Promise<ModulFormule>, ucitajStil: () => Promise<void>, slajdovi: readonly (SlajdDetails | null)[],
): void {
  if (!slajdovi.some(imaFormuluZaCrtanje)) {
    return;
  }
  // greške se gutaju: prikaz sam ponovo pokuša i, ako ne uspe, crta LaTeX izvor
  ucitaj().catch(() => undefined);
  ucitajStil().catch(() => undefined);
}

/**
 * Unapred učitava `mathlive/ssr` (modul `formula-markup`), CSS i KaTeX fontove kad neki od slajdova ima formulu za
 * crtanje (odluka 6 i 32: publika i konzola za trenutni i sledeći slajd). Keš je u `formula-ucitavanje` (jednom po
 * prozoru), pa je poziv posle svakog snimka jeftin.
 */
export function preducitajFormule(...slajdovi: (SlajdDetails | null)[]): void {
  preducitajFormuleSa(ucitajFormule, ucitajStilFormula, slajdovi);
}

/** Samo za testove: zaboravlja učitane slike, tražene fontove i učitavanje formula (keševi traju koliko i prozor). */
export function resetujPreducitavanje(): void {
  ucitaneSlike.clear();
  trazeniFontovi.clear();
  resetujUcitavanjeFormula();
}

