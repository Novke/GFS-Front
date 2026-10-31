import type { OdgovorPolja, PoljeZadatka } from '../data-access/uzivo.models';
import { tacanBroj } from './format';

/*
 * Polja odgovora Zadatka (šema grupe banke) na telefonu: čista pravila koja dele unos na času (`javno/zadatak-unos`) i
 * vežbanje na nalogu studenta (`features/nalog`). Bez Angular-a i bez HTTP-a; tipovi iz `uzivo.models` samo kao tipovi.
 */

export type { OdgovorPolja, PoljeZadatka, TipPoljaZadatka } from '../data-access/uzivo.models';

/** Vrednost polja kako ide serveru: BROJ i TEKST string, JEDAN_TACAN i VISE_TACNIH lista id-jeva opcija. */
export type VrednostPolja = string | number[];

/** Isto pravilo kao `Normalizacija.broj` na serveru: razmaci su razdvajači hiljada, decimalni znak tačka ili zarez. */
const BROJ = /^[+-]?\d+([.,]\d+)?$/;

export const PORUKA_BROJ = 'Unesi broj.';

export function normalizujBroj(unos: string): string {
  return unos.replace(/[\s\u00A0\u202F]/g, '');
}

/** Poruka kad unos nije broj (ista kao serverska), inače null. */
export function porukaZaBroj(unos: string): string | null {
  return BROJ.test(normalizujBroj(unos)) ? null : PORUKA_BROJ;
}

/** Polje sa opcijama (dugmad), a ne tekst. */
export function jeOpcija(p: Pick<PoljeZadatka, 'tip'>): boolean {
  return p.tip === 'JEDAN_TACAN' || p.tip === 'VISE_TACNIH';
}

/** Da li je polje popunjeno ("Pošalji" tek kad su sva): tekst posle skraćivanja, tačno jedna ili bar jedna opcija. */
export function popunjeno(p: PoljeZadatka, v: VrednostPolja | undefined): boolean {
  if (p.tip === 'BROJ' || p.tip === 'TEKST') return typeof v === 'string' && v.trim().length > 0;
  return Array.isArray(v) && (p.tip === 'JEDAN_TACAN' ? v.length === 1 : v.length > 0);
}

/**
 * Tačan odgovor polja za prikaz (isti oblik kao `tacnoTekst` nastavničkog rezultata, ovde nad šemom svoje varijante, jer
 * javni deo ne sme da uvozi `ui/zadatak-rezultat`): BROJ sa svim decimalama i jedinicom, TEKST prihvatljivi spojeni zarezom,
 * opcije njihov tekst (redom opcija; sme da ima `$formule$`). Bez vrednosti prazan tekst.
 */
export function tacnoPolja(p: PoljeZadatka, t: OdgovorPolja | null | undefined): string {
  if (!t) return '';
  switch (p.tip) {
    case 'BROJ':
      return t.broj === null ? '' : tacanBroj(t.broj) + (p.jedinica ? ' ' + p.jedinica : '');
    case 'TEKST':
      return (t.prihvatljivi ?? []).join(', ');
    case 'JEDAN_TACAN':
      return p.opcije?.find(o => o.id === t.tacna)?.tekst ?? '';
    case 'VISE_TACNIH':
      return (p.opcije ?? []).filter(o => t.tacne?.includes(o.id)).map(o => o.tekst).join(', ');
  }
}

/**
 * Oznaka stavke liste na početku: `a) `, `(b) `, `1) `, `12) ` (jedno slovo ili do dve cifre, zagrada, pa razmak). Server oznaku
 * skraćuje (`BankaPP.normalizujPolja`), pa posle razmaka uvek ima teksta; kratko zbog budžeta telefona (`e2e/lenji-formule.spec.ts`).
 */
const OZNAKA_LISTE = /^\(?([a-z]|\d\d?)\)\s+/i;

/**
 * Oznaka polja na telefonu. Kad šema ima samo jedno polje, slovo liste ("a) dekadna vrednost") ništa ne znači, pa se skida
 * (stare šeme i snimci rundi ga imaju); oznaka bez teksta posle slova ostaje kakva jeste. Više polja: oznake kakve jesu.
 */
export function oznakaNaTelefonu(p: Pick<PoljeZadatka, 'oznaka'>, brojPolja: number): string {
  return brojPolja === 1 ? p.oznaka.replace(OZNAKA_LISTE, '') : p.oznaka;
}
