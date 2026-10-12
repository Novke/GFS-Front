// Granice dokumenta platna (PlatnoPP na serveru): uvoz ih proverava PRE slanja, pa server nikad ne odbija dokument
// koji je napravio uvoz. Čiste funkcije bez Angular-a. Pravila brojanja su ista kao na serveru:
//  - slojevi: samo sloj najvišeg nivoa (grupa nema pa ni ugnježdenih slojeva);
//  - znaci: code point-i (ne UTF-16 jedinice) u `deo.tekst` svih pasusa TEKST sloja i SVIH ćelija TABELE (i pokrivenih),
//    plus `latex` FORMULE;
//  - tačke: po CRTEZ sloju, zbir `tacke.length / 2` preko poteza (parovi x, y);
//  - bajtovi: UTF-8 dužina serijalizacije koju server pravi posle normalizacije (vidi `bajtovaPlatna`).
import type { Platno, Pasus, Sloj } from '../data-access/platno.models';
import type { KodUpozorenja } from './izvestaj';
import { zaokruzi } from './tipovi';

export const GRANICE = {
  slojeva: 300, animacija: 400, znakova: 50_000, tacakaPoCrtezu: 20_000, bajtova: 1_048_576, beleske: 20_000,
} as const;

/** Polja koja server drži kao `Integer` (ostali brojevi su `Double`: Jackson piše `100.0` za ceo broj). */
const CELOBROJNA_POLJA: ReadonlySet<string> = new Set(['verzija', 'nivo', 'pocetak', 'spojDesno', 'spojDole', 'pasus', 'trajanjeMs', 'kasnjenjeMs']);

/**
 * UTF-8 dužina dokumenta onako kako ga server serijalizuje (`PlatnoJson.velicinaBajtova`, provera `PlatnoPP.proveriVelicinu`):
 * server normalizuje (brojke `Double` zaokružuje HALF_UP na 2 decimale) i piše `Double` sa `.0` kad je ceo (`100` -> `100.0`),
 * pa se isto računa ovde: `JSON.stringify` posle zaokruživanja plus 2 bajta za svaki ceo broj u `Double` polju.
 * Redosled polja i razmaci ne utiču (server piše bez razmaka, kao `JSON.stringify`). Pretpostavlja potpun dokument (sva
 * polja postoje, `null` gde nema vrednosti), kakav pravi uvoz.
 */
export function bajtovaPlatna(p: Platno): number {
  let dodatak = 0;
  const tekst = JSON.stringify(p, function (this: unknown, kljuc: string, vrednost: unknown) {
    if (typeof vrednost !== 'number') return vrednost;
    if (!Array.isArray(this) && CELOBROJNA_POLJA.has(kljuc)) return vrednost;
    const z = zaokruzi(vrednost);
    if (Number.isInteger(z)) dodatak += 2;
    return z;
  });
  return new TextEncoder().encode(tekst).length + dodatak;
}

/** Broj code point-a (kao `String.codePointCount` na serveru). */
function codePointa(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i++; // par surogata je jedan code point
    n++;
  }
  return n;
}

const znakovaPasusa = (pasusi: Pasus[]) => pasusi.reduce((z, p) => z + p.delovi.reduce((d, deo) => d + codePointa(deo.tekst), 0), 0);

function znakovaSloja(s: Sloj): number {
  switch (s.tip) {
    case 'TEKST': return znakovaPasusa(s.pasusi);
    case 'TABELA': return s.celije.reduce((z, red) => z + red.reduce((r, c) => r + znakovaPasusa(c.pasusi), 0), 0);
    case 'FORMULA': return codePointa(s.latex);
    default: return 0;
  }
}

const tacakaCrteza = (s: Sloj) => (s.tip === 'CRTEZ' && s.potezi ? s.potezi.reduce((n, z) => n + Math.floor(z.tacke.length / 2), 0) : 0);

function bezPoteza(p: Platno, jeste: (s: Sloj) => boolean): Platno {
  return { ...p, slojevi: p.slojevi.map((s) => (s.tip === 'CRTEZ' && s.potezi && jeste(s) ? { ...s, potezi: null } : s)) };
}

/**
 * Dovodi dokument u granice servera: crtež sa previše tačaka gubi poteze (slika ostaje), preveliki dokument (zbog poteza)
 * gubi poteze svih crteža; što se ne može skratiti bez gubitka smisla (slojevi, animacije, tekst) je greška slajda.
 * Ulaz se ne menja. Redosled provera je redosled iz briefa.
 */
export function uklopiUGranice(p: Platno, upozori: (kod: KodUpozorenja, poruka: string) => void): Platno | { greska: string } {
  let dokument = p;
  const previse = (s: Sloj) => tacakaCrteza(s) > GRANICE.tacakaPoCrtezu;
  if (dokument.slojevi.some(previse)) {
    const n = dokument.slojevi.filter(previse).length;
    dokument = bezPoteza(dokument, previse);
    upozori('CRTEZ_BEZ_POTEZA', `${n === 1 ? 'Crtež ima' : `${n} crteža imaju`} više od ${GRANICE.tacakaPoCrtezu} tačaka: ostala je slika bez poteza koji se mogu crtati.`);
  }
  if (dokument.slojevi.length > GRANICE.slojeva) return { greska: `Slajd ima više od ${GRANICE.slojeva} objekata.` };
  if (dokument.animacije.length > GRANICE.animacija) return { greska: `Slajd ima više od ${GRANICE.animacija} animacija.` };
  if (dokument.slojevi.reduce((z, s) => z + znakovaSloja(s), 0) > GRANICE.znakova) {
    return { greska: `Slajd ima više od ${GRANICE.znakova} znakova teksta.` };
  }
  if (bajtovaPlatna(dokument) > GRANICE.bajtova) {
    dokument = bezPoteza(dokument, () => true);
    upozori('CRTEZ_BEZ_POTEZA', 'Slajd je prevelik (više od 1 MB): crteži su ostali bez poteza koji se mogu crtati.');
    if (bajtovaPlatna(dokument) > GRANICE.bajtova) return { greska: 'Slajd je prevelik (više od 1 MB).' };
  }
  return dokument;
}
