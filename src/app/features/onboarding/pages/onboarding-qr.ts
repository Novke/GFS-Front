import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { toCanvas } from 'qrcode';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { kopirajTekst } from '../../../shared/util/kopiraj';
import { OnboardingApi, OnboardingSesijaInfo, upisLink } from '../../../core/api/onboarding.api';

/** Najmanja i najveća širina QR koda (projektor; telefon studenta skenira i sa zadnjih klupa). */
export const QR_MIN_PX = 320;
export const QR_MAX_PX = 640;

/** Širina QR koda za širinu prozora: najmanje {@link QR_MIN_PX}, najviše {@link QR_MAX_PX}. */
export function sirinaQr(sirinaProzora: number): number {
  return Math.max(QR_MIN_PX, Math.min(sirinaProzora - 48, QR_MAX_PX));
}

type Kopirano = 'ne' | 'da' | 'selektovano';

/**
 * QR za projektor (`/grupe/:id/onboarding/:sid/qr`, `ProjectorLayout` bez ljuske, uvek svetao): naziv grupe, QR kod
 * (canvas ≥ 320 px, paket `qrcode`), link u `<code>` sa "Kopiraj" -> "Kopirano", rok važenja i "Pun ekran". Bez ličnih
 * podataka. Esc van punog ekrana vraća na prijave. Link je `new URL('upis/' + token, document.baseURI)`, pa radi pod
 * `/` i `/gfs/`. Kopiranje kroz `kopirajTekst` (i bez Clipboard API-ja na http-u); ako ni to ne uspe, link se selektuje
 * ("Selektovano, pritisnite Ctrl+C").
 */
@Component({
  selector: 'app-onboarding-qr',
  imports: [DatumPipe, MatButton, MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'esc()',
    '(document:fullscreenchange)': 'punEkran.set(!!dokument.fullscreenElement)',
  },
  template: `
    <div class="alati">
      @if (gId(); as g) {
        <a matButton [routerLink]="['/grupe', g, 'onboarding', sId()]" data-prijave><mat-icon svgIcon="arrow_back" aria-hidden="true" />Prijave</a>
      }
      <button matButton="outlined" type="button" data-pun-ekran (click)="prebaciPunEkran()">
        <mat-icon svgIcon="fullscreen" aria-hidden="true" />{{ punEkran() ? 'Izađi iz punog ekrana' : 'Pun ekran' }}
      </button>
    </div>

    <section class="sadrzaj">
      <h1>{{ sesija()?.grupa?.naziv || (greska() ? 'Prijava za grupu' : 'Učitavanje…') }}</h1>

      @if (sesija(); as s) {
        @if (!s.otvorena) {
          <p class="upozorenje" role="alert" data-zatvorena>Sesija je zatvorena ili istekla, prijave se ne primaju.</p>
        } @else {
          <p class="uputstvo">Skeniraj kod telefonom i popuni prijavu.</p>
        }
      }
      @if (greska(); as g) {
        <p class="greska" role="alert">{{ g }}</p>
      }

      <!-- canvas je uvek u DOM-u, crta se kad stigne sesija -->
      <canvas #qr [hidden]="!sesija()" aria-label="QR kod za prijavu" role="img" data-qr></canvas>

      @if (sesija(); as s) {
        <p class="link"><code #linkTekst data-link>{{ link() }}</code></p>
        <button matButton="filled" type="button" class="kopiraj" (click)="kopiraj()" data-kopiraj>
          <mat-icon svgIcon="content_copy" aria-hidden="true" />{{ tekstKopiranja() }}
        </button>
        <p class="rok">Važi do: <strong>{{ s.istice | datum: 'sa-vremenom' }}</strong></p>
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: calc(100dvh - 48px); }
    .alati { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .sadrzaj { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
    h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); line-height: 1.15; overflow-wrap: anywhere; }
    .uputstvo, .rok { margin: 0; font-size: clamp(20px, 2.4vw, 28px); color: var(--ink-2); }
    .upozorenje, .greska { margin: 0; padding: 12px 16px; border-radius: var(--radius); font-size: 22px; }
    .upozorenje { background: var(--warn-soft); color: var(--warn); }
    .greska { background: var(--danger-soft); color: var(--danger); }
    canvas { max-width: 100%; height: auto !important; image-rendering: pixelated; }
    .link { margin: 0; max-width: 100%; }
    code { font-family: var(--font-mono); font-size: clamp(16px, 2vw, 26px); overflow-wrap: anywhere; color: var(--ink); }
    .kopiraj { min-height: 48px; }
  `,
})
export class OnboardingQr {
  private readonly api = inject(OnboardingApi);
  private readonly router = inject(Router);
  protected readonly dokument = inject(DOCUMENT);

