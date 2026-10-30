/**
 * Čiste funkcije zvona studenta (spec „Aplikacija i obaveštenja“ 6.8), bez uvoza.
 */

/** Osvežavanje zvona dok je stranica vidljiva (pored otvaranja, fokusa i poruke service worker-a). */
export const OSVEZAVANJE_ZVONA_MS = 120_000;

/**
 * Putanja stavke u adresu unutar naloga: server šalje relativnu putanju (`nalog`, `nalog/cas`, `nalog/predmet/7`); sve što
 * nije pod `nalog` (ili sadrži `..`, šemu, `//`) vodi na `/nalog`.
 */
export function adresaStavke(putanja: string): string {
  const p = putanja.trim();
  if (!/^nalog(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_=&%.-]*)?$/u.test(p) || p.includes('..') || p.includes('//')) {
    return '/nalog';
  }
  return `/${p}`;
}

const dvocifreno = (n: number) => String(n).padStart(2, '0');

/** `danas 18:05`, `juče 9:30`, inače `3. 11. 18:05` (lokalno vreme; `iso` je bez zone, kao ostali datumi sa servera). */
export function kadaStiglo(iso: string, sada: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const vreme = `${d.getHours()}:${dvocifreno(d.getMinutes())}`;
  const dan = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const razlika = Math.round((dan(sada) - dan(d)) / 86_400_000);
  if (razlika === 0) {
    return `danas ${vreme}`;
  }
  if (razlika === 1) {
    return `juče ${vreme}`;
  }
  return `${d.getDate()}. ${d.getMonth() + 1}. ${vreme}`;
}
