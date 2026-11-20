import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { FajlPrezentacijeInfo, MAX_FAJL_BAJTOVA, PRIHVACENI_FAJLOVI, velicinaFajla } from '../../../shared/util/fajlovi';
import { FajloviPrezentacijeApi } from './fajlovi-prezentacije.api';
import { razlogGreske } from './razlog-greske';

export interface FajloviEditorState {
  prezentacijaId: number | null;
  fajlovi: FajlPrezentacijeInfo[];
  ucitano: boolean;
  /** Traje otpremanje ili izmena (dugmad su onemogućena, jedan zahtev odjednom). */
  radi: boolean;
  /** Poruka kad lista nije stigla (prikaz u panelu); greške izmena idu kroz red poruka. */
  greska: string | null;
}

const POCETNO: FajloviEditorState = { prezentacijaId: null, fajlovi: [], ucitano: false, radi: false, greska: null };

/** Najviše fajlova po prezentaciji (server vraća 409 iznad ovoga). */
export const MAX_FAJLOVA = 30;

const EKSTENZIJE = PRIHVACENI_FAJLOVI.split(',');

/** Provera pre slanja: ekstenzija iz liste i najviše 10 MB; `null` kad je u redu. */
export function greskaFajla(fajl: Pick<File, 'name' | 'size'>): string | null {
  const ime = fajl.name.toLowerCase();
  if (!EKSTENZIJE.some(e => ime.endsWith(e))) return 'Dozvoljeni su Word, Excel, PowerPoint, PDF i ZIP fajlovi.';
  if (fajl.size <= 0) return 'Fajl je prazan.';
  if (fajl.size > MAX_FAJL_BAJTOVA) return `Fajl je prevelik (${velicinaFajla(fajl.size)}). Najviše je 10 MB.`;
  return null;
}

/**
 * Fajlovi prezentacije u editoru (spec 2026-11-20, odeljak 6). Provide-uje ga stranica editora, pa panel i lista slajdova
 * dele isto stanje. Svaka izmena vraća sa servera ono što je sačuvano; greške idu u red poruka.
 */
export const FajloviEditorStore = signalStore(
  withState(POCETNO),
  withComputed(s => ({
    /** Broj fajlova po slajdu (`slajdId`); fajlovi uz celu prezentaciju nisu ovde. */
    poSlajdu: computed(() => {
      const m = new Map<number, number>();
      for (const f of s.fajlovi()) if (f.slajdId !== null) m.set(f.slajdId, (m.get(f.slajdId) ?? 0) + 1);
      return m;
    }),
    punoFajlova: computed(() => s.fajlovi().length >= MAX_FAJLOVA),
  })),
  withMethods((store, api = inject(FajloviPrezentacijeApi), poruke = inject(NotificationStore)) => {
    const izvrsi = <T>(zahtev: Observable<T>, uspeh: (t: T) => void, poruka: string): void => {
      if (store.radi()) return;
      patchState(store, { radi: true });
      zahtev.subscribe({
        next: t => { patchState(store, { radi: false }); uspeh(t); },
        error: e => { patchState(store, { radi: false }); poruke.greska(razlogGreske(e, poruka)); },
      });
    };
    const postavi = (fajlovi: FajlPrezentacijeInfo[]) => patchState(store, { fajlovi });
    return {
      /** Učitaj (ponovo) spisak; promena slajdova na serveru (brisanje slajda) menja `slajdId`, pa je ovo i "osveži". */
      ucitaj(prezentacijaId: number | null = store.prezentacijaId()): void {
        if (prezentacijaId === null) return;
        if (prezentacijaId !== store.prezentacijaId()) patchState(store, { ...POCETNO, prezentacijaId });
        api.lista(prezentacijaId).subscribe({
          next: fajlovi => patchState(store, { fajlovi, ucitano: true, greska: null }),
          error: e => patchState(store, { ucitano: true, greska: razlogGreske(e, 'Fajlovi nisu učitani.') }),
        });
      },
      dodaj(fajl: File, slajdId: number | null): void {
        const id = store.prezentacijaId();
        if (id === null) return;
        const greska = greskaFajla(fajl);
        if (greska) { poruke.greska(greska); return; }
        if (store.punoFajlova()) { poruke.greska(`Prezentacija već ima ${MAX_FAJLOVA} fajlova.`); return; }
        izvrsi(api.dodaj(id, fajl, slajdId), f => {
          postavi([...store.fajlovi(), f]);
          poruke.uspeh(`Fajl „${f.naziv}“ je dodat.`);
        }, 'Fajl nije dodat.');
      },
      izmeni(fajl: FajlPrezentacijeInfo, naziv: string, slajdId: number | null): void {
        const n = naziv.trim();
        if (!n || n.length > 200) { poruke.greska('Naziv fajla ima 1 do 200 znakova.'); return; }
        if (n === fajl.naziv && slajdId === fajl.slajdId) return;
        izvrsi(api.izmeni(fajl.id, { naziv: n, slajdId }), f => postavi(store.fajlovi().map(x => (x.id === f.id ? f : x))),
          'Izmena fajla nije sačuvana.');
      },
      /** `smer` -1 = gore, +1 = dole; šalje ceo novi redosled. */
      pomeri(id: number, smer: -1 | 1): void {
        const pid = store.prezentacijaId();
        const ids = store.fajlovi().map(f => f.id);
        const i = ids.indexOf(id);
        const j = i + smer;
        if (pid === null || i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        izvrsi(api.redosled(pid, ids), postavi, 'Redosled nije sačuvan.');
      },
      obrisi(id: number): void {
        izvrsi(api.obrisi(id), () => postavi(store.fajlovi().filter(f => f.id !== id)), 'Fajl nije obrisan.');
      },
    };
  }),
);
export type FajloviEditorStore = InstanceType<typeof FajloviEditorStore>;
