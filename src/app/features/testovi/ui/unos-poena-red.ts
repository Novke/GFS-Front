import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIcon } from '@angular/material/icon';

import { SaveStatus, StanjeCuvanja } from '../../../shared/ui/save-status';
import { StatusChip } from '../../../shared/ui/status-chip';
import { IndeksPipe } from '../../../shared/util/indeks.pipe';
import { GreskaReda, MAX_NAPOMENA, PoljeReda, RedIspitanika, VrednostiReda } from '../data-access/test.store';
import { TestGrupa } from '../data-access/testovi.models';

/** Kolone sa poljem za unos (Enter prelazi na isto polje u sledećem redu). */
export type KolonaUnosa = 'poeni' | 'napomena';

/**
 * Jedan red tabelarnog unosa poena (`<tr appUnosPoenaRed>`): ime, indeks, varijanta (segmentirano), poeni 0-max sa
 * porukom validacije, prepisivao, napomena, status čuvanja (`SaveStatus`, "Pokušaj ponovo") i ukloni. Red ne čuva sam:
 * svaka izmena ide kroz `izmena` (store debounsuje i šalje). Enter u polju poena ili napomene ide na isto polje u
 * sledećem redu (Shift+Enter u prethodnom), Tab na sledeće polje. Ispod 600 px red je kartica.
 */
@Component({
  // red tabele mora biti `<tr>` (semantika tabele), pa je selektor atribut
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'tr[appUnosPoenaRed]',
  imports: [IndeksPipe, MatButtonToggle, MatButtonToggleGroup, MatCheckbox, MatIcon, MatIconButton, SaveStatus, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-student]': 'red().id', '[class.zauzet]': '!!zauzet()', '[class.neispravan]': '!!greskaValidacije()' },
  template: `
    <th scope="row" class="c-student">
      <span class="ime">{{ ime() }}</span>
      @if (red().stariji) {
        <app-status-chip tekst="stariji" ton="warn" [ikona]="null" />
      }
    </th>
    <td class="c-indeks mono">{{ red().indeks | indeks: red().godina }}</td>
    <td class="c-varijanta">
      @if (samoCitanje() || varijante().length <= 1) {
        <span class="mono">{{ vrednost().grupa ?? '—' }}</span>
      } @else {
        <mat-button-toggle-group class="segment" [attr.aria-label]="'Varijanta, ' + ime()" [hideSingleSelectionIndicator]="true"
          [attr.aria-invalid]="neispravno('varijanta')" [attr.aria-describedby]="opis('varijanta')"
          [value]="vrednost().grupa" [disabled]="!!zauzet()" (change)="izmena.emit({ grupa: $event.value })">
          @for (v of varijante(); track v) {
            <mat-button-toggle [value]="v" [attr.data-varijanta]="v">{{ v }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      }
    </td>
    <td class="c-poeni">
      @if (samoCitanje()) {
        <span class="mono">{{ vrednost().poeni || '—' }}</span>
      } @else {
        <span class="poeni-polje">
          <input class="unos mono" type="text" inputmode="decimal" autocomplete="off" data-kolona="poeni"
            [attr.aria-label]="'Poeni, ' + ime() + (max() !== null ? ', od 0 do ' + max() : '')"
            [attr.aria-invalid]="neispravno('poeni')" [attr.aria-describedby]="opis('poeni')"
            [value]="vrednost().poeni" [disabled]="!!zauzet()"
            (input)="izmena.emit({ poeni: $any($event.target).value })" (keydown.enter)="dalje($event, 'poeni')" />
          @if (max() !== null) {
            <span class="od" aria-hidden="true">/ {{ max() }}</span>
          }
        </span>
      }
      @if (greskaValidacije(); as g) {
        <span class="greska" [id]="idGreske()" data-greska>{{ g.poruka }}</span>
      } @else if (stanje() === 'greska' && greskaServera()) {
        <span class="greska" [id]="idGreske()" data-greska-servera>Nije sačuvano: {{ greskaServera() }}</span>
      }
    </td>
    <td class="c-prepisivao">
      @if (samoCitanje()) {
        @if (vrednost().prepisivao) {
          <app-status-chip tekst="prepisivao" ton="danger" />
        } @else {
          <span class="nema">—</span>
        }
      } @else {
        <mat-checkbox [checked]="vrednost().prepisivao" [disabled]="!!zauzet()" (change)="izmena.emit({ prepisivao: $event.checked })"
          data-prepisivao>
          <span class="sr-only">Prepisivao, {{ ime() }}</span><span class="samo-mobilno" aria-hidden="true">Prepisivao</span>
        </mat-checkbox>
      }
    </td>
    <td class="c-napomena">
      @if (samoCitanje()) {
        <span [class.nema]="!vrednost().napomene">{{ vrednost().napomene || '—' }}</span>
      } @else {
        <input class="unos" type="text" autocomplete="off" data-kolona="napomena" [attr.maxlength]="maxNapomena"
          [attr.aria-label]="'Napomena, ' + ime()" [attr.aria-invalid]="neispravno('napomena')" [attr.aria-describedby]="opis('napomena')"
          placeholder="Napomena" [value]="vrednost().napomene" [disabled]="!!zauzet()"
          (input)="izmena.emit({ napomene: $any($event.target).value })" (keydown.enter)="dalje($event, 'napomena')" />
      }
    </td>
    @if (!samoCitanje()) {
      <td class="c-status">
        @if (zauzet() === 'dodaje') {
          <span class="info">Dodaje se…</span>
        } @else if (zauzet() === 'uklanja') {
          <span class="info">Uklanja se…</span>
        } @else {
          <app-save-status kompaktno [stanje]="stanje()" [attr.title]="greskaServera()" (ponovo)="ponovo.emit()" />
        }
      </td>
      <td class="c-ukloni">
        <button matIconButton type="button" [attr.aria-label]="'Ukloni ' + ime() + ' sa testa'" [disabled]="!!zauzet()"
          data-ukloni (click)="ukloni.emit()">
          <mat-icon svgIcon="delete" />
        </button>
      </td>
    }
  `,
  styles: `
    :host { vertical-align: middle; }
    :host(.zauzet) { opacity: 0.65; }
    th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
    .c-student { font-weight: 600; min-width: 160px; }
    .c-student .ime { margin-right: 6px; overflow-wrap: anywhere; }
    .c-indeks { white-space: nowrap; color: var(--ink-2); font-size: 13px; }
    .segment { --mat-button-toggle-height: 32px; }
    .poeni-polje { display: inline-flex; align-items: center; gap: 6px; }
    .c-poeni .unos { width: 72px; text-align: right; }
    .od { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .c-napomena { min-width: 160px; }
    .c-napomena .unos { width: 100%; min-width: 140px; }
    .unos { height: 36px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface);
      color: var(--ink); font: inherit; font-size: 14px; }
    .unos:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; border-color: var(--primary); }
    .unos[aria-invalid='true'] { border-color: var(--danger); }
    .unos:disabled { background: var(--surface-2); }
    .greska { display: block; margin-top: 2px; color: var(--danger); font-size: 12px; }
    .nema, .info { color: var(--muted); font-size: 13px; }
    .samo-mobilno { display: none; }
    .c-status { width: 1%; white-space: nowrap; }
    .c-ukloni { width: 1%; }
    @media (max-width: 599.98px) {
      :host { display: grid; grid-template-columns: auto auto 1fr auto; grid-template-areas:
        'student student status ukloni' 'indeks indeks indeks ukloni' 'varijanta poeni poeni prepisivao' 'napomena napomena napomena napomena';
        gap: 6px 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
      th, td { display: block; padding: 0; border: 0; }
      .c-student { grid-area: student; min-width: 0; }
      .c-indeks { grid-area: indeks; }
      .c-varijanta { grid-area: varijanta; }
      .c-poeni { grid-area: poeni; }
      .c-prepisivao { grid-area: prepisivao; text-align: right; }
      .c-napomena { grid-area: napomena; min-width: 0; }
      .c-status { grid-area: status; justify-self: end; align-self: center; width: auto; }
      .c-ukloni { grid-area: ukloni; justify-self: end; align-self: center; width: auto; }
      .segment { --mat-button-toggle-height: 44px; }
      .unos { height: 44px; font-size: 16px; }
      .c-napomena .unos { min-width: 0; }
      .samo-mobilno { display: inline; }
    }
  `,
})
export class UnosPoenaRed {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly red = input.required<RedIspitanika>();
  readonly vrednost = input.required<VrednostiReda>();
  readonly varijante = input.required<readonly TestGrupa[]>();
  readonly max = input<number | null>(null);
  readonly stanje = input<StanjeCuvanja | null | undefined>(null);
  readonly greskaServera = input<string | null | undefined>(null);
  readonly greskaValidacije = input<GreskaReda | null | undefined>(null);
  readonly zauzet = input<'dodaje' | 'uklanja' | undefined>(undefined);
  readonly samoCitanje = input(false);