  readonly id = input<string>();
  readonly sid = input<string>();

  protected readonly gId = computed(() => (JE_ID.test(this.id() ?? '') ? Number(this.id()) : null));
  protected readonly sId = computed(() => (JE_ID.test(this.sid() ?? '') ? Number(this.sid()) : null));

  protected readonly sesija = signal<OnboardingSesijaInfo | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly kopirano = signal<Kopirano>('ne');
  protected readonly punEkran = signal(false);
  protected readonly link = computed(() => {
    const s = this.sesija();
    return s ? upisLink(s.token) : '';
  });
  protected readonly tekstKopiranja = computed(() => {
    switch (this.kopirano()) {
      case 'da':
        return 'Kopirano';
      case 'selektovano':
        return 'Selektovano, pritisnite Ctrl+C';
      default:
        return 'Kopiraj';
    }
  });

  private readonly qr = viewChild.required<ElementRef<HTMLCanvasElement>>('qr');
  private readonly linkTekst = viewChild<ElementRef<HTMLElement>>('linkTekst');
  private zahtev: Subscription | null = null;
  private kopiranoTajmer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const sid = this.sId();
      if (sid !== null) {
        untracked(() => this.ucitaj(sid));
      }
    });

    afterRenderEffect(() => {
      const link = this.link();
      const canvas = this.qr().nativeElement;
      if (!link) {
        return;
      }
      const sirina = sirinaQr(this.dokument.defaultView?.innerWidth ?? QR_MIN_PX);
      toCanvas(canvas, link, { width: sirina, margin: 2, errorCorrectionLevel: 'M' }).catch(() =>
        this.greska.set('QR kod nije mogao da se nacrta.'),
      );
    });

    inject(DestroyRef).onDestroy(() => {
      this.zahtev?.unsubscribe();
      clearTimeout(this.kopiranoTajmer);
    });
  }

  private ucitaj(sid: number): void {
    this.zahtev?.unsubscribe();
    this.sesija.set(null);
    this.greska.set(null);
    this.kopirano.set('ne');
    this.zahtev = this.api.sesija(sid, { tiho: true }).subscribe({
      next: d => this.sesija.set(d?.sesija ?? null),
      error: (e: unknown) => {
        const status = e instanceof HttpErrorResponse ? e.status : null;
        this.greska.set(status === 404 ? 'Sesija ne postoji.' : `Sesija nije mogla da se učita. ${e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM}`);
      },
    });
  }

  protected kopiraj(): void {
    const link = this.link();
    if (!link) {
      return;
    }
    // ni Clipboard API ni execCommand: link se selektuje, korisnik pritiska Ctrl+C
    void kopirajTekst(link, this.dokument).then(ok => (ok ? this.postaviKopirano('da') : this.selektuj()));
  }

  private selektuj(): void {
    const el = this.linkTekst()?.nativeElement;
    const selekcija = this.dokument.defaultView?.getSelection();
    if (!el || !selekcija) {
      return;
    }
    const opseg = this.dokument.createRange();
    opseg.selectNodeContents(el);
    selekcija.removeAllRanges();
    selekcija.addRange(opseg);
    this.postaviKopirano('selektovano');
  }

  private postaviKopirano(stanje: Kopirano): void {
    this.kopirano.set(stanje);
    clearTimeout(this.kopiranoTajmer);
    this.kopiranoTajmer = setTimeout(() => this.kopirano.set('ne'), 2000);
  }

  protected prebaciPunEkran(): void {
    if (this.dokument.fullscreenElement) {
      void this.dokument.exitFullscreen?.();
    } else {
      void this.dokument.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  protected esc(): void {
    const g = this.gId();
    const s = this.sId();
    if (!this.dokument.fullscreenElement && g !== null && s !== null) {
      void this.router.navigate(['/grupe', g, 'onboarding', s]);
    }
  }
}
