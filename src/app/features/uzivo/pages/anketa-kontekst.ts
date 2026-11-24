import type { KontekstAnkete } from '../../ankete/ui/otvori-anketu';
import { NastavnickoStanje } from '../data-access/uzivo.models';

/**
 * Kontekst brze ankete iz stanja izvođenja (konzola, daljinski): predavanje i grupa izvođenja, naziv prezentacije u
 * podnaslovu i broj čekiranih. Izvođenje bez predavanja nema anketu "na času" (spec brze ankete 6.1).
 */
export function kontekstAnketeIzvodjenja(s: NastavnickoStanje | null): KontekstAnkete {
  const iz = s?.izvodjenje;
  return {
    predavanjeId: iz?.predavanje?.id ?? null,
    grupaId: iz?.grupa?.id ?? null,
    grupaNaziv: iz?.grupa?.naziv ?? null,
    predmetNaziv: iz?.prezentacija.naziv ?? null,
    brojCekiranih: iz?.predavanje ? (s?.brojCekiranih ?? null) : null,
  };
}

/** Isti kontekst (stanje stiže na svaku komandu, a panel treba novu vrednost samo kad se nešto od ovoga promeni). */
export function istiKontekst(a: KontekstAnkete, b: KontekstAnkete): boolean {
  return a.predavanjeId === b.predavanjeId && a.grupaId === b.grupaId && a.grupaNaziv === b.grupaNaziv
    && a.predmetNaziv === b.predmetNaziv && a.brojCekiranih === b.brojCekiranih;
}
