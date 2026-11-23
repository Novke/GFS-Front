import {
  AnketaDetails, AnketeSabloniInfo, BojaPrecice, KontekstAnkete, PokreniAnketuCmd, PublikaAnkete, SablonAnkete,
  SablonAnketeCmd,
} from './ankete.models';

/*
 * Čista pravila brze ankete na strani nastavnika (spec 4 i 6.1): publike konteksta, nacrt iz šablona, provera pre
 * pokretanja (iste granice kao server), komande, trake rezultata, prečice i tastatura panela. Bez Angular servisa.
 */

export const MIN_ODGOVORA = 2;
export const MAX_ODGOVORA = 10;
export const MAX_PITANJE = 300;
export const MAX_ODGOVOR = 120;
export const MAX_KRATAK_NAZIV = 30;
export const MAX_NAZIV_FOLDERA = 60;
/** Rok ankete za grupu: najviše 14 dana od pokretanja (server: 400 `Rok mora biti u narednih 14 dana.`). */
export const MAX_ROK_DANA = 14;
/** Nastavnik (panel, projektori) pita `GET ankete/{id}` / `ankete/aktivne` na 2 s dok je anketa otvorena. */
export const OSVEZAVANJE_ANKETE_MS = 2_000;
/** Najviše prečica (server: 409). */
export const MAX_PRECICA = 12;
/** Prečice panela koje pokreću tasteri 1-9. */
export const MAX_PRECICA_TASTERI = 9;

/** "Zatvori sama posle": bez, 30 s, 1, 2, 5 min (samo "na času"). */
export const TRAJANJA: readonly (number | null)[] = [null, 30, 60, 120, 300];

/** Ponuđene ikonice prečice (pored slobodnog unosa jednog emoji-ja). */
export const IKONICE: readonly string[] = ['☕', '🧭', '⏱️', '📅', '➕', '✅', '❓', '👍', '🔁', '🍕', '😴', '⭐'];

/**
 * Boje pločica: tokeni teme (`--predmet-1..4`, `--ok`, `--warn`), tekst `--primary-ink` (beo danju, taman noću), pa je kontrast
 * bar 5:1 u oba režima (`bojaPrecice`).
 */
export const BOJE_PRECICA: readonly { boja: BojaPrecice; naziv: string }[] = [
  { boja: 'PLAVA', naziv: 'Plava' },
  { boja: 'ZELENA', naziv: 'Zelena' },
  { boja: 'LJUBICASTA', naziv: 'Ljubičasta' },
  { boja: 'VISNJA', naziv: 'Višnja' },
  { boja: 'TIRKIZNA', naziv: 'Tirkizna' },
  { boja: 'OKER', naziv: 'Oker' },
];

export const PORUKA_BEZ_PREDAVANJA = 'Anketa radi uz predavanje: pokreni prezentaciju sa stranice predavanja.';
export const PORUKA_BEZ_GRUPE = 'Predavanje nema grupu, pa anketa nema kome da ode.';

/** Koje publike kontekst nudi; `poruka` kad nijednu (dugme panela tada samo objašnjava). */
export interface Mogucnosti {
  naCasu: boolean;
  grupa: boolean;
  poruka: string | null;
}

/** "Na času" traži predavanje sa grupom; "Cela grupa" samo grupu (izvođenje bez predavanja sa grupom). */
export function mogucnosti(k: KontekstAnkete): Mogucnosti {
  const naCasu = k.predavanjeId !== null && k.grupaId !== null;
  const grupa = k.grupaId !== null;
  const poruka = naCasu || grupa ? null : k.predavanjeId !== null ? PORUKA_BEZ_GRUPE : PORUKA_BEZ_PREDAVANJA;
  return { naCasu, grupa, poruka };
}

