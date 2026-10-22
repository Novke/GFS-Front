/*
 * Broj telefona u javnoj formi za upis: izbor zemlje (pozivni broj) i broj, sve se šalje i čuva kao E.164 (`+381641234567`),
 * isto pravilo kao backend `Telefon.uE164`. Čiste funkcije bez uvoza. Mala sopstvena lista umesto `libphonenumber-js`
 * (desetine kB metapodataka u javnom chunk-u studenta): studenti su iz Srbije i okolnih zemalja, a server je izvor istine.
 */

export interface Zemlja {
  /** ISO 3166 kod (`RS`) ili `XX` za "Druga zemlja". */
  kod: string;
  naziv: string;
  /** Pozivni broj bez `+` (`381`); prazno za "Druga zemlja" (unosi se ručno). */
  pozivni: string;
  /** Zastava (regionalni simboli; gde font nema zastave, vidi se kod zemlje, npr. "RS"). */
  zastava: string;
  /** Nacionalni prefiks koji se skida ispred broja (`0`; u Mađarskoj `06`). */
  prefiks: string[];
}

export const DRUGA_ZEMLJA = 'XX';

export const ZEMLJE: readonly Zemlja[] = [
  { kod: 'RS', naziv: 'Srbija', pozivni: '381', zastava: '\u{1F1F7}\u{1F1F8}', prefiks: ['0'] },
  { kod: 'BA', naziv: 'Bosna i Hercegovina', pozivni: '387', zastava: '\u{1F1E7}\u{1F1E6}', prefiks: ['0'] },
  { kod: 'ME', naziv: 'Crna Gora', pozivni: '382', zastava: '\u{1F1F2}\u{1F1EA}', prefiks: ['0'] },
  { kod: 'HR', naziv: 'Hrvatska', pozivni: '385', zastava: '\u{1F1ED}\u{1F1F7}', prefiks: ['0'] },
  { kod: 'HU', naziv: 'Mađarska', pozivni: '36', zastava: '\u{1F1ED}\u{1F1FA}', prefiks: ['06', '0'] },
  { kod: 'MK', naziv: 'Severna Makedonija', pozivni: '389', zastava: '\u{1F1F2}\u{1F1F0}', prefiks: ['0'] },
  { kod: 'SI', naziv: 'Slovenija', pozivni: '386', zastava: '\u{1F1F8}\u{1F1EE}', prefiks: ['0'] },
  { kod: DRUGA_ZEMLJA, naziv: 'Druga zemlja', pozivni: '', zastava: '\u{1F310}', prefiks: ['0'] },
];

export const PODRAZUMEVANA_ZEMLJA = 'RS';

/** E.164: plus, pozivni broj (ne počinje nulom), ukupno 8-15 cifara (kao backend `Telefon.E164`). */
const E164 = /^\+[1-9]\d{7,14}$/u;
/** Dozvoljeni znaci u polju broja: cifre, razmaci, crtice, tačke, kose crte, zagrade i `+` samo na početku. */
const DOZVOLJENO = /^\+?[\d\s().\-/]*$/u;
const POZIVNI = /^[1-9]\d{0,2}$/u;

export function zemlja(kod: string): Zemlja {
  return ZEMLJE.find(z => z.kod === kod) ?? ZEMLJE[0];
}

/** Samo cifre pozivnog broja ("Druga zemlja"): `+44` -> `44`. */
export function cifrePozivnog(v: string): string {
  return v.replace(/\D+/gu, '').slice(0, 3);
}

/** Da li unos počinje međunarodno (`+...` ili `00...`). */
function medjunarodni(broj: string): string | null {
  const s = broj.trim();
  if (s.startsWith('+')) {
    return s.slice(1).replace(/\D+/gu, '');
  }
  const cifre = s.replace(/\D+/gu, '');
  return cifre.startsWith('00') ? cifre.slice(2) : null;
}

/** Zemlja sa liste čiji je pozivni broj početak međunarodnog broja (najduži prvo: `381` pre `38`). */
export function prepoznajZemlju(cifre: string): Zemlja | null {
  const kandidati = ZEMLJE.filter(z => z.pozivni && cifre.startsWith(z.pozivni));
  return kandidati.sort((a, b) => b.pozivni.length - a.pozivni.length)[0] ?? null;
}

