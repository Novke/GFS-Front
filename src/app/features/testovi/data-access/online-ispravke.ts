import type { OdgovorPolja, TipPoljaZadatka } from './online.models';

/**
 * „Ispravi ključ“ (ispravka KLJUC, plan 4.4): tekst iz dijaloga u `OdgovorPolja` (postavljeno je samo svojstvo tipa polja), ili
 * `null` kad tekst ne odgovara tipu. BROJ: jedan broj (zarez ili tačka); TEKST: prihvatljivi odgovori razdvojeni zarezom;
 * JEDAN_TACAN: jedan redni broj opcije (1..n); VISE_TACNIH: redni brojevi razdvojeni zarezom.
 */
export function kljucIzTeksta(p: { tip: TipPoljaZadatka; opcije: { id: number }[] | null }, tekst: string): OdgovorPolja | null {
  const t = tekst.trim();
  const prazno: OdgovorPolja = { broj: null, prihvatljivi: null, tacna: null, tacne: null };
  if (!t) return null;
  switch (p.tip) {
    case 'BROJ': {
      const n = t.replace(/[\s\u00a0]/gu, '').replace(',', '.');
      return /^[+-]?\d+(\.\d+)?$/u.test(n) ? { ...prazno, broj: Number(n) } : null;
    }
    case 'TEKST': {
      const l = t.split(',').map(x => x.trim()).filter(Boolean);
      return l.length ? { ...prazno, prihvatljivi: l } : null;
    }
    case 'JEDAN_TACAN':
    case 'VISE_TACNIH': {
      const opcije = p.opcije ?? [];
      const rb = t.split(/[,\s]+/u).filter(Boolean).map(Number);
      if (!rb.length || rb.some(n => !Number.isInteger(n) || n < 1 || n > opcije.length)) return null;
      const ids = [...new Set(rb)].map(n => opcije[n - 1].id);
      if (p.tip === 'JEDAN_TACAN') return ids.length === 1 ? { ...prazno, tacna: ids[0] } : null;
      return { ...prazno, tacne: ids };
    }
  }
}
