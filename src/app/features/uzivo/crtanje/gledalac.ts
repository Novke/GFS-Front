// Crtež u prozoru publike (izvođenje ili tabla predavanja): izvor istine je kanal dok stiže puls konzole istog
// pregledača (poslednjih 5 s), a bez pulsa server (plan crtanja, "Kanal između prozora").
import { computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ElementCrteza, KljucStrane, StanjeAlata, StranaCrteza, kljucNiz } from './crtanje.models';
import { istiKljuc, PrikazCrteza } from './crtac';
import { KanalCrtanja, PULS_ISTEKAO_MS, PorukaCrtanja } from './kanal-crtanja';

/** Strana sa servera; `posle` = poznata verzija (tabla: `null` kad se nije menjala, 204). */
export interface IzvorGledanja {
  ucitaj(k: KljucStrane, posle: number): Observable<StranaCrteza | null>;
}

const PRAZNO: readonly ElementCrteza[] = [];

/**
 * - Kanal (`puls`, `strana`, `uToku`, `alati`): dok je živ, crtež se uzima samo odatle, pa nema vraćanja unazad dok je
 *   `PUT` konzole na putu. Nova strana bez poruke za nju -> `trazi`.
 * - Bez pulsa: `postavi` (snimak: ključ ili verzija strane) traži stranu sa servera kad je verzija veća od poznate;
 *   `osvezi` (povezivanje, povratak iz sna, tabla na 3 s) traži uvek. Odgovor sa manjom verzijom od poznate se odbacuje,
 *   a odgovor koji stigne pošto je puls ponovo tu, takođe.
 */
export class Gledalac {
  private readonly _kljuc = signal<KljucStrane | null>(null);
  readonly kljuc = this._kljuc.asReadonly();
  private readonly strane = signal<ReadonlyMap<string, { elementi: readonly ElementCrteza[]; verzija: number }>>(new Map());
  private readonly _uToku = signal<{ kljuc: string; element: ElementCrteza } | null>(null);
  private readonly _alati = signal<StanjeAlata | null>(null);
  /** Puls konzole u poslednjih 5 s. */
  readonly kanalZiv = signal(false);

  private readonly trenutna = computed(() => {
    const k = this._kljuc();
    return k ? this.strane().get(kljucNiz(k)) ?? null : null;
  });
  readonly elementi = computed(() => this.trenutna()?.elementi ?? PRAZNO);
  readonly uToku = computed(() => {
    const u = this._uToku();
    const k = this._kljuc();
    return u && k && u.kljuc === kljucNiz(k) && this.kanalZiv() ? u.element : null;
  });
  readonly prikaz = computed<PrikazCrteza | null>(() => {
    const k = this._kljuc();
    const s = this.trenutna();
    return k && s ? { kljuc: k, elementi: s.elementi, uToku: this.uToku() } : null;
  });
  /** Traka alata na projektoru: samo dok konzola crta i nastavnik je uključio „oko”. */
  readonly alati = computed(() => {
    const a = this._alati();
    return this.kanalZiv() && a?.ukljuceno && a.publikaVidi ? a : null;
  });

  private readonly kanal: KanalCrtanja;
  private serverVerzija = 0;
  private zahtev: Subscription | null = null;
  private istek: ReturnType<typeof setTimeout> | undefined;
  private zatvoren = false;

  constructor(private readonly izvor: IzvorGledanja, imeKanala: string) {
    this.kanal = new KanalCrtanja(imeKanala);
    this.kanal.naPoruku(p => this.poruka(p));
    this.kanal.posalji({ tip: 'trazi' });
  }

  /** Trenutna strana iz snimka nastavnika i njena verzija na serveru. */
  postavi(kljuc: KljucStrane | null, verzija: number): void {
    const promena = !istiKljuc(kljuc, this._kljuc());
    if (promena) this._kljuc.set(kljuc);
    this.serverVerzija = verzija;
    if (!kljuc) return;
    if (this.kanalZiv()) {
      if (promena && !this.strane().has(kljucNiz(kljuc))) this.kanal.posalji({ tip: 'trazi' });
      return;
    }
    this.saServera(false);
  }

  /** Povezivanje, povratak iz sna, tabla na 3 s: strana sa servera (samo kad kanal ne radi). */
  osvezi(): void {
    if (!this.kanalZiv()) this.saServera(true);
  }

  unisti(): void {
    this.zatvoren = true;
    clearTimeout(this.istek);
    this.zahtev?.unsubscribe();
    this.kanal.zatvori();
  }

  private poruka(p: PorukaCrtanja): void {
    if (this.zatvoren || p.tip === 'trazi') return;
    this.ziv();
    switch (p.tip) {
      case 'strana':
        this.strane.update(m => new Map(m).set(p.kljuc, { elementi: p.elementi, verzija: p.verzija }));
        break;
      case 'uToku':
        this._uToku.set(p.element ? { kljuc: p.kljuc, element: p.element } : null);
        break;
      case 'alati':
        this._alati.set({ ukljuceno: p.ukljuceno, alat: p.alat, boja: p.boja, publikaVidi: p.publikaVidi });
        break;
    }
  }

  private ziv(): void {
    if (!this.kanalZiv()) {
      this.kanalZiv.set(true);
      this.zahtev?.unsubscribe();
    }
    clearTimeout(this.istek);
    this.istek = setTimeout(() => {
      this.kanalZiv.set(false);
      this._uToku.set(null);
      this.saServera(false);
    }, PULS_ISTEKAO_MS);
  }

  private saServera(uvek: boolean): void {
    const kljuc = this._kljuc();
    if (!kljuc || this.zatvoren) return;
    const k = kljucNiz(kljuc);
    const poznata = this.strane().get(k);
    if (!uvek) {
      if (poznata && this.serverVerzija <= poznata.verzija) return;
      if (!poznata && this.serverVerzija === 0) {
        // strana još ne postoji: nema šta da se traži
        this.strane.update(m => new Map(m).set(k, { elementi: PRAZNO, verzija: 0 }));
        return;
      }
    }
    this.zahtev?.unsubscribe();
    this.zahtev = this.izvor.ucitaj(kljuc, poznata?.verzija ?? -1).subscribe({
      next: r => {
        if (!r || this.kanalZiv()) return;
        const sada = this.strane().get(k);
        if (sada && r.verzija < sada.verzija) return;
        this.strane.update(m => new Map(m).set(k, { elementi: r.elementi, verzija: r.verzija }));
      },
      // tiho: sledeći snimak, povezivanje ili povratak pokušavaju ponovo
      error: (e: unknown) => console.warn('Crtež nije učitan.', e),
    });
  }
}
