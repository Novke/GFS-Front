/**
 * Naredni časovi studenta i najava odsustva (`api/public/nalog/casovi*`, spec najave odsustva, odeljak 4). Odgovor nikad
 * ne nosi broj najava ni tuđa imena; vremena su `HH:mm:ss`, datum `yyyy-MM-dd`.
 */
export interface StudentskiTermin {
  stavkaId: number;
  datum: string;
  pocetak: string;
  kraj: string;
  predmet: string;
  grupa: string;
  /** `false` za čas grupe koju student sluša kao starija generacija. */
  svojaGrupa: boolean;
  otkazan: boolean;
  napomena?: string | null;
  najavljeno: boolean;
  razlog?: string | null;
}

export interface NaredniCasovi {
  termini: StudentskiTermin[];
}

/** `POST najavi` / `POST povuci`; `razlog` (do 200 znakova) samo uz najavu. Student je uvek iz kolačića. */
export interface NajavaCmd {
  stavkaId: number;
  datum: string;
  razlog?: string | null;
}

/** Najviše znakova razloga (isto kao server). */
export const MAX_RAZLOG = 200;

/** Ključ termina u listi (stavka i datum). */
export const kljucTermina = (t: Pick<StudentskiTermin, 'stavkaId' | 'datum'>) => `${t.stavkaId}:${t.datum}`;
