import { Pipe, PipeTransform } from '@angular/core';

/**
 * Indeks za prikaz: `GD12` i godina upisa `2025` -> `GD12/2025`; bez godine samo indeks; bez indeksa `—`
 * (stari redovi nemaju godinu, Review Focus 4). Indeks koji već sadrži `/` ostaje kakav jeste.
 */
export function formatIndeks(indeks: string | null | undefined, godina?: number | null): string {
  const i = indeks?.trim();
  if (!i) {
    return '—';
  }
  if (godina === null || godina === undefined || !Number.isFinite(godina) || i.includes('/')) {
    return i;
  }
  return `${i}/${godina}`;
}

/** `{{ s.indeks | indeks: s.godina }}` -> `GD12/2025`. */
@Pipe({ name: 'indeks' })
export class IndeksPipe implements PipeTransform {
  transform(indeks: string | null | undefined, godina?: number | null): string {
    return formatIndeks(indeks, godina);
  }
}
