import {
  ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';

import { napraviBudanEkran } from '../data-access/budan-ekran';
import { prihvatiDodir, vibriraj } from '../data-access/dodir';
import { odgovorili, oznakaDalje, oznakaOtvoriZatvori, oznakaPolozajaKratko } from '../data-access/izvodjenje-pravila';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { pratiPovratak } from '../data-access/povratak';
import { TipKomande } from '../data-access/uzivo.models';
import { BeleskePanelComponent } from './beleske-panel.component';
import { VremeIzvodjenjaComponent } from './vreme-izvodjenja.component';

/** Dok STOMP nije povezan, stanje se osvežava GET-om (komande sa laptopa se vide i bez WebSocket-a na telefonu). */
export const OSVEZI_BEZ_VEZE_MS = 5_000;
/** Koliko dugo se razlog neuspele komande vidi u traci na vrhu (snackbar na dnu delimično pokriva dugmad). */
export const PRIKAZ_GRESKE_MS = 6_000;

const PRAZNO_PRIJAVA = 'Prijava studenata. „Napred“ prikazuje prvi slajd.';
const PRAZNO_KRAJ = 'Kraj prezentacije. Izvođenje se završava u konzoli („Završi“).';
const PRAZNO_SLAJD = 'Nema beležaka za ovaj slajd.';

/**
 * Daljinski na telefonu nastavnika (`izvodjenja/:id/daljinski`, iza basic-auth-a, prati dan/noć): gore štoperica, sat,
 * položaj i veza, u sredini beleške (skroluju same), dole velika dugmad Nazad/Napred (svako pola širine, bar 25% visine),
 * a na pitanju još red Otvori/Zatvori, Rezultati, Tačan. Ekran se drži budnim (Wake Lock), dodir vibrira, odskok prsta u
 * 300 ms se ignoriše (monotoni sat). Posle buđenja: `posleVracanja`; dok veza nije tu, `GET stanje` na 5 s. Greška
 * komande se vidi u traci (6 s); završeno izvođenje: poruka, bez dugmadi i bez navigacije. `ZAVRSI` namerno nije ovde.
 */
@Component({
  selector: 'app-daljinski',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [IzvodjenjeStore],
  imports: [BeleskePanelComponent, VremeIzvodjenjaComponent],
  host: { class: 'uz-dalj', lang: 'sr-Latn' },
  template: `
    @if (store.stanje(); as s) {
      @if (zavrseno()) {
        <div class="uz-dalj-kraj" role="status"><p>Izvođenje je završeno.</p></div>
      } @else {
        <header class="uz-dalj-traka">
          <app-vreme-izvodjenja [izvodjenjeId]="s.izvodjenje.id" [pocetakMs]="s.pocetakMs" [sat]="store.sat()" [kompaktno]="true" />
          <span class="uz-dalj-polozaj">{{ polozaj() }}</span>
          <span class="uz-dalj-veza" [class.uz-dalj-veza--ok]="store.veza() === 'povezan'" role="status">{{ vezaTekst() }}</span>
        </header>
        <div class="uz-dalj-upozorenja">
          @if (prikazGreske(); as g) {
            <p class="uz-dalj-greska" role="alert">{{ g }}</p>
          }
          @switch (budan.stanje()) {
            @case ('nepodrzano') {
              <p class="uz-dalj-budnost" role="status">Ovaj pregledač ne može da drži ekran upaljenim. Produži vreme gašenja ekrana u podešavanjima telefona.</p>
            }
            @case ('odbijeno') {
              <p class="uz-dalj-budnost" role="status">
                Ekran može da se ugasi: pregledač nije dozvolio da ostane upaljen.
                <button type="button" class="uz-dalj-ponovo" (click)="budan.ukljuci()">Pokušaj ponovo</button>
              </p>
            }
          }
        </div>
        <app-beleske-panel class="uz-dalj-beleske" [tekst]="s.trenutniSlajd?.beleske ?? null"
                           [kljucSlajda]="s.trenutniSlajd?.id ?? s.prikaz" [prazno]="prazno()" />
        @if (naPitanju()) {
          <div class="uz-dalj-pitanje" role="group" aria-label="Pitanje">
            <button type="button" [disabled]="!ima('OTVORI_ZATVORI')" (click)="dodir('OTVORI_ZATVORI')">{{ otvoriZatvori() }}</button>
            <button type="button" [disabled]="!ima('REZULTATI')" [attr.aria-pressed]="s.rezultatiPrikazani" (click)="dodir('REZULTATI')">Rezultati</button>
            <button type="button" [disabled]="!ima('TACAN')" [attr.aria-pressed]="s.tacanPrikazan" (click)="dodir('TACAN')">Tačan</button>
            @if (s.runda) {
              @let o = odgovoriliSu();
              <p class="uz-dalj-odgovorili">Odgovorili <strong>{{ o?.broj }}/{{ o?.od }}</strong></p>
            }
          </div>
        }
        <nav class="uz-dalj-dugmad" aria-label="Nazad i napred">
          <button type="button" class="uz-dalj-nazad" [disabled]="!ima('PRETHODNI')" (click)="dodir('PRETHODNI')">
            <span class="uz-dalj-glavno"><span aria-hidden="true">◀</span> Nazad</span>
          </button>
          <button type="button" class="uz-dalj-napred" [disabled]="!ima('SLEDECI')" [attr.aria-label]="'Napred: ' + dalje()"
                  (click)="dodir('SLEDECI')">
            <span class="uz-dalj-glavno">Napred <span aria-hidden="true">▶</span></span>
            <span class="uz-dalj-oznaka">{{ dalje() }}</span>
          </button>
        </nav>
      }
    } @else if (store.greska(); as g) {
      <div class="uz-dalj-kraj" role="alert"><p>{{ g }}</p></div>
    } @else {
      <div class="uz-dalj-kraj" role="status"><p>Učitavanje…</p></div>
    }
  `,
})
export class DaljinskiPage {
  protected readonly store = inject(IzvodjenjeStore);
  protected readonly budan = napraviBudanEkran();
  private readonly doc = inject(DOCUMENT);
  private readonly poslednjiDodir = new Map<TipKomande, number>();

  protected readonly prikazGreske = signal<string | null>(null);
  private readonly status = computed(() => this.store.stanje()?.izvodjenje.status ?? null);
  protected readonly zavrseno = computed(() => this.status() === 'ZAVRSENO');
  /**
   * Stanje je učitano, a STOMP nije povezan. Bez učitanog stanja (404/410 pri otvaranju) se ne osvežava: store tada ni
   * ne otvara STOMP, pa bi GET na 5 s trajao zauvek.
   */
  private readonly bezVeze = computed(() =>
    this.store.veza() !== 'povezan' && !this.zavrseno() && this.store.stanje() !== null);

  protected readonly polozaj = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaPolozajaKratko(s) : '';
  });
  protected readonly dalje = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaDalje(s) : '';
  });
  protected readonly otvoriZatvori = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaOtvoriZatvori(s) : '';
  });
  protected readonly odgovoriliSu = computed(() => {
    const s = this.store.stanje();
    return s ? odgovorili(s) : null;
  });
  protected readonly naPitanju = computed(() => {
    const s = this.store.stanje();
    return s?.prikaz === 'SLAJD' && s.trenutniSlajd?.tip === 'PITANJE';
  });
  protected readonly prazno = computed(() => {
    const p = this.store.stanje()?.prikaz;
    return p === 'PRIJAVA' ? PRAZNO_PRIJAVA : p === 'KRAJ' ? PRAZNO_KRAJ : PRAZNO_SLAJD;
  });
  protected readonly vezaTekst = computed(() => ({
    povezan: 'Povezano', povezivanje: 'Povezivanje…', prekinut: 'Veza prekinuta, povezujem…',
  })[this.store.veza()]);

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(
      map(p => Number(p.get('id'))), filter(id => id > 0), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(id => this.store.init(id));
    // Telefon koji je spavao: stanje odmah, a posle dužeg skrivanja i nova STOMP veza.
    inject(DestroyRef).onDestroy(pratiPovratak(this.doc, window, ms => this.store.posleVracanja(ms)));

    // Budan ekran samo dok izvođenje traje (status, ne svaki snimak: odbijen zahtev se ne ponavlja na svaku komandu).
    effect(() => {
      const st = this.status();
      untracked(() => {
        if (st === 'AKTIVNO') this.budan.ukljuci();
        else if (st === 'ZAVRSENO') this.budan.iskljuci();
      });
    });

    // Razlog neuspele komande u traci 6 s. Store ne menja `greska` kad ista komanda ponovo ne uspe, pa se prikaz
    // obnavlja i kad se red komandi isprazni (`salje` -> false) uz grešku; uspešna komanda grešku briše odmah.
    // Zato se greška vidi tek kad red stane: komanda koja još čeka iza neuspele odlaže prikaz (njen ishod ga i odredi).
    effect(onCleanup => {
      const g = this.store.greska();
      const salje = this.store.salje();
      if (!g) {
        this.prikazGreske.set(null);
        return;
      }
      if (salje) return;
      this.prikazGreske.set(g);
      const t = setTimeout(() => this.prikazGreske.set(null), PRIKAZ_GRESKE_MS);
      onCleanup(() => clearTimeout(t));
    });

    // Bez STOMP veze (npr. pregledač ne šalje basic-auth na WebSocket): GET stanje na 5 s, samo dok je stranica vidljiva.
    effect(onCleanup => {
      if (!this.bezVeze()) return;
      const t = setInterval(() => {
        if (this.doc.visibilityState === 'visible') this.store.osvezi();
      }, OSVEZI_BEZ_VEZE_MS);
      onCleanup(() => clearInterval(t));
    });
  }

  protected ima(tip: TipKomande): boolean {
    return this.store.dozvoljene().has(tip);
  }

  /** Drugi dodir istog dugmeta pre 300 ms je odskok prsta; meri se monotonim satom (ne pomera ga promena sata telefona). */
  protected dodir(tip: TipKomande): void {
    if (!this.ima(tip)) return;
    const sada = performance.now();
    if (!prihvatiDodir(this.poslednjiDodir.get(tip), sada)) return;
    this.poslednjiDodir.set(tip, sada);
    vibriraj();
    this.store.komanda(tip);
  }
}
