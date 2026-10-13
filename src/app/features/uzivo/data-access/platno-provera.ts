// Granice i provera dokumenta platna kao na serveru (`PlatnoPP`, `PlatnoJson`): deli ih uvoz PPTX-a (pre slanja, pa
// server nikad ne odbija dokument koji je napravio uvoz) i editor platna (pred slanje i pre svake radnje). Čiste
// funkcije bez Angular-a; uvoze samo modele i katalog fontova (ništa iz modula uvoza, inače bi editor vukao chunk uvoza).
// Pravila brojanja su ista kao na serveru:
//  - slojevi: samo sloj najvišeg nivoa (grupa nema pa ni ugnježdenih slojeva);
//  - znaci: code point-i (ne UTF-16 jedinice) u `deo.tekst` svih pasusa TEKST sloja i SVIH ćelija TABELE (i pokrivenih),
//    plus `latex` FORMULE;
//  - tačke: po CRTEZ sloju, zbir `tacke.length / 2` preko poteza (parovi x, y);
//  - bajtovi: UTF-8 dužina serijalizacije koju server pravi posle normalizacije (vidi `bajtovaPlatna`).
import type { Animacija, Ivica, Lista, OblikSloj, Pasus, Platno, Sloj, Tacka } from './platno.models';
import { FONTOVI_PLATNA } from '../ui/platno-fontovi';

/**
 * Zaokruživanje na 2 decimale kao server (`PlatnoPP.r`: `BigDecimal.valueOf(d).setScale(2, RoundingMode.HALF_UP)`):
 * `BigDecimal.valueOf` polazi od najkraćeg decimalnog zapisa broja (`Double.toString`), pa se zaokružuje taj zapis, na
 * dalje od nule kad je treća decimala >= 5 (1,005 -> 1,01; -0,125 -> -0,13; 2,675 -> 2,68), a ne binarna vrednost
 * (`Math.round(1.005 * 100)` daje 100). Nikad `-0`.
 */
export function zaokruziKaoServer(n: number): number {
  if (!Number.isFinite(n)) return n;
  const zapis = String(n);
  if (/e/i.test(zapis)) return Math.abs(n) < 1 ? 0 : n; // |n| < 1e-6 je 0,00; >= 1e21 je ceo broj
  const negativan = zapis.startsWith('-');
  const [celi, razlomak = ''] = (negativan ? zapis.slice(1) : zapis).split('.');
  if (razlomak.length <= 2) return n === 0 ? 0 : n;
  let stotinke = Number(celi + razlomak.slice(0, 2));
  if (razlomak.charCodeAt(2) >= 53) stotinke += 1; // '5'
  const rezultat = stotinke / 100;
  return rezultat === 0 ? 0 : negativan ? -rezultat : rezultat;
}

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

/** Dužina id-ja medija na serveru (UUID `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). */
export const DUZINA_ID_MEDIJA = 36;
const ID_ZA_MERENJE = '0'.repeat(DUZINA_ID_MEDIJA);

/**
 * Kopija dokumenta sa preslikanim referencama medija: `pozadina.medijId`, `medijId` SLIKA i CRTEZ slojeva i
 * `slikaIzvora` FORMULE (samo one koje nisu `null`). Ostalo se ne kopira (isti objekti).
 */
export function preslikajMedije(p: Platno, f: (kljuc: string) => string): Platno {
  return {
    ...p,
    pozadina: p.pozadina.medijId == null ? p.pozadina : { ...p.pozadina, medijId: f(p.pozadina.medijId) },
    slojevi: p.slojevi.map((s) => {
      if ((s.tip === 'SLIKA' || s.tip === 'CRTEZ') && s.medijId != null) return { ...s, medijId: f(s.medijId) };
      if (s.tip === 'FORMULA' && s.slikaIzvora != null) return { ...s, slikaIzvora: f(s.slikaIzvora) };
      return s;
    }),
  };
}

