// Otvaranje dijaloga formule iz editora (F16): traka ("Formula"), koren editora (dvoklik i Enter na FORMULA sloju) i
// panel ("Uredi formulu"). Dijalog i MathLive su u lenjim chunk-ovima: ovde je samo dinamički `import()` (i `import
// type`, koji se briše pri prevođenju), pa editor ne nosi ništa od njih. Store ne zna za dijaloge: otvara komponenta.
import { DestroyRef, Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { NotificationStore } from '../../../../core/state/notification.store';
import { novaFormula } from '../../data-access/platno-novo';
import type { FormulaSloj, Tema } from '../../data-access/platno.models';
import { izmeniSlojeve, slobodnoMesto } from '../komande';
import { PlatnoEditorStore } from '../platno-editor.store';
import { type FormulaUnos, primeniFormulu, unosFormule } from './formula-pravila';
import type { FormulaPodaci, OtvorenaFormula } from './formula.dialog';

export const PORUKA_DIJALOG_NIJE_UCITAN = 'Dijalog formule nije učitan. Osveži stranicu i pokušaj ponovo.';
export const PORUKA_FORMULA_ODBACENA = 'Izmena formule nije sačuvana: slajd je zatvoren.';

/**
 * Editori (njihov `PlatnoEditorStore`) u kojima se dijalog formule upravo otvara ili je otvoren. Jedan čuvar za sve tri
 * komponente istog editora (traka, koren, panel): dok se lenji chunk dijaloga još učitava (pre modala), Enter na
 * formuli ili "Formula" iz trake ne sme da otvori drugi dijalog.
 */
const otvoreni = new WeakSet<object>();

@Injectable({ providedIn: 'root' })
export class FormulaOtvarac {
  /**
   * Dinamički import dijaloga; odbijen `import()` (npr. stari chunk posle novog izdanja) je odbijen `Promise`. Kad `ziv`
   * posle učitavanja vrati false (editor je u međuvremenu uništen), dijalog se ne otvara (null).
   */
  async otvori(dialog: MatDialog, podaci: FormulaPodaci, ziv: () => boolean = () => true): Promise<OtvorenaFormula | null> {
    const { otvoriFormulu } = await import('./formula.dialog');
    return ziv() ? otvoriFormulu(dialog, podaci) : null;
  }
}

/**
 * Formula u editoru za komponentu koja otvara dijalog (zove se u injekcionom kontekstu komponente, uz njen
 * `PlatnoEditorStore`). Jedan dijalog odjednom po editoru (zajednički čuvar `otvoreni`). Kad komponenta nestane dok je
 * dijalog otvoren (npr. promena slajda), dijalog se zatvara, uz poruku ako je u njemu bilo izmena; dok se lenji chunk još
 * učitava, ni ne otvara. Ništa se ne upisuje u slajd koji se više ne uređuje. Svaka izmena je jedan korak (`primeniFormulu`).
 */
export function formulaEditora() {
  const otvarac = inject(FormulaOtvarac);
  const dialog = inject(MatDialog);
  const store = inject(PlatnoEditorStore);
  const obavestenja = inject(NotificationStore);
  let ziv = true;
  /** Dijalog koji je ova komponenta otvorila: zatvara se kad ona nestane (npr. promena slajda), ne ostaje nad praznim. */
  let otvoren: OtvorenaFormula | null = null;
  inject(DestroyRef).onDestroy(() => {
    ziv = false;
    if (otvoren?.zatvori()) obavestenja.greska(PORUKA_FORMULA_ODBACENA);
    otvoren = null;
  });

  /** Ishod dijaloga; `undefined` za Otkaži, neuspelo učitavanje (poruka), drugi dijalog u toku ili uništenu komponentu. */
  async function unos(podaci: FormulaPodaci): Promise<FormulaUnos | undefined> {
    if (otvoreni.has(store)) return undefined;
    otvoreni.add(store);
    try {
      otvoren = await otvarac.otvori(dialog, podaci, () => ziv);
      if (!otvoren) return undefined;
      const u = await firstValueFrom(otvoren.ishod, { defaultValue: undefined });
      return ziv ? u : undefined;
    } catch {
      if (ziv) obavestenja.greska(PORUKA_DIJALOG_NIJE_UCITAN);
      return undefined;
    } finally {
      otvoren = null;
      otvoreni.delete(store);
    }
  }

  return {
    /**
     * Nova formula (traka): prazan dijalog iz teme, pa sloj na slobodnom mestu. `sacuvano` false = Otkaži (ili dijalog
     * nije učitan); `id` null uz `sacuvano` = ubacivanje odbijeno (granica, poruka iz store-a).
     */
    async ubaci(tema: Tema): Promise<{ sacuvano: boolean; id: string | null }> {
      const pocetak = unosFormule(novaFormula('s0', tema, ''));
      const u = await unos({ pocetak, tema, izSlike: false });
      if (!u) return { sacuvano: false, id: null };
      const id = store.ubaci((novi, p) => {
        const f = primeniFormulu(novaFormula(novi, tema, u.latex), u);
        return { ...f, ...slobodnoMesto(p, f.sirina, f.visina) };
      });
      return { sacuvano: true, id };
    },
    /**
     * Postojeća formula (dvoklik, Enter, "Uredi formulu"): zaključana -> poruka bez dijaloga. "Sačuvaj" je jedan korak
     * (i bez izmene briše sliku izvora, spec 11); true kad je dokument promenjen.
     */
    async uredi(slojId: string, tema: Tema): Promise<boolean> {
      const s = store.platno().slojevi.find((x): x is FormulaSloj => x.id === slojId && x.tip === 'FORMULA');
      if (!s || store.gest() || store.rezim() !== 'UREDJIVANJE') return false;
      if (s.zakljucan) {
        obavestenja.greska('Sloj je zaključan.');
        return false;
      }
      const u = await unos({ pocetak: unosFormule(s), tema, izSlike: s.slikaIzvora !== null });
      if (!u) return false;
      return store.primeni((p) => izmeniSlojeve(p, new Set([slojId]), (x) => (x.tip === 'FORMULA' ? primeniFormulu(x, u) : x)));
    },
    /** Izmena iz panela (boja, veličina, poravnanje): kroz `primeniFormulu`, pa i ona briše sliku izvora. */
    primeni(slojId: string, f: (s: FormulaSloj) => FormulaUnos, kljuc?: string): boolean {
      if (store.zakljucanUIzboru()) return false;
      return store.primeni((p) => izmeniSlojeve(p, new Set([slojId]), (x) => (x.tip === 'FORMULA' ? primeniFormulu(x, f(x)) : x)), kljuc);
    },
  };
}

export type FormulaEditora = ReturnType<typeof formulaEditora>;
