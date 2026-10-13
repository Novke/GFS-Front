import type { Crtica, Deo, FormatBroja, Okvir, Pasus, Poravnanje, Sidro } from '../data-access/platno.models';
import { kljucPasusa } from '../data-access/platno-koraci';
import { cssFonta } from './platno-fontovi';

/**
 * Čiste funkcije za tekst platna (TEKST slojevi i ćelije tabela). Sve mere su u jedinicama platna: 1 jedinica = 1 pt
 * PowerPointovog 16:9 slajda = `var(--u)` (`100cqw / 960`, postavlja `.uz-pl-platno`).
 */

export type Stil = Record<string, string>;

/** Broj bez šuma pokretnog zareza (18 * 0.925 = 16.650000000000002 -> 16.65). */
export function zaokruzi(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Dužina u jedinicama platna. */
export function jedinice(n: number): string {
  return `calc(var(--u) * ${zaokruzi(n)})`;
}

export const CSS_CRTICE: Record<Crtica, string> = { PUNA: 'solid', ISPREKIDANA: 'dashed', TACKASTA: 'dotted' };
const PORAVNANJA: Record<Poravnanje, string> = { LEVO: 'left', CENTAR: 'center', DESNO: 'right', OBOSTRANO: 'justify' };
const SIDRA_FLEKS: Record<Sidro, string> = { VRH: 'flex-start', SREDINA: 'center', DNO: 'flex-end' };
export const SIDRA_CELIJE: Record<Sidro, string> = { VRH: 'top', SREDINA: 'middle', DNO: 'bottom' };

/** PowerPointov jednostruki prored je 1,2 x veličina fonta (kalibracija prema PDF referenci: faza 2). */
const OSNOVNI_PRORED = 1.2;
/** Veličina indeksa i eksponenta u odnosu na osnovni tekst. */
const SKALA_POLOZAJA = 0.65;
/** Prazan pasus bez delova ima visinu reda od 18 pt (odluka 9). */
const PODRAZUMEVANA_VELICINA = 18;
const ZWSP = '​';

const RIMSKE: readonly [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Rimski broj (veliki); za n < 1 ostaje arapski. */
export function rimski(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    return String(n);
  }
  let ostatak = n;
  let rezultat = '';
  for (const [vrednost, znak] of RIMSKE) {
    while (ostatak >= vrednost) {
      rezultat += znak;
      ostatak -= vrednost;
    }
  }
  return rezultat;
}

/** Slovo kao u PowerPointu: a..z, pa aa, bb, ... */
function slovo(n: number): string {
  if (n < 1) {
    return String(n);
  }
  return String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
}

function formatiraj(n: number, format: FormatBroja): string {
  switch (format) {
    case 'ARAPSKI_TACKA': return `${n}.`;
    case 'ARAPSKI_ZAGRADA': return `${n})`;
    case 'MALA_SLOVA_ZAGRADA': return `${slovo(n)})`;
    case 'VELIKA_SLOVA_TACKA': return `${slovo(n).toUpperCase()}.`;
    case 'RIMSKI_VELIKI_TACKA': return `${rimski(n)}.`;
    case 'RIMSKI_MALI_TACKA': return `${rimski(n).toLowerCase()}.`;
  }
}

function prazan(p: Pasus): boolean {
  return p.delovi.every((d) => d.tekst === '');
}

/**
 * Oznaka liste po pasusu (znak ili broj), ili null. Brojanje ide po nivou: nastavlja se dok se na istom nivou ne
 * promeni format ili početak, ili ne dođe pasus bez numeracije; dublji nivoi ne prekidaju plići, a povratak na plići
 * nivo ponovo počinje dublje. Prazan pasus nema oznaku i ne troši broj (kao u PowerPointu).
 */
export function oznakeListe(pasusi: Pasus[]): (string | null)[] {
  const brojaci = new Map<number, { format: FormatBroja; pocetak: number; n: number }>();
  return pasusi.map((p) => {
    if (prazan(p)) {
      return null;
    }
    for (const nivo of [...brojaci.keys()]) {
      if (nivo > p.nivo) {
        brojaci.delete(nivo);
      }
    }
    const lista = p.lista;
    if (lista?.vrsta !== 'BROJ') {
      brojaci.delete(p.nivo);
      return lista ? (lista.znak ?? '•') : null;
    }
    const format = lista.format ?? 'ARAPSKI_TACKA';
    const pocetak = lista.pocetak ?? 1;
    const tekuci = brojaci.get(p.nivo);
    const n = tekuci && tekuci.format === format && tekuci.pocetak === pocetak ? tekuci.n + 1 : pocetak;
    brojaci.set(p.nivo, { format, pocetak, n });
    return formatiraj(n, format);
  });
}

export interface PrikazDela { tekst: string; stil: Stil; }
export interface PrikazOznake { tekst: string; stil: Stil; }
export interface PrikazPasusa {
  indeks: number;
  /** Ključ vidljivosti (`kljucPasusa`) za pasuse TEKST sloja; null u ćelijama tabele. */
  kljuc: string | null;
  stil: Stil;
  oznaka: PrikazOznake | null;
  delovi: PrikazDela[];
}

function velicinaDela(deo: Pick<Deo, 'velicina' | 'polozaj'>, skala: number): number {
  return deo.velicina * skala * (deo.polozaj === 'OBICAN' ? 1 : SKALA_POLOZAJA);
}

export function stilDela(deo: Deo, skala: number): Stil {
  const ukras = [deo.podvuceno ? 'underline' : '', deo.precrtano ? 'line-through' : ''].filter(Boolean).join(' ');
  const stil: Stil = {
    'font-family': cssFonta(deo.font),
    'font-size': jedinice(velicinaDela(deo, skala)),
    color: deo.boja,
    'font-weight': deo.podebljano ? '700' : '400',
    'font-style': deo.kurziv ? 'italic' : 'normal',
    'text-decoration': ukras || 'none',
  };
  if (deo.polozaj !== 'OBICAN') {
    stil['vertical-align'] = deo.polozaj === 'EKSPONENT' ? 'super' : 'sub';
  }
  return stil;
}

function delovi(p: Pasus, skala: number): PrikazDela[] {
  if (prazan(p)) {
    // Prazan red mora imati visinu: zero-width space nosi veličinu prvog dela ili 18 pt (odluka 9).
    const prvi = p.delovi[0];
    const stil = prvi
      ? stilDela(prvi, skala)
      : { 'font-family': cssFonta(''), 'font-size': jedinice(PODRAZUMEVANA_VELICINA * skala) };
    return [{ tekst: ZWSP, stil }];
  }
  const rezultat = p.delovi.filter((d) => d.tekst !== '').map((d) => ({ tekst: d.tekst, stil: stilDela(d, skala) }));
  const poslednji = rezultat[rezultat.length - 1];
  if (poslednji.tekst.endsWith('\n')) {
    // Prelom reda na kraju pasusa (`a:br`) u PowerPointu daje prazan red; u CSS-u ga bez sadržaja nema.
    poslednji.tekst += ZWSP;
  }
  return rezultat;
}

/**
 * Prikaz pasusa: `<p>` nosi poravnanje, razmake (zbirno, jer su pasusi u fleks koloni pa se margine ne skupljaju,
 * kao u PowerPointu), uvlačenje (`levo` = marL, `prviRed` = indent; viseća oznaka liste stoji u `-prviRed`), prored i
 * font prvog dela (od njega zavise visina praznog reda i oznaka liste).
 * Sopstveni tab-stopovi: faza 4 (editor). Do tada `\t` ide na podrazumevani razmak 36 pt (`tab-size` u `platno.css`),
 * a `tabulatori` se ne čitaju.
 */
export function prikazPasusa(pasusi: Pasus[], skala = 1, skalaProreda = 1, slojId: string | null = null): PrikazPasusa[] {
  const oznake = oznakeListe(pasusi);
  return pasusi.map((p, indeks) => {
    const prvi = p.delovi[0];
    const stil: Stil = {
      'text-align': PORAVNANJA[p.poravnanje],
      'margin-top': jedinice(p.razmakPre),
      'margin-bottom': jedinice(p.razmakPosle),
      'padding-left': jedinice(p.uvlacenje.levo),
      'text-indent': jedinice(p.uvlacenje.prviRed),
      'line-height': String(zaokruzi(OSNOVNI_PRORED * (p.proredProcenat / 100) * skalaProreda)),
      'font-family': cssFonta(prvi?.font ?? ''),
      'font-size': jedinice((prvi?.velicina ?? PODRAZUMEVANA_VELICINA) * skala),
    };
    const tekstOznake = oznake[indeks];
    let oznaka: PrikazOznake | null = null;
    if (tekstOznake !== null) {
      const stilOznake: Stil = {};
      const boja = p.lista?.boja ?? prvi?.boja;
      if (boja) {
        stilOznake['color'] = boja;
      }
      if (p.uvlacenje.prviRed < 0) {
        stilOznake['min-width'] = jedinice(-p.uvlacenje.prviRed);
      }
      oznaka = { tekst: tekstOznake, stil: stilOznake };
    }
    return {
      indeks,
      kljuc: slojId === null ? null : kljucPasusa(slojId, indeks),
      stil,
      oznaka,
      delovi: delovi(p, skala),
    };
  });
}

/**
 * Okvir TEKST sloja: fleks kolona sidrena po `sidro`, unutrašnje margine, popuna i ivica. Ivica je, kao u PowerPointu,
 * centrirana na ivici sloja (pola debljine spolja), a margine se mere od ivice sloja.
 */
export function stilOkvira(okvir: Okvir, popuna: string | null, ivica: { boja: string; debljina: number; crtica: Crtica } | null): Stil {
  const pola = ivica ? ivica.debljina / 2 : 0;
  const unutra = (n: number) => jedinice(Math.max(0, n - pola));
  const stil: Stil = {
    'justify-content': SIDRA_FLEKS[okvir.sidro],
    'padding-top': unutra(okvir.unutraGore),
    'padding-right': unutra(okvir.unutraDesno),
    'padding-bottom': unutra(okvir.unutraDole),
    'padding-left': unutra(okvir.unutraLevo),
  };
  if (popuna) {
    stil['background-color'] = popuna;
  }
  if (ivica) {
    stil['inset'] = jedinice(-pola);
    stil['border'] = `${jedinice(ivica.debljina)} ${CSS_CRTICE[ivica.crtica]} ${ivica.boja}`;
  }
  return stil;
}
