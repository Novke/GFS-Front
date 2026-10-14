// Lažni otvoren dijalog formule za specove editora (traka, koren, panel): ishod i `zatvori` bez pravog MatDialog-a.
import type { Observable } from 'rxjs';
import type { FormulaUnos } from './formula-pravila';
import type { OtvorenaFormula } from './formula.dialog';

/** `zatvori` beleži poziv u `zatvoren` i vraća `izmenjeno` (da li je u dijalogu bilo izmena). */
export function otvorena(ishod: Observable<FormulaUnos | undefined>, izmenjeno = false): OtvorenaFormula & { zatvoren: number } {
  const o = {
    ishod,
    zatvoren: 0,
    zatvori: () => {
      o.zatvoren++;
      return izmenjeno;
    },
  };
  return o;
}
