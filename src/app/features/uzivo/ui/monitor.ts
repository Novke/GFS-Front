/**
 * Prozor za publiku na drugom monitoru (spec 2.16): Window Management API (Chrome/Edge) daje spisak ekrana, prozor se
 * otvara preko celog izabranog ekrana. Bez podrške, bez dozvole ili sa jednim ekranom: običan `window.open`. Ceo ekran
 * (bez okvira prozora) je `F` u samom prozoru publike, jer browser traži gest korisnika u tom prozoru.
 */

export type EkranOpis = { oznaka: string; levo: number; gore: number; sirina: number; visina: number; primarni: boolean };

/** Ime prozora publike (isti prozor se ponovo koristi, ne otvara se drugi). */
export const PROZOR_PUBLIKE = 'gfs-publika';
export const PROZOR_KONZOLE = 'gfs-konzola';

/** Deo `ScreenDetailed` koji koristimo (tipovi Window Management API-ja još nisu u lib.dom). */
interface EkranDetalji {
  availLeft: number; availTop: number; availWidth: number; availHeight: number;
  left: number; top: number; width: number; height: number;
  isPrimary: boolean; label?: string;
}

/** Ono što funkcija koristi od `window`; testovi podmeću svoje. */
export interface ProzorSaEkranima {
  open(url: string, ime: string, osobine?: string): Window | null;
  getScreenDetails?: () => Promise<{ screens: readonly EkranDetalji[]; currentScreen?: EkranDetalji }>;
  screen?: { isExtended?: boolean };
}

function opis(e: EkranDetalji, i: number): EkranOpis {
  const ime = e.label?.trim() || (e.isPrimary ? 'Glavni ekran' : `Ekran ${i + 1}`);
  return {
    oznaka: `${ime} (${e.width}×${e.height})`, levo: e.availLeft, gore: e.availTop, sirina: e.availWidth,
    visina: e.availHeight, primarni: e.isPrimary,
  };
}

const isti = (a: EkranDetalji, b: EkranDetalji) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/**
 * Otvara `url` u prozoru publike. Kandidati su ekrani osim onog na kom je konzola (bez podatka o tome: ne-primarni).
 * Jedan kandidat: prozor ide na njega bez pitanja; više: `izbor` (dijalog) bira, `null` = odustao (ništa se ne otvara).
 * Vraća otvoreni prozor ili `null` (odustao ili browser blokirao iskačući prozor).
 */
export async function otvoriPublikuNaMonitoru(
  url: string,
  izbor?: (ekrani: EkranOpis[]) => Promise<EkranOpis | null>,
  prozor: ProzorSaEkranima = window as unknown as ProzorSaEkranima,
): Promise<Window | null> {
  const obicno = () => prozor.open(url, PROZOR_PUBLIKE, 'popup');
  if (typeof prozor.getScreenDetails !== 'function' || prozor.screen?.isExtended === false) {
    return obicno();
  }
  let detalji: Awaited<ReturnType<NonNullable<ProzorSaEkranima['getScreenDetails']>>>;
  try {
    detalji = await prozor.getScreenDetails();
  } catch {
    return obicno();   // korisnik nije dao dozvolu
  }
  const trenutni = detalji.currentScreen;
  const kandidati = detalji.screens
    .map((e, i) => ({ e, o: opis(e, i) }))
    .filter(({ e }) => (trenutni ? !isti(e, trenutni) : !e.isPrimary))
    .map(({ o }) => o);
  if (kandidati.length === 0) {
    return obicno();
  }
  const ekran = kandidati.length === 1 || !izbor ? kandidati[0] : await izbor(kandidati);
  if (!ekran) {
    return null;
  }
  const osobine = `popup,left=${ekran.levo},top=${ekran.gore},width=${ekran.sirina},height=${ekran.visina}`;
  return prozor.open(url, PROZOR_PUBLIKE, osobine);
}

/**
 * Fokusira postojeći prozor sa imenom `ime` ili otvara nov; prozor koji je već na `url`-u se ne učitava ponovo.
 * Konzola i publika postavljaju `window.name`, pa se nalaze i kad nijedna nije otvorila drugu.
 */
export function otvoriIliFokusiraj(url: string, ime: string, osobine?: string): Window | null {
  const w = window.open('', ime, osobine);
  if (!w) return null;
  try {
    if (w.location.href !== url) w.location.href = url;
  } catch {
    w.location.href = url;
  }
  w.focus();
  return w;
}
