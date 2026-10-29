import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, inject, input, OnInit, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { izasaoIz } from '../../uzivo/izlaz-iz-izvodjenja';
import { CasApi } from '../data-access/cas.api';
import { CasStanje } from '../data-access/cas.models';
import {
  KLJUC_CEKANJA, odlaganjeKoraka429, odlaganjePosle429, opisCasa, opisUToku, putanjaUzivo, sledeciUpitMs, sledeciUpitVanCasaMs,
} from '../data-access/cas.pravila';
import { porukaGreske } from '../data-access/nalog.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';

type Faza = 'ucitavanje' | 'naCasu' | 'nijeNaCasu' | 'poruka';

/** Posle prijave kodom `/nalog` vraća ovde (`javnoNazad` pušta `nalog/...`). */
const NA_PRIJAVU = 'nalog?nazad=nalog/cas';

/** `sessionStorage` može da baci (privatni režim, zabranjeno skladište): tada ključa nema, student skenira ponovo. */
function citajKljuc(): string | null {
  try {
    return sessionStorage.getItem(KLJUC_CEKANJA);
  } catch {
    return null;
  }
}

function pisiKljuc(kljuc: string | null): void {
  try {
    if (kljuc === null) {
      sessionStorage.removeItem(KLJUC_CEKANJA);
    } else {
      sessionStorage.setItem(KLJUC_CEKANJA, kljuc);
    }
  } catch {
    // bez skladišta: ključ se gubi, posle prijave student skenira ponovo
  }
}

const status = (e: unknown) => (e instanceof HttpErrorResponse ? e.status : -1);

/** Koliko puta se skeniranje ili potvrda sami ponove posle 429, pre poruke sa "Pokušaj ponovo". */
const POKUSAJA_429 = 5;

/**
 * Tab **Čas** naloga (spec studentskog dela 4.2 i 12.1): samo čas uživo, čekiranje i praćenje (`/nalog/cas/:token` iz QR-a i
 * `/nalog/cas`, obe u ljusci tabova `NalogTabovi`; javna ruta u `PublicLayout`-u). Zove samo `api/public/nalog/cas*` (`CasApi`).
 * "Naredni časovi" su na tabu Početna. Nečekiran student vidi "Nisi na času · Skeniraj QR sa table.", a dok je današnje
 * predavanje njegove grupe u toku (`CasStanje.uToku`) "Predavanje je u toku" sa predmetom i temom. Mesto
 * `[data-skener-mesto]` je za skener QR-a kamerom (zaseban posao).
 *
 * - Sa tokenom: adresa se odmah menja u `/nalog/cas` (token ne ostaje u istoriji), pa `POST skeniraj`. Prijavljen student
 *   dobija stanje časa; neprijavljen ključ čekanja, koji ide u `sessionStorage`, a stranica na `/nalog?nazad=nalog/cas`.
 * - Bez tokena: ključ iz `sessionStorage` (posle prijave) ide na `POST potvrdi` i briše se (401 ga čuva i vodi na prijavu);
 *   bez ključa `GET` stanja (401 vodi na prijavu).
 * - Na času: upit stanja na 10 s ± 2 s i odmah kad se stranica vrati (`visibilitychange`); skrivena stranica ne pita. Kad
 *   stanje ima izvođenje, ide u Uživo (`uzivo/<kod>?sa=cas`, **`replaceUrl`**: Nazad odande ne vraća na ovaj tab, koji bi
 *   opet ušao; odande se posle kraja vraća ovde). Ako je student sam izašao iz tog izvođenja ("Izađi" ili Nazad,
 *   `izlaz-iz-izvodjenja`), ne ulazi sam nego nudi "Uđi u prezentaciju". 429 odlaže upit (20, 40, najviše 60 s) bez poruke,
 *   prekid mreže zadržava prikaz.
 * - Van časa (nije čekiran, čas završen, prisustvo uklonjeno): prikaz sa napomenom i upit na 30 s dok je predavanje grupe u
 *   toku, inače 60 s, samo dok je stranica vidljiva (kao na času).
 * - 429 na skeniranju ili potvrdi (cela učionica odjednom): isti korak se sam ponovi posle 1-9 s (`odlaganjeKoraka429`), do
 *   `POKUSAJA_429` puta, pa poruka sa "Pokušaj ponovo"; ključ ostaje.
 */
