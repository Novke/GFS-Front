import { Location } from '@angular/common';
import { DestroyRef, DOCUMENT, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GuardsCheckEnd, NavigationError, Router } from '@angular/router';

import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import { jeGreskaUcitavanja } from './greska-ucitavanja';

/** `<meta name="gfs-izdanje" content="...">` u `index.html` i `assets/izdanje.json`: oba piše `scripts/oznaci-izdanje.mjs`. */
export const META_IZDANJA = 'gfs-izdanje';
export const PUTANJA_IZDANJA = 'assets/izdanje.json';

/** Redovna provera dok je kartica vidljiva (konzola, projektor i forme stoje otvoreni satima). */
export const PERIOD_MS = 10 * 60_000;
/** Najmanji razmak između dve obične provere (povratak na karticu, HTTP greška). */
export const RAZMAK_MS = 60_000;
/** Najmanji razmak posle neuspelog učitavanja chunk-a (više lenjih delova padne odjednom). */
export const RAZMAK_HITNO_MS = 5_000;
/** Posle automatskog osvežavanja ka izdanju X, a učitano je opet nešto drugo: toliko dugo bez novog automatskog. */
export const ZASTITA_MS = 5 * 60_000;
export const KLJUC_OSVEZAVANJA = 'gfs.izdanje.osvezavanje';

/** Heširan build fajl (`chunk-CtOh0Kox.js`, `main-4GOMCQ2O.js`, `styles-TI5ZISUJ.css`, `worker-*.js`). */
const HESIRAN_FAJL = /-[A-Za-z0-9_-]{8}\.(js|css)$/;

export type IshodProvere = 'novo' | 'isto' | 'nepoznato';

/** Izdanje na serveru: `assets/izdanje.json` mimo HTTP interceptora i keša; `null` = nepoznato (mreža, 404, loš JSON). */
export const DOHVATI_IZDANJE = new InjectionToken<() => Promise<string | null>>('DOHVATI_IZDANJE', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return async () => {
      try {
        const odgovor = await fetch(new URL(PUTANJA_IZDANJA, doc.baseURI), { cache: 'no-store', credentials: 'same-origin' });
        if (!odgovor.ok) return null;
        const json = (await odgovor.json()) as { izdanje?: unknown };
        return typeof json.izdanje === 'string' && json.izdanje ? json.izdanje : null;
      } catch {
        return null;
      }
    };
  },
});

/** Puno učitavanje strane; token zbog testova (jsdom `location` se ne može zameniti). */
export interface UcitavanjeStrane {
  ucitaj(url: string): void;
  osvezi(): void;
}

export const UCITAVANJE_STRANE = new InjectionToken<UcitavanjeStrane>('UCITAVANJE_STRANE', {
  providedIn: 'root',
  factory: () => {
    const location = inject(DOCUMENT).defaultView?.location;
    return { ucitaj: url => location?.assign(url), osvezi: () => location?.reload() };
  },
});

/**
 * Prati da li je kartica zastarela: da li server već služi novije izdanje frontenda od onog koje je ova kartica učitala.
 *
 * Zastarela kartica radi dok ne zatraži lenji chunk koga novi build nema (404: uvoz, dijalozi, rute, `@defer`) ili dok ne
 * pošalje zahtev koji je novi backend promenio. Zato se izdanje proverava redovno (vidljiva kartica, svakih
 * {@link PERIOD_MS}), pri povratku na karticu i povratku mreže, odmah posle neuspelog učitavanja chunk-a (greška rute,
 * `ErrorHandler`, neuhvaćeno odbijanje, 404 heširanog fajla u Resource Timing-u) i posle 4xx odgovora API-ja.
 *
 * Kad je novije izdanje poznato:
 * - prvi prelazak na drugu stranu (druga putanja, posle čuvara izlaska) učitava tu stranu iznova sa servera, pa korisnik bez
 *   ikakve radnje dobija novu verziju; promena samo query parametara (filteri liste) to nikad ne radi;
 * - ruta čiji chunk nije učitan se otvara punim učitavanjem iste adrese;
 * - `IzdanjeTraka` nudi "Osveži".
 * Automatski nikad dok `NesacuvaneIzmene` ima nesačuvanog, i najviše jednom ka istom izdanju ({@link ZASTITA_MS}), pa
 * keš ili proxy koji vraća staru stranu ne pravi petlju. Bez meta oznake (`ng serve`, unit i e2e build) servis ništa ne radi.
 */
@Injectable({ providedIn: 'root' })
export class Izdanje {
  private readonly doc = inject(DOCUMENT);
  private readonly prozor = this.doc.defaultView;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly nesacuvane = inject(NesacuvaneIzmene);
  private readonly dohvati = inject(DOHVATI_IZDANJE);
  private readonly strana = inject(UCITAVANJE_STRANE);

  /** Izdanje koje je ova kartica učitala; `null` = bez praćenja. */
  readonly ucitano = this.doc.querySelector<HTMLMetaElement>(`meta[name="${META_IZDANJA}"]`)?.content || null;
  private readonly _novo = signal<string | null>(null);
  /** Novije izdanje koje server služi, kad je primećeno (`null` dok je kartica ažurna ili se ne zna). */
  readonly novo = this._novo.asReadonly();

  private uToku: Promise<IshodProvere> | null = null;
  private poslednja = Number.NEGATIVE_INFINITY;
  private poslednjiIshod: IshodProvere = 'nepoznato';
  private readonly autoBlokirano = this.procitajZastitu();

