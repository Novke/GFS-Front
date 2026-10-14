/** Lokalna štoperica prozora; sva vremena su serverski epoch ms. */
export interface Stoperica { od: number; pauzirano: number; pauzaOd: number | null; }

export const novaStoperica = (pocetakMs: number): Stoperica => ({ od: pocetakMs, pauzirano: 0, pauzaOd: null });
export const proteklo = (s: Stoperica, sadaMs: number): number => Math.max(0, (s.pauzaOd ?? sadaMs) - s.od - s.pauzirano);
export const pauziraj = (s: Stoperica, sadaMs: number): Stoperica => (s.pauzaOd !== null ? s : { ...s, pauzaOd: sadaMs });
export const nastavi = (s: Stoperica, sadaMs: number): Stoperica =>
  s.pauzaOd === null ? s : { ...s, pauzirano: s.pauzirano + Math.max(0, sadaMs - s.pauzaOd), pauzaOd: null };
export const nuluj = (s: Stoperica, sadaMs: number): Stoperica =>
  ({ od: sadaMs, pauzirano: 0, pauzaOd: s.pauzaOd === null ? null : sadaMs });

/** "0:00", "9:05", "1:02:03"; negativno ili NaN -> "0:00". */
export function formatTrajanja(ms: number): string {
  const ukupno = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(ukupno / 3600);
  const m = Math.floor((ukupno % 3600) / 60);
  const sek = ukupno % 60;
  const dd = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dd(m)}:${dd(sek)}` : `${m}:${dd(sek)}`;
}

/** "09:05" (24 h) u zoni uređaja ili u zadatoj (testovi). */
export function formatSata(epochMs: number, zona?: string): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(epochMs);
}

export const kljucStoperice = (izvodjenjeId: number): string => `gfs.uzivo.stoperica.${izvodjenjeId}`;

const konacan = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function ucitajStopericu(storage: Storage | null, izvodjenjeId: number, pocetakMs: number): Stoperica {
  try {
    const sirovo = storage?.getItem(kljucStoperice(izvodjenjeId));
    if (sirovo) {
      const z = JSON.parse(sirovo) as Partial<Stoperica> | null;
      if (z && konacan(z.od) && konacan(z.pauzirano) && z.pauzirano >= 0 && (z.pauzaOd === null || konacan(z.pauzaOd))) {
        return { od: z.od, pauzirano: z.pauzirano, pauzaOd: z.pauzaOd };
      }
    }
  } catch { /* neispravan zapis: sveža štoperica */ }
  return novaStoperica(pocetakMs);
}

export function sacuvajStopericu(storage: Storage | null, izvodjenjeId: number, s: Stoperica): void {
  try { storage?.setItem(kljucStoperice(izvodjenjeId), JSON.stringify(s)); } catch { /* pun storage: preskoči */ }
}
