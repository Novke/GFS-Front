// Stil teksta (F12: stanje izbora u uređivaču i uvlačenje liste; F13: iste izmene nad celim slojem za panel teksta, kad
// tekst nije u uređivanju). Čiste funkcije nad modelom (bez ProseMirror-a): bez promene vraćaju ISTI niz (i iste pasuse),
// pa komanda koja ništa ne menja ne pravi korak istorije ni `PUT` (odluka 8).
import type { Deo, Lista, Pasus, Polozaj, Poravnanje } from '../../data-access/platno.models';
import type { AtributiDela } from './pm-sema';

/** Stil izbora u uređivaču teksta (panel teksta, F13); null = mešano (izbor obuhvata delove ili pasuse različitih vrednosti). */
export interface StanjeSelekcije {
  font: string | null; velicina: number | null; boja: string | null;
  podebljano: boolean | null; kurziv: boolean | null; podvuceno: boolean | null; precrtano: boolean | null;
  polozaj: Polozaj | null; poravnanje: Poravnanje | null; lista: 'ZNAK' | 'BROJ' | 'BEZ' | null; nivo: number | null;
  proredProcenat: number | null; razmakPre: number | null; razmakPosle: number | null;
  /** Položaji i vrste liste PRISUTNI u izboru (redom pojavljivanja): `aria-pressed="mixed"` samo za prisutnu vrednost. */
  polozaji: readonly Polozaj[]; liste: readonly ('ZNAK' | 'BROJ' | 'BEZ')[];
}

/** Najviši nivo liste (0-8, kao PowerPoint). */
export const MAX_NIVO = 8;

/** Meni veličina slova u panelu teksta (pt, kao PowerPoint); polje prima i bilo koju drugu od 1 do 400. */
export const VELICINE_SLOVA: readonly number[] = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];

/** Stil dela kad sloj nema nijedan (Carlito 18, crno; isto kao `PODRAZUMEVANI_STIL` uređivača i prikaz praznog reda). */
const PODRAZUMEVANI_DEO: Omit<Deo, 'tekst'> = {
  font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false,
  polozaj: 'OBICAN',
};
const POLJA_DELA = ['font', 'velicina', 'boja', 'podebljano', 'kurziv', 'podvuceno', 'precrtano', 'polozaj'] as const;

/**
 * Uvlačenje stavke liste (odluka 18): `levo = 18 + 36 * nivo`, `prviRed = -18` (PowerPointovo telo 16:9: `marL` 228 600
 * EMU = 18 pt; viseća oznaka stoji u `-prviRed`).
 */
export function uvlacenjeListe(nivo: number): { levo: number; prviRed: number } {
  return { levo: 18 + 36 * nivo, prviRed: -18 };
}

/** Nova lista (odluka 18): znak `•`, ili broj `ARAPSKI_TACKA` od 1. */
export function novaLista(vrsta: 'ZNAK' | 'BROJ'): Lista {
  return vrsta === 'ZNAK'
    ? { vrsta, znak: '•', boja: null, format: null, pocetak: null }
    : { vrsta, znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: 1 };
}

/** Jedna vrednost ako je ista za sve, inače null (mešano ili prazno). */
export function jedna<T>(vrednosti: readonly T[]): T | null {
  return vrednosti.length && vrednosti.every((v) => v === vrednosti[0]) ? vrednosti[0] : null;
}

/**
 * Stanje celog sloja (ili više slojeva) za panel teksta kad tekst nije u uređivanju. Stil delova gleda vidljiv tekst
 * (prazni delovi ne mešaju stanje); sloj bez ijednog znaka daje stil svojih praznih delova (stil praznog reda), a bez
 * ijednog dela podrazumevani stil (ne "Različito": nema šta da se razlikuje; `stilSvima` polazi od istog stila).
 */
export function stanjeDelova(pasusi: readonly Pasus[]): StanjeSelekcije {
  const sviDelovi = pasusi.flatMap((p) => p.delovi);
  const sTekstom = sviDelovi.filter((d) => d.tekst !== '');
  const delovi = sTekstom.length ? sTekstom : sviDelovi.length ? sviDelovi : [PODRAZUMEVANI_DEO];
  const deo = Object.fromEntries(POLJA_DELA.map((k) => [k, jedna(delovi.map((d) => d[k]))])) as {
    [K in (typeof POLJA_DELA)[number]]: Deo[K] | null;
  };
  return {
    ...deo,
    poravnanje: jedna(pasusi.map((p) => p.poravnanje)),
    lista: jedna(pasusi.map((p) => p.lista?.vrsta ?? 'BEZ')),
    nivo: jedna(pasusi.map((p) => p.nivo)),
    proredProcenat: jedna(pasusi.map((p) => p.proredProcenat)),
    razmakPre: jedna(pasusi.map((p) => p.razmakPre)),
    razmakPosle: jedna(pasusi.map((p) => p.razmakPosle)),
    polozaji: [...new Set(delovi.map((d) => d.polozaj))],
    liste: [...new Set(pasusi.map((p) => p.lista?.vrsta ?? 'BEZ'))],
  };
}