  readonly izmena = output<Partial<VrednostiReda>>();
  readonly ponovo = output<void>();
  readonly ukloni = output<void>();

  protected readonly maxNapomena = MAX_NAPOMENA;
  protected readonly ime = computed(() => [this.red().ime, this.red().prezime].filter(Boolean).join(' ') || 'Student');
  protected readonly idGreske = computed(() => `greska-reda-${this.red().id}`);
  /** `aria-invalid` za polje na koje se odnosi greška validacije (greška servera se vezuje za poene). */
  protected neispravno(polje: PoljeReda): 'true' | null {
    const g = this.greskaValidacije();
    return g ? (g.polje === polje ? 'true' : null) : polje === 'poeni' && this.serverska() ? 'true' : null;
  }

  /** `aria-describedby` ka poruci ispod poena, za polje na koje se poruka odnosi. */
  protected opis(polje: PoljeReda): string | null {
    return this.neispravno(polje) ? this.idGreske() : null;
  }

  private readonly serverska = computed(() => this.stanje() === 'greska' && !!this.greskaServera());

  /** Enter: isto polje u sledećem redu (Shift+Enter: u prethodnom). */
  protected dalje(e: Event, kolona: KolonaUnosa): void {
    e.preventDefault();
    const shift = (e as KeyboardEvent).shiftKey;
    let red = (shift ? this.host.previousElementSibling : this.host.nextElementSibling) as HTMLElement | null;
    while (red) {
      const polje = red.querySelector<HTMLInputElement>(`[data-kolona="${kolona}"]:not(:disabled)`);
      if (polje) {
        polje.focus();
        polje.select();
        return;
      }
      red = (shift ? red.previousElementSibling : red.nextElementSibling) as HTMLElement | null;
    }
  }
}