/** Prečice redom (`precicaRb`, pa id). */
export function precice(info: AnketeSabloniInfo | null): SablonAnkete[] {
  return (info?.sabloni ?? [])
    .filter(s => s.precica)
    .sort((a, b) => (a.precicaRb ?? Number.MAX_SAFE_INTEGER) - (b.precicaRb ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
}

/** Šabloni foldera (`null` = bez foldera) po `rb`, pa id. */
export function sabloniFoldera(info: AnketeSabloniInfo | null, folderId: number | null): SablonAnkete[] {
  return (info?.sabloni ?? []).filter(s => s.folderId === folderId).sort((a, b) => a.rb - b.rb || a.id - b.id);
}

/** Najviše `n` znakova sa `…`; reč se ne seče kad razmak postoji u drugoj polovini. */
export function skrati(tekst: string, n: number): string {
  const t = tekst.trim().replace(/\s+/g, ' ');
  if (t.length <= n) {
    return t;
  }
  let rez = t.slice(0, Math.max(1, n - 1));
  const razmak = rez.lastIndexOf(' ');
  if (t[rez.length] !== ' ' && razmak >= Math.floor(n / 2)) {
    rez = rez.slice(0, razmak);
  }
  return `${rez.trimEnd()}…`;
}

/** Natpis pločice: kratak naziv ili početak pitanja. */
export function nazivPrecice(s: Pick<SablonAnkete, 'kratakNaziv' | 'pitanje'>): string {
  return s.kratakNaziv?.trim() || skrati(s.pitanje, 24);
}

/** Token teme za boju pločice (bez boje: plava). */
export function bojaPrecice(b: BojaPrecice | null): string {
  switch (b) {
    case 'ZELENA': return 'var(--ok)';
    case 'LJUBICASTA': return 'var(--predmet-2)';
    case 'VISNJA': return 'var(--predmet-4)';
    case 'TIRKIZNA': return 'var(--predmet-3)';
    case 'OKER': return 'var(--warn)';
    default: return 'var(--predmet-1)';
  }
}

/** Podrazumevani rok šablona za grupu (`rokSati`; `null` = sutra u 20:00). */
export const ROKOVI_SABLONA: readonly { sati: number | null; naziv: string }[] = [
  { sati: null, naziv: 'sutra u 20:00' },
  { sati: 24, naziv: '24 h' },
  { sati: 48, naziv: '48 h' },
  { sati: 72, naziv: '3 dana' },
  { sati: 168, naziv: '7 dana' },
];

export function oznakaRoka(rokSati: number | null): string {
  return ROKOVI_SABLONA.find(r => r.sati === rokSati)?.naziv ?? `${rokSati} h`;
}

/** Mali opis ispod natpisa: odgovori (`10 · 15 · bez`), za grupu sa `cela grupa · `. */
export function opisPrecice(s: Pick<SablonAnkete, 'opcije' | 'publika'>): string {
  const odgovori = skrati(s.opcije.join(' · '), 40);
  return s.publika === 'GRUPA' ? `cela grupa · ${odgovori}` : odgovori;
}

/** Bez razlike velikih i malih slova i kvačica (č, ć, š, ž, đ). */
export function bezKvacica(s: string): string {
  return s.toLocaleLowerCase('sr-Latn').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'dj');
}

/** Pretraga sačuvanih: pitanje, kratak naziv i odgovori sadrže sve reči upita. */
export function pretrazi(sabloni: readonly SablonAnkete[], upit: string): SablonAnkete[] {
  const reci = bezKvacica(upit).split(/\s+/).filter(Boolean);
  if (reci.length === 0) {
    return [];
  }
  return sabloni.filter(s => {
    const tekst = bezKvacica([s.pitanje, s.kratakNaziv ?? '', ...s.opcije].join(' '));
    return reci.every(r => tekst.includes(r));
  });
}

/** Šta se pokreće: nacrt ekrana provere (rok kao `Date`, `null` za "na času"). */
export interface Nacrt {
  sablonId: number | null;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: PublikaAnkete;
  trajanjeSekunde: number | null;
  rok: Date | null;
}

/** Sutra u 20:00, a sa `rokSati` sada + toliko sati (na pun minut). */
export function podrazumevaniRok(sada: Date, rokSati: number | null): Date {
  if (rokSati !== null && rokSati > 0) {
    const d = new Date(sada.getTime() + rokSati * 3_600_000);
    d.setSeconds(0, 0);
    return d;
  }
  const d = new Date(sada);
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

/** Rok u satima od sada (za šablon), 1..336. */
export function rokSatiIzRoka(rok: Date | null, sada: Date): number | null {
  if (!rok) {
    return null;
  }
  const sati = Math.round((rok.getTime() - sada.getTime()) / 3_600_000);
  return Math.min(MAX_ROK_DANA * 24, Math.max(1, sati));
}

/** Publika nacrta: "na času" kad kontekst to nudi, inače cela grupa. */
function publikaZa(zeljena: PublikaAnkete, m: Mogucnosti): PublikaAnkete {
  return zeljena === 'NA_CASU' && !m.naCasu ? 'GRUPA' : zeljena === 'GRUPA' && !m.grupa && m.naCasu ? 'NA_CASU' : zeljena;
}

/**
 * Mesto za upis pri pokretanju: šablon iz predloga čuva `Opcija 1`, `Opcija 2` (spec, dodatak A), a provera ih otvara prazne,
 * pa se takav šablon nikad ne pokreće odmah.
 */
const PRAZNO_MESTO = /^Opcija \d+$/;

export function imaPraznaMesta(s: Pick<SablonAnkete, 'opcije'>): boolean {
  return s.opcije.some(o => PRAZNO_MESTO.test(o.trim()));
}

/** Nacrt iz šablona; za pokretanje (`praznaMesta`) `Opcija N` postaje prazno polje za upis. */
export function nacrtIzSablona(s: SablonAnkete, m: Mogucnosti, sada: Date, praznaMesta = true): Nacrt {
  const publika = publikaZa(s.publika, m);
  const opcije = praznaMesta ? s.opcije.map(o => (PRAZNO_MESTO.test(o.trim()) ? '' : o)) : [...s.opcije];
  return {
    sablonId: s.id, pitanje: s.pitanje, opcije, viseOdgovora: s.viseOdgovora, publika,
    trajanjeSekunde: publika === 'NA_CASU' ? s.trajanjeSekunde : null,
    rok: publika === 'GRUPA' ? podrazumevaniRok(sada, s.rokSati) : null,
  };
}

/** "Nova": prazno pitanje, dva prazna odgovora. */
export function prazanNacrt(m: Mogucnosti, sada: Date): Nacrt {
  const publika = publikaZa('NA_CASU', m);
  return {
    sablonId: null, pitanje: '', opcije: ['', ''], viseOdgovora: false, publika, trajanjeSekunde: null,
    rok: publika === 'GRUPA' ? podrazumevaniRok(sada, null) : null,
  };
}

/** "Pokreni ponovo": isto pitanje i odgovori, iz istog šablona, sa novim rokom. */
export function nacrtIzAnkete(a: AnketaDetails, m: Mogucnosti, sada: Date): Nacrt {
  const publika = publikaZa(a.publika, m);
  return {
    sablonId: a.sablonId, pitanje: a.pitanje, opcije: [...a.opcije], viseOdgovora: a.viseOdgovora, publika,
    trajanjeSekunde: null, rok: publika === 'GRUPA' ? podrazumevaniRok(sada, null) : null,
  };
}

/** Odgovori bez praznih redova, bez razmaka na krajevima. */
export function ocisceneOpcije(opcije: readonly string[]): string[] {
  return opcije.map(o => o.trim()).filter(o => o !== '');
}

/** Iste granice kao server (spec 4, "Pokretanje"); `null` = može. */
export function proveriNacrt(n: Nacrt, sada: Date): string | null {
  const pitanje = n.pitanje.trim();
  if (!pitanje) {
    return 'Upiši pitanje.';
  }
  if (pitanje.length > MAX_PITANJE) {
    return `Pitanje može imati najviše ${MAX_PITANJE} znakova.`;
  }
  const opcije = ocisceneOpcije(n.opcije);
  if (opcije.length < MIN_ODGOVORA) {
    return 'Potrebna su bar dva odgovora.';
  }
  if (opcije.length > MAX_ODGOVORA) {
    return `Najviše ${MAX_ODGOVORA} odgovora.`;
  }
  if (opcije.some(o => o.length > MAX_ODGOVOR)) {
    return `Odgovor može imati najviše ${MAX_ODGOVOR} znakova.`;
  }
  if (new Set(opcije.map(o => o.toLocaleLowerCase('sr-Latn'))).size !== opcije.length) {
    return 'Odgovori moraju biti različiti.';
  }
  if (n.publika === 'GRUPA') {
    if (!n.rok || isNaN(n.rok.getTime())) {
      return 'Izaberi rok.';
    }
    if (n.rok.getTime() <= sada.getTime()) {
      return 'Rok mora biti u budućnosti.';
    }
    if (n.rok.getTime() - sada.getTime() > MAX_ROK_DANA * 86_400_000) {
      return 'Rok mora biti u narednih 14 dana.';
    }
  }
  return null;
}

const dva = (n: number) => String(n).padStart(2, '0');

/** Lokalno vreme za server (`LocalDateTime`): `2026-11-24T20:00:00`. */
export function lokalnoVreme(d: Date): string {
  return `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}T${dva(d.getHours())}:${dva(d.getMinutes())}:${dva(d.getSeconds())}`;
}

/** `POST ankete`: "na času" nosi predavanje, grupa nosi grupu i rok (i predavanje kad je pokrenuta sa njega). */
export function cmdPokretanja(n: Nacrt, k: KontekstAnkete): PokreniAnketuCmd {
  const naCasu = n.publika === 'NA_CASU';
  return {
    sablonId: n.sablonId, pitanje: n.pitanje.trim(), opcije: ocisceneOpcije(n.opcije), viseOdgovora: n.viseOdgovora,
    publika: n.publika, predavanjeId: k.predavanjeId, grupaId: naCasu ? null : k.grupaId,
    trajanjeSekunde: naCasu ? n.trajanjeSekunde : null, rok: !naCasu && n.rok ? lokalnoVreme(n.rok) : null,
  };
}

/** Komanda šablona iz postojećeg (cela zamena: neizmenjena polja ostaju). */
export function cmdIzSablona(s: SablonAnkete, izmene: Partial<SablonAnketeCmd> = {}): SablonAnketeCmd {
  return {
    folderId: s.folderId, pitanje: s.pitanje, opcije: [...s.opcije], viseOdgovora: s.viseOdgovora, publika: s.publika,
    trajanjeSekunde: s.trajanjeSekunde, rokSati: s.rokSati, precica: s.precica, ikonica: s.ikonica, boja: s.boja,
    kratakNaziv: s.kratakNaziv, pokreniOdmah: s.pokreniOdmah, ...izmene,
  };
}

/** Prva boja koju prečice još nemaju (pa redom ukrug). */
export function sledecaBoja(postojece: readonly SablonAnkete[]): BojaPrecice {
  const zauzete = new Set(postojece.map(p => p.boja));
  return BOJE_PRECICA.find(b => !zauzete.has(b.boja))?.boja ?? BOJE_PRECICA[postojece.length % BOJE_PRECICA.length].boja;
}

/**
 * Nacrt kao šablon: sadržaj nacrta, a izgled prečice iz postojećeg šablona (izmena) ili podrazumevan (nov). Za "na času"
 * rok se ne čuva; za grupu se čuva kao `rokSati` od sada.
 */
export function cmdSablonaIzNacrta(
  n: Nacrt, postojeci: SablonAnkete | null, nov: { folderId: number | null; precica: boolean; boja: BojaPrecice | null }, sada: Date,
): SablonAnketeCmd {
  // rok koji je i dalje podrazumevani rok šablona (± 2 min) ne menja `rokSati` (sutra u 20:00 nije "33 h")
  const istiRok = postojeci?.publika === 'GRUPA' && n.rok !== null
    && Math.abs(n.rok.getTime() - podrazumevaniRok(sada, postojeci.rokSati).getTime()) <= 120_000;
  const sadrzaj: Partial<SablonAnketeCmd> = {
    pitanje: n.pitanje.trim(), opcije: ocisceneOpcije(n.opcije), viseOdgovora: n.viseOdgovora, publika: n.publika,
    trajanjeSekunde: n.publika === 'NA_CASU' ? n.trajanjeSekunde : null,
    rokSati: n.publika === 'GRUPA' ? (istiRok ? (postojeci?.rokSati ?? null) : rokSatiIzRoka(n.rok, sada)) : null,
  };
  if (postojeci) {
    return cmdIzSablona(postojeci, sadrzaj);
  }
  return {
    folderId: nov.folderId, pitanje: '', opcije: [], viseOdgovora: false, publika: 'NA_CASU', trajanjeSekunde: null, rokSati: null,
    precica: nov.precica, ikonica: null, boja: nov.precica ? nov.boja : null, kratakNaziv: nov.precica ? skrati(n.pitanje, MAX_KRATAK_NAZIV) : null,
    pokreniOdmah: false, ...sadrzaj,
  };
}

/** "★ Sačuvaj" za anketu koja nije iz šablona: nova prečica (na času: dodir pokreće odmah). */
export function cmdPreciceIzAnkete(a: AnketaDetails, boja: BojaPrecice): SablonAnketeCmd {
  // oba vremena su lokalna (`LocalDateTime`), pa razlika ne zavisi od zone pregledača
  const trajanjeMs = a.rok ? Date.parse(a.rok) - Date.parse(a.otvoreno) : NaN;
  const trajanje = a.publika === 'NA_CASU' && Number.isFinite(trajanjeMs) ? Math.round(trajanjeMs / 1000) : null;
  const rokSati = a.publika === 'GRUPA' && Number.isFinite(trajanjeMs)
    ? Math.min(MAX_ROK_DANA * 24, Math.max(1, Math.round(trajanjeMs / 3_600_000)))
    : null;
  return {
    folderId: null, pitanje: a.pitanje, opcije: [...a.opcije], viseOdgovora: a.viseOdgovora, publika: a.publika,
    trajanjeSekunde: trajanje !== null && trajanje >= 10 && trajanje <= 1800 ? trajanje : null,
    rokSati,
    precica: true, ikonica: null, boja, kratakNaziv: skrati(a.pitanje, MAX_KRATAK_NAZIV), pokreniOdmah: a.publika === 'NA_CASU',
  };
}

/** Dodir prečice pokreće odmah samo kad šablon to traži i kontekst nudi njegovu publiku (inače ekran provere). */
export function mozeOdmah(s: SablonAnkete, m: Mogucnosti): boolean {
  return s.pokreniOdmah && !imaPraznaMesta(s) && (s.publika === 'NA_CASU' ? m.naCasu : m.grupa);
}

/** Jedna traka rezultata: `udeo` (0..1) je od broja studenata koji su glasali. */
export interface Traka {
  tekst: string;
  broj: number;
  udeo: number;
  procenat: number;
  pobednik: boolean;
}

/** Trake po odgovoru; pobednik je jedini sa najviše glasova (nerešeno: nijedan, kao `AnketaInfo.pobednik`). */
export function trake(opcije: readonly string[], glasovi: readonly number[], brojGlasalo: number): Traka[] {
  const brojevi = opcije.map((_, i) => Math.max(0, glasovi[i] ?? 0));
  const max = Math.max(0, ...brojevi);
  const jedini = max > 0 && brojevi.filter(b => b === max).length === 1;
  const od = Math.max(brojGlasalo, 1);
  return opcije.map((tekst, i) => ({
    tekst, broj: brojevi[i], udeo: Math.min(1, brojevi[i] / od), procenat: Math.round((brojevi[i] / od) * 100),
    pobednik: jedini && brojevi[i] === max,
  }));
}

/** `1 čekiran`, `3 čekirana`, `27 čekiranih`. */
export function cekiranihTekst(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  return `${n} ${d === 1 && dd !== 11 ? 'čekiran' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'čekirana' : 'čekiranih'}`;
}

/** Podnaslov panela: `UPR · GD-2026 · 27 čekiranih` (bez delova koji fale). */
export function opisKonteksta(k: KontekstAnkete): string {
  return [k.predmetNaziv, k.grupaNaziv, k.brojCekiranih !== null ? cekiranihTekst(k.brojCekiranih) : null]
    .filter((x): x is string => !!x).join(' · ');
}

/** Lokalno vreme servera (`2026-11-24T10:44:00`) kao `24.11. u 10:44`; neispravno: prazno. */
export function kratkoVreme(lokalno: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(lokalno ?? '');
  return m ? `${Number(m[3])}.${Number(m[2])}. u ${m[4]}:${m[5]}` : '';
}

/** Koliko još nije glasalo (nikad manje od 0). */
export function nijeGlasalo(a: Pick<AnketaDetails, 'brojGlasalo' | 'brojMogucih'>): number {
  return Math.max(0, a.brojMogucih - a.brojGlasalo);
}

/** "Zatvori sama posle": `bez`, `30 s`, `1 min`, `90 s`. */
export function oznakaTrajanja(s: number | null): string {
  if (s === null) {
    return 'bez';
  }
  return s % 60 === 0 ? `${s / 60} min` : `${s} s`;
}

/**
 * Šta projektor prikazuje od `aktivne`: najnovija otvorena, inače najnovija zatvorena sa prikazanim rezultatom (server
 * takve šalje 30 min), inače ništa. Zatvorena bez prikazanog rezultata nestaje.
 */
export function anketaZaProjektor(lista: readonly AnketaDetails[] | null | undefined): AnketaDetails | null {
  const redom = [...(lista ?? [])].sort((a, b) => b.id - a.id);
  return redom.find(a => a.otvorena) ?? redom.find(a => a.rezultatPrikazan) ?? null;
}

/** Pomeranje u nizu (prevlačenje, strelice): nov niz, original ostaje. */
export function pomeri<T>(lista: readonly T[], od: number, ka: number): T[] {
  const novi = [...lista];
  if (od < 0 || od >= novi.length || ka < 0 || ka >= novi.length || od === ka) {
    return novi;
  }
  const [x] = novi.splice(od, 1);
  novi.splice(ka, 0, x);
  return novi;
}

/**
 * Tačno jedan emoji (slobodan unos ikonice): jedan grafem sa slikovnim znakom ili zastavom; inače `null`. Slova, cifre i
 * više znakova ne prolaze (server čuva najviše 16 bajtova po koloni, pa i dug ZWJ niz odbija sam).
 */
export function jedanEmoji(unos: string): string | null {
  const t = unos.trim();
  if (!t || t.length > 16) {
    return null;
  }
  const Segmenter = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  const grafema = Segmenter ? [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].length : [...t].length;
  return grafema === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t) ? t : null;
}

/** Taster panela: 1-9 pokreću prečicu, Enter zatvara prikazanu anketu, R pokazuje ili sakriva rezultat. */
export type AkcijaPanela = { tip: 'precica'; indeks: number } | { tip: 'zatvori' } | { tip: 'rezultat' };

type TasterPanela = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'defaultPrevented' | 'target'> & {
  code?: string;
};

/** Polja i kontrole koje same koriste tastere (unos, izbor, meni, kalendar). */
const SVOJA_TASTATURA = '[role="combobox"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],[role="textbox"],[role="slider"],[role="spinbutton"],[role="radiogroup"],[role="radio"],.mat-datepicker-content,.mat-timepicker-panel';
/** Fokusirano dugme ili link sam obrađuje Enter. */
const AKTIVIRA_SE = 'button,a[href],[role="button"],[role="switch"],[role="checkbox"],summary,select';

/**
 * Akcija za taster dok je panel otvoren, ili `null`: ponavljanje, modifikatori, kucanje u polje i kontrole sa svojom
 * tastaturom se preskaču; Enter na dugmetu ostaje dugmetu. `R` radi i na ćiriličnom rasporedu (`e.code` = `KeyR`).
 */
export function akcijaPanela(e: TasterPanela): AkcijaPanela | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
    return null;
  }
  const el = e.target instanceof Element ? e.target : null;
  if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || (el as HTMLElement).isContentEditable || el.closest(SVOJA_TASTATURA))) {
    return null;
  }
  if (/^[1-9]$/.test(e.key)) {
    return { tip: 'precica', indeks: Number(e.key) - 1 };
  }
  if (e.key === 'Enter') {
    return el?.closest(AKTIVIRA_SE) ? null : { tip: 'zatvori' };
  }
  if (e.key === 'r' || e.key === 'R' || (e.key.length === 1 && e.key.charCodeAt(0) > 0x7f && e.code === 'KeyR')) {
    return { tip: 'rezultat' };
  }
  return null;
}