  constructor() {
    const w = this.prozor;
    if (!this.ucitano || !w) return;
    const destroy = inject(DestroyRef);
    const slusaj = (cilj: EventTarget, tip: string, f: (e: Event) => void) => {
      cilj.addEventListener(tip, f);
      destroy.onDestroy(() => cilj.removeEventListener(tip, f));
    };

    slusaj(this.doc, 'visibilitychange', () => this.vidljiva() && void this.proveri());
    slusaj(w, 'online', () => void this.proveri());
    slusaj(w, 'unhandledrejection', e => jeGreskaUcitavanja((e as PromiseRejectionEvent).reason) && void this.proveri(true));
    const interval = w.setInterval(() => this.vidljiva() && void this.proveri(), PERIOD_MS);
    destroy.onDestroy(() => w.clearInterval(interval));
    this.pratiNeuspeleFajlove(destroy);

    this.router.events.pipe(takeUntilDestroyed(destroy)).subscribe(e => {
      if (e instanceof GuardsCheckEnd && e.shouldActivate && this.smeAutomatski() && this.drugaPutanja(e.urlAfterRedirects)) {
        this.ucitajIznova(e.urlAfterRedirects);
      } else if (e instanceof NavigationError && jeGreskaUcitavanja(e.error)) {
        void this.proveri(true).then(ishod => ishod === 'novo' && this.smeAutomatski() && this.ucitajIznova(e.url));
      }
    });
  }

  /**
   * Pita server za izdanje. Istovremeni pozivi dele jedan zahtev; obična provera najviše jednom u {@link RAZMAK_MS},
   * hitna (posle neuspelog chunk-a) u {@link RAZMAK_HITNO_MS}, inače vraća poslednji ishod.
   */
  proveri(hitno = false): Promise<IshodProvere> {
    if (!this.ucitano) return Promise.resolve('nepoznato');
    if (this.uToku) return this.uToku;
    const sada = Date.now();
    if (sada - this.poslednja < (hitno ? RAZMAK_HITNO_MS : RAZMAK_MS)) return Promise.resolve(this.poslednjiIshod);
    this.poslednja = sada;
    const ucitano = this.ucitano;
    this.uToku = this.dohvati()
      .then(id => {
        const ishod: IshodProvere = id === null ? 'nepoznato' : id === ucitano ? 'isto' : 'novo';
        // 'isto' briše ranije viđeno novo izdanje: rollback na izdanje ove kartice je opet ažurna kartica.
        if (ishod !== 'nepoznato') this._novo.set(ishod === 'novo' ? id : null);
        this.poslednjiIshod = ishod;
        return ishod;
      })
      .finally(() => (this.uToku = null));
    return this.uToku;
  }

  /** "Osveži" iz trake: obično osvežavanje (pregledač sam pita ako stranica ima nesačuvanog). */
  osvezi(): void {
    this.strana.osvezi();
  }

  private smeAutomatski(): boolean {
    return this._novo() !== null && !this.autoBlokirano && this.nesacuvane.broj() === 0;
  }

  private drugaPutanja(url: string): boolean {
    const putanja = (u: string) => u.split(/[?#]/, 1)[0];
    return putanja(url) !== putanja(this.router.url);
  }

  private ucitajIznova(url: string): void {
    try {
      this.prozor?.sessionStorage.setItem(KLJUC_OSVEZAVANJA, JSON.stringify({ cilj: this._novo(), vreme: Date.now() }));
    } catch {
      /* bez sessionStorage-a nema zaštite od petlje, ali ni automatskog osvežavanja posle njega: ostaje traka */
      return;
    }
    this.strana.ucitaj(this.location.prepareExternalUrl(url));
  }

  /** Da li je ova kartica nastala automatskim osvežavanjem ka izdanju koje nije dobila (keš, proxy): tada bez novog. */
  private procitajZastitu(): boolean {
    try {
      const s = this.prozor?.sessionStorage;
      const zapis = JSON.parse(s?.getItem(KLJUC_OSVEZAVANJA) ?? 'null') as { cilj?: unknown; vreme?: unknown } | null;
      if (!zapis) return false;
      if (zapis.cilj !== this.ucitano && typeof zapis.vreme === 'number' && Date.now() - zapis.vreme < ZASTITA_MS) return true;
      s?.removeItem(KLJUC_OSVEZAVANJA);
    } catch {
      /* oštećen zapis ili bez sessionStorage-a */
    }
    return false;
  }

  /** 404 heširanog fajla sa svog porekla (Resource Timing `responseStatus`; Safari ga nema, tamo ostaju ostali signali). */
  private pratiNeuspeleFajlove(destroy: DestroyRef): void {
    const Posmatrac = this.prozor?.PerformanceObserver;
    if (!Posmatrac?.supportedEntryTypes?.includes('resource')) return;
    const poreklo = this.prozor!.location.origin;
    const posmatrac = new Posmatrac(lista => {
      const neuspeo = lista.getEntries().some(u => {
        const status = (u as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0;
        if (status < 400) return false;
        const url = new URL(u.name, poreklo);
        return url.origin === poreklo && HESIRAN_FAJL.test(url.pathname);
      });
      if (neuspeo) void this.proveri(true);
    });
    posmatrac.observe({ type: 'resource' });
    destroy.onDestroy(() => posmatrac.disconnect());
  }

  private vidljiva(): boolean {
    return this.doc.visibilityState === 'visible';
  }
}
