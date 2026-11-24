/**
 * Brza anketa na strani studenta (spec brze ankete 5, "Student"): isti skup iz `GET public/nalog/cas` (polje `ankete`) i
 * `GET public/nalog/ankete`. Ko je za šta glasao student ne vidi, samo svoj glas (`mojGlas`) i, kad ga nastavnik pokaže,
 * zbir (`rezultat`).
 */
export interface RezultatAnketeStudentu {
  /** Broj glasova po odgovoru, istim redom kao `opcije`. */
  glasovi: number[];
  brojGlasalo: number;
}

export interface AnketaStudentu {
  id: number;
  pitanje: string;
  opcije: string[];
  viseOdgovora: boolean;
  publika: 'NA_CASU' | 'GRUPA';
  /** Rok, epoch ms (`null` = na času bez roka: dok je nastavnik ne zatvori ili se predavanje ne završi). */
  rokMs: number | null;
  otvorena: boolean;
  /** Indeksi izabranih odgovora; `null` dok student nije glasao. */
  mojGlas: number[] | null;
  /** Samo kad je nastavnik pokazao rezultat. */
  rezultat: RezultatAnketeStudentu | null;
  sadaMs: number;
}
