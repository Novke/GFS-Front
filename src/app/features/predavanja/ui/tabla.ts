import { PredavanjeDetails } from '../../../core/api/predavanja.models';
import { formatDatum } from '../../../shared/util/datum.pipe';
import type { KljucStrane } from '../../uzivo/crtanje/crtanje.models';

/** Tabla predavanja ima jednu stranu: bela, bez slajda (spec crtanja 5.7). */
export const KLJUC_TABLE: KljucStrane = { slajdId: null, pozadina: 'BELA' };

/** Putanje table (stranica predavanja otvara tablu, tabla otvara publiku). */
export const tablaPredavanja = (id: number | string): string => `predavanja/${id}/tabla`;
export const publikaTable = (id: number | string): string => `predavanja/${id}/tabla/publika`;

/** „Tabla · Uvod u računarstvo, predavanje 24. 11. 2026.” (bez datuma redni broj, bez predmeta samo predavanje). */
export function naslovTable(p: Pick<PredavanjeDetails, 'predmet' | 'datum' | 'rb'> | null): string {
  if (!p) return 'Tabla';
  const predavanje = `predavanje ${p.datum ? formatDatum(p.datum) : p.rb}`;
  return `Tabla · ${[p.predmet?.naziv, predavanje].filter(Boolean).join(', ')}`;
}
