/** Deo teksta: običan tekst ili link; `href` je uvek apsolutna `http(s)` adresa. */
export interface DeoTeksta {
  readonly tekst: string;
  readonly href?: string;
}

/** Kandidat za adresu: od `http://` ili `https://` do razmaka, `<`, `>` ili navodnika (i srpskih „ ” i » «). */
const ADRESA = /https?:\/\/[^\s<>"'„“”‘’«»]+/giu;
/** Interpunkcija kojom se rečenica nastavlja posle adrese ("…folders/1cb), pa…"): nije deo linka. */
const INTERPUNKCIJA_NA_KRAJU = /[.,;:!?…]+$/u;

function broj(tekst: string, znak: string): number {
  return tekst.split(znak).length - 1;
}

/** Skida interpunkciju i zatvorenu zagradu bez para sa kraja kandidata: `(https://x.rs/a):` -> `https://x.rs/a`. */
function ociscenaAdresa(kandidat: string): string {
  let a = kandidat;
  for (;;) {
    const pre = a;
    a = a.replace(INTERPUNKCIJA_NA_KRAJU, '');
    for (const [otvorena, zatvorena] of [['(', ')'], ['[', ']']] as const) {
      if (a.endsWith(zatvorena) && broj(a, zatvorena) > broj(a, otvorena)) a = a.slice(0, -1);
    }
    if (a === pre) return a;
  }
}

function ispravnaAdresa(adresa: string): boolean {
  try {
    const u = new URL(adresa);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Tekst (beleške slajda, opis prezentacije) podeljen na obične delove i linkove: svaka `http(s)://` adresa postaje link,
 * a interpunkcija i zagrada odmah posle nje ostaju tekst. Drugi protokoli (`javascript:`, `mailto:`, `file:`) i adrese
 * bez `http(s)://` ostaju običan tekst. Spojeni delovi daju tačno ulazni tekst.
 */
export function deloviSaLinkovima(tekst: string | null | undefined): DeoTeksta[] {
  if (!tekst) return [];
  const delovi: DeoTeksta[] = [];
  let od = 0;
  for (const m of tekst.matchAll(ADRESA)) {
    const adresa = ociscenaAdresa(m[0]);
    if (!ispravnaAdresa(adresa)) continue;
    if (m.index > od) delovi.push({ tekst: tekst.slice(od, m.index) });
    delovi.push({ tekst: adresa, href: adresa });
    od = m.index + adresa.length;
  }
  if (od < tekst.length) delovi.push({ tekst: tekst.slice(od) });
  return delovi;
}

/** Samo linkovi iz teksta, bez ponavljanja, redom kojim se prvi put javljaju. */
export function linkoviIzTeksta(tekst: string | null | undefined): string[] {
  return [...new Set(deloviSaLinkovima(tekst).flatMap((d) => (d.href ? [d.href] : [])))];
}

/** Kratak natpis za link van teksta: ime servera bez `www.` (`drive.google.com`). */
export function kratakNatpisLinka(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./u, '');
  } catch {
    return href;
  }
}
