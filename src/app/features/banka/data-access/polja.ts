import type { OdgovorPolja, Polje, PoljeOpcija, TipPolja } from './banka.models';

/*
 * Čista pravila šeme polja grupe i odgovora varijante, za prikaz pre slanja. Ogledalo `BankaPP` na serveru (iste poruke, isti
 * redosled provera); server je jedini sud i proverava sve ponovo, ovde je samo ono što korisnik može da pogreši u formi.
 */

const MAX_POLJA = 10;
const MAX_OZNAKA = 200;
const MIN_OPCIJA = 2;
const MAX_OPCIJA = 6;
const MAX_TEKST_OPCIJE = 200;
const MAX_JEDINICA = 30;
const KLJUC = /^[a-z][a-z0-9]{0,9}$/;
const SLOVA = 'abcdefghijklmnopqrstuvwxyz';

const imaOpcije = (tip: TipPolja) => tip === 'JEDAN_TACAN' || tip === 'VISE_TACNIH';
/** Dužina u znakovima (code point), kao u MySQL koloni i `BankaPP`. */
const duzina = (s: string | null | undefined) => (s === null || s === undefined ? 0 : [...s].length);
const prazan = (s: string | null | undefined) => !s || s.trim() === '';

/** Nova opcija sa prvim id-jem iznad najvećeg datog (od 1), pa nova opcija nikad ne preuzme id postojeće. */
export function novaOpcija(postojece: readonly PoljeOpcija[]): PoljeOpcija {
  return { id: postojece.reduce((najveci, o) => Math.max(najveci, o.id), 0) + 1, tekst: '' };
}

/**
 * Novo polje sa prvim slobodnim ključem (`a`, `b`, ...). Podrazumevane vrednosti su one koje server upisuje pri
 * normalizaciji, pa polje ima isti oblik pre i posle prvog čuvanja; oznaka je prazna (korisnik je mora uneti), a
 * JEDAN_TACAN i VISE_TACNIH kreću sa dve prazne opcije.
 */
export function novoPolje(tip: TipPolja, postojeci: readonly Polje[]): Polje {
  const zauzeti = new Set(postojeci.map(p => p.kljuc.trim()));
  const kljuc = [...SLOVA].find(k => !zauzeti.has(k)) ?? `p${postojeci.length + 1}`;
  const prva = novaOpcija([]);
  return {
    kljuc,
    oznaka: '',
    tip,
    odstupanje: 0,
    odstupanjeTip: 'APSOLUTNO',
    jedinica: null,
    zanemariVelicinu: true,
    zanemariRazmake: true,
    opcije: imaOpcije(tip) ? [prva, novaOpcija([prva])] : null,
  };
}

/**
 * Poruka prvog prekršenog pravila šeme (kao `BankaPP.proveriPolja`, posle skidanja razmaka sa krajeva ključa, oznake i
 * teksta opcije, kako ih server normalizuje) ili `null`.
 */
export function proveriPolja(polja: readonly Polje[]): string | null {
  if (polja.length > MAX_POLJA) {
    return 'Najviše 10 polja.';
  }
  const kljucevi = new Set<string>();
  for (const p of polja) {
    const k = p.kljuc.trim();
    if (!KLJUC.test(k)) {
      return 'Ključ polja mora biti 1-10 malih slova i cifara i počinjati slovom.';
    }
    if (kljucevi.has(k)) {
      return `Ključ polja '${k}' se ponavlja.`;
    }
    kljucevi.add(k);
    if (prazan(p.oznaka) || duzina(p.oznaka.trim()) > MAX_OZNAKA) {
      return 'Oznaka polja mora imati 1 do 200 znakova.';
    }
    if (p.odstupanje !== null && (!Number.isFinite(p.odstupanje) || p.odstupanje < 0)) {
      return `Odstupanje polja '${k}' mora biti nenegativan broj.`;
    }
    if (duzina(p.jedinica?.trim()) > MAX_JEDINICA) {
      return `Jedinica polja '${k}' može imati najviše 30 znakova.`;
    }
    if (imaOpcije(p.tip)) {
      const opcije = p.opcije;
      if (!opcije || opcije.length < MIN_OPCIJA || opcije.length > MAX_OPCIJA) {
        return `Polje '${k}' mora imati 2 do 6 opcija.`;
      }
      if (opcije.some(o => prazan(o.tekst) || duzina(o.tekst.trim()) > MAX_TEKST_OPCIJE)) {
        return `Tekst opcije polja '${k}' mora imati 1 do 200 znakova.`;
      }
    }
  }
  return null;
}

/** Prazan odgovor polja: samo svojstvo koje tip traži je postavljeno na praznu vrednost (broj `null`, liste `[]`). */
export function prazanOdgovor(p: Pick<Polje, 'tip'>): OdgovorPolja {
  return {
    broj: null,
    prihvatljivi: p.tip === 'TEKST' ? [] : null,
    tacna: null,
    tacne: p.tip === 'VISE_TACNIH' ? [] : null,
  };
}

/** Po jedan prazan odgovor za svaki ključ šeme (varijanta mora pokriti svako polje). */
export function prazniOdgovori(polja: readonly Polje[]): Record<string, OdgovorPolja> {
  return Object.fromEntries(polja.map(p => [p.kljuc, prazanOdgovor(p)]));
}

/**
 * Da li je odgovor za polje popunjen onako kako tip traži (kao `BankaPP.proveriOdgovore`, bez ograničenja dužina): BROJ
 * konačan broj, TEKST bar jedan i nijedan prazan prihvatljiv odgovor, JEDAN_TACAN id opcije šeme, VISE_TACNIH neprazan skup
 * id-jeva opcija šeme.
 */
export function odgovorPopunjen(p: Polje, o: OdgovorPolja): boolean {
  const ids = new Set((p.opcije ?? []).map(op => op.id));
  switch (p.tip) {
    case 'BROJ':
      return o.broj !== null && o.broj !== undefined && Number.isFinite(o.broj);
    case 'TEKST':
      return !!o.prihvatljivi && o.prihvatljivi.length > 0 && o.prihvatljivi.every(s => !prazan(s));
    case 'JEDAN_TACAN':
      return o.tacna !== null && o.tacna !== undefined && ids.has(o.tacna);
    case 'VISE_TACNIH':
      return !!o.tacne && o.tacne.length > 0 && o.tacne.every(id => ids.has(id));
  }
}
