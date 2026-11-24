// Upis strana na server jedan po jedan (plan crtanja, "Upis"): dok jedan `PUT` traje, za svaku stranu čeka samo njen
// najnoviji sadržaj (stari se ne šalju); neuspeh se ponavlja posle pauze (kao `PoteziCrteza`), a dok upis ne uspe,
// `nesacuvano` drži mali znak u konzoli.
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ElementCrteza, KljucStrane, kljucNiz } from './crtanje.models';

/** Pauza pre ponovnog pokušaja posle greške mreže ili servera. */
export const PONOVI_UPIS_MS = 3000;

export type Upisi = (kljuc: KljucStrane, elementi: readonly ElementCrteza[]) => Observable<{ verzija: number }>;

/** 400 (neispravno), 404 (slajd ili izvođenje), 410 (izvođenje završeno): ponavljanje ne pomaže. */
function konacnaGreska(e: unknown): boolean {
  return e instanceof HttpErrorResponse && (e.status === 400 || e.status === 404 || e.status === 410);
}

interface Zahtev { kljuc: KljucStrane; elementi: readonly ElementCrteza[]; }

export class UpisStrana {
  /** Neki upis nije uspeo, a novi upis iste strane još nije prošao. */
  readonly nesacuvano = signal(false);
  private readonly ceka = new Map<string, Zahtev>();
  private readonly neuspele = new Set<string>();
  private uToku: (Zahtev & { k: string }) | null = null;
  private pauza: ReturnType<typeof setTimeout> | undefined;
  private zatvoren = false;

  constructor(
    private readonly upisi: Upisi,
    private readonly uspeh: (kljuc: string, verzija: number) => void,
    private readonly pauzaMs = PONOVI_UPIS_MS,
  ) {}

  /** Nov sadržaj strane: zamenjuje sadržaj koji za nju još čeka. */
  posalji(kljuc: KljucStrane, elementi: readonly ElementCrteza[]): void {
    const k = kljucNiz(kljuc);
    this.ceka.delete(k);
    this.ceka.set(k, { kljuc, elementi });
    this.dalje();
  }

  /** Strana ima upis koji čeka ili je na putu (tada se verzija sa servera ne preuzima: važi ono što konzola šalje). */
  imaUpis(k: string): boolean {
    return this.ceka.has(k) || this.uToku?.k === k;
  }

  /** Konzola se zatvara: ono što čeka se još šalje, ali posle greške nema novog pokušaja. */
  unisti(): void {
    this.zatvoren = true;
  }

  private dalje(): void {
    if (this.uToku || this.pauza !== undefined) return;
    const prvi = this.ceka.entries().next();
    if (prvi.done) return;
    const [k, z] = prvi.value;
    this.ceka.delete(k);
    this.uToku = { ...z, k };
    this.upisi(z.kljuc, z.elementi).subscribe({
      next: (o) => {
        this.uToku = null;
        this.neuspele.delete(k);
        this.nesacuvano.set(this.neuspele.size > 0);
        this.uspeh(k, o.verzija);
        this.dalje();
      },
      error: (e: unknown) => {
        this.uToku = null;
        this.neuspele.add(k);
        this.nesacuvano.set(true);
        if (konacnaGreska(e) || this.zatvoren) {
          console.warn('Crtež nije sačuvan.', e);
          this.dalje();
          return;
        }
        // novi sadržaj iste strane ima prednost; inače se ponavlja ovaj
        if (!this.ceka.has(k)) this.ceka.set(k, z);
        this.pauza = setTimeout(() => {
          this.pauza = undefined;
          this.dalje();
        }, this.pauzaMs);
      },
    });
  }
}
