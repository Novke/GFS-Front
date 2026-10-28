import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, inject, input, OnInit, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { CasApi } from '../data-access/cas.api';
import { CasStanje } from '../data-access/cas.models';
import { KLJUC_CEKANJA, odlaganjePosle429, opisCasa, putanjaUzivo, sledeciUpitMs } from '../data-access/cas.pravila';
import { porukaGreske } from '../data-access/nalog.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';

type Faza = 'ucitavanje' | 'naCasu' | 'poruka';

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

/**
 * Čekiranje i praćenje časa (`/nalog/cas/:token` iz QR-a i `/nalog/cas`; javna ruta u `PublicLayout`-u, spec studentskog
 * portala 4.2). Zove samo `api/public/nalog/cas*` (`CasApi`).
 *
 * - Sa tokenom: adresa se odmah menja u `/nalog/cas` (token ne ostaje u istoriji), pa `POST skeniraj`. Prijavljen student
 *   dobija stanje časa; neprijavljen ključ čekanja, koji ide u `sessionStorage`, a stranica na `/nalog?nazad=nalog/cas`.
 * - Bez tokena: ključ iz `sessionStorage` (posle prijave) ide na `POST potvrdi` i briše se (401 ga čuva i vodi na prijavu);
 *   bez ključa `GET` stanja (401 vodi na prijavu).
 * - Na času: upit stanja na 10 s ± 2 s i odmah kad se stranica vrati (`visibilitychange`); skrivena stranica ne pita. Kad
 *   stanje ima izvođenje, ide u Uživo (`uzivo/<kod>?sa=cas`, odande se posle kraja vraća ovde). 429 odlaže upit (20, 40,
 *   najviše 60 s) bez poruke, prekid mreže zadržava prikaz. Završen čas, uklonjeno prisustvo i "nisi čekiran" prekidaju
 *   praćenje porukom.
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
          <p class="stanje" role="status">
            <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Čeka se prezentacija…
          </p>
          <p class="napomena">Ostavi ovu stranicu otvorenu: kad nastavnik pokrene prezentaciju, otvoriće se sama.</p>
        }
        @case ('poruka') {
          <h2>Čekiranje</h2>
          <p class="poruka" [class.opasnost]="greska()" [class.info]="!greska()" role="alert" data-poruka>{{ poruka() }}</p>
          @if (ponovo()) {
            <button type="button" mat-flat-button class="dugme" (click)="pokusajPonovo()">Pokušaj ponovo</button>
          }
          <a matButton="outlined" class="dugme" routerLink="/nalog">Moj nalog</a>
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

  private zahtev: Subscription | null = null;
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  private broj429 = 0;
  /** Bar jednom prikazano "na času": prazno stanje posle toga je "Nisi više na času.". */
  private bioNaCasu = false;
  /** Praćenje je završeno (navigacija ili konačna poruka): ni tajmer ni povratak na stranicu više ne pitaju. */
  private gotovo = false;
  private poslednjiKorak: () => void = () => this.upit();

  constructor() {
    const slusalac = () => {
      if (this.dokument.visibilityState === 'visible' && this.faza() === 'naCasu' && !this.gotovo) {
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
          this.idi(NA_PRIJAVU);
          return;
        }
        this.prikazi(odg?.stanje ?? {});
      },
      error: (e: unknown) => {
        this.zahtev = null;
        this.greskaKoraka(e);
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
          this.idi(NA_PRIJAVU); // ključ ostaje za posle prijave
          return;
        }
        if (status(e) === 0 || status(e) >= 500) {
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
    if (this.gotovo || (this.zahtev && !this.zahtev.closed) || (this.faza() === 'naCasu' && this.dokument.hidden)) {
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
          this.idi(NA_PRIJAVU);
        } else if (status(e) === 429) {
          this.broj429++;
          this.zakazi(odlaganjePosle429(this.broj429));
        } else if (this.faza() === 'naCasu') {
          this.zakazi(sledeciUpitMs(Math.random())); // prekid mreže: prikaz ostaje
        } else {
          this.greskaKoraka(e);
        }
      },
    });
  }

  private prikazi(s: CasStanje): void {
    const p = s.predavanje ?? null;
    const izvodjenje = s.izvodjenje ?? null;
    if (p && !p.zavrseno && izvodjenje?.kod) {
      this.idi(putanjaUzivo(izvodjenje.kod));
      return;
    }
    if (!p) {
      this.kraj(this.bioNaCasu ? 'Nisi više na času.' : 'Trenutno nisi čekiran ni na jednom času. Skeniraj QR sa table.', false);
      return;
    }
    if (p.zavrseno) {
      this.kraj('Čas je završen.', false);
      return;
    }
    this.bioNaCasu = true;
    this.stanje.set(s);
    this.faza.set('naCasu');
    this.zakazi(sledeciUpitMs(Math.random()));
  }

  /** Greška koraka: poruka servera doslovno (4xx); mreža i 5xx dobijaju "Pokušaj ponovo". */
  private greskaKoraka(e: unknown): void {
    const s = status(e);
    this.kraj(porukaGreske(e), true);
    this.ponovo.set(s === 0 || s >= 500 || s === -1);
  }

  private kraj(poruka: string, greska: boolean): void {
    this.gotovo = true;
    this.zaustaviTajmer();
    this.poruka.set(poruka);
    this.greska.set(greska);
    this.ponovo.set(false);
    this.faza.set('poruka');
  }

  private idi(url: string): void {
    this.gotovo = true;
    this.zaustaviTajmer();
    void this.router.navigateByUrl(url);
  }

  private zakazi(ms: number): void {
    this.zaustaviTajmer();
    if (!this.gotovo) {
      this.tajmer = setTimeout(() => this.upit(), ms);
    }
  }

  private zaustaviTajmer(): void {
    if (this.tajmer !== null) {
      clearTimeout(this.tajmer);
      this.tajmer = null;
    }
  }
}
