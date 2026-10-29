import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { VrednostPolja } from '../../uzivo/ui/polja-zadatka';
import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import { ProveraVezbanja, ResenjeVezbanja, TipVezbanja, ZadatakVezbanja } from '../data-access/portal.models';
import { idIzRute, nivoIzUpita, nivoZaCitac, putanjaPrijave, status, ucinak, zvezdice } from '../data-access/portal.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';
import { VezbanjeUnos } from '../ui/vezbanje-unos.component';

const NIJE_OTVOREN = 'Ovaj tip nije otvoren za vežbanje.';

/**
 * Vežbanje jednog tipa (`/nalog/predmet/:id/vezbanje/:tipId[?nivo=1-3]`, spec studentskog dela 5.4): bez bodova, ceo tip
 * (sve aktivne varijante, svi nivoi ili izabran nivo). `GET predmeti/{id}/vezbanje` daje naziv, put i broj zadataka po nivou
 * (tip koga nema u odgovoru nije otvoren grupi studenta: poruka, bez zahteva za zadatak), pa `POST vezbanje` izvlači zadatak
 * (server preskače poslednjih 5). "Proveri" i "Prikaži rešenje" idu preko id-ja pokušaja; tuđ ili zatvoren je 404.
 * 401 vodi na prijavu sa povratkom ovde. Promena nivoa izvlači novi zadatak tog nivoa.
 */
