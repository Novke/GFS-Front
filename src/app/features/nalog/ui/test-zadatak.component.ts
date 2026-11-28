import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { jeOpcija, oznakaNaTelefonu, porukaZaBroj } from '../../uzivo/ui/polja-zadatka';
import { TekstFormuleComponent } from '../../uzivo/ui/tekst-formule.component';
import { tekstZaCitac } from '../../uzivo/ui/tekst-formule';
import type { StatusCuvanja } from '../data-access/polaganje.store';
import { PoljeTesta, UnetoPolja, ZadatakTesta } from '../data-access/testovi-studenta.models';
import { formatPoena, vremeIzIso } from '../data-access/testovi-studenta.pravila';
import { SlikaZadatka } from './slika-zadatka.component';

/** Izmena jednog polja (`null` = obrisano). */
export interface IzmenaPolja { kljuc: string; vrednost: UnetoPolja | null; }

/**
 * Jedan zadatak online testa (spec online testova 11): slika, polja sa poenima koje nose i stanje čuvanja („Sačuvano 10:41:07“).
 * **Bez ikakve povratne informacije tačno/netačno**: jedina provera je oblik broja („Unesi broj.“), ista kao na serveru.
 * Prezentaciona: vrednosti dolaze iz store-a polaganja, svaka izmena ide napolje (`izmena`).
 */
