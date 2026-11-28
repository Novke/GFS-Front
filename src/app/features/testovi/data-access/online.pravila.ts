import type { GrupaTesta, Rezim, StanjeOnline, StanjePrimerka } from './online.models';

/*
 * Čista pravila online testa, nastavnik (bez Angular-a): sat, nazivi stanja, raspodela, provera stavke šablona. Javni deo
 * (`features/nalog`) ima svoja pravila u `testovi-studenta.pravila` (`gfs/granice-featurea` zabranjuje deljenje data-access-a).
 */

/** Konzola (tab Uživo) i projektor čitaju stanje na 3 s. */
export const KONZOLA_MS = 3_000;

/** `31:12`, `1:05:09`; `0:00` na isteku. */
export function formatSata(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Sat testa: U_TOKU preostalo do roka po satu servera; pre početka trajanje; posle kraja `0:00`. */
export function satTesta(stanje: StanjeOnline, rokMs: number | null, pomak: number, sada: number, trajanjeMin: number | null): string {
  if (stanje === 'U_TOKU' && rokMs !== null) return formatSata(rokMs - (sada + pomak));
  if (stanje === 'ZAVRSEN') return '0:00';
  return trajanjeMin !== null ? formatSata(trajanjeMin * 60_000) : '—';
}

export const NAZIV_STANJA: Record<StanjeOnline, string> = {
  PRIPREMA: 'Priprema',
  ULAZ: 'Ulaz otvoren',
  U_TOKU: 'U toku',
  ZAVRSEN: 'Završen',
};

export const NAZIV_STANJA_PRIMERKA: Record<StanjePrimerka, string> = {
  NIJE_USAO: 'Nije ušao',
  CEKA: 'Čeka',
  RADI: 'Radi',
  PREDAO: 'Predao',
  PONISTEN: 'Poništen',
};

export const TON_STANJA_PRIMERKA: Record<StanjePrimerka, 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'uToku'> = {
  NIJE_USAO: 'neutral',
  CEKA: 'info',
  RADI: 'uToku',
  PREDAO: 'ok',
  PONISTEN: 'danger',
};

export const NAZIV_REZIMA: Record<Rezim, string> = {
  GRUPE: 'Po grupama (A, B, …)',
  POJEDINACNO: 'Svako svoj primerak',
};

export const GRUPE_TESTA: readonly GrupaTesta[] = ['A', 'B', 'C', 'D'];

/** Poeni sa najviše dve decimale, zarez kao decimalni znak; `—` bez vrednosti. */
export function formatPoena(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  return String(Math.round(p * 100) / 100).replace('.', ',');
}

/** Ručni poeni iz polja forme (`2,5` ili `2.5`): 0..max, najviše 2 decimale; `null` za prazno; `undefined` za neispravno. */
export function rucniPoeniIzTeksta(tekst: string, max: number): number | null | undefined {
  const t = tekst.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/u.test(t)) return undefined;
  const v = Number(t);
  return v >= 0 && v <= max ? v : undefined;
}

/** Ukupno poena šablona: zbir poeni × broj. */
export function maxPoenaStavki(stavke: readonly { poeni: number; broj: number }[]): number {
  return stavke.reduce((z, s) => z + (s.poeni || 0) * (s.broj || 0), 0);
}

/** Greška stavke šablona pre slanja (ugovor 4.1), ili `null`. */
export function greskaStavke(s: { naziv: string; poeni: number; broj: number; izvori: readonly unknown[] }): string | null {
  if (!s.naziv.trim()) return 'Unesi naziv stavke.';
  if (!Number.isInteger(s.poeni) || s.poeni < 1 || s.poeni > 100) return 'Poeni su ceo broj od 1 do 100.';
  if (!Number.isInteger(s.broj) || s.broj < 1 || s.broj > 20) return 'Broj zadataka je od 1 do 20.';
  if (s.izvori.length < 1 || s.izvori.length > 10) return 'Izaberi od 1 do 10 izvora iz banke.';
  return null;
}

/** Vreme iz `LocalDateTime` (`2026-12-09T10:41:07`) kao `10:41`. */
export function vremeIzIso(iso: string | null | undefined): string {
  const m = /T(\d{2}):(\d{2})/u.exec(iso ?? '');
  return m ? `${m[1]}:${m[2]}` : '';
}

/** Tekst za `uneto` jednog polja (nastavnički pregled primerka). */
export function prikazUnetog(v: unknown, opcije: { id: number; tekst: string }[] | null): string {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v) || typeof v === 'number') {
    const ids = Array.isArray(v) ? v : [v];
    return (opcije ?? []).filter(o => ids.includes(o.id)).map(o => o.tekst).join(', ') || ids.join(', ');
  }
  return String(v);
}
