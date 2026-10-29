/**
 * Prozori istog pregledača javljaju jedni drugima da je konzola posle kraja pokrenula novo izvođenje (završni ekran,
 * "Pokreni"): prozor publike na projektoru sam prelazi na novo, pa ga nastavnik ne otvara i ne prevlači ponovo
 * (navigacija u istom dokumentu ne izlazi iz celog ekrana). Bez `BroadcastChannel` (stari pregledač) ništa se ne dešava.
 */
export const KANAL_IZVODJENJA = 'gfs-uzivo-izvodjenje';

export interface NovoIzvodjenje {
  tip: 'novo-izvodjenje';
  staro: number;
  novo: number;
}

export function javiNovoIzvodjenje(staro: number, novo: number): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const kanal = new BroadcastChannel(KANAL_IZVODJENJA);
  kanal.postMessage({ tip: 'novo-izvodjenje', staro, novo } satisfies NovoIzvodjenje);
  kanal.close();
}

/** Prati poruke; vraća funkciju za odjavu. */
export function pratiNovoIzvodjenje(naPoruku: (p: NovoIzvodjenje) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const kanal = new BroadcastChannel(KANAL_IZVODJENJA);
  kanal.onmessage = (e: MessageEvent) => {
    const p = e.data as Partial<NovoIzvodjenje> | null;
    if (p?.tip === 'novo-izvodjenje' && Number.isInteger(p.staro) && Number.isInteger(p.novo) && (p.novo as number) > 0) {
      naPoruku(p as NovoIzvodjenje);
    }
  };
  return () => kanal.close();
}
