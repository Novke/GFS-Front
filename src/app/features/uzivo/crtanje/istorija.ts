// Istorija jedne strane (poništi / vrati): samo u memoriji konzole, do 100 koraka, nepromenljivi nizovi.
import { ElementCrteza } from './crtanje.models';

export const MAX_KORAKA = 100;

export interface Istorija {
  readonly elementi: readonly ElementCrteza[];
  readonly pre: readonly (readonly ElementCrteza[])[];
  readonly posle: readonly (readonly ElementCrteza[])[];
}

export function novaIstorija(elementi: readonly ElementCrteza[] = []): Istorija {
  return { elementi, pre: [], posle: [] };
}

/** Novo stanje strane kao jedan korak: staro ide na "poništi" (najviše 100), "vrati" se briše. */
export function izmeni(i: Istorija, elementi: readonly ElementCrteza[]): Istorija {
  const pre = [...i.pre, i.elementi];
  if (pre.length > MAX_KORAKA) pre.splice(0, pre.length - MAX_KORAKA);
  return { elementi, pre, posle: [] };
}

/** Dodaje elemente kao jedan korak (potez, ili ceo raniji crtež). Ništa za dodati -> ista istorija. */
export function dodaj(i: Istorija, novi: readonly ElementCrteza[]): Istorija {
  return novi.length ? izmeni(i, [...i.elementi, ...novi]) : i;
}

/** "Obriši sve" je jedan korak, pa ga "poništi" vraća. Prazna strana -> ista istorija. */
export function obrisiSve(i: Istorija): Istorija {
  return i.elementi.length ? izmeni(i, []) : i;
}

export function ponisti(i: Istorija): Istorija {
  if (!i.pre.length) return i;
  return { elementi: i.pre[i.pre.length - 1], pre: i.pre.slice(0, -1), posle: [...i.posle, i.elementi] };
}

export function vrati(i: Istorija): Istorija {
  if (!i.posle.length) return i;
  return { elementi: i.posle[i.posle.length - 1], pre: [...i.pre, i.elementi], posle: i.posle.slice(0, -1) };
}
