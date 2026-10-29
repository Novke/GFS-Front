import { dodajDane, hhmm, isoDatum, lokalniDatum } from '../../../shared/util/termin';
import { RasporedDetails, RasporedInfo, StavkaCmd, TerminInfo } from './raspored.models';

/** Vrednosti jedne stavke u formi (vreme `HH:mm`). */
export interface StavkaForme {
  id: number | null;
  predmet: number | null;
  grupa: number | null;
  dan: number | null;
  pocetak: string;
  kraj: string;
}

export interface VrednostiForme {
  naziv: string;
  vaziOd: string;
  vaziDo: string;
  pragNajava: number | null;
  stavke: StavkaForme[];
}

/** Forma iz sačuvanog rasporeda (izmena). */
export function formaIzRasporeda(r: RasporedDetails): VrednostiForme {
  return {
    naziv: r.naziv,
    vaziOd: r.vaziOd,
    vaziDo: r.vaziDo,
    pragNajava: r.pragNajava,
    stavke: r.stavke.map(s => ({
      id: s.id, predmet: s.predmet.id, grupa: s.grupa.id, dan: s.dan, pocetak: hhmm(s.pocetak), kraj: hhmm(s.kraj),
    })),
  };
}

/**
 * „Kopiraj u novi“: isti termini i prag, naziv sa „(kopija)“, bez id-jeva (nove stavke) i bez datuma važenja (novi period
 * se uvek bira svesno).
 */
export function kopijaRasporeda(r: RasporedDetails): VrednostiForme {
  const f = formaIzRasporeda(r);
  return { ...f, naziv: `${r.naziv} (kopija)`.slice(0, 100), vaziOd: '', vaziDo: '', stavke: f.stavke.map(s => ({ ...s, id: null })) };
}

/** Zahtev iz forme (forma je već proverena: obavezna polja nisu null). */
export function cmdIzForme(v: VrednostiForme): { naziv: string; vaziOd: string; vaziDo: string; pragNajava: number; stavke: StavkaCmd[] } {
  return {
    naziv: v.naziv.trim(),
    vaziOd: v.vaziOd,
    vaziDo: v.vaziDo,
    pragNajava: v.pragNajava ?? 5,
    stavke: v.stavke.map(s => ({
      id: s.id, predmetId: s.predmet!, grupaId: s.grupa!, dan: s.dan!, pocetak: s.pocetak, kraj: s.kraj,
    })),
  };
}

/** Broj dana perioda sa oba kraja (`2026-10-01`..`2026-10-01` = 1); 0 za neispravne datume. */
export function danaUPeriodu(od: string, doDatuma: string): number {
  const a = lokalniDatum(od);
  const b = lokalniDatum(doDatuma);
  if (!a || !b) {
    return 0;
  }
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()))
    / 86_400_000) + 1;
}

/** Period sadrži dan `danas` (ISO). */
export function vaziNaDan(r: Pick<RasporedInfo, 'vaziOd' | 'vaziDo'>, danas: string): boolean {
  return r.vaziOd <= danas && danas <= r.vaziDo;
}

/** Više najava nego što je prag perioda (tada je nastavnik dobio obaveštenje). */
export function iznadPraga(t: Pick<TerminInfo, 'brojNajava' | 'prag'>): boolean {
  return t.brojNajava > t.prag;
}

/** Termini po datumu, redom kojim su stigli (server ih šalje po datumu pa početku). */
export function poDatumu(termini: readonly TerminInfo[]): { datum: string; termini: TerminInfo[] }[] {
  const grupe: { datum: string; termini: TerminInfo[] }[] = [];
  for (const t of termini) {
    const poslednja = grupe.at(-1);
    if (poslednja?.datum === t.datum) {
      poslednja.termini.push(t);
    } else {
      grupe.push({ datum: t.datum, termini: [t] });
    }
  }
  return grupe;
}

/** Ispravan `?od=` (ISO datum) ili danas. */
export function odIliDanas(od: string | null | undefined, danas = isoDatum(new Date())): string {
  return od && lokalniDatum(od) ? od : danas;
}

/** Pomeranje prozora termina za `dana` (može negativno). */
export function pomeriOd(od: string, dana: number): string {
  return dodajDane(od, dana);
}

/** `Ana Anić (GD5/2026)`; nedostajući delovi se izostavljaju. */
export function imeStudenta(n: { ime: string | null; prezime: string | null; indeks: string | null; godina: number | null }): string {
  const ime = [n.ime, n.prezime].filter(x => !!x && x.trim() !== '').join(' ') || 'Student';
  const indeks = n.indeks ? (n.godina ? `${n.indeks}/${n.godina}` : n.indeks) : null;
  return indeks ? `${ime} (${indeks})` : ime;
}
