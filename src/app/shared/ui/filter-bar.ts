import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/** Koliko se čeka posle poslednjeg otkucaja pre `pretragaChange` (spec 4; isto kao `withListQuery`). */
export const DEBOUNCE_PRETRAGE_MS = 300;

function normalizuj(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Traka filtera liste: polje za pretragu (debounce {@link DEBOUNCE_PRETRAGE_MS} ms, prazno -> `null`), projektovani
 * chipovi (`ChipSelect`, `DateRangeChip`) i "Očisti filtere" kad `imaFiltera`.
 *
 * `pretraga` je spoljašnja vrednost (iz URL-a); bez tog ulaza (`undefined`) traka nema polje. Dok korisnik kuca
 * (debounce na čekanju), spoljašnja promena ne prepisuje polje, da odgovor na prethodni otkucaj ne pojede sledeći.
 */
@Component({
  selector: 'app-filter-bar',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pretraga() !== undefined) {
      <label class="polje">
        <mat-icon svgIcon="search" aria-hidden="true" />
        <input type="search" [attr.aria-label]="pretragaLabela()" [placeholder]="pretragaLabela()" autocomplete="off"
          enterkeyhint="search" maxlength="200" [value]="tekst()" (input)="kucaj($any($event.target).value)"
          (keydown.escape)="isprazni($event)" />
      </label>
    }
    <div class="chipovi"><ng-content /></div>
    @if (imaFiltera()) {
      <button type="button" class="ocisti" data-ocisti (click)="ocistiSve()">
        <mat-icon svgIcon="filter_alt_off" aria-hidden="true" />Očisti filtere
      </button>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .polje { flex: 0 1 280px; min-width: 200px; display: flex; align-items: center; gap: 6px; padding: 0 10px; min-height: 36px;
      border: 1px solid var(--muted); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); }
    .polje:focus-within { outline: 3px solid var(--focus); outline-offset: 1px; }
    .polje .mat-icon { width: 18px; height: 18px; flex: none; }
    input { flex: 1; min-width: 0; height: 34px; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; font-size: 14px; }
    input::placeholder { color: var(--muted); }
    .chipovi { display: contents; }
    .ocisti { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 6px 8px; border: 0;
      border-radius: var(--radius-sm); background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
    .ocisti:hover { color: var(--ink); }
    .ocisti .mat-icon { width: 18px; height: 18px; }
    @media (max-width: 599.98px) {
      .polje { flex: 1 1 100%; min-height: 44px; }
      input { font-size: 16px; }
      .ocisti { min-height: 44px; }
    }
  `,
})
export class FilterBar {
  /** Trenutna pretraga iz URL-a; `undefined` = lista nema pretragu. */
  readonly pretraga = input<string | null | undefined>(undefined);
  readonly pretragaLabela = input('Pretraži…');
  readonly imaFiltera = input(false);
  readonly pretragaChange = output<string | null>();
  readonly ocisti = output<void>();

  protected readonly tekst = signal('');
  private tajmer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const spolja = this.pretraga() ?? '';
      untracked(() => {
        // Poredi normalizovano: roditelj vraća `trim`-ovanu vrednost, a razmak na kraju (korisnik tek kuca sledeću reč)
        // ne sme da nestane niti da kursor skoči.
        if (this.tajmer === undefined && normalizuj(spolja) !== normalizuj(this.tekst())) {
          this.tekst.set(spolja);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.otkazi());
  }

  protected kucaj(v: string): void {
    this.tekst.set(v);
    this.otkazi();
    this.tajmer = setTimeout(() => {
      this.tajmer = undefined;
      const nova = normalizuj(this.tekst());
      if (nova !== normalizuj(this.pretraga())) {
        this.pretragaChange.emit(nova);
      }
    }, DEBOUNCE_PRETRAGE_MS);
  }

  /** Esc u punom polju ga briše odmah (bez čekanja); u praznom polju ostavlja Esc roditelju (dijalog, meni). */
  protected isprazni(e: Event): void {
    if (this.tekst() === '') {
      return;
    }
    e.stopPropagation();
    this.otkazi();
    this.tekst.set('');
    if (normalizuj(this.pretraga()) !== null) {
      this.pretragaChange.emit(null);
    }
  }

  protected ocistiSve(): void {
    this.otkazi();
    this.tekst.set('');
    this.ocisti.emit();
  }

  private otkazi(): void {
    clearTimeout(this.tajmer);
    this.tajmer = undefined;
  }
}
