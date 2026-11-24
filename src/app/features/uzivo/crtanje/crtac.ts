// Crtanje u konzoli (i na tabli predavanja): strane u memoriji sa istorijom, upis na server jedan po jedan i kanal ka
// publici u istom pregledaču (puls, strana, element u nastajanju, alati). Obična klasa sa signalima (bez DI): stranica je
// pravi kad zna id, a `unisti()` je zove na kraju.
import { Signal, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ElementCrteza, KljucStrane, POCETNA_BOJA, POCETNA_DEBLJINA, StanjeAlata, StranaCrteza, TipElementa, kljucNiz,
} from './crtanje.models';
import { gotovElement, normalizuj, staje } from './geometrija';
import { Istorija, dodaj, novaIstorija, obrisiSve, ponisti, vrati } from './istorija';
import { KanalCrtanja, PULS_MS } from './kanal-crtanja';
import { UpisStrana, Upisi } from './upis-strana';

/** Odakle konzola čita i gde upisuje strane (izvođenje ili tabla predavanja). */
export interface IzvorCrteza {
  ucitaj(k: KljucStrane): Observable<StranaCrteza>;
  upisi: Upisi;
}

/** Posle greške učitavanja strana se traži ponovo posle ovoliko (dok je još trenutna). */
export const PONOVI_UCITAVANJE_MS = 2000;

/** Šta scena crta: elementi strane i element u nastajanju. */
export interface PrikazCrteza { kljuc: KljucStrane; elementi: readonly ElementCrteza[]; uToku: ElementCrteza | null; }

interface Strana { istorija: Istorija; verzija: number; }

const PRAZNO: readonly ElementCrteza[] = [];

export const istiKljuc = (a: KljucStrane | null, b: KljucStrane | null): boolean =>
  a === b || (!!a && !!b && a.slajdId === b.slajdId && a.pozadina === b.pozadina);

const kadar: (cb: () => void) => unknown =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16);

/**
 * Konzola (ili tabla) koja crta:
 * - `postavi(kljuc, verzija)` iz snimka (`NastavnickoStanje.crtez`): nova strana se jednom učitava sa servera; dok ne
 *   stigne, ne crta se (`spremno`). Veća verzija u snimku od poznate, bez upisa ove konzole na putu, znači da je crtala druga
 *   konzola (telefon): strana se učitava ponovo (istorija se tada briše).
 * - izmena (`dodaj`, `ponisti`, `vrati`, `obrisiSve`, `dodajRanije`): nova istorija strane, `PUT` cele strane kroz
 *   `UpisStrana` i cela strana na kanal. Strana preko granica servera (2000 elemenata, 1 MB) se ne menja (`puno`).
 * - kanal: puls svake 2 s, element u nastajanju najviše jednom po kadru, odgovor na `trazi`, alati posle promene.
 */
export class Crtac {
  private readonly _ukljuceno = signal(false);
  private readonly _alat = signal<TipElementa>('OLOVKA');
  private readonly _boja = signal(POCETNA_BOJA);
  private readonly _publikaVidi = signal(false);
  readonly ukljuceno = this._ukljuceno.asReadonly();
  readonly alat = this._alat.asReadonly();
  readonly boja = this._boja.asReadonly();
  readonly debljina = signal(POCETNA_DEBLJINA);
  readonly publikaVidiAlate = this._publikaVidi.asReadonly();

