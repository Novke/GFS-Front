import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { formatDatum, parseDatum } from '../util/datum.pipe';

/** Opseg datuma filtera liste; krajevi su `YYYY-MM-DD` (isto što lista drži u URL-u) ili `null`. */
export interface OpsegDatuma {
  od: string | null;
  do: string | null;
}

/** Tekst aktivnog chipa: `1. 10. – 14. 10. 2025.`, `od 1. 10. 2025.`, `do 14. 10. 2025.`; prazan opseg `null`. */
export function opisOpsega(o: OpsegDatuma): string | null {
  const od = parseDatum(o.od);
  const doD = parseDatum(o.do);
  if (od && doD) {
    const istaGodina = od.getFullYear() === doD.getFullYear();
    return `${formatDatum(od, istaGodina ? 'kratko' : 'pun')} – ${formatDatum(doD)}`;
  }
  if (od) {
    return `od ${formatDatum(od)}`;
  }
  return doD ? `do ${formatDatum(doD)}` : null;
}

const ISPOD: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
];

/**
 * Chip "Datum" za filter opsega (od-do). Panel ima dva polja tipa `date` (na telefonu sistemski birač), "Primeni" i
 * "Odustani"; početni datum posle krajnjeg je greška. Jedan kraj je dovoljan. ✕ na aktivnom chipu briše oba kraja.
 * Kontrolisana komponenta, kao `ChipSelect`.
 */
@Component({
  selector: 'app-date-range-chip',
  imports: [A11yModule, CdkConnectedOverlay, CdkOverlayOrigin, MatButton, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [class.aktivan]="opis() !== null" cdkOverlayOrigin #izvor="cdkOverlayOrigin">
      <button #dugme type="button" data-otvori aria-haspopup="dialog" [attr.aria-expanded]="otvoren()" (click)="otvori()">
        @if (opis(); as o) {
          {{ labela() }}: {{ o }}
        } @else {
          {{ labela() }}
          <mat-icon svgIcon="expand_more" aria-hidden="true" />
        }
      </button>
      @if (opis() !== null) {
        <button type="button" class="chip-x" data-ukloni [attr.aria-label]="'Ukloni filter ' + labela()"
          (click)="opsegChange.emit({ od: null, do: null })">
          <mat-icon svgIcon="close" aria-hidden="true" />
        </button>
      }
    </span>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="izvor" [cdkConnectedOverlayOpen]="otvoren()"
      [cdkConnectedOverlayPositions]="pozicije" [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="zatvori()" (overlayKeydown)="tipka($event)" (detach)="zatvori()">
      <div class="panel" role="dialog" [attr.aria-label]="labela() + ': opseg'" cdkTrapFocus cdkTrapFocusAutoCapture>
        <div class="polja">
          <label>Od <input type="date" name="od" [value]="od()" [attr.max]="doV() || null" (input)="od.set($any($event.target).value)" /></label>
          <label>Do <input type="date" name="do" [value]="doV()" [attr.min]="od() || null" (input)="doV.set($any($event.target).value)" /></label>
        </div>
        @if (obrnuto()) {
          <p class="greska" role="alert">Početni datum je posle krajnjeg.</p>
        }
        <div class="dugmad">
          <button matButton type="button" (click)="zatvori()">Odustani</button>
          <button matButton="filled" type="button" data-primeni [disabled]="obrnuto()" (click)="primeni()">Primeni</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: inline-flex; max-width: 100%; }
    .panel { display: flex; flex-direction: column; gap: 12px; padding: 16px; width: min(320px, 92vw); border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); color: var(--ink); box-shadow: 0 6px 20px rgba(0, 0, 0, .18); }
    .polja { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
    input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 40px; padding: 0 8px; border: 1px solid var(--muted); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; }
    input:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    .greska { margin: 0; color: var(--danger); font-size: 13px; }
    .dugmad { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class DateRangeChip {
  readonly labela = input('Datum');
  readonly opseg = input<OpsegDatuma>({ od: null, do: null });
  readonly opsegChange = output<OpsegDatuma>();

  protected readonly pozicije = ISPOD;
  protected readonly otvoren = signal(false);
  /** Vrednosti u panelu dok je otvoren (string iz `input[type=date]`, prazno = bez tog kraja). */
  protected readonly od = signal('');
  protected readonly doV = signal('');
  protected readonly opis = computed(() => opisOpsega(this.opseg()));
  protected readonly obrnuto = computed(() => this.od() !== '' && this.doV() !== '' && this.od() > this.doV());
  private readonly dugme = viewChild.required<ElementRef<HTMLButtonElement>>('dugme');

  protected otvori(): void {
    const o = this.opseg();
    this.od.set(parseDatum(o.od) ? (o.od ?? '') : '');
    this.doV.set(parseDatum(o.do) ? (o.do ?? '') : '');
    this.otvoren.set(true);
  }

  protected zatvori(): void {
    if (this.otvoren()) {
      this.otvoren.set(false);
      this.dugme().nativeElement.focus();
    }
  }

  protected tipka(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.zatvori();
    }
  }

  protected primeni(): void {
    if (this.obrnuto()) {
      return;
    }
    const novo: OpsegDatuma = { od: parseDatum(this.od()) ? this.od() : null, do: parseDatum(this.doV()) ? this.doV() : null };
    const staro = this.opseg();
    this.zatvori();
    if (novo.od !== (staro.od ?? null) || novo.do !== (staro.do ?? null)) {
      this.opsegChange.emit(novo);
    }
  }
}
