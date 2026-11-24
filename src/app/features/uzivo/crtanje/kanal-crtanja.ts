// Kanal između prozora istog pregledača (konzola -> publika), plan crtanja: `BroadcastChannel('gfs-crtanje-<id>')`,
// za tablu predavanja `('gfs-tabla-<id>')`. Server ne vidi ove poruke; crtež ide na server posebno (`UpisStrana`).
import { ElementCrteza, StanjeAlata } from './crtanje.models';

export type PorukaCrtanja =
  /** Konzola je živa (svake 2 s). */
  | { tip: 'puls' }
  /** Konzola: cela strana posle izmene (i na `trazi`), sa verzijom poslednjeg potvrđenog upisa. */
  | { tip: 'strana'; kljuc: string; elementi: readonly ElementCrteza[]; verzija: number }
  /** Konzola: element u nastajanju (najviše jednom po kadru), `null` kad je gotov ili otkazan. */
  | { tip: 'uToku'; kljuc: string; element: ElementCrteza | null }
  /** Publika: daj trenutnu stranu i alate. */
  | { tip: 'trazi' }
  /** Konzola: da li crta, alat i boja, da li publika vidi alate. */
  | ({ tip: 'alati' } & StanjeAlata);

export const PULS_MS = 2000;
/** Publika koja ovoliko nije videla puls uzima crtež sa servera. */
export const PULS_ISTEKAO_MS = 5000;

export const kanalIzvodjenja = (id: number): string => `gfs-crtanje-${id}`;
export const kanalTable = (predavanjeId: number): string => `gfs-tabla-${predavanjeId}`;

/** `BroadcastChannel` uz proveru da postoji (stari pregledač, SSR, testovi bez kanala: ništa se ne šalje). */
export class KanalCrtanja {
  private readonly kanal: BroadcastChannel | null;

  constructor(ime: string) {
    this.kanal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(ime);
  }

  posalji(p: PorukaCrtanja): void {
    try {
      this.kanal?.postMessage(p);
    } catch {
      // zatvoren kanal ili podatak koji ne može da se klonira: crtež i dalje ide na server
    }
  }

  naPoruku(cb: (p: PorukaCrtanja) => void): void {
    this.kanal?.addEventListener('message', (e: MessageEvent) => {
      const p = e.data as PorukaCrtanja | null;
      if (p && typeof p === 'object' && typeof p.tip === 'string') cb(p);
    });
  }

  zatvori(): void {
    this.kanal?.close();
  }
}