  private readonly _kljuc = signal<KljucStrane | null>(null);
  readonly kljuc = this._kljuc.asReadonly();
  private readonly _uToku = signal<ElementCrteza | null>(null);
  readonly uToku = this._uToku.asReadonly();
  private readonly strane = signal<ReadonlyMap<string, Strana>>(new Map());
  private readonly strana = computed(() => {
    const k = this._kljuc();
    return k ? this.strane().get(kljucNiz(k)) ?? null : null;
  });
  readonly elementi = computed(() => this.strana()?.istorija.elementi ?? PRAZNO);
  /** Trenutna strana je učitana: tek tada se crta. */
  readonly spremno = computed(() => !!this.strana());
  readonly mozePonisti = computed(() => !!this.strana()?.istorija.pre.length);
  readonly mozeVrati = computed(() => !!this.strana()?.istorija.posle.length);
  /** Poslednja izmena bi prešla granice servera (2000 elemenata ili 1 MB), pa nije primenjena. */
  readonly puno = signal(false);
  readonly nesacuvano: Signal<boolean>;
  /** Za scenu: trenutna strana sa elementom u nastajanju; `null` dok nema strane ili nije učitana. */
  readonly prikaz = computed<PrikazCrteza | null>(() => {
    const k = this._kljuc();
    const s = this.strana();
    return k && s ? { kljuc: k, elementi: s.istorija.elementi, uToku: this._uToku() } : null;
  });
  /** Alati kako ih vidi publika (scena konzole „Na projektoru” prikazuje isto). */
  readonly alatiZaPubliku = computed<StanjeAlata | null>(() =>
    this._ukljuceno() && this._publikaVidi() ? this.stanjeAlata() : null);

  private readonly kanal: KanalCrtanja;
  private readonly upis: UpisStrana;
  /** Broj izmena po strani: učitavanje koje je krenulo pre izmene se odbacuje. */
  private readonly izmene = new Map<string, number>();
  private readonly ucitava = new Set<string>();
  private readonly puls: ReturnType<typeof setInterval>;
  private kadarZakazan = false;
  private zatvoren = false;

  constructor(private readonly izvor: IzvorCrteza, imeKanala: string) {
    this.kanal = new KanalCrtanja(imeKanala);
    this.upis = new UpisStrana(izvor.upisi, (k, v) => this.upisano(k, v));
    this.nesacuvano = this.upis.nesacuvano.asReadonly();
    this.kanal.naPoruku(p => {
      if (p.tip === 'trazi') this.odgovori();
    });
    this.kanal.posalji({ tip: 'puls' });
    this.puls = setInterval(() => this.kanal.posalji({ tip: 'puls' }), PULS_MS);
  }

  /** Trenutna strana iz snimka (`null`: prijava, kraj, beli ekran bez slajda) i njena verzija na serveru. */
  postavi(kljuc: KljucStrane | null, verzija: number): void {
    const promena = !istiKljuc(kljuc, this._kljuc());
    if (promena) {
      this.otkazi();
      this._kljuc.set(kljuc);
      this.puno.set(false);
    }
    if (!kljuc) return;
    const k = kljucNiz(kljuc);
    const s = this.strane().get(k);
    if (!s) {
      this.ucitaj(kljuc);
    } else {
      if (verzija > s.verzija && !this.upis.imaUpis(k)) this.ucitaj(kljuc);
      if (promena) this.objaviStranu();
    }
  }

  ukljuci(da: boolean): void {
    if (this._ukljuceno() === da) return;
    if (!da) this.otkazi();
    this._ukljuceno.set(da);
    this.objaviAlate();
  }

  izaberiAlat(t: TipElementa): void {
    this._alat.set(t);
    this.objaviAlate();
  }

  izaberiBoju(hex: string): void {
    this._boja.set(hex);
    this.objaviAlate();
  }

  prebaciPublikaVidi(): void {
    this._publikaVidi.update(v => !v);
    this.objaviAlate();
  }

  /** Element u nastajanju (površina, na svaki pomeraj): scena ga crta odmah, a publici ide najviše jednom po kadru. */
  uTokuJe(e: ElementCrteza | null): void {
    this._uToku.set(e);
    if (this.kadarZakazan) return;
    this.kadarZakazan = true;
    kadar(() => {
      this.kadarZakazan = false;
      const k = this._kljuc();
      if (k && !this.zatvoren) this.kanal.posalji({ tip: 'uToku', kljuc: kljucNiz(k), element: this._uToku() });
    });
  }

  /** Otkazuje element u nastajanju (Esc, promena strane); `true` ako ga je bilo. */
  otkazi(): boolean {
    const bilo = this._uToku() !== null;
    if (bilo) this.uTokuJe(null);
    return bilo;
  }

