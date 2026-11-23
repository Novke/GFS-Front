import { DANI, isoDatum, relativniDan } from './termin';

/*
 * Vreme brze ankete (spec brze ankete 6.1 i 6.3): odbrojavanje do roka i opis roka. Deli ga panel nastavnika i studentski
 * nalog (javna ruta, allow-lista `gfs/javna-ruta-uvozi`): uvozi samo `shared/util/termin`, koji nema uvoza.
 */

/**
 * Preostalo do roka po satu servera: `sadaServerMs` je stiglo sa odgovorom u lokalnom trenutku `primljenoMs`, pa se pomera
 * za proteklo lokalno vreme. `null` bez roka; nikad manje od 0.
 */
export function preostaloMs(rokMs: number | null | undefined, sadaServerMs: number, primljenoMs: number, sadaLokalnoMs: number): number | null {
  if (typeof rokMs !== 'number' || !Number.isFinite(rokMs)) {
    return null;
  }
  return Math.max(0, rokMs - (sadaServerMs + (sadaLokalnoMs - primljenoMs)));
}

/** `0:42`, `12:05`, a od sat vremena `1 h 05 min`; preko dva dana `3 dana`. */
export function odbrojavanje(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 48 * 3600) {
    const dana = Math.floor(s / 86_400);
    return `${dana} ${dana % 10 === 1 && dana % 100 !== 11 ? 'dan' : 'dana'}`;
  }
  if (s >= 3600) {
    return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Rok kao `danas u 20:00`, `sutra u 20:00` ili `sreda 25.11. u 20:00` (lokalni dan prema `sadaMs`). */
export function opisRoka(rokMs: number, sadaMs: number): string {
  const rok = new Date(rokMs);
  const vreme = `${String(rok.getHours()).padStart(2, '0')}:${String(rok.getMinutes()).padStart(2, '0')}`;
  const relativno = relativniDan(isoDatum(rok), isoDatum(new Date(sadaMs)));
  const dan = relativno || `${DANI[((rok.getDay() + 6) % 7) + 1]} ${rok.getDate()}.${rok.getMonth() + 1}.`;
  return `${dan} u ${vreme}`;
}

/** `1 glas`, `3 glasa`, `5 glasova`, `21 glas`, `12 glasova`. */
export function glasovaTekst(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  const oblik = d === 1 && dd !== 11 ? 'glas' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'glasa' : 'glasova';
  return `${n} ${oblik}`;
}