/**
 * Broj u E.164 za izabranu zemlju, ili `null` kad unos nije broj. Međunarodni unos (`+387 65 ...`, `00387...`) važi kakav
 * jeste, bez obzira na izbor; inače se skida nacionalni prefiks (`064...` -> `64...`) i dodaje pozivni broj. Cifre koje već
 * počinju pozivnim brojem izabrane zemlje i duže su od lokalnog broja (`381641234567`) su međunarodni broj bez plusa.
 */
export function uE164(kodZemlje: string, pozivniRucno: string, broj: string): string | null {
  const s = (broj ?? '').trim();
  if (!s || !DOZVOLJENO.test(s)) {
    return null;
  }
  const medj = medjunarodni(s);
  let rezultat: string;
  if (medj !== null) {
    rezultat = `+${medj}`;
  } else {
    const z = zemlja(kodZemlje);
    const pozivni = z.kod === DRUGA_ZEMLJA ? cifrePozivnog(pozivniRucno) : z.pozivni;
    if (!POZIVNI.test(pozivni)) {
      return null;
    }
    let cifre = s.replace(/\D+/gu, '');
    if (cifre.startsWith(pozivni) && cifre.length >= pozivni.length + 8) {
      rezultat = `+${cifre}`;
    } else {
      const prefiks = z.prefiks.find(p => cifre.startsWith(p));
      if (prefiks) {
        cifre = cifre.slice(prefiks.length);
      }
      if (cifre.length < 6) {
        return null;
      }
      rezultat = `+${pozivni}${cifre}`;
    }
  }
  return E164.test(rezultat) ? rezultat : null;
}

/**
 * Nalepljen ili ukucan međunarodni broj (`+387 65 123 456`, `00387...`): zemlja sa liste i ostatak broja za polje, ili
 * `null` kad unos nije međunarodni ili pozivni broj nije na listi (tada ostaje kako je ukucan; i tako važi kao E.164).
 */
export function razdvojiMedjunarodni(broj: string): { kod: string; broj: string } | null {
  const medj = medjunarodni(broj ?? '');
  if (medj === null) {
    return null;
  }
  const z = prepoznajZemlju(medj);
  if (!z) {
    return null;
  }
  const ostatak = medj.slice(z.pozivni.length);
  return ostatak.length >= 6 ? { kod: z.kod, broj: ostatak } : null;
}

/** `+381641234567` -> `+381 64 1234567` (pozivni sa liste, pa dve cifre, pa ostatak) za prikaz; ostalo kako jeste. */
export function prikazTelefona(e164: string): string {
  const z = prepoznajZemlju(e164.replace(/^\+/u, ''));
  if (!e164.startsWith('+') || !z) {
    return e164;
  }
  const ostatak = e164.slice(1 + z.pozivni.length);
  return ostatak.length > 4 ? `+${z.pozivni} ${ostatak.slice(0, 2)} ${ostatak.slice(2)}` : e164;
}

export const PORUKE_TELEFONA = {
  broj: 'Unesi broj telefona.',
  neispravan: 'Broj nije ispravan. Npr. 064 1234567 ili +387 65 123 456.',
  pozivni: 'Unesi pozivni broj zemlje (1-3 cifre).',
} as const;

/** Poruka za polje broja (prazno, neispravno), ili `null` kad broj daje E.164. */
export function greskaTelefona(kodZemlje: string, pozivniRucno: string, broj: string): string | null {
  if (!(broj ?? '').trim()) {
    return PORUKE_TELEFONA.broj;
  }
  return uE164(kodZemlje, pozivniRucno, broj) ? null : PORUKE_TELEFONA.neispravan;
}

/** Poruka za ručni pozivni broj ("Druga zemlja"), ili `null`; međunarodni broj u polju broja ga ne traži. */
export function greskaPozivnog(kodZemlje: string, pozivniRucno: string, broj: string): string | null {
  if (kodZemlje !== DRUGA_ZEMLJA || /^\s*(\+|00)/u.test(broj ?? '')) {
    return null;
  }
  return POZIVNI.test(cifrePozivnog(pozivniRucno ?? '')) ? null : PORUKE_TELEFONA.pozivni;
}