@Component({
  selector: 'app-cas-page',
  imports: [MatButton, MatProgressSpinner, NalogOkvir, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Čas">
      @switch (faza()) {
        @case ('ucitavanje') {
          <h2>Čekiranje</h2>
          <p class="stanje" role="status">
            <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
          </p>
        }
        @case ('naCasu') {
          <h2>Na času si</h2>
          <p class="poruka uspeh" role="status" data-na-casu>Prisutan si: <strong>{{ opis() }}</strong></p>
          @if (izvodjenje(); as iz) {
            <p class="poruka info" role="status" data-izasao>
              <strong>Prezentacija je u toku</strong>@if (iz.naziv) { · {{ iz.naziv }}}
            </p>
            <a mat-flat-button class="dugme" [routerLink]="['/uzivo', iz.kod]" [queryParams]="{ sa: 'cas' }"
               data-udji>Uđi u prezentaciju</a>
          } @else {
            <p class="stanje" role="status">
              <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Čeka se prezentacija…
            </p>
            <p class="napomena">Ostavi ovu stranicu otvorenu: kad nastavnik pokrene prezentaciju, otvoriće se sama.</p>
          }
        }
        @case ('nijeNaCasu') {
          @if (napomena(); as n) {
            <p class="poruka info" role="status" data-poruka>{{ n }}</p>
          }
          @if (uToku(); as u) {
            <h2>Predavanje je u toku</h2>
            <p class="poruka upozorenje" role="status" data-u-toku>
              @if (u.opis) { <strong>{{ u.opis }}</strong><br> }
              Skeniraj QR sa table da te nastavnik vidi na času.
            </p>
            <p class="napomena">Ako QR nije na tabli, zamoli nastavnika da ga pokaže.</p>
          } @else {
            <h2>Nisi na času</h2>
            <p class="poruka info" role="status" data-nije-na-casu>Skeniraj QR sa table.</p>
            <p class="napomena">Kad nastavnik pokaže QR za čekiranje, skeniraj ga kamerom telefona.</p>
          }
          <div class="skener" data-skener-mesto></div>
        }
        @case ('poruka') {
          <h2>Čekiranje</h2>
          <p class="poruka" [class.opasnost]="greska()" [class.info]="!greska()" role="alert" data-poruka>{{ poruka() }}</p>
          @if (ponovo()) {
            <button type="button" mat-flat-button class="dugme" (click)="pokusajPonovo()">Pokušaj ponovo</button>
          }
        }
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 14px; font-size: 18px; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 16px 0; color: var(--muted); }
    .napomena { margin: 0; font-size: 14px; color: var(--muted); text-align: center; }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; margin-top: 8px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.uspeh { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
    .poruka.info { background: var(--surface-2, transparent); border-color: var(--line); color: var(--ink); }
    .poruka.upozorenje { background: var(--warn-soft); border-color: var(--warn); color: var(--ink); }
    .skener:empty { display: none; }
    .skener { margin-top: 16px; }
  `,
})
export class CasPage implements OnInit {
  /** Token iz QR-a (`cas/:token`, `withComponentInputBinding`); `cas` je bez njega. */
  readonly token = input<string | null | undefined>(null);

  private readonly api = inject(CasApi);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dokument = inject(DOCUMENT);

  protected readonly faza = signal<Faza>('ucitavanje');
  protected readonly stanje = signal<CasStanje | null>(null);
  protected readonly poruka = signal('');
  protected readonly greska = signal(false);
  /** Poruka posle greške mreže ili servera (5xx): dugme ponavlja poslednji korak. */
  protected readonly ponovo = signal(false);
  protected readonly opis = computed(() => {
    const p = this.stanje()?.predavanje;
    return p ? opisCasa(p) : '';
  });
  /** Napomena iznad prikaza van časa: "Čas je završen." ili "Nisi više na času."; prazno kad nije ni bio. */
  protected readonly napomena = signal('');
  /** Predavanje grupe u toku (van časa): opis `predmet · tema` (može biti prazan), `null` kad ga nema. */
  protected readonly uToku = computed(() => {
    const u = this.stanje()?.uToku;
    return u ? { opis: opisUToku(u) } : null;
  });
  /** Izvođenje iz koga je student sam izašao: "Uđi u prezentaciju" umesto ulaska. */
  protected readonly izvodjenje = computed(() => {
    const iz = this.stanje()?.izvodjenje;
    return this.faza() === 'naCasu' && iz?.kod ? iz : null;
  });

  private zahtev: Subscription | null = null;
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  private broj429 = 0;
  private broj429Koraka = 0;
  /** Bar jednom prikazano "na času": prazno stanje posle toga je "Nisi više na času.". */
  private bioNaCasu = false;
  /** Praćenje je završeno (navigacija ili konačna poruka): ni tajmer ni povratak na stranicu više ne pitaju. */
  private gotovo = false;
  private poslednjiKorak: () => void = () => this.upit();

  constructor() {
    const slusalac = () => {
      if (this.dokument.visibilityState === 'visible' && this.prati() && !this.gotovo) {
        this.upit();
      }
    };
    this.dokument.addEventListener('visibilitychange', slusalac);
    inject(DestroyRef).onDestroy(() => {
      this.dokument.removeEventListener('visibilitychange', slusalac);
      this.gotovo = true;
      this.zaustaviTajmer();
      this.zahtev?.unsubscribe();
    });
  }

  ngOnInit(): void {
    const token = this.token();
    if (token) {
      this.location.replaceState('/nalog/cas');
      this.skeniraj(token);
      return;
    }
    const kljuc = citajKljuc();
    if (kljuc) {
      this.potvrdi(kljuc);
    } else {
      this.upit();
    }
  }

  protected pokusajPonovo(): void {
    this.gotovo = false;
    this.broj429Koraka = 0;
    this.ponovo.set(false);
    this.faza.set('ucitavanje');
    this.poslednjiKorak();
  }

  private skeniraj(token: string): void {
    this.poslednjiKorak = () => this.skeniraj(token);
    this.zahtev = this.api.skeniraj(token).subscribe({
      next: odg => {
        this.zahtev = null;
        if (odg?.kljuc) {
          pisiKljuc(odg.kljuc);
          this.idi(NA_PRIJAVU, false);
          return;
        }
        this.prikazi(odg?.stanje ?? {});
      },
      error: (e: unknown) => {
        this.zahtev = null;
        if (!this.ponoviPosle429(e, () => this.skeniraj(token))) {
          this.greskaKoraka(e);
        }
      },
    });
  }

  private potvrdi(kljuc: string): void {
    this.poslednjiKorak = () => this.potvrdi(kljuc);
    this.zahtev = this.api.potvrdi(kljuc).subscribe({
      next: s => {
        this.zahtev = null;
        pisiKljuc(null);
        this.prikazi(s ?? {});
      },
      error: (e: unknown) => {
        this.zahtev = null;
        if (status(e) === 401) {
          this.idi(NA_PRIJAVU, false); // ključ ostaje za posle prijave
          return;
        }
        if (this.ponoviPosle429(e, () => this.potvrdi(kljuc))) {
          return; // ključ ostaje
        }
        if (status(e) === 0 || status(e) === 429 || status(e) >= 500) {
          this.greskaKoraka(e); // server ga možda nije ni video: ključ ostaje za "Pokušaj ponovo"
          return;
        }
        pisiKljuc(null);
        this.greskaKoraka(e);
      },
    });
  }

  /** `GET` stanja; skrivena stranica ne pita (pita `visibilitychange` kad se vrati). */
  private upit(): void {
    this.zaustaviTajmer();
    if (this.gotovo || (this.zahtev && !this.zahtev.closed) || (this.prati() && this.dokument.hidden)) {
      return;
    }
    this.poslednjiKorak = () => this.upit();
    this.zahtev = this.api.stanje().subscribe({
      next: s => {
        this.zahtev = null;
        this.broj429 = 0;
        this.prikazi(s ?? {});
      },
      error: (e: unknown) => {
        this.zahtev = null;
        if (status(e) === 401) {
          this.idi(NA_PRIJAVU, false);
        } else if (status(e) === 429) {
          this.broj429++;
          this.zakazi(odlaganjePosle429(this.broj429));
        } else if (this.faza() === 'naCasu') {
          this.zakazi(sledeciUpitMs(Math.random())); // prekid mreže: prikaz ostaje
        } else if (this.faza() === 'nijeNaCasu') {
          this.zakazi(sledeciUpitVanCasaMs(!!this.stanje()?.uToku));
        } else {
          this.greskaKoraka(e);
        }
      },
    });
  }

  private prikazi(s: CasStanje): void {
    const p = s.predavanje ?? null;
    const izvodjenje = s.izvodjenje ?? null;
    this.ponovo.set(false);
    if (p && !p.zavrseno) {
      if (izvodjenje?.kod && !izasaoIz(izvodjenje.kod)) {
        this.idi(putanjaUzivo(izvodjenje.kod), true);
        return;
      }
      this.bioNaCasu = true;
      this.stanje.set(s);
      this.napomena.set('');
      this.faza.set('naCasu');
      this.zakazi(sledeciUpitMs(Math.random()));
      return;
    }
    // van časa: praćenje se nastavlja ređe (traka "Predavanje je u toku" se pojavi i nestane sama)
    this.napomena.set(p?.zavrseno ? 'Čas je završen.' : this.bioNaCasu ? 'Nisi više na času.' : '');
    this.stanje.set(s);
    this.faza.set('nijeNaCasu');
    this.zakazi(sledeciUpitVanCasaMs(!!s.uToku));
  }

  /** Stanje koje se prati upitima (na času i van njega); poruka greške i učitavanje ne. */
  private prati(): boolean {
    const f = this.faza();
    return f === 'naCasu' || f === 'nijeNaCasu';
  }

  /** 429 na skeniranju ili potvrdi: isti korak posle kratkog čekanja, najviše `POKUSAJA_429` puta. */
  private ponoviPosle429(e: unknown, korak: () => void): boolean {
    if (status(e) !== 429 || this.broj429Koraka >= POKUSAJA_429) {
      return false;
    }
    this.broj429Koraka++;
    this.zakazi(odlaganjeKoraka429(this.broj429Koraka, Math.random()), korak);
    return true;
  }

  /** Greška koraka: poruka servera doslovno (4xx); mreža, 429 posle pokušaja i 5xx dobijaju "Pokušaj ponovo". */
  private greskaKoraka(e: unknown): void {
    const s = status(e);
    this.kraj(porukaGreske(e), true);
    this.ponovo.set(s === 0 || s === 429 || s >= 500 || s === -1);
  }

  private kraj(poruka: string, greska: boolean): void {
    this.gotovo = true;
    this.zaustaviTajmer();
    this.poruka.set(poruka);
    this.greska.set(greska);
    this.ponovo.set(false);
    this.faza.set('poruka');
  }

  /** `zameni`: ulazak u izvođenje menja ovaj unos istorije, pa Nazad iz izvođenja ne vraća na tab koji bi opet ušao. */
  private idi(url: string, zameni: boolean): void {
    this.gotovo = true;
    this.zaustaviTajmer();
    void (zameni ? this.router.navigateByUrl(url, { replaceUrl: true }) : this.router.navigateByUrl(url));
  }

  private zakazi(ms: number, korak: () => void = () => this.upit()): void {
    this.zaustaviTajmer();
    if (!this.gotovo) {
      this.tajmer = setTimeout(korak, ms);
    }
  }

  private zaustaviTajmer(): void {
    if (this.tajmer !== null) {
      clearTimeout(this.tajmer);
      this.tajmer = null;
    }
  }
}
