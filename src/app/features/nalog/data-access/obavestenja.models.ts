/** Vrste u zvonu studenta (spec „Aplikacija i obaveštenja“ 6.8); podsetnik dan pre časa u zvono ne ide. */
export type VrstaObavestenjaStudenta = 'OTKAZAN_CAS' | 'ODRZAVA_SE' | 'OCENE' | 'POSLE_CASA';

/** `GET api/public/nalog/obavestenja`: stavka zvona (bez ocena, imena i razloga; tekst piše server). */
export interface StavkaZvona {
  id: number;
  vrsta: VrstaObavestenjaStudenta;
  naslov: string;
  tekst: string;
  /** Relativna prema korenu aplikacije, kao u push poruci (`nalog/cas`, `nalog/predmet/7`...). */
  putanja: string;
  /** ISO, lokalno vreme servera. */
  kreirano: string;
}

/** Najviše 30 stavki, najnovije prvo; `novo` = ima stavki posle poslednjeg otvaranja zvona (na bilo kom uređaju). */
export interface Zvono {
  novo: boolean;
  stavke: StavkaZvona[];
}