/**
 * Oblik kakav server upisuje posle `PlatnoPP.normalizuj` za polja koja uvoz sme da ostavi praznim. Ključevi medija
 * uvoza (`gen:1`, `pptx:ppt/media/…`) stoje tamo gde će slanje upisati id servera od 36 znakova, pa se mere kao takav id.
 */
function kaoServer(dokument: Platno): Platno {
  const p = preslikajMedije(dokument, () => ID_ZA_MERENJE);
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
 *  - ključ medija (`gen:1`, `pptx:…`) se meri kao id servera od 36 znakova koji ga zamenjuje pri slanju;
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

/** Znaci sloja kao na serveru: tekst svih pasusa (i svih ćelija tabele, i pokrivenih) i `latex` formule. */
export function znakovaSloja(s: Sloj): number {
  switch (s.tip) {
    case 'TEKST': return znakovaPasusa(s.pasusi);
    case 'TABELA': return s.celije.reduce((z, red) => z + red.reduce((r, c) => r + znakovaPasusa(c.pasusi), 0), 0);
    case 'FORMULA': return codePointa(s.latex);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------------------------- ogledalo PlatnoPP

const FONTOVI_SERVERA: ReadonlySet<string> = new Set(FONTOVI_PLATNA.map((f) => f.naziv));
const ID_SERVERA = /^[A-Za-z0-9_-]{1,12}$/;
const BOJA_SERVERA = /^#[0-9A-F]{6}$/;
const MAX_TABELA = 30;
const MAX_TABULATORA = 32;
const MAX_LATEX = 5000;
const MAX_NAZIV = 60;

/** Odbijanje kao na serveru (`SystemException` 400); poruka je ista kao serverova. */
class Odbijeno extends Error {}
function odbij(poruka: string): never {
  throw new Odbijeno(poruka);
}

/** `PlatnoPP.r`: `null`/`undefined` ostaje, inače zaokruženo na 2 decimale kao server. */
const r = (n: number | null | undefined) => (n == null ? n : zaokruziKaoServer(n));
/** `min <= v <= max` posle zaokruživanja; `null`/NaN nisu u opsegu. */
const u = (v: number | null | undefined, min: number, max: number) => {
  const z = r(v);
  return z != null && z >= min && z <= max;
};
/** `0 < v <= max` posle zaokruživanja. */
const pozitivno = (v: number | null | undefined, max: number) => {
  const z = r(v);
  return z != null && z > 0 && z <= max;
};

/**
 * Beli znaci Java `Character.isWhitespace` (`String.strip`/`isBlank` na serveru): razmaci Unicode-a bez neprelomnih
 * (U+00A0, U+2007, U+202F) i U+FEFF, plus `\t \n \v \f \r` i U+001C-U+001F. JS `trim()` skida i neprelomne i U+FEFF, a
 * U+001C-U+001F ne, pa se ovde ne koristi.
 */
const JAVA_BELI = '\\t\\n\\u000B\\f\\r\\u001C-\\u001F \\u1680\\u2000-\\u2006\\u2008-\\u200A\\u2028\\u2029\\u205F\\u3000';
const STRIP = new RegExp(`^[${JAVA_BELI}]+|[${JAVA_BELI}]+$`, 'g');
const strip = (s: string) => s.replace(STRIP, '');

function boja(b: string | null | undefined): void {
  if (b == null || !BOJA_SERVERA.test(strip(b).toUpperCase())) odbij('Boja nije ispravna (#RRGGBB).');
}
const bojaMoze = (b: string | null | undefined) => b != null && boja(b);

function ivica(i: Ivica | null | undefined): void {
  if (i == null) return;
  if (!u(i.debljina, 0.25, 20)) odbij('Debljina ivice mora biti od 0,25 do 20.');
  boja(i.boja);
}

function proveriListu(l: Lista | null | undefined): void {
  if (l == null) return;
  const ispravna = l.vrsta === 'ZNAK'
    ? l.znak != null && l.znak !== '' && codePointa(l.znak) <= 2
    : l.vrsta === 'BROJ' && l.format != null && (l.pocetak ?? 1) >= 1 && (l.pocetak ?? 1) <= 9999;
  if (!ispravna) odbij('Lista nije ispravna.');
  bojaMoze(l.boja);
}

function pasusi(niz: readonly Pasus[] | null | undefined, znakova: { n: number }): void {
  for (const p of niz ?? []) {
    if (p == null || p.poravnanje == null || p.nivo == null || p.nivo < 0 || p.nivo > 8
      || !u(p.proredProcenat ?? 100, 50, 300) || !u(p.razmakPre ?? 0, 0, 1000) || !u(p.razmakPosle ?? 0, 0, 1000)
      || !u(p.uvlacenje?.levo ?? 0, -1000, 1000) || !u(p.uvlacenje?.prviRed ?? 0, -1000, 1000)
      || (p.tabulatori ?? []).length > MAX_TABULATORA || p.delovi == null) {
      odbij('Pasus nije ispravan.');
    }
    for (const t of p.tabulatori ?? []) {
      if (t == null || t.poravnanje == null || !u(t.poz, 0, 2880)) odbij('Pasus nije ispravan.');
    }
    proveriListu(p.lista);
    for (const d of p.delovi) {
      if (d == null) odbij('Pasus nije ispravan.');
      const font = d.font ?? 'Carlito';
      if (!FONTOVI_SERVERA.has(font)) odbij(`Font nije podržan: ${font}.`);
      if (!u(d.velicina ?? 18, 1, 400)) odbij('Veličina slova mora biti od 1 do 400.');
      boja(d.boja ?? '#000000');
      znakova.n += codePointa(d.tekst ?? '');
    }
  }
}

const jeLinija = (o: OblikSloj) => o.oblik === 'LINIJA' || o.oblik === 'STRELICA' || o.oblik === 'DVOSTRUKA_STRELICA';
const tackaU = (t: Tacka | null | undefined) => t != null && u(t.x, -2880, 2880) && u(t.y, -2880, 2880);

function sloj(s: Sloj, znakova: { n: number }): void {
  if (s.naziv != null && codePointa(s.naziv) > MAX_NAZIV) odbij('Naziv sloja može imati najviše 60 znakova.');
  if (!u(s.x, -960, 1920) || !u(s.y, -960, 1920) || !pozitivno(s.sirina, 2880) || !pozitivno(s.visina, 2880)) {
    odbij('Položaj ili veličina sloja nije ispravna.');
  }
  if (!u(s.rotacija ?? 0, -360, 360) || !u(s.providnost ?? 1, 0, 1)) odbij('Rotacija ili providnost sloja nije ispravna.');
  if (s.senka != null) {
    const z = s.senka;
    if (!u(z.pomerajX, -100, 100) || !u(z.pomerajY, -100, 100) || !u(z.zamucenje, 0, 100)) odbij('Senka nije ispravna.');
    boja(z.boja);
  }
  switch (s.tip) {
    case 'TEKST': {
      const o = s.okvir;
      if (o == null || !u(o.unutraLevo, 0, 200) || !u(o.unutraGore, 0, 200) || !u(o.unutraDesno, 0, 200)
        || !u(o.unutraDole, 0, 200) || !u(o.skala, 0.25, 1) || !u(o.skalaProreda, 0.5, 1) || o.sidro == null || o.prelom == null) {
        odbij('Okvir teksta nije ispravan.');
      }
      pasusi(s.pasusi, znakova);
      bojaMoze(s.popuna);
      ivica(s.ivica);
      return;
    }
    case 'SLIKA': {
      if (s.medijId == null || strip(s.medijId) === '') odbij('Sloj slike mora imati sliku.');
      const c = s.isecak;
      const [l, g, d, o] = [r(c?.levo ?? 0)!, r(c?.gore ?? 0)!, r(c?.desno ?? 0)!, r(c?.dole ?? 0)!];
      if (!u(l, 0, 1) || !u(g, 0, 1) || !u(d, 0, 1) || !u(o, 0, 1) || l + d >= 1 || g + o >= 1) odbij('Isečak slike nije ispravan.');
      return;
    }
    case 'OBLIK': {
      if (s.oblik == null) odbij('Oblik sloja nije ispravan.');
      bojaMoze(s.popuna);
      ivica(s.ivica);
      if (jeLinija(s)) {
        const y = r(r(s.visina)! / 2);
        const od = s.od ?? { x: 0, y: y! };
        const ka = s.do ?? { x: r(s.sirina)!, y: y! };
        if (!tackaU(od) || !tackaU(ka)) odbij('Linija mora imati početak i kraj.');
      }
      return;
    }
    case 'TABELA': {
      const { kolone, redovi, celije } = s;
      if (kolone == null || redovi == null || kolone.length === 0 || redovi.length === 0 || kolone.length > MAX_TABELA
        || redovi.length > MAX_TABELA || !kolone.every((k) => pozitivno(k, 2880)) || !redovi.every((k) => pozitivno(k, 2880))
        || celije == null || celije.length !== redovi.length) {
        odbij('Tabela nije ispravna.');
      }
      celije.forEach((red, ri) => {
        if (red == null || red.length !== kolone.length) odbij('Tabela nije ispravna.');
        red.forEach((c, k) => {
          if (c == null || c.spojDesno == null || c.spojDole == null || c.spojDesno < 0 || c.spojDole < 0
            || c.spojDesno >= kolone.length - k || c.spojDole >= redovi.length - ri || c.sidro == null || c.pokrivena == null
            || c.ivice == null) {
            odbij('Tabela nije ispravna.');
          }
          pasusi(c.pasusi, znakova);
          bojaMoze(c.popuna);
          ivica(c.ivice.gore);
          ivica(c.ivice.dole);
          ivica(c.ivice.levo);
          ivica(c.ivice.desno);
        });
      });
      return;
    }
    case 'FORMULA': {
      const n = s.latex == null ? 0 : codePointa(s.latex);
      if (n === 0 || n > MAX_LATEX || !u(s.velicina, 1, 400)) odbij('Formula nije ispravna.');
      boja(s.boja);
      znakova.n += n;
      return;
    }
    case 'CRTEZ': {
      if (s.medijId == null || strip(s.medijId) === '') odbij('Sloj slike mora imati sliku.');
      let tacaka = 0;
      for (const z of s.potezi ?? []) {
        if (z == null || z.tacke == null || z.tacke.length % 2 !== 0 || !u(z.debljina, 0.25, 20)) odbij('Crtež nije ispravan.');
        if (!z.tacke.every((d) => d != null && Number.isFinite(d))) odbij('Crtež nije ispravan.');
        tacaka += z.tacke.length / 2;
        if (tacaka > GRANICE.tacakaPoCrtezu) odbij('Crtež nije ispravan.');
        boja(z.boja);
      }
    }
  }
}

function animacija(a: Animacija, slojevi: readonly Sloj[]): void {
  const cilj = slojevi.find((s) => s.id === a.slojId);
  if (!cilj) odbij('Animacija cilja sloj koji ne postoji.');
  if (a.pasus != null && (cilj?.tip !== 'TEKST' || a.pasus < 0 || a.pasus >= (cilj.pasusi ?? []).length)) {
    odbij('Animacija cilja pasus koji ne postoji.');
  }
  if (a.vrsta == null || a.efekat == null || a.okidac == null) odbij('Animacija nije ispravna.');
  const trajanje = a.efekat === 'POJAVI' ? 0 : a.trajanjeMs ?? 500;
  const kasnjenje = a.kasnjenjeMs ?? 0;
  if (trajanje < 0 || trajanje > 10_000 || kasnjenje < 0 || kasnjenje > 10_000) odbij('Trajanje i kašnjenje animacije su od 0 do 10000 ms.');
  // `normalizuj` daje podrazumevani smer usmerenim efektima, a ostalima ga briše.
  const smer = a.smer ?? (a.efekat === 'ULET' ? 'DOLE' : a.efekat === 'PODELI' ? 'VERTIKALNO' : 'LEVO');
  const ok = a.efekat === 'ULET' || a.efekat === 'BRISANJE' || a.efekat === 'ISCRTAJ'
    ? smer === 'LEVO' || smer === 'DESNO' || smer === 'GORE' || smer === 'DOLE'
    : a.efekat === 'PODELI' ? smer === 'HORIZONTALNO' || smer === 'VERTIKALNO' : true;
  if (!ok) odbij('Smer animacije nije ispravan.');
}

// JSON sloj servera (`PlatnoJson.procitaj`, strogi Jackson): pre pravila `PlatnoPP`. `Integer` polja ne primaju broj sa
// razlomkom (`ACCEPT_FLOAT_AS_INT` isključen), enum polja samo poznata imena; poruka je "pogrešan tip vrednosti" sa putanjom.
const ENUMI = {
  poravnanje: ['LEVO', 'CENTAR', 'DESNO', 'OBOSTRANO'],
  sidro: ['VRH', 'SREDINA', 'DNO'],
  crtica: ['PUNA', 'ISPREKIDANA', 'TACKASTA'],
  polozaj: ['OBICAN', 'INDEKS', 'EKSPONENT'],
  vrstaListe: ['ZNAK', 'BROJ'],
  format: ['ARAPSKI_TACKA', 'ARAPSKI_ZAGRADA', 'ARAPSKI', 'MALA_SLOVA_ZAGRADA', 'VELIKA_SLOVA_TACKA', 'RIMSKI_VELIKI_TACKA', 'RIMSKI_MALI_TACKA'],
  poravnanjeTaba: ['LEVO', 'CENTAR', 'DESNO', 'DECIMALNO'],
  oblik: ['PRAVOUGAONIK', 'ZAOBLJENI_PRAVOUGAONIK', 'ELIPSA', 'TROUGAO', 'LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA'],
  vrstaAnimacije: ['ULAZ', 'IZLAZ'],
  efekat: ['POJAVI', 'FADE', 'ULET', 'PODELI', 'BRISANJE', 'ZUM', 'ISCRTAJ'],
  smer: ['LEVO', 'DESNO', 'GORE', 'DOLE', 'HORIZONTALNO', 'VERTIKALNO'],
  okidac: ['KLIK', 'SA_PRETHODNIM', 'POSLE_PRETHODNOG'],
} as const satisfies Record<string, readonly string[]>;
const TIPOVI_SLOJA: readonly string[] = ['TEKST', 'SLIKA', 'OBLIK', 'TABELA', 'FORMULA', 'CRTEZ'];
const MAX_PORUKE_JSONA = 200;

function odbijJson(opis: string, putanja: string): never {
  const r = `${opis} (${putanja})`;
  odbij(`Neispravan dokument platna: ${r.length > MAX_PORUKE_JSONA ? r.slice(0, MAX_PORUKE_JSONA) : r}.`);
}
function ceo(v: unknown, putanja: string): void {
  if (v != null && !Number.isInteger(v)) odbijJson('pogrešan tip vrednosti', putanja);
}
function enumVrednost(v: unknown, dozvoljene: readonly string[], putanja: string): void {
  if (v != null && !dozvoljene.includes(v as string)) odbijJson('pogrešan tip vrednosti', putanja);
}

function jsonIvice(i: Ivica | null | undefined, putanja: string): void {
  if (i != null) enumVrednost(i.crtica, ENUMI.crtica, `${putanja}.crtica`);
}

function jsonPasusi(niz: readonly Pasus[] | null | undefined, putanja: string): void {
  (niz ?? []).forEach((p, i) => {
    if (p == null) return;
    const pp = `${putanja}[${i}]`;
    enumVrednost(p.poravnanje, ENUMI.poravnanje, `${pp}.poravnanje`);
    ceo(p.nivo, `${pp}.nivo`);
    if (p.lista != null) {
      enumVrednost(p.lista.vrsta, ENUMI.vrstaListe, `${pp}.lista.vrsta`);
      enumVrednost(p.lista.format, ENUMI.format, `${pp}.lista.format`);
      ceo(p.lista.pocetak, `${pp}.lista.pocetak`);
    }
    (p.tabulatori ?? []).forEach((t, j) => {
      if (t != null) enumVrednost(t.poravnanje, ENUMI.poravnanjeTaba, `${pp}.tabulatori[${j}].poravnanje`);
    });
    (p.delovi ?? []).forEach((d, j) => {
      if (d != null) enumVrednost(d.polozaj, ENUMI.polozaj, `${pp}.delovi[${j}].polozaj`);
    });
  });
}

/** Provera tipova kao strogi Jackson servera (posle nje dolaze pravila `PlatnoPP`). */
function jsonSloj(p: Platno): void {
  ceo(p.verzija, 'verzija');
  (p.slojevi ?? []).forEach((s, i) => {
    if (s == null) return;
    const ps = `slojevi[${i}]`;
    if (!TIPOVI_SLOJA.includes(s.tip)) odbijJson('nepoznat tip sloja', ps);
    switch (s.tip) {
      case 'TEKST':
        jsonPasusi(s.pasusi, `${ps}.pasusi`);
        if (s.okvir != null) enumVrednost(s.okvir.sidro, ENUMI.sidro, `${ps}.okvir.sidro`);
        jsonIvice(s.ivica, `${ps}.ivica`);
        break;
      case 'OBLIK':
        enumVrednost(s.oblik, ENUMI.oblik, `${ps}.oblik`);
        jsonIvice(s.ivica, `${ps}.ivica`);
        break;
      case 'TABELA':
        (s.celije ?? []).forEach((red, r) => (red ?? []).forEach((c, k) => {
          if (c == null) return;
          const pc = `${ps}.celije[${r}][${k}]`;
          jsonPasusi(c.pasusi, `${pc}.pasusi`);
          ceo(c.spojDesno, `${pc}.spojDesno`);
          ceo(c.spojDole, `${pc}.spojDole`);
          enumVrednost(c.sidro, ENUMI.sidro, `${pc}.sidro`);
          if (c.ivice != null) for (const strana of ['gore', 'dole', 'levo', 'desno'] as const) jsonIvice(c.ivice[strana], `${pc}.ivice.${strana}`);
        }));
        break;
      case 'FORMULA':
        enumVrednost(s.poravnanje, ENUMI.poravnanje, `${ps}.poravnanje`);
        break;
      default:
        break;
    }
  });
  (p.animacije ?? []).forEach((a, i) => {
    if (a == null) return;
    const pa = `animacije[${i}]`;
    ceo(a.pasus, `${pa}.pasus`);
    enumVrednost(a.vrsta, ENUMI.vrstaAnimacije, `${pa}.vrsta`);
    enumVrednost(a.efekat, ENUMI.efekat, `${pa}.efekat`);
    enumVrednost(a.smer, ENUMI.smer, `${pa}.smer`);
    enumVrednost(a.okidac, ENUMI.okidac, `${pa}.okidac`);
    ceo(a.trajanjeMs, `${pa}.trajanjeMs`);
    ceo(a.kasnjenjeMs, `${pa}.kasnjenjeMs`);
  });
}

/**
 * Ogledalo serverske provere dokumenta (`PlatnoPP.proveri(normalizuj(p))` pa `proveriVelicinu`): poruka prvog prekršenog
 * pravila, ista kao serverova, ili `null` kad bi server dokument primio. Brojevi se proveravaju posle zaokruživanja kao na
 * serveru, boje posle prevođenja u velika slova, podrazumevane vrednosti `normalizuj` važe za polja koja nedostaju.
 * Pre pravila ide JSON sloj (`PlatnoJson`, strogi Jackson): `Integer` polja moraju biti celi brojevi, enum polja poznata
 * imena (poruka `Neispravan dokument platna: pogrešan tip vrednosti (<putanja>).`). Nepoznata polja, tipovi vrednosti
 * (string umesto broja, ...) i obavezna polja JSON-a se NE proveravaju: dokument prave tipizirani moduli uvoza.
 * Uvoz je poziva za svaki slajd pre slanja (`pretvoriPptx`): odbijen slajd je greška tog slajda, a ne 400 za ceo uvoz.
 */
export function proveriKaoServer(p: Platno): string | null {
  try {
    if (p == null) odbij('Platno slajd mora imati dokument platna.');
    jsonSloj(p);
    if (p.verzija !== 1) odbij('Nepodržana verzija platna.');
    if (p.pozadina == null) odbij('Boja nije ispravna (#RRGGBB).');
    boja(p.pozadina.boja);
    const slojevi = p.slojevi ?? [];
    const animacije = p.animacije ?? [];
    if (slojevi.length > GRANICE.slojeva) odbij('Slajd može imati najviše 300 slojeva.');
    if (animacije.length > GRANICE.animacija) odbij('Slajd može imati najviše 400 animacija.');
    const idjevi = new Set<string>();
    const id = (x: string | null | undefined) => {
      if (x == null || !ID_SERVERA.test(x)) odbij('Id sloja ili animacije nije ispravan.');
      if (idjevi.has(x!)) odbij('Id-jevi slojeva i animacija moraju biti jedinstveni.');
      idjevi.add(x!);
    };
    const znakova = { n: 0 };
    for (const s of slojevi) {
      if (s == null) odbij('Id sloja ili animacije nije ispravan.');
      id(s.id);
      sloj(s, znakova);
    }
    for (const a of animacije) {
      if (a == null) odbij('Id sloja ili animacije nije ispravan.');
      id(a.id);
    }
    if (znakova.n > GRANICE.znakova) odbij('Slajd može imati najviše 50000 znakova teksta.');
    for (const a of animacije) animacija(a, slojevi);
    if (bajtovaPlatna(p) > GRANICE.bajtova) odbij('Dokument platna je prevelik (najviše 1 MB).');
    return null;
  } catch (e) {
    if (e instanceof Odbijeno) return e.message;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------- editor

const KES_GRESAKA = new WeakMap<Platno, string | null>();

/** `proveriKaoServer` sa kešom po objektu: editor pravi nov objekt pri svakoj izmeni, a nepromenjeni slajdovi zadržavaju svoj. */
export function greskePlatna(p: Platno): string | null {
  if (KES_GRESAKA.has(p)) return KES_GRESAKA.get(p)!;
  const g = proveriKaoServer(p);
  KES_GRESAKA.set(p, g);
  return g;
}

/** Brza provera brojeva (bez serijalizacije) za radnje editora; poruke iste kao server. */
export function prekoGranica(p: Platno): string | null {
  if (p.slojevi.length > GRANICE.slojeva) return 'Slajd može imati najviše 300 slojeva.';
  if (p.animacije.length > GRANICE.animacija) return 'Slajd može imati najviše 400 animacija.';
  if (p.slojevi.reduce((n, s) => n + znakovaSloja(s), 0) > GRANICE.znakova) return 'Slajd može imati najviše 50000 znakova teksta.';
  return null;
}
