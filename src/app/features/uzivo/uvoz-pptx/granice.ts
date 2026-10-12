// Granice dokumenta platna (PlatnoPP na serveru): uvoz ih proverava PRE slanja, pa server nikad ne odbija dokument
// koji je napravio uvoz. Čiste funkcije bez Angular-a. Pravila brojanja su ista kao na serveru:
//  - slojevi: samo sloj najvišeg nivoa (grupa nema pa ni ugnježdenih slojeva);
//  - znaci: code point-i (ne UTF-16 jedinice) u `deo.tekst` svih pasusa TEKST sloja i SVIH ćelija TABELE (i pokrivenih),
//    plus `latex` FORMULE;
//  - tačke: po CRTEZ sloju, zbir `tacke.length / 2` preko poteza (parovi x, y);
//  - bajtovi: UTF-8 dužina serijalizacije koju server pravi posle normalizacije (vidi `bajtovaPlatna`).
import type { OblikSloj, Pasus, Platno, Sloj } from '../data-access/platno.models';
import type { KodUpozorenja } from './izvestaj';
import { zaokruziKaoServer } from './tipovi';

export const GRANICE = {
  slojeva: 300, animacija: 400, znakova: 50_000, tacakaPoCrtezu: 20_000, bajtova: 1_048_576, beleske: 20_000,
} as const;

/** Polja koja server drži kao `Integer` (ostali brojevi su `Double`: Jackson piše `100.0` za ceo broj). */
const CELOBROJNA_POLJA: ReadonlySet<string> = new Set(['verzija', 'nivo', 'pocetak', 'spojDesno', 'spojDole', 'pasus', 'trajanjeMs', 'kasnjenjeMs']);

/** Dužina `Double.toString` zapisa (Jackson piše `Double` kao Java) za |x| >= 1e7: `1.23456789E7`, `1.0E7`. */
function javaNaucni(x: number): string {
  const [mantisa, izlozilac] = Math.abs(x).toExponential().split('e');
  return `${x < 0 ? '-' : ''}${mantisa.includes('.') ? mantisa : `${mantisa}.0`}E${Number(izlozilac)}`;
}

/** Oblik kakav server upisuje posle `PlatnoPP.normalizuj` za polja koja uvoz sme da ostavi praznim. */
function kaoServer(p: Platno): Platno {
  const linija = (o: OblikSloj) => o.oblik === 'LINIJA' || o.oblik === 'STRELICA' || o.oblik === 'DVOSTRUKA_STRELICA';
  return {
    ...p,
    slojevi: p.slojevi.map((s) => {
      if (s.tip !== 'OBLIK' || !linija(s)) return s;
      const y = zaokruziKaoServer(zaokruziKaoServer(s.visina) / 2);
      return { ...s, od: s.od ?? { x: 0, y }, do: s.do ?? { x: zaokruziKaoServer(s.sirina), y } };
    }),
    animacije: p.animacije.map((a) => ({
      ...a,
      smer: a.smer ?? (a.efekat === 'ULET' ? 'DOLE' : a.efekat === 'PODELI' ? 'VERTIKALNO' : a.efekat === 'BRISANJE' || a.efekat === 'ISCRTAJ' ? 'LEVO' : null),
      trajanjeMs: a.efekat === 'POJAVI' ? 0 : a.trajanjeMs,
    })),
  };
}

/**
 * UTF-8 dužina dokumenta onako kako ga server serijalizuje (`PlatnoJson.velicinaBajtova` posle `PlatnoPP.normalizuj`,
 * provera `PlatnoPP.proveriVelicinu`).
 * Meri se oblik koji server upisuje, ne ono što klijent pošalje:
 *  - `Double` polja se zaokružuju kao server (`zaokruziKaoServer`) i pišu sa `.0` kad su ceo broj (`100` -> `100.0`: +2 bajta),
 *    a `Integer` polja (`verzija`, `nivo`, `pocetak`, `spojDesno`, `spojDole`, `pasus`, `trajanjeMs`, `kasnjenjeMs`) ne;
 *  - za |x| >= 1e7 Jackson piše naučni zapis (`1.23456789E7`); granica koordinata je 2880, pa import to ne daje, ali je izmereno;
 *  - linije (LINIJA, STRELICA, DVOSTRUKA_STRELICA) bez `od`/`do` dobijaju krajeve (0, visina/2) i (širina, visina/2);
 *  - `smer` koji nedostaje: ULET -> DOLE, PODELI -> VERTIKALNO, BRISANJE i ISCRTAJ -> LEVO; POJAVI ima trajanje 0;
 *  - razmaci i redosled polja ne utiču (obe strane pišu bez razmaka, `null` se piše).
 * Pretpostavlja ostala polja popunjena (model ih tako i tipizira).
 */
export function bajtovaPlatna(p: Platno): number {
  let dodatak = 0;
  const tekst = JSON.stringify(kaoServer(p), function (this: unknown, kljuc: string, vrednost: unknown) {
    if (typeof vrednost !== 'number') return vrednost;
    if (!Array.isArray(this) && CELOBROJNA_POLJA.has(kljuc)) return vrednost;
    const z = zaokruziKaoServer(vrednost);
    if (Math.abs(z) >= 1e7) dodatak += javaNaucni(z).length - String(z).length;
    else if (Number.isInteger(z)) dodatak += 2;
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
