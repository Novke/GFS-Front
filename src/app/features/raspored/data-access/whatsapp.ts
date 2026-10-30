import { blokVremena, danIDatum, danUNedelji, dodajDane, lokalniDatum } from '../../../shared/util/termin';
import { TerminInfo } from './raspored.models';

/** Šta se javlja grupi: čas je otkazan ili se otkazan čas ipak održava. */
export type VrstaPromene = 'OTKAZAN' | 'ODRZAVA';

/** Dani u akuzativu, za „u sredu“, „u subotu“ (indeks kao `DANI`: 1 = ponedeljak). */
const DANI_AKUZATIV: readonly string[] = ['', 'ponedeljak', 'utorak', 'sredu', 'četvrtak', 'petak', 'subotu', 'nedelju'];

/** `Sutra (četvrtak 30. 10.)`, `Danas (...)`, inače `U sredu 5. 11.`. */
function kad(datum: string, danas: string): string {
  if (datum === danas) {
    return `Danas (${danIDatum(datum)})`;
  }
  if (dodajDane(danas, 1) === datum) {
    return `Sutra (${danIDatum(datum)})`;
  }
  const d = lokalniDatum(datum);
  return d ? `U ${DANI_AKUZATIV[danUNedelji(datum)]} ${d.getDate()}. ${d.getMonth() + 1}.` : danIDatum(datum);
}

/**
 * Predlog poruke za WhatsApp grupu posle otkazivanja ili vraćanja termina (spec aplikacije i obaveštenja, odeljak 7).
 * Nastavnik je menja pre slanja; aplikacija ništa ne šalje sama.
 */
export function tekstZaWhatsApp(t: TerminInfo, vrsta: VrstaPromene, danas: string): string {
  const cas = `${t.predmet.naziv}, ${blokVremena(t.pocetak, t.kraj)}.`;
  if (vrsta === 'ODRZAVA') {
    return `${kad(t.datum, danas)} ipak imamo čas: ${cas}`;
  }
  const napomena = t.napomena?.trim();
  return `${kad(t.datum, danas)} nema časa: ${cas}${napomena ? `\n${napomena}` : ''}`;
}

/** Link koji otvara WhatsApp sa gotovim tekstom; grupu bira nastavnik u WhatsApp-u. */
export function whatsAppLink(tekst: string): string {
  return `https://wa.me/?text=${encodeURIComponent(tekst)}`;
}
