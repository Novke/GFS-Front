import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DOCUMENT, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { catchError, filter, map, of, startWith, switchMap, timer } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { StudentiApi } from '../../../core/api/studenti.api';
import { sviStudentiGrupe } from '../data-access/predavanje.store';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeDetails } from '../../../core/api/predavanja.models';

/** Projektor osvežava broj prisutnih na 10 s (samo dok je tab vidljiv). */
export const OSVEZAVANJE_MS = 10_000;

/** `grupa`: id-jevi studenata grupe predavanja (`null` = predavanje bez grupe ili grupa nije učitana). */
type Ucitano = { tip: 'ok'; p: PredavanjeDetails; grupa: ReadonlySet<number> | null } | { tip: 'greska'; poruka: string } | { tip: 'ucitava' };

/**
 * Projektorski režim predavanja (`/predavanja/:id/projektor`, `ProjectorLayout` bez ljuske, uvek svetao): tema,
 * "Predavanje N · Predmet · Grupa" i veliki broj prisutnih, bez ličnih podataka. Broj je isti kao u zaglavlju detalja:
 * prisutni iz grupe ("od 14"), a stariji (studenti van grupe) kao "+N stariji". "Pun ekran" (Fullscreen API);
 * Esc van punog ekrana vraća na predavanje.
 */
@Component({
  selector: 'app-predavanje-projektor',
  imports: [MatButton, MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'esc()',
    '(document:fullscreenchange)': 'punEkran.set(!!dokument.fullscreenElement)',
  },
  template: `
    <div class="alati">
      <a matButton [routerLink]="['/predavanja', id()]"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Nazad na predavanje</a>
      <button matButton="outlined" type="button" data-pun-ekran (click)="prebaciPunEkran()">
        <mat-icon svgIcon="fullscreen" aria-hidden="true" />{{ punEkran() ? 'Izađi iz punog ekrana' : 'Pun ekran' }}
      </button>
    </div>
    @switch (stanje().tip) {
      @case ('ok') {
        @if (predavanje(); as p) {
          <section class="sadrzaj" aria-live="polite">
            <p class="kontekst">{{ kontekst() }}</p>
            <h1 class="tema">{{ p.tema?.trim() || 'Predavanje ' + p.rb }}</h1>
            <div class="broj" data-prisutnih>
              <span class="vrednost">{{ brojevi().izGrupe }}</span>
              <span class="labela">prisutno@if (brojevi().od !== null) { od {{ brojevi().od }}}</span>
              @if (brojevi().stariji > 0) {
                <span class="stariji" data-stariji>+{{ starijiTekst() }}</span>
              }
            </div>
          </section>
        }
      }
      @case ('greska') {
        <p class="poruka" role="alert">{{ greska() }}</p>
      }
      @default {
        <p class="poruka" role="status">Učitavanje…</p>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: calc(100dvh - 48px); }
    .alati { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .sadrzaj { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
    .kontekst { margin: 0; font-size: clamp(22px, 3vw, 36px); color: var(--ink-2); }
    .tema { margin: 0; font-size: clamp(36px, 6vw, 80px); line-height: 1.1; overflow-wrap: anywhere; }
    .broj { display: flex; flex-direction: column; align-items: center; margin-top: 24px; }
    .vrednost { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700; font-size: clamp(96px, 18vw, 240px); line-height: 1; color: var(--primary); }
    .labela { font-size: clamp(28px, 3vw, 40px); color: var(--muted); }
    .stariji { margin-top: 8px; font-size: clamp(22px, 2.4vw, 32px); color: var(--warn); font-weight: 600; }
    .poruka { margin: auto; font-size: 32px; color: var(--ink-2); text-align: center; }
  `,
})
export class PredavanjeProjektor {
  private readonly api = inject(PredavanjaApi);
  private readonly studentiApi = inject(StudentiApi);
  private readonly router = inject(Router);
  protected readonly dokument = inject(DOCUMENT);

  readonly id = input.required<string>();
  protected readonly punEkran = signal(false);