@Component({
  selector: 'app-vezbanje-page',
  imports: [MatButton, MatProgressSpinner, NalogOkvir, RouterLink, VezbanjeUnos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Vežbanje">
      @if (predmet(); as pid) {
        <a class="nazad" [routerLink]="['/nalog/predmet', pid]">← Nazad na predmet</a>
      }
      @if (tip(); as t) {
        <h2>{{ t.naziv }}</h2>
        @if (t.putanja.length) {
          <p class="putanja">{{ t.putanja.join(' › ') }}</p>
        }
        <p class="ucinak" data-ucinak>Tvoj učinak: {{ ucinakTipa() }}</p>
        <div class="nivoi" role="group" aria-label="Nivo zadatka">
          <button type="button" class="nivo" [attr.aria-pressed]="izabranNivo() === null" [disabled]="salje()" (click)="izaberiNivo(null)">
            Svi <span class="broj">({{ t.ukupno }})</span>
          </button>
          @for (n of [1, 2, 3]; track n) {
            <button type="button" class="nivo" [attr.aria-pressed]="izabranNivo() === n" [disabled]="salje() || !t.poNivou[n - 1]"
                    [attr.aria-label]="nivoCitac(n) + ', zadataka: ' + t.poNivou[n - 1]" (click)="izaberiNivo(n)" [attr.data-nivo]="n">
              <span aria-hidden="true">{{ zvezdice(n) }} <span class="broj">({{ t.poNivou[n - 1] }})</span></span>
            </button>
          }
        </div>
        @if (greska(); as g) {
          <p class="poruka opasnost" role="alert" data-greska>{{ g }}</p>
        }
        @if (zadatak(); as z) {
          <p class="nivo-zadatka">Nivo <span aria-hidden="true">{{ zvezdice(z.nivo) }}</span><span class="citac">{{ z.nivo }} od 3</span></p>
          <app-vezbanje-unos [zadatak]="z" [provera]="provera()" [resenje]="resenje()" [salje]="salje()"
                             (proveri)="proveri($event)" (prikaziResenje)="prikaziResenje()" (sledeci)="novi()" />
        } @else if (salje()) {
          <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Biram zadatak...</p>
        } @else {
          <button type="button" mat-flat-button class="dugme" (click)="novi()">Novi zadatak</button>
        }
      } @else if (nijeOtvoren()) {
        <h2>Vežbanje</h2>
        <p class="poruka info" role="alert" data-nije-otvoren>{{ nijeOtvorenPoruka }}</p>
      } @else if (greska(); as g) {
        <h2>Vežbanje</h2>
        <p class="poruka opasnost" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitajTip()">Pokušaj ponovo</button>
      } @else {
        <h2>Vežbanje</h2>
        <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 4px; font-size: 18px; overflow-wrap: anywhere; }
    .nazad { display: inline-flex; align-items: center; min-height: 44px; margin: -8px 0 4px; color: var(--primary); font-weight: 600; }
    .putanja { margin: 0 0 4px; color: var(--ink-2); font-size: 14px; overflow-wrap: anywhere; }
    .ucinak { margin: 0 0 12px; color: var(--ink-2); font-size: 14px; }
    .nivoi { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
    .nivo { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface);
      color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
    .nivo[aria-pressed='true'] { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-soft-ink); }
    .nivo:disabled { opacity: 0.5; cursor: default; }
    .nivo:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .broj { color: var(--muted); font-weight: 400; }
    .nivo-zadatka { margin: 0 0 6px; color: var(--ink-2); }
    .citac { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.info { border-color: var(--line); }
  `,
})
export class VezbanjePage implements OnInit {
  /** `:id` (predmet) i `:tipId` iz rute, `?nivo=` iz upita (`withComponentInputBinding`). */
  readonly id = input<string | null | undefined>(null);
  readonly tipId = input<string | null | undefined>(null);
  readonly nivo = input<string | null | undefined>(null);

  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  protected readonly predmet = computed(() => idIzRute(this.id()));
  private readonly tipIdBroj = computed(() => idIzRute(this.tipId()));
  protected readonly tip = signal<TipVezbanja | null>(null);
  protected readonly nijeOtvoren = signal(false);
  protected readonly nijeOtvorenPoruka = NIJE_OTVOREN;
  protected readonly izabranNivo = signal<number | null>(null);
  protected readonly zadatak = signal<ZadatakVezbanja | null>(null);
  protected readonly provera = signal<ProveraVezbanja | null>(null);
  protected readonly resenje = signal<ResenjeVezbanja | null>(null);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  /** Učinak ove sesije se dodaje na učinak sa servera (prva provera svakog zadatka), bez ponovnog učitavanja stabla. */
  private readonly sesija = signal({ provereno: 0, tacno: 0 });
  protected readonly ucinakTipa = computed(() => {
    const t = this.tip();
    const s = this.sesija();
    return t ? ucinak({ provereno: t.provereno + s.provereno, tacno: t.tacno + s.tacno }) : '';
  });
  protected readonly zvezdice = zvezdice;
  protected readonly nivoCitac = nivoZaCitac;

  private zahtev?: Subscription;
  private proverenPokusaj: number | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
  }

  ngOnInit(): void {
    this.izabranNivo.set(nivoIzUpita(this.nivo()));
    this.ucitajTip();
  }

  protected ucitajTip(): void {
    const predmet = this.predmet();
    const tipId = this.tipIdBroj();
    this.greska.set(null);
    if (predmet === null || tipId === null) {
      this.nijeOtvoren.set(true);
      return;
    }
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.vezbanje(predmet).subscribe({
      next: teme => {
        const t = (teme ?? []).flatMap(x => x.tipovi).find(x => x.tipId === tipId) ?? null;
        this.tip.set(t);
        this.nijeOtvoren.set(t === null);
        if (t) {
          const n = this.izabranNivo();
          if (n !== null && !t.poNivou[n - 1]) {
            this.izabranNivo.set(null);
          }
          this.novi();
        }
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  protected izaberiNivo(n: number | null): void {
    if (this.salje() || this.izabranNivo() === n) {
      return;
    }
    this.izabranNivo.set(n);
    void this.router.navigate([], { queryParams: { nivo: n }, replaceUrl: true });
    this.novi();
  }

  protected novi(): void {
    const t = this.tip();
    if (!t || this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.noviZadatak(t.tipId, this.izabranNivo()).subscribe({
      next: z => {
        this.salje.set(false);
        this.provera.set(null);
        this.resenje.set(null);
        this.zadatak.set(z);
      },
      error: (e: unknown) => {
        this.zadatak.set(null);
        this.neuspeh(e);
      },
    });
  }

  protected proveri(polja: Record<string, VrednostPolja>): void {
    const z = this.zadatak();
    if (!z || this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.provera(z.pokusajId, polja).subscribe({
      next: p => {
        this.salje.set(false);
        this.provera.set(p);
        if (this.proverenPokusaj !== z.pokusajId) {
          this.proverenPokusaj = z.pokusajId;
          this.sesija.update(s => ({ provereno: s.provereno + 1, tacno: s.tacno + (p.tacno ? 1 : 0) }));
        }
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  protected prikaziResenje(): void {
    const z = this.zadatak();
    if (!z || this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.resenje(z.pokusajId).subscribe({
      next: r => {
        this.salje.set(false);
        this.resenje.set(r);
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  private pocni(): void {
    this.zahtev?.unsubscribe();
    this.salje.set(true);
    this.greska.set(null);
  }

  /** 401: prijava; 404: tip više nije otvoren (zatvoren u međuvremenu); ostalo poruka servera (409 "nema zadataka"). */
  private neuspeh(e: unknown): void {
    this.salje.set(false);
    const s = status(e);
    if (s === 401) {
      void this.router.navigateByUrl(putanjaPrijave(this.router.url));
    } else if (s === 404) {
      this.tip.set(null);
      this.zadatak.set(null);
      this.nijeOtvoren.set(true);
    } else {
      this.greska.set(porukaGreske(e));
    }
  }
}
