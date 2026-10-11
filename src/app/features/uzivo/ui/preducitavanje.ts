import type { Tema } from '../data-access/platno.models';
import { SlajdDetails, medijUrl } from '../data-access/uzivo.models';
import { FONTOVI_PLATNA, fontoviPlatna } from './platno-fontovi';
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

/** Pokreće preuzimanje slika (`new Image()`); svaki URL samo jednom po prozoru. */
export function preducitajSlike(urls: string[]): void {
  for (const url of urls) {
    if (ucitaneSlike.has(url)) continue;
    ucitaneSlike.add(url);
    const slika = new Image();
    slika.decoding = 'async';
    slika.src = url;
  }
}

const POZNATI = new Set(FONTOVI_PLATNA.map((f) => f.naziv));
const PODRAZUMEVANI = FONTOVI_PLATNA[0].naziv;

/** Fontovi koje prikaz koristi: naslov i telo teme (bez teme NACRT) i `deo.font` PLATNO slajdova (nepoznat -> Carlito). */
export function fontoviZaPrikaz(tema: Tema | null | undefined, slajdovi: readonly (SlajdDetails | null)[]): Set<string> {
  const t = TEME[vazecaTema(tema)];
  const fontovi = new Set<string>([t.fontNaslova, t.fontTela]);
  for (const s of slajdovi) {
    if (s?.tip === 'PLATNO' && s.platno) {
      for (const f of fontoviPlatna(s.platno)) fontovi.add(POZNATI.has(f) ? f : PODRAZUMEVANI);
    }
  }
  return fontovi;
}

/** Znakovi za `document.fonts.load`: latinica i latin-ext (`unicode-range` deli fajlove; č ć đ š ž su u latin-ext). */
const UZORAK = 'AaZz09 čćđšž ČĆĐŠŽ';
const REZOVI = ['400', '700'];

interface SkupFontova { load(font: string, tekst?: string): Promise<unknown>; }

function skupFontova(): SkupFontova | null {
  const fonts = (document as Document & { fonts?: SkupFontova }).fonts;
  return typeof fonts?.load === 'function' ? fonts : null;
}

/** Normalan i podebljan rez svakog fonta (kurziv se učita sam pri prvom crtanju). */
function ucitaj(skup: SkupFontova, fontovi: Iterable<string>): Promise<unknown>[] {
  const zahtevi: Promise<unknown>[] = [];
  for (const f of new Set(fontovi)) {
    for (const rez of REZOVI) zahtevi.push(skup.load(`${rez} 32px "${f}"`, UZORAK));
  }
  return zahtevi;
}

/**
 * Čeka da se fontovi učitaju, najviše `maxMs`. Nikad ne odbija: greška učitavanja ili pregledač bez `document.fonts`
 * znači da se prikaz crta odmah (sa rezervnim fontom ili kad font stigne).
 */
export function sacekajFontove(fontovi: Iterable<string>, maxMs = 3000): Promise<void> {
  const skup = skupFontova();
  if (!skup) {
    return Promise.resolve();
  }
  return new Promise<void>((razresi) => {
    const tajmer = setTimeout(razresi, maxMs);
    void Promise.allSettled(ucitaj(skup, fontovi)).then(() => {
      clearTimeout(tajmer);
      razresi();
    });
  });
}

const trazeniFontovi = new Set<string>();

/** Pokreće učitavanje fontova bez čekanja; svaki font samo jednom po prozoru. */
export function preducitajFontove(fontovi: Iterable<string>): void {
  const skup = skupFontova();
  if (!skup) {
    return;
  }
  const novi = [...fontovi].filter((f) => !trazeniFontovi.has(f));
  novi.forEach((f) => trazeniFontovi.add(f));
  for (const zahtev of ucitaj(skup, novi)) {
    zahtev.catch(() => undefined);
  }
}
