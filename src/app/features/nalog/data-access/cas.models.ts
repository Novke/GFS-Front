/** Predavanje na kome je student čekiran (`CasPredavanje`); `predmet` je naziv predmeta. */
export interface CasPredavanje {
  id: number;
  predmet: string | null;
  /** `yyyy-MM-dd`. */
  datum: string;
  rb: number;
  tema: string | null;
  zavrseno: boolean;
}

/** Aktivno izvođenje prezentacije na tom predavanju (student iz njega nije izbačen). */
export interface CasIzvodjenje {
  kod: string;
  naziv: string;
}

/**
 * `GET api/public/nalog/cas` (i odgovor potvrde i skeniranja prijavljenog studenta): poslednje čekiranje u poslednjih 5 h.
 * Server može da izostavi `null` polja, pa se odsutno polje čita kao `null`.
 */
export interface CasStanje {
  predavanje?: CasPredavanje | null;
  cekiranU?: string | null;
  izvodjenje?: CasIzvodjenje | null;
}

/** `POST skeniraj`: neprijavljen dobija `kljuc` (čeka prijavu, 15 min), prijavljen `stanje` skeniranog časa. */
export interface SkeniranjeOdgovor {
  kljuc?: string | null;
  stanje?: CasStanje | null;
}