  /** Gotov potez: normalizovan, bez premalih oblika, olovka duža od 5000 tačaka podeljena. */
  dodaj(e: ElementCrteza): void {
    this.uTokuJe(null);
    const novi = gotovElement(e);
    if (novi.length) this.izmeni(i => dodaj(i, novi));
  }

  /** Raniji crtež na trenutnu stranu, kao jedan korak. */
  dodajRanije(elementi: readonly ElementCrteza[]): void {
    this.izmeni(i => dodaj(i, elementi.map(normalizuj)));
  }

  ponisti(): void {
    this.izmeni(ponisti);
  }

  vrati(): void {
    this.izmeni(vrati);
  }

  obrisiSve(): void {
    this.izmeni(obrisiSve);
  }

  unisti(): void {
    if (this.zatvoren) return;
    this._ukljuceno.set(false);
    this.objaviAlate();
    this.zatvoren = true;
    clearInterval(this.puls);
    this.upis.unisti();
    this.kanal.zatvori();
  }

  private stanjeAlata(): StanjeAlata {
    return { ukljuceno: this._ukljuceno(), alat: this._alat(), boja: this._boja(), publikaVidi: this._publikaVidi() };
  }

  private izmeni(f: (i: Istorija) => Istorija): void {
    const kljuc = this._kljuc();
    if (!kljuc) return;
    const k = kljucNiz(kljuc);
    const s = this.strane().get(k);
    if (!s) return;
    const nova = f(s.istorija);
    if (nova === s.istorija) return;
    if (!staje(nova.elementi)) {
      this.puno.set(true);
      return;
    }
    this.puno.set(false);
    this.strane.update(m => new Map(m).set(k, { ...s, istorija: nova }));
    this.izmene.set(k, (this.izmene.get(k) ?? 0) + 1);
    this.upis.posalji(kljuc, nova.elementi);
    this.objaviStranu();
  }

  private ucitaj(kljuc: KljucStrane): void {
    const k = kljucNiz(kljuc);
    if (this.ucitava.has(k) || this.zatvoren) return;
    this.ucitava.add(k);
    const izmena = this.izmene.get(k) ?? 0;
    this.izvor.ucitaj(kljuc).subscribe({
      next: r => {
        this.ucitava.delete(k);
        if (this.zatvoren || (this.izmene.get(k) ?? 0) !== izmena || this.upis.imaUpis(k)) return;
        const s = this.strane().get(k);
        if (s && r.verzija <= s.verzija) return;
        // prvo učitavanje ili tuđa izmena: istorija počinje od strane sa servera
        this.strane.update(m => new Map(m).set(k, { istorija: novaIstorija(r.elementi), verzija: r.verzija }));
        if (istiKljuc(kljuc, this._kljuc())) this.objaviStranu();
      },
      error: (e: unknown) => {
        this.ucitava.delete(k);
        console.warn('Strana crteža nije učitana.', e);
        setTimeout(() => {
          if (!this.zatvoren && istiKljuc(kljuc, this._kljuc()) && !this.strane().has(k)) this.ucitaj(kljuc);
        }, PONOVI_UCITAVANJE_MS);
      },
    });
  }

  private upisano(k: string, verzija: number): void {
    const s = this.strane().get(k);
    if (!s || verzija <= s.verzija) return;
    this.strane.update(m => new Map(m).set(k, { ...s, verzija }));
    const t = this._kljuc();
    if (t && kljucNiz(t) === k) this.objaviStranu();
  }

  private objaviStranu(): void {
    const k = this._kljuc();
    const s = this.strana();
    if (!k || !s || this.zatvoren) return;
    this.kanal.posalji({ tip: 'strana', kljuc: kljucNiz(k), elementi: s.istorija.elementi, verzija: s.verzija });
  }

  private objaviAlate(): void {
    if (!this.zatvoren) this.kanal.posalji({ tip: 'alati', ...this.stanjeAlata() });
  }

  private odgovori(): void {
    this.kanal.posalji({ tip: 'puls' });
    this.objaviStranu();
    this.objaviAlate();
    const k = this._kljuc();
    const u = this._uToku();
    if (k && u) this.kanal.posalji({ tip: 'uToku', kljuc: kljucNiz(k), element: u });
  }
}
