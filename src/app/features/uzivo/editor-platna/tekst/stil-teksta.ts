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
function jedna<T>(vrednosti: readonly T[]): T | null {
  return vrednosti.length && vrednosti.every((v) => v === vrednosti[0]) ? vrednosti[0] : null;
}

/**
 * Stanje celog sloja (ili više slojeva) za panel teksta kad tekst nije u uređivanju. Stil delova gleda vidljiv tekst
 * (prazni delovi ne mešaju stanje); sloj bez ijednog znaka daje stil svojih praznih delova (stil praznog reda).
 */
export function stanjeDelova(pasusi: readonly Pasus[]): StanjeSelekcije {
  const sviDelovi = pasusi.flatMap((p) => p.delovi);
  const sTekstom = sviDelovi.filter((d) => d.tekst !== '');
  const delovi = sTekstom.length ? sTekstom : sviDelovi;
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
 * bez delova (`delovi: []`, prikaz ga crta 18 pt) dobija prazan deo u stilu prethodnog teksta, sa izmenom, da prazan
 * red prati izmenu celog sloja.
 */
export function stilSvima(pasusi: readonly Pasus[], izmena: Partial<AtributiDela>): Pasus[] {
  let prethodni: Omit<Deo, 'tekst'> = PODRAZUMEVANI_DEO;
  const novi = pasusi.map((p) => {
    if (!p.delovi.length) return { ...p, delovi: [{ ...prethodni, ...izmena, tekst: '' }] };
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
