import { computed, DOCUMENT, effect, inject, signal } from '@angular/core';
import { Params } from '@angular/router';
import { patchState, signalStore, watchState, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

/** Izbor korisnika; `sistem` prati `prefers-color-scheme`. */
export type Rezim = 'sistem' | 'dan' | 'noc';
export type EfektivniRezim = 'dan' | 'noc';

export type NedavnoTip = 'predavanje' | 'test' | 'domaci' | 'grupa' | 'student' | 'predmet';

export interface NedavnoStavka {
  tip: NedavnoTip;
  id: number;
  naslov: string;
  url: string;
}

/** Oblik u localStorage (`gfs.prefs.v1`). */
export interface PreferencesState {
  rezim: Rezim;
  filteri: Record<string, Params>;
  nedavno: NedavnoStavka[];
}

/** Stanje store-a: filteri su privatni (`_filteri`), a čitaju se metodom `filteri(kljuc)`. */
interface PreferencesStoreState {
  rezim: Rezim;
  _filteri: Record<string, Params>;
  nedavno: NedavnoStavka[];
}

/**
 * Ključ u localStorage; verzija u imenu, pa se nekompatibilan oblik uvodi novim ključem.
 * Isti ključ čita inline skripta u `index.html` (režim pre prvog renderovanja, bez treptanja).
 */
export const PREFS_KLJUC = 'gfs.prefs.v1';
export const MAX_NEDAVNO = 8;

const REZIMI: readonly Rezim[] = ['sistem', 'dan', 'noc'];
const NEDAVNO_TIPOVI: readonly NedavnoTip[] = ['predavanje', 'test', 'domaci', 'grupa', 'student', 'predmet'];
const TAMNA_SEMA = '(prefers-color-scheme: dark)';

const podrazumevano = (): PreferencesState => ({ rezim: 'sistem', filteri: {}, nedavno: [] });

function jeObjekat(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function jeNedavnoStavka(v: unknown): v is NedavnoStavka {
  return jeObjekat(v)
    && NEDAVNO_TIPOVI.includes(v['tip'] as NedavnoTip)
    && typeof v['id'] === 'number'
    && typeof v['naslov'] === 'string'
    && typeof v['url'] === 'string';
}

/** Čita sačuvano stanje; svako polje koje nije ispravno pada na podrazumevanu vrednost, ništa ne baca. */
export function ucitajPreference(storage: Storage | null): PreferencesState {
  const stanje = podrazumevano();
  let sirovo: unknown;
  try {
    const tekst = storage?.getItem(PREFS_KLJUC);
    sirovo = tekst ? JSON.parse(tekst) : null;
  } catch {
    return stanje;
  }
  if (!jeObjekat(sirovo)) {
    return stanje;
  }
  if (REZIMI.includes(sirovo['rezim'] as Rezim)) {
    stanje.rezim = sirovo['rezim'] as Rezim;
  }
  const filteri = sirovo['filteri'];
  if (jeObjekat(filteri)) {
    stanje.filteri = Object.fromEntries(Object.entries(filteri).filter(([, v]) => jeObjekat(v))) as Record<string, Params>;
  }
  const nedavno = sirovo['nedavno'];
  if (Array.isArray(nedavno)) {
    stanje.nedavno = nedavno.filter(jeNedavnoStavka).slice(0, MAX_NEDAVNO);
  }
  return stanje;
}

function bezbedanStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // pristup localStorage-u može da baci (zabranjeni kolačići)
  }
}

/**
 * Korisničke postavke: režim dan/noć, zapamćeni filteri po listi i nedavno otvorene stavke.
 * Stanje se čuva u localStorage (`gfs.prefs.v1`), a efektivni režim se primenjuje na `<html>`
 * kao `data-mode` + `color-scheme` (tokeni u `src/styles/_tokens.scss` i M3 tema prate ga).
 */
export const PreferencesStore = signalStore(
  { providedIn: 'root' },
  withState<PreferencesStoreState>(() => {
    const { rezim, filteri, nedavno } = ucitajPreference(bezbedanStorage());
    return { rezim, _filteri: filteri, nedavno };
  }),
  withProps(() => {
    const mql = typeof matchMedia === 'function' ? matchMedia(TAMNA_SEMA) : null;
    const sistemTaman = signal(mql?.matches ?? false);
    const naPromenu = (e: { matches: boolean }) => sistemTaman.set(e.matches);
    return {
      _document: inject(DOCUMENT),
      _storage: bezbedanStorage(),
      _mql: mql,
      _naPromenuSistema: naPromenu,
      _sistemTaman: sistemTaman.asReadonly(),
    };
  }),
  withComputed(store => ({
    efektivniRezim: computed<EfektivniRezim>(() => {
      const rezim = store.rezim();
      if (rezim !== 'sistem') {
        return rezim;
      }
      return store._sistemTaman() ? 'noc' : 'dan';
    }),
  })),
  withMethods(store => ({
    postaviRezim(rezim: Rezim): void {
      patchState(store, { rezim });
    },
    sacuvajFiltere(kljuc: string, params: Params): void {
      patchState(store, s => ({ _filteri: { ...s._filteri, [kljuc]: { ...params } } }));
    },
    filteri(kljuc: string): Params | null {
      const svi = store._filteri();
      return Object.hasOwn(svi, kljuc) ? svi[kljuc] : null;
    },
    zabeleziNedavno(stavka: NedavnoStavka): void {
      patchState(store, s => ({
        nedavno: [stavka, ...s.nedavno.filter(n => n.tip !== stavka.tip || n.id !== stavka.id)].slice(0, MAX_NEDAVNO),
      }));
    },
  })),
  withHooks({
    onInit(store) {
      store._mql?.addEventListener('change', store._naPromenuSistema);

      watchState(store, ({ rezim, _filteri, nedavno }) => {
        const zaUpis: PreferencesState = { rezim, filteri: _filteri, nedavno };
        try {
          store._storage?.setItem(PREFS_KLJUC, JSON.stringify(zaUpis));
        } catch {
          // pun ili zabranjen localStorage: postavke važe do zatvaranja taba
        }
      });

      effect(() => {
        const mod = store.efektivniRezim();
        const html = store._document.documentElement;
        html.dataset['mode'] = mod;
        html.style.colorScheme = mod === 'noc' ? 'dark' : 'light';
      });
    },
    onDestroy(store) {
      store._mql?.removeEventListener('change', store._naPromenuSistema);
    },
  }),
);
