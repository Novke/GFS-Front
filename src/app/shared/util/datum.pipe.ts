import { Pipe, PipeTransform } from '@angular/core';

/**
 * `pun` `14. 10. 2025.` · `kratko` `14. 10.` · `sa-vremenom` `14. 10. 2025. 14:05` · `vreme` `14:05` (spec 4, Formati).
 */
export type FormatDatuma = 'pun' | 'kratko' | 'sa-vremenom' | 'vreme';

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;

/**
 * Datum sa servera (`LocalDate` `2025-10-14` ili `LocalDateTime` `2025-10-14T14:05:00`) kao lokalni dan i vreme.
 * `new Date('2025-10-14')` bi bio UTC ponoć, pa bi zapadno od Griniča pokazao prethodni dan; zato se string čita ručno.
 * Nepostojeći datum (`2025-02-30`) i bilo šta drugo -> `null`.
 */
export function parseDatum(v: string | Date | null | undefined): Date | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v;
  }
  const m = typeof v === 'string' ? ISO.exec(v.trim()) : null;
  if (!m) {
    return null;
  }
  const [g, mes, d, h, min] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
  const datum = new Date(g, mes - 1, d, h, min);
  return datum.getFullYear() === g && datum.getMonth() === mes - 1 && datum.getDate() === d ? datum : null;
}

const dvaMesta = (n: number) => String(n).padStart(2, '0');

/** Datum u srpskom formatu; nedostajući ili neispravan datum je `—` (Review Focus 4). */
export function formatDatum(v: string | Date | null | undefined, format: FormatDatuma = 'pun'): string {
  const d = parseDatum(v);
  if (!d) {
    return '—';
  }
  const kratko = `${d.getDate()}. ${d.getMonth() + 1}.`;
  const vreme = `${dvaMesta(d.getHours())}:${dvaMesta(d.getMinutes())}`;
  switch (format) {
    case 'kratko':
      return kratko;
    case 'vreme':
      return vreme;
    case 'sa-vremenom':
      return `${kratko} ${d.getFullYear()}. ${vreme}`;
    default:
      return `${kratko} ${d.getFullYear()}.`;
  }
}

/** `{{ p.datum | datum }}` -> `14. 10. 2025.`; `{{ x | datum: 'kratko' }}` -> `14. 10.`. */
@Pipe({ name: 'datum' })
export class DatumPipe implements PipeTransform {
  transform(v: string | Date | null | undefined, format: FormatDatuma = 'pun'): string {
    return formatDatum(v, format);
  }
}
