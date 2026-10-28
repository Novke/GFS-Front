import type { OdgovorPolja, Polje, PoljeOpcija, TipPolja } from './banka.models';

/*
 * Čista pravila šeme polja grupe i odgovora varijante, za prikaz pre slanja. Ogledalo `BankaPP` na serveru (iste poruke, isti
 * redosled provera); server je jedini sud i proverava sve ponovo, ovde je samo ono što korisnik može da pogreši u formi.
 */

export const MAX_POLJA = 10;
export const MAX_OZNAKA = 200;
export const MIN_OPCIJA = 2;
export const MAX_OPCIJA = 6;
export const MAX_TEKST_OPCIJE = 200;
export const MAX_JEDINICA = 30;
const KLJUC = /^[a-z][a-z0-9]{0,9}$/;
const SLOVA = 'abcdefghijklmnopqrstuvwxyz';

/** JEDAN_TACAN i VISE_TACNIH imaju ponuđene odgovore (`opcije`). */
export const imaOpcije = (tip: TipPolja) => tip === 'JEDAN_TACAN' || tip === 'VISE_TACNIH';
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

/** Polje za unos na koje se odnosi prekršeno pravilo šeme (`aria-invalid` i `aria-describedby` u editoru polja). */
export type UnosPolja = 'oznaka' | 'odstupanje' | 'jedinica' | 'opcija';

/** Prvo prekršeno pravilo šeme: poruka, polje (`null` = šema kao celina) i unos (`null` = pravilo bez svog unosa, npr. ključ). */
export interface PrekrsajPolja {
  poruka: string;
  kljuc: string | null;
  unos: UnosPolja | null;
  /** Id opcije kad je `unos` `'opcija'`, inače `null`. */
  opcija: number | null;
}

const prekrsaj = (poruka: string, kljuc: string | null = null, unos: UnosPolja | null = null, opcija: number | null = null): PrekrsajPolja =>
  ({ poruka, kljuc, unos, opcija });

/**
 * Sva prekršena pravila šeme, redom kojim ih proverava `BankaPP.proveriPolja` (posle skidanja razmaka sa krajeva ključa,
 * oznake i teksta opcije, kako ih server normalizuje), svako sa poljem i unosom na koji se odnosi. Prvo je ono koje bi server
 * prijavio ({@link prekrsajPolja}); ostala služe editoru polja, koji prikazuje prvo među unosima koje je korisnik već dodirnuo.
 */
export function prekrsajiPolja(polja: readonly Polje[]): PrekrsajPolja[] {
  const lista: PrekrsajPolja[] = [];
  if (polja.length > MAX_POLJA) {
    lista.push(prekrsaj('Najviše 10 polja.'));
  }
  const kljucevi = new Set<string>();
  for (const p of polja) {
    const k = p.kljuc.trim();
    if (!KLJUC.test(k)) {
      lista.push(prekrsaj('Ključ polja mora biti 1-10 malih slova i cifara i počinjati slovom.', p.kljuc));
    } else if (kljucevi.has(k)) {
      lista.push(prekrsaj(`Ključ polja '${k}' se ponavlja.`, p.kljuc));
    }
    kljucevi.add(k);
    if (prazan(p.oznaka) || duzina(p.oznaka.trim()) > MAX_OZNAKA) {
      lista.push(prekrsaj('Oznaka polja mora imati 1 do 200 znakova.', p.kljuc, 'oznaka'));
    }
    if (p.odstupanje !== null && (!Number.isFinite(p.odstupanje) || p.odstupanje < 0)) {
      lista.push(prekrsaj(`Odstupanje polja '${k}' mora biti nenegativan broj.`, p.kljuc, 'odstupanje'));
    }
    if (duzina(p.jedinica?.trim()) > MAX_JEDINICA) {
      lista.push(prekrsaj(`Jedinica polja '${k}' može imati najviše 30 znakova.`, p.kljuc, 'jedinica'));
    }
    if (imaOpcije(p.tip)) {
      const opcije = p.opcije;
      if (!opcije || opcije.length < MIN_OPCIJA || opcije.length > MAX_OPCIJA) {
        lista.push(prekrsaj(`Polje '${k}' mora imati 2 do 6 opcija.`, p.kljuc));
      } else {
        for (const o of opcije.filter(x => prazan(x.tekst) || duzina(x.tekst.trim()) > MAX_TEKST_OPCIJE)) {
          lista.push(prekrsaj(`Tekst opcije polja '${k}' mora imati 1 do 200 znakova.`, p.kljuc, 'opcija', o.id));
        }
      }
    }
  }
  return lista;
}

