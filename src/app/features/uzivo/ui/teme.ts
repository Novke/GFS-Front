import type { Tema } from '../data-access/platno.models';
import { cssFonta } from './platno-fontovi';

/**
 * Pet tema slajda. Ovo je jedino mesto u aplikaciji gde se boje pišu kao heks vrednosti: tema je podatak platna,
 * ne stil aplikacije. NACRT preuzima dnevne vrednosti iz `src/styles/_tokens.scss` (--ink, --primary, --accent,
 * --ok, --danger, --warn, --muted); ako se tokeni promene, ovde ih ručno uskladiti.
 */
export interface TemaOpis {
  tema: Tema; naziv: string; pozadina: string; tekst: string; naslov: string;
  akcenti: readonly [string, string, string, string, string, string];
  fontNaslova: string; fontTela: string;
  tabelaZaglavlje: string; tabelaZaglavljeTekst: string; tabelaTraka: string;
}

export const TEME: Record<Tema, TemaOpis> = {
  NACRT: {
    // Naslov je boje mastila (kao tekst), ne --primary: INFO slajdovi iz vremena pre tema izgledaju isto.
    tema: 'NACRT', naziv: 'Nacrt', pozadina: '#FFFFFF', tekst: '#121A2A', naslov: '#121A2A',
    akcenti: ['#2456A6', '#F0A23B', '#1D7A55', '#B42318', '#8A5300', '#5F6C84'],
    fontNaslova: 'IBM Plex Sans', fontTela: 'IBM Plex Sans',
    tabelaZaglavlje: '#2456A6', tabelaZaglavljeTekst: '#FFFFFF', tabelaTraka: '#E4ECF8',
  },
  BELA: {
    tema: 'BELA', naziv: 'Bela', pozadina: '#FFFFFF', tekst: '#000000', naslov: '#000000',
    akcenti: ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'],
    fontNaslova: 'Carlito', fontTela: 'Carlito',
    tabelaZaglavlje: '#4472C4', tabelaZaglavljeTekst: '#FFFFFF', tabelaTraka: '#E9EBF5',
  },
  PAPIR: {
    tema: 'PAPIR', naziv: 'Papir', pozadina: '#FAF7F2', tekst: '#2B2B2B', naslov: '#1F6F78',
    akcenti: ['#1F6F78', '#B5533C', '#6B7F3A', '#C08A2E', '#4A5D8C', '#7A4E6B'],
    fontNaslova: 'Caladea', fontTela: 'Carlito',
    tabelaZaglavlje: '#1F6F78', tabelaZaglavljeTekst: '#FFFFFF', tabelaTraka: '#EFE9DD',
  },
  TAMNA: {
    tema: 'TAMNA', naziv: 'Tamna', pozadina: '#1E1F22', tekst: '#E8E8E8', naslov: '#FFFFFF',
    akcenti: ['#7FB2F0', '#F0A35E', '#9BD17F', '#E58FB4', '#C3A6F2', '#F2D16B'],
    fontNaslova: 'Atkinson Hyperlegible', fontTela: 'Atkinson Hyperlegible',
    tabelaZaglavlje: '#7FB2F0', tabelaZaglavljeTekst: '#1E1F22', tabelaTraka: '#2A2C31',
  },
  PONOC: {
    tema: 'PONOC', naziv: 'Ponoć', pozadina: '#0F1B2D', tekst: '#F2F5F9', naslov: '#FFFFFF',
    akcenti: ['#3CC6C8', '#F2B544', '#8FB8FF', '#F27F7F', '#B9E07A', '#D4A5FF'],
    fontNaslova: 'IBM Plex Sans', fontTela: 'IBM Plex Sans',
    tabelaZaglavlje: '#3CC6C8', tabelaZaglavljeTekst: '#0F1B2D', tabelaTraka: '#17263D',
  },
};

/** Tema iz snimka ili prezentacije; odsutna (stari server, e2e fixture-i) ili nepoznata je NACRT. */
export function vazecaTema(t: Tema | null | undefined): Tema {
  return t && Object.hasOwn(TEME, t) ? t : 'NACRT';
}

/**
 * Tamna tema: beli tekst ima veći kontrast sa pozadinom od crnog. Sadržaj INFO/PITANJE slajda (pločice, rezultati,
 * podnožje) tada dobija noćne tokene aplikacije (`rezim-noc`), da ostane čitljiv na tamnoj pozadini.
 */
export function tamnaTema(t: Tema): boolean {
  const p = TEME[t].pozadina;
  return kontrast(p, '#FFFFFF') > kontrast(p, '#000000');
}

/** CSS promenljive teme za korenski element slajda. */
export function promenljiveTeme(t: Tema): Record<string, string> {
  const o = TEME[t];
  const p: Record<string, string> = {
    '--uz-tema-pozadina': o.pozadina,
    '--uz-tema-tekst': o.tekst,
    '--uz-tema-naslov': o.naslov,
    '--uz-tema-font-naslova': cssFonta(o.fontNaslova),
    '--uz-tema-font-tela': cssFonta(o.fontTela),
  };
  o.akcenti.forEach((a, i) => { p[`--uz-tema-akcent-${i + 1}`] = a; });
  return p;
}

function luminansa(boja: string): number {
  let h = boja.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Neispravna boja: ${boja}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x odnos kontrasta dve boje (1 do 21). */
export function kontrast(a: string, b: string): number {
  const [la, lb] = [luminansa(a), luminansa(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