const imaIzmenu = <T extends object>(o: T, izmena: Partial<T>) =>
  (Object.keys(izmena) as (keyof T)[]).some((k) => JSON.stringify(o[k]) !== JSON.stringify(izmena[k]));

/** Isti niz kad nijedan element nije promenjen (identitet), inače nov. */
function istiIliNovi(stari: readonly Pasus[], novi: Pasus[]): Pasus[] {
  return novi.every((p, i) => p === stari[i]) ? (stari as Pasus[]) : novi;
}

/**
 * Stil dela svim delovima, i praznim delovima praznih pasusa (stil praznog reda, kao PowerPointov kraj pasusa). Pasus
 * bez delova (`delovi: []`, prikaz ga crta 18 pt) dobija prazan deo, sa izmenom, da prazan red prati izmenu celog sloja;
 * osnova je prvi SLEDEĆI deo sa tekstom (pa poslednji prethodni deo, pa Carlito 18). Pozivalac zove funkciju po sloju
 * (ili ćeliji), pa osnova nikad ne dolazi iz drugog sloja.
 */
export function stilSvima(pasusi: readonly Pasus[], izmena: Partial<AtributiDela>): Pasus[] {
  // sledeci[i] = prvi deo sa tekstom u pasusima posle i-tog
  const sledeci: (Deo | null)[] = new Array(pasusi.length).fill(null);
  for (let i = pasusi.length - 2; i >= 0; i--) {
    sledeci[i] = pasusi[i + 1].delovi.find((d) => d.tekst !== '') ?? sledeci[i + 1];
  }
  let prethodni: Omit<Deo, 'tekst'> | null = null;
  const novi = pasusi.map((p, i) => {
    if (!p.delovi.length) {
      const osnova = sledeci[i] ?? prethodni ?? PODRAZUMEVANI_DEO;
      return { ...p, delovi: [{ ...osnova, ...izmena, tekst: '' }] };
    }
    prethodni = p.delovi[p.delovi.length - 1];
    if (!p.delovi.some((d) => imaIzmenu(d, izmena))) return p;
    return { ...p, delovi: p.delovi.map((d) => (imaIzmenu(d, izmena) ? { ...d, ...izmena } : d)) };
  });
  return istiIliNovi(pasusi, novi);
}

/** Atributi svih pasusa (objekti iz izmene se kopiraju po pasusu: nijedan se ne deli ni sa pozivaocem). */
export function pasusSvima(pasusi: readonly Pasus[], izmena: Partial<Omit<Pasus, 'delovi'>>): Pasus[] {
  return istiIliNovi(pasusi, pasusi.map((p) => (imaIzmenu(p, izmena) ? { ...p, ...structuredClone(izmena) } : p)));
}

/**
 * Lista nad svim pasusima (kao `prebaciListu` uređivača): svi već te vrste -> bez liste i bez uvlačenja; inače svi
 * postaju ta vrsta (pasus koji je već te vrste zadržava svoju listu), uvlačenje `uvlacenjeListe(nivo)`.
 */
export function listaSvima(pasusi: readonly Pasus[], vrsta: 'ZNAK' | 'BROJ'): Pasus[] {
  const svi = pasusi.every((p) => p.lista?.vrsta === vrsta);
  return istiIliNovi(pasusi, pasusi.map((p) => {
    const izmena = svi
      ? { lista: null, uvlacenje: { levo: 0, prviRed: 0 } }
      : { lista: p.lista?.vrsta === vrsta ? p.lista : novaLista(vrsta), uvlacenje: uvlacenjeListe(p.nivo) };
    return imaIzmenu(p, izmena) ? { ...p, ...izmena } : p;
  }));
}

/** Nivo (0-8) samo pasusima liste, sa uvlačenjem nivoa; pasus bez liste ostaje isti. */
export function nivoSvima(pasusi: readonly Pasus[], razlika: 1 | -1): Pasus[] {
  return istiIliNovi(pasusi, pasusi.map((p) => {
    if (!p.lista) return p;
    const nivo = Math.min(MAX_NIVO, Math.max(0, p.nivo + razlika));
    return nivo === p.nivo ? p : { ...p, nivo, uvlacenje: uvlacenjeListe(nivo) };
  }));
}
