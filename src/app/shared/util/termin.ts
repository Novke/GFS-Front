/**
 * Prikaz termina rasporeda (spec najave odsustva): dan u nedelji, kratak datum i vreme bloka. Bez uvoza (koristi ga i javna
 * ruta `/nalog`, preko allow-liste `gfs/javna-ruta-uvozi`), bez `Date` parsiranja kroz UTC: `2026-11-04` se čita ručno.
 */

/** ISO dan u nedelji (1 = ponedeljak ... 7 = nedelja) -> naziv; indeks 0 je prazan. */
export const DANI: readonly string[] = ['', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota', 'nedelja'];

/** Isto, kratko (`pon`, `uto`, ...), za uske tabele. */
export const DANI_KRATKO: readonly string[] = ['', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub', 'ned'];

/** Kratki nazivi meseci (`jan` ... `dec`), indeks 0 = januar; za blok datuma na kartici termina. */
export const MESECI_KRATKO: readonly string[] = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

const ISO_DAN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-11-04` -> lokalni datum (ponoć), ili `null` za nešto drugo i nepostojeći dan. */
export function lokalniDatum(iso: string | null | undefined): Date | null {
  const m = typeof iso === 'string' ? ISO_DAN.exec(iso) : null;
  if (!m) {
    return null;
  }
  const [g, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const datum = new Date(g, mes - 1, d);
  return datum.getFullYear() === g && datum.getMonth() === mes - 1 && datum.getDate() === d ? datum : null;
}

/** ISO dan u nedelji datuma (1-7), ili 0 za neispravan datum. */
export function danUNedelji(iso: string): number {
  const d = lokalniDatum(iso);
  return d ? ((d.getDay() + 6) % 7) + 1 : 0;
}

/** Lokalni datum kao `2026-11-04`. */
export function isoDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `2026-11-04` + 7 -> `2026-11-11` (lokalno, bez pomeranja zbog letnjeg računanja vremena). */
export function dodajDane(iso: string, dana: number): string {
  const d = lokalniDatum(iso);
  if (!d) {
    return iso;
  }
  d.setDate(d.getDate() + dana);
  return isoDatum(d);
}

/** Vreme sa servera (`10:00:00` ili `10:00`) -> `10:00`; neispravno -> prazno. */
export function hhmm(vreme: string | null | undefined): string {
  return typeof vreme === 'string' && /^\d{2}:\d{2}/.test(vreme) ? vreme.slice(0, 5) : '';
}

/** `10:00–13:00`. */
export function blokVremena(pocetak: string, kraj: string): string {
  return `${hhmm(pocetak)}–${hhmm(kraj)}`;
}

/** `sreda 4. 11.`; neispravan datum -> `—`. */
export function danIDatum(iso: string): string {
  const d = lokalniDatum(iso);
  return d ? `${DANI[danUNedelji(iso)]} ${d.getDate()}. ${d.getMonth() + 1}.` : '—';
}

/**
 * Relativni opis dana prema `danas` (oba ISO): `danas`, `sutra`, inače prazno. Za studentsku karticu, gde je „danas“ važnije
 * od datuma.
 */
export function relativniDan(iso: string, danas: string): string {
  if (iso === danas) {
    return 'danas';
  }
  return dodajDane(danas, 1) === iso ? 'sutra' : '';
}