/** Prvo prekršeno pravilo šeme (ono koje server prijavljuje), sa poljem i unosom, ili `null`. */
export function prekrsajPolja(polja: readonly Polje[]): PrekrsajPolja | null {
  return prekrsajiPolja(polja)[0] ?? null;
}

/** Poruka prvog prekršenog pravila šeme ({@link prekrsajPolja}) ili `null`. */
export function proveriPolja(polja: readonly Polje[]): string | null {
  return prekrsajPolja(polja)?.poruka ?? null;
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

/**
 * Kopija šeme kako bi je server upisao (`BankaPP.normalizujPolja`): ključ, oznaka i tekst opcije bez razmaka na krajevima,
 * prazna jedinica `null`, odstupanje 0 `APSOLUTNO` i oba "zanemari" `true` kad nisu data, opcije samo za JEDAN_TACAN i
 * VISE_TACNIH. Svojstva su uvek istim redom (poređenje kroz JSON). Ne proverava pravila (to je `proveriPolja`).
 */
export function normalizujPolja(polja: readonly Polje[]): Polje[] {
  return polja.map(p => {
    const jedinica = p.jedinica?.trim();
    return {
      kljuc: p.kljuc.trim(),
      oznaka: p.oznaka.trim(),
      tip: p.tip,
      odstupanje: p.odstupanje ?? 0,
      odstupanjeTip: p.odstupanjeTip ?? 'APSOLUTNO',
      jedinica: jedinica ? jedinica : null,
      zanemariVelicinu: p.zanemariVelicinu ?? true,
      zanemariRazmake: p.zanemariRazmake ?? true,
      opcije: imaOpcije(p.tip) ? (p.opcije ?? []).map(o => ({ id: o.id, tekst: o.tekst.trim() })) : null,
      // samo uključeno, kao server (isključeno ne upisuje): šema od pre opcije ostaje bajt po bajt ista
      ...(p.tip === 'TEKST' && p.zanemariVodeceNule === true ? { zanemariVodeceNule: true } : {}),
    };
  });
}

/** Iste šeme posle normalizacije (redosled polja i opcija se računa); server ih tada ne smatra novom šemom. */
export function istaPolja(a: readonly Polje[], b: readonly Polje[]): boolean {
  return JSON.stringify(normalizujPolja(a)) === JSON.stringify(normalizujPolja(b));
}

/** Brojači grupe od kojih zavise posledice nove šeme. */
export interface BrojaciSeme {
  brojVarijanti: number;
  brojAktivnih: number;
}

/**
 * Šta nova šema radi postojećim varijantama (kao `prilagodiVarijante` na serveru), za upozorenje pre čuvanja: dodato polje
 * vraća aktivne varijante u nacrt (fali im odgovor), a obrisano polje, promenjen tip i obrisana opcija brišu odgovore. Bez
 * varijanti nema posledica. Poređenje je po ključu; promenu tipa dok ima aktivnih server odbija (409), pa to nije posledica.
 */
export function posledicePromene(stara: readonly Polje[], nova: readonly Polje[], b: BrojaciSeme): string[] {
  if (b.brojVarijanti === 0) {
    return [];
  }
  const stare = new Map(stara.map(p => [p.kljuc.trim(), p]));
  const nove = new Map(nova.map(p => [p.kljuc.trim(), p]));
  const parovi = [...nove].flatMap(([k, p]) => (stare.has(k) ? [[stare.get(k)!, p] as const] : []));
  const promenjenTip = parovi.some(([s, n]) => s.tip !== n.tip);
  const obrisanaOpcija = parovi.some(([s, n]) => s.tip === n.tip && imaOpcije(n.tip)
    && (s.opcije ?? []).some(o => !(n.opcije ?? []).some(x => x.id === o.id)));
  const poruke: string[] = [];
  if (b.brojAktivnih > 0 && [...nove.keys()].some(k => !stare.has(k))) {
    poruke.push('Aktivne varijante će postati nacrti dok ne dobiju odgovor za novo polje.');
  }
  if ([...stare.keys()].some(k => !nove.has(k))) {
    poruke.push('Odgovori za obrisano polje se brišu iz svih varijanti.');
  }
  if (promenjenTip) {
    poruke.push('Odgovori za polje sa promenjenim tipom se brišu iz svih varijanti.');
  }
  if (obrisanaOpcija) {
    poruke.push(b.brojAktivnih > 0
      ? 'Tačni odgovori koji biraju obrisanu opciju se brišu iz varijanti; takva aktivna varijanta postaje nacrt.'
      : 'Tačni odgovori koji biraju obrisanu opciju se brišu iz varijanti.');
  }
  return poruke;
}
