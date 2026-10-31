/**
 * Detekcija za ponudu instalacije (spec „Aplikacija i obaveštenja“ 4.3): čista funkcija, bez uvoza, jer je koristi i javni
 * nalog studenta (`gfs/javna-ruta-uvozi`). Redosled po pouzdanosti znaka: instalirano, ponuda browsera
 * (`beforeinstallprompt`), iPhone/iPad, Android bez ponude, računar. Ime browsera na Androidu se ne pogađa: odluku nosi ponuda.
 */

/** Ulaz: šta browser kaže o sebi. */
export interface UlazDetekcije {
  readonly userAgent: string;
  /** `navigator.maxTouchPoints` (iPad u desktop režimu se predstavlja kao `Macintosh`). */
  readonly maxTouchPoints: number;
  /** `display-mode: standalone` ili `navigator.standalone` (iOS). */
  readonly standalone: boolean;
  /** Browser je poslao `beforeinstallprompt`. */
  readonly imaPonudu: boolean;
}

export type Uredjaj = 'iphone' | 'android' | 'racunar';

/**
 * Šta kartica prikazuje: `instalirano` ništa; `ponuda` dugme „Instaliraj“; `ios-safari` i `ios-drugi` uputstvo za iPhone
 * (Safari, odnosno Chrome i ostali browseri na iPhone-u, „Podeli“ im je na drugom mestu); `android` uputstvo bez ponude;
 * `racunar` kratak tekst za računar.
 */
export type NacinInstalacije = 'instalirano' | 'ponuda' | 'ios-safari' | 'ios-drugi' | 'android' | 'racunar';

export interface PrikazInstalacije {
  readonly uredjaj: Uredjaj;
  readonly nacin: NacinInstalacije;
}

/** Browseri na iPhone-u koji nisu Safari (svi su WebKit, ali im je „Podeli“ u drugom meniju). */
const IOS_DRUGI = /\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|YaBrowser|GSA|DuckDuckGo)\//u;

export function uredjajIz(userAgent: string, maxTouchPoints: number): Uredjaj {
  if (/\b(iPhone|iPad|iPod)\b/u.test(userAgent) || (/\bMacintosh\b/u.test(userAgent) && maxTouchPoints > 1)) {
    return 'iphone';
  }
  return /\bAndroid\b/u.test(userAgent) ? 'android' : 'racunar';
}

export function detektujInstalaciju(u: UlazDetekcije): PrikazInstalacije {
  const uredjaj = uredjajIz(u.userAgent, u.maxTouchPoints);
  if (u.standalone) {
    return { uredjaj, nacin: 'instalirano' };
  }
  if (u.imaPonudu) {
    return { uredjaj, nacin: 'ponuda' };
  }
  if (uredjaj === 'iphone') {
    return { uredjaj, nacin: IOS_DRUGI.test(u.userAgent) ? 'ios-drugi' : 'ios-safari' };
  }
  return { uredjaj, nacin: uredjaj === 'android' ? 'android' : 'racunar' };
}

/** Kartica na nalogu se nudi samo na telefonu koji još nema aplikaciju; računar je vidi samo na tabu Ja. */
export function karticaNaTelefonu(p: PrikazInstalacije): boolean {
  return p.nacin !== 'instalirano' && p.uredjaj !== 'racunar';
}

/** „Ne sada“ i „Već sam dodao“: pamti se samo na ovom uređaju; server ne zna ništa o tome. */
export const KLJUC_SKRIVENA_PONUDA = 'gfs.instalacija.skrivena';