@Component({
  selector: 'app-test-zadatak',
  imports: [SlikaZadatka, TekstFormuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let z = zadatak();
    <header class="glava">
      <h2>{{ z.rb }}. {{ z.naziv }}</h2>
      <span class="poeni">{{ poeni(z.maxPoena) }}</span>
    </header>
    <app-slika-zadatka [svgId]="z.svgId" oznaka="zadatak" />
    @if (!z.polja.length || z.rucno) {
      <p class="napomena" data-papir>
        {{ z.polja.length ? 'Ovaj zadatak nastavnik pregleda ručno.' : 'Ovaj zadatak radiš na papiru; predaješ ga nastavniku.' }}
      </p>
    }
    @if (z.polja.length) {
      <div class="polja">
        @for (p of z.polja; track p.kljuc; let i = $index) {
          @let id = 'tz-' + z.zadatakId + '-' + i;
          @if (opcija(p)) {
            <div class="polje" role="group" [attr.aria-labelledby]="id" [attr.data-polje]="p.kljuc">
              <span class="oznaka" [id]="id">{{ oznaka(p) }} <span class="pp">({{ poeni(p.poeniPolja) }})</span></span>
              <div class="opcije">
                @for (op of p.opcije ?? []; track op.id) {
                  @let izabrana = izabrane(p).includes(op.id);
                  <button type="button" class="opcija" [disabled]="zakljucano()" [attr.aria-pressed]="izabrana"
                          [attr.aria-label]="citac(op.tekst)" (click)="izaberi(p, op.id)">
                    <span class="kvacica" aria-hidden="true">{{ izabrana ? '✓' : '' }}</span>
                    <app-tekst-formule aria-hidden="true" [tekst]="op.tekst" />
                  </button>
                }
              </div>
            </div>
          } @else {
            <div class="polje">
              <label class="oznaka" [for]="id">{{ oznaka(p) }} <span class="pp">({{ poeni(p.poeniPolja) }})</span></label>
              <div class="red">
                <input class="unos" type="text" autocomplete="off" spellcheck="false" [id]="id" [attr.data-polje]="p.kljuc"
                       [attr.inputmode]="p.tip === 'BROJ' ? 'decimal' : null" maxlength="200"
                       [value]="tekst(p)" [disabled]="zakljucano()" (input)="upisi(p, $event)"
                       [attr.aria-invalid]="greskaBroja(p) ? 'true' : null" [attr.aria-describedby]="id + '-p'" />
                @if (p.jedinica) { <span class="jedinica">{{ p.jedinica }}</span> }
              </div>
              <p class="poruka-polja" [id]="id + '-p'">@if (greskaBroja(p); as g) { {{ g }} }</p>
            </div>
          }
        }
      </div>
      <p class="cuvanje" [class.greska]="status() === 'greska'" role="status" data-cuvanje>{{ tekstCuvanja() }}</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .glava { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 20px; }
    .poeni { flex: none; color: var(--ink-2); font-family: var(--font-mono); }
    .napomena { margin: 0; color: var(--ink-2); }
    .polja { display: flex; flex-direction: column; gap: 12px; }
    .polje { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .oznaka { font-weight: 600; }
    .pp { color: var(--ink-2); font-weight: 400; font-family: var(--font-mono); }
    .opcije { display: flex; flex-direction: column; gap: 8px; }
    .opcija {
      display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 12px; border: 2px solid var(--line);
      border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-size: 17px; text-align: left;
      cursor: pointer; touch-action: manipulation;
    }
    .opcija[aria-pressed='true'] { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 1px var(--primary); }
    .opcija:disabled { opacity: 0.6; cursor: default; }
    .opcija:focus-visible, .unos:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .opcija app-tekst-formule { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .kvacica { flex: none; width: 24px; font-size: 22px; text-align: center; }
    .red { display: flex; align-items: center; gap: 8px; }
    .unos { flex: 1; min-width: 0; min-height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px;
      background: var(--surface); color: var(--ink); font: inherit; font-size: 18px; }
    .unos[aria-invalid='true'] { border-color: var(--danger); }
    .jedinica { flex: none; color: var(--ink-2); }
    .poruka-polja { min-height: 1.2em; margin: 0; color: var(--danger); font-size: 14px; }
    .cuvanje { margin: 0; color: var(--ink-2); font-size: 14px; }
    .cuvanje.greska { color: var(--danger); font-weight: 600; }
    :host ::ng-deep .uz-formula--spremna { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
  `,
})
export class TestZadatak {
  readonly zadatak = input.required<ZadatakTesta>();
  readonly uneto = input<Record<string, UnetoPolja>>({});
  readonly status = input<StatusCuvanja>('cisto');
  readonly poruka = input<string | null>(null);
  readonly sacuvano = input<string | null>(null);
  readonly zakljucano = input(false);
  readonly izmena = output<IzmenaPolja>();

  protected readonly opcija = jeOpcija;
  protected readonly citac = tekstZaCitac;
  protected readonly tekstCuvanja = computed(() => {
    switch (this.status()) {
      case 'ceka':
      case 'cuva':
        return 'Čuvam…';
      case 'greska':
        return this.poruka() ?? 'Nije sačuvano.';
      default:
        return this.sacuvano() ? `Sačuvano ${vremeIzIso(this.sacuvano())}` : 'Još ništa nije uneto.';
    }
  });

  protected poeni(p: number): string {
    return `${formatPoena(p)} ${p === 1 ? 'poen' : 'poena'}`;
  }

  protected oznaka(p: PoljeTesta): string {
    return oznakaNaTelefonu(p, this.zadatak().polja.length);
  }

  protected tekst(p: PoljeTesta): string {
    const v = this.uneto()[p.kljuc];
    return typeof v === 'string' ? v : '';
  }

  protected greskaBroja(p: PoljeTesta): string | null {
    const v = this.tekst(p);
    return p.tip === 'BROJ' && v.trim() !== '' ? porukaZaBroj(v) : null;
  }

  protected izabrane(p: PoljeTesta): number[] {
    const v = this.uneto()[p.kljuc];
    return typeof v === 'number' ? [v] : Array.isArray(v) ? v : [];
  }

  protected upisi(p: PoljeTesta, e: Event): void {
    this.izmena.emit({ kljuc: p.kljuc, vrednost: (e.target as HTMLInputElement).value });
  }

  /** JEDAN_TACAN: id opcije (ponovni dodir poništava izbor); VISE_TACNIH: prekidač, izabrane redom opcija. */
  protected izaberi(p: PoljeTesta, id: number): void {
    const ima = this.izabrane(p);
    if (p.tip === 'JEDAN_TACAN') {
      this.izmena.emit({ kljuc: p.kljuc, vrednost: ima.includes(id) ? null : id });
      return;
    }
    const nove = (p.opcije ?? []).map(o => o.id).filter(x => (x === id ? !ima.includes(x) : ima.includes(x)));
    this.izmena.emit({ kljuc: p.kljuc, vrednost: nove });
  }
}
