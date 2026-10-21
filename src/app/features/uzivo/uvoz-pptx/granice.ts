// Granice dokumenta platna (PlatnoPP na serveru): uvoz ih proverava PRE slanja, pa server nikad ne odbija dokument
// koji je napravio uvoz. Čiste funkcije bez Angular-a. Pravila brojanja su ista kao na serveru:
//  - slojevi: samo sloj najvišeg nivoa (grupa nema pa ni ugnježdenih slojeva);
//  - znaci: code point-i (ne UTF-16 jedinice) u `deo.tekst` svih pasusa TEKST sloja i SVIH ćelija TABELE (i pokrivenih),
//    plus `latex` FORMULE;
//  - tačke: po CRTEZ sloju, zbir `tacke.length / 2` preko poteza (parovi x, y);
//  - bajtovi: UTF-8 dužina serijalizacije koju server pravi posle normalizacije (vidi `bajtovaPlatna`).
import type { Platno, Sloj } from '../data-access/platno.models';
import { bajtovaPlatna, GRANICE, znakovaSloja } from '../data-access/platno-provera';
import type { KodUpozorenja } from './izvestaj';

// Provera dokumenta kao na serveru živi u `data-access/platno-provera` (deli je editor platna); moduli uvoza je i dalje
// uvoze odavde.
export { GRANICE, DUZINA_ID_MEDIJA, bajtovaPlatna, preslikajMedije, proveriKaoServer } from '../data-access/platno-provera';

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