  private readonly pId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));

  /** Poslednji uspešan odgovor ostaje na ekranu i kad jedno osvežavanje ne uspe. */
  private poslednji: PredavanjeDetails | null = null;
  /** Studenti grupe se učitavaju jednom po predavanju (`undefined` = još nisu traženi). */
  private grupa: ReadonlySet<number> | null | undefined = undefined;

  protected readonly stanje = toSignal(
    toObservable(this.pId).pipe(
      switchMap(id => {
        this.poslednji = null;
        this.grupa = undefined;
        if (id === null) {
          return of<Ucitano>({ tip: 'greska', poruka: 'Predavanje ne postoji.' });
        }
        return timer(0, OSVEZAVANJE_MS).pipe(
          filter((_, i) => i === 0 || !this.dokument.hidden),
          switchMap(() =>
            this.api.get(id, { tiho: true }).pipe(
              switchMap(p => this.saGrupom(p)),
              map((p): Ucitano => {
                this.poslednji = p;
                return { tip: 'ok', p, grupa: this.grupa ?? null };
              }),
              catchError((e: unknown) =>
                of<Ucitano>(
                  this.poslednji
                    ? { tip: 'ok', p: this.poslednji, grupa: this.grupa ?? null }
                    : { tip: 'greska', poruka: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM },
                ),
              ),
            ),
          ),
          startWith<Ucitano>({ tip: 'ucitava' }),
        );
      }),
    ),
    { initialValue: { tip: 'ucitava' } as Ucitano },
  );

  protected readonly predavanje = computed(() => {
    const s = this.stanje();
    return s.tip === 'ok' ? s.p : null;
  });
  protected readonly greska = computed(() => {
    const s = this.stanje();
    return s.tip === 'greska' ? s.poruka : null;
  });
  /** Kao `PredavanjeStore.brojevi`: iz grupe = prisutni u grupi, stariji = prisutni van nje; bez grupe svi su "iz grupe". */
  protected readonly brojevi = computed(() => {
    const s = this.stanje();
    const prisutni = new Set(s.tip === 'ok' ? s.p.aktivnosti.map(a => a.student?.id) : []);
    const grupa = s.tip === 'ok' && s.p.grupa ? s.grupa : null;
    if (!grupa) {
      return { izGrupe: prisutni.size, stariji: 0, od: null as number | null };
    }
    const izGrupe = [...prisutni].filter(id => id !== undefined && grupa.has(id)).length;
    return { izGrupe, stariji: prisutni.size - izGrupe, od: grupa.size as number | null };
  });
  protected readonly kontekst = computed(() => {
    const p = this.predavanje();
    return p ? [`Predavanje ${p.rb}`, p.predmet?.naziv, p.grupa?.naziv].filter(Boolean).join(' · ') : '';
  });

  /** `1 stariji student`, `2 starija studenta`, `5 starijih studenata`. */
  protected readonly starijiTekst = computed(() => {
    const n = this.brojevi().stariji;
    const d = n % 10;
    const dd = n % 100;
    const oblik = d === 1 && dd !== 11 ? 'stariji student' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'starija studenta' : 'starijih studenata';
    return `${n} ${oblik}`;
  });

  /** Prvi put za predavanje sa grupom: učita id-jeve studenata grupe; neuspeh = prikaz bez podele (svi prisutni). */
  private saGrupom(p: PredavanjeDetails) {
    if (!p.grupa || this.grupa !== undefined) {
      return of(p);
    }
    return sviStudentiGrupe(this.studentiApi, p.grupa.id).pipe(
      map(studenti => {
        this.grupa = new Set(studenti.map(st => st.id));
        return p;
      }),
      catchError(() => {
        this.grupa = null;
        return of(p);
      }),
    );
  }

  protected prebaciPunEkran(): void {
    if (this.dokument.fullscreenElement) {
      void this.dokument.exitFullscreen?.();
    } else {
      void this.dokument.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  protected esc(): void {
    if (!this.dokument.fullscreenElement && this.pId() !== null) {
      void this.router.navigate(['/predavanja', this.pId()]);
    }
  }
}
