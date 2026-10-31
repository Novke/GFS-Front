import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

import {
  PoljeZadatka, VrednostPolja, jeOpcija, normalizujBroj, oznakaNaTelefonu, popunjeno, porukaZaBroj, tacnoPolja,
} from '../../uzivo/ui/polja-zadatka';
import { TekstFormuleComponent } from '../../uzivo/ui/tekst-formule.component';
import { tekstZaCitac } from '../../uzivo/ui/tekst-formule';
import { ProveraVezbanja, ResenjeVezbanja, ZadatakVezbanja } from '../data-access/portal.models';
import { SlikaZadatka } from './slika-zadatka.component';

/**
 * Jedan zadatak za vežbanje (spec studentskog dela 5.4): slika zadatka, ista polja kao na času (BROJ numerička tastatura,
 * TEKST, JEDAN_TACAN dugmad, VISE_TACNIH prekidači; formule u opcijama), "Proveri" (više puta: tačno/netačno po polju, polja
 * ostaju za ispravku), "Prikaži rešenje" (tačne vrednosti i slika rešenja) i "Sledeći zadatak". Bez bodova. Grupa bez polja:
 * "Reši na papiru". Prezentaciona: zahteve šalje strana (`vezbanje.page`), a ova komponenta crta tačno ono što je server
 * vratio (tačne vrednosti tek posle "Prikaži rešenje").
 */
@Component({
  selector: 'app-vezbanje-unos',
  imports: [SlikaZadatka, TekstFormuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let z = zadatak();
    <app-slika-zadatka [svgId]="z.svgId" oznaka="zadatak" />
    @if (!z.polja.length) {
      <p class="napomena" data-papir>Reši na papiru, pa uporedi sa rešenjem.</p>
    } @else {
      <form class="polja" (submit)="$event.preventDefault(); proveri1()">
        @for (p of z.polja; track p.kljuc; let i = $index) {
          @let o = ishodPolja(p.kljuc);
          @if (opcija(p)) {
            <div class="polje" role="group" [attr.aria-labelledby]="'vz-' + i" [attr.data-polje]="p.kljuc">
              <span class="oznaka" [id]="'vz-' + i">{{ oznaka(p) }}</span>
              <div class="opcije">
                @for (op of p.opcije ?? []; track op.id) {
                  @let izabrana = izabrane(p.kljuc).includes(op.id);
                  <button type="button" class="opcija" [disabled]="salje()" [attr.aria-pressed]="izabrana"
                          [attr.aria-label]="citac(op.tekst)" (click)="izaberi(p, op.id)">
                    @if (p.tip === 'VISE_TACNIH') { <span class="kvacica" aria-hidden="true">{{ izabrana ? '✓' : '' }}</span> }
                    <app-tekst-formule aria-hidden="true" [tekst]="op.tekst" />
                  </button>
                }
              </div>
              @if (o !== null) {
                <p class="ishod" [class.ok]="o" [class.lose]="!o" data-ishod>{{ o ? 'Tačno' : 'Netačno' }}</p>
              }
            </div>
          } @else {
            <div class="polje">
              <label class="oznaka" [for]="'vz-' + i">{{ oznaka(p) }}</label>
              <div class="red">
                <input class="unos" type="text" autocomplete="off" [id]="'vz-' + i" [attr.data-polje]="p.kljuc"
                       [attr.inputmode]="p.tip === 'BROJ' ? 'decimal' : null" [attr.maxlength]="p.tip === 'TEKST' ? 200 : null"
                       [value]="tekst(p.kljuc)" [disabled]="salje()" (input)="upisi(p.kljuc, $event)"
                       [attr.aria-invalid]="greske()[p.kljuc] || o === false ? 'true' : null"
                       [attr.aria-describedby]="'vz-poruka-' + i" />
                @if (p.jedinica) { <span class="jedinica">{{ p.jedinica }}</span> }
              </div>
              <p class="poruka-polja" [id]="'vz-poruka-' + i">
                @if (greske()[p.kljuc]; as g) { <span role="alert">{{ g }}</span> }
                @else if (o !== null) { <span class="ishod" [class.ok]="o" [class.lose]="!o" data-ishod>{{ o ? 'Tačno' : 'Netačno' }}</span> }
              </p>
            </div>
          }
          @if (resenje() && tacno(p); as t) {
            <p class="tacno" data-tacno>Tačno: @if (opcija(p)) { <app-tekst-formule [tekst]="t" /> } @else { {{ t }} }</p>
          }
        }
        <button type="submit" class="dugme glavno" [disabled]="salje() || !sve()" data-proveri>Proveri</button>
      </form>
      @if (provera(); as pr) {
        <p class="zbir" [class.ok]="pr.tacno" role="status" data-zbir>
          {{ pr.tacno ? 'Tačno! Sva polja su dobra.' : 'Nije sve tačno. Ispravi pa proveri ponovo, ili pogledaj rešenje.' }}
        </p>
      }
    }
    <div class="akcije">
      @if (!resenje()) {
        <button type="button" class="dugme" [disabled]="salje()" (click)="prikaziResenje.emit()" data-resenje>Prikaži rešenje</button>
      }
      <button type="button" class="dugme" [class.glavno]="!z.polja.length || provera()?.tacno || !!resenje()" [disabled]="salje()"
              (click)="sledeci.emit()" data-sledeci>Sledeći zadatak</button>
    </div>
    @if (resenje(); as r) {
      @if (r.resenjeSvgId; as id) {
        <app-slika-zadatka [svgId]="id" naziv="Rešenje" oznaka="resenje" />
      } @else if (!z.polja.length || !imaTacnih()) {
        <p class="napomena">Za ovaj zadatak rešenje nije uneto.</p>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .napomena { margin: 0; color: var(--ink-2); }
    .polja { display: flex; flex-direction: column; gap: 12px; margin: 0; }
    .polje { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .oznaka { font-weight: 600; }
    .opcije { display: flex; flex-direction: column; gap: 8px; }
    .opcija {
      display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 12px; border: 2px solid var(--line);
      border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-size: 17px; font-weight: 600;
      text-align: left; cursor: pointer; touch-action: manipulation;
    }
    .opcija[aria-pressed='true'] { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 1px var(--primary); }
    .opcija:disabled { opacity: 0.6; cursor: default; }
    .opcija:focus-visible, .dugme:focus-visible, .unos:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .opcija app-tekst-formule { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .kvacica { flex: none; width: 24px; font-size: 22px; text-align: center; }
    .red { display: flex; align-items: center; gap: 8px; }
    .unos { flex: 1; min-width: 0; min-height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px;
      background: var(--surface); color: var(--ink); font: inherit; font-size: 18px; }
    .unos[aria-invalid='true'] { border-color: var(--danger); }
    .jedinica { flex: none; color: var(--ink-2); }
    .poruka-polja { min-height: 1.2em; margin: 0; color: var(--danger); font-size: 14px; }
    .ishod { margin: 0; font-weight: 700; }
    .ok { color: var(--ok); }
    .lose { color: var(--danger); }
    .tacno { margin: -4px 0 0; color: var(--ok); overflow-wrap: anywhere; }
    .zbir { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; }
    .zbir.ok { border-color: var(--ok); background: var(--ok-soft); }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .dugme { min-height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
      color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
    .dugme.glavno { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
    .dugme:disabled { opacity: 0.6; cursor: default; }
    :host ::ng-deep .uz-formula--spremna { max-width: 100%; overflow-x: auto; overflow-y: hidden; padding-block: 0.25em; margin-block: -0.25em; }
  `,
})
export class VezbanjeUnos {
  readonly zadatak = input.required<ZadatakVezbanja>();
  readonly provera = input<ProveraVezbanja | null>(null);
  readonly resenje = input<ResenjeVezbanja | null>(null);
  readonly salje = input(false);
  readonly proveri = output<Record<string, VrednostPolja>>();
  readonly prikaziResenje = output<void>();
  readonly sledeci = output<void>();

  protected readonly opcija = jeOpcija;
  protected readonly citac = tekstZaCitac;
  private readonly pokusaj = computed(() => this.zadatak().pokusajId);
  protected readonly vrednosti = linkedSignal<number, Record<string, VrednostPolja>>({ source: this.pokusaj, computation: () => ({}) });
  protected readonly greske = linkedSignal<number, Record<string, string>>({ source: this.pokusaj, computation: () => ({}) });
  /** Polja promenjena posle poslednje provere: njihov stari ishod se više ne pokazuje. */
  private readonly izmenjena = linkedSignal<ProveraVezbanja | null, ReadonlySet<string>>({
    source: this.provera,
    computation: () => new Set(),
  });
  protected readonly sve = computed(() => this.zadatak().polja.every(p => popunjeno(p, this.vrednosti()[p.kljuc])));
  protected readonly imaTacnih = computed(() => Object.keys(this.resenje()?.tacneVrednosti ?? {}).length > 0);

  protected oznaka(p: PoljeZadatka): string {
    return oznakaNaTelefonu(p, this.zadatak().polja.length);
  }

  protected ishodPolja(kljuc: string): boolean | null {
    const o = this.provera()?.ishod?.[kljuc];
    return typeof o === 'boolean' && !this.izmenjena().has(kljuc) ? o : null;
  }

  protected tekst(kljuc: string): string {
    const v = this.vrednosti()[kljuc];
    return typeof v === 'string' ? v : '';
  }

  protected izabrane(kljuc: string): number[] {
    const v = this.vrednosti()[kljuc];
    return Array.isArray(v) ? v : [];
  }

  protected tacno(p: PoljeZadatka): string {
    return tacnoPolja(p, this.resenje()?.tacneVrednosti?.[p.kljuc]);
  }

  protected upisi(kljuc: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.vrednosti.update(s => ({ ...s, [kljuc]: v }));
    this.greske.update(g => ({ ...g, [kljuc]: '' }));
    this.oznaciIzmenu(kljuc);
  }

  /** JEDAN_TACAN: dodir bira (drugi menja izbor); VISE_TACNIH: prekidač. Izabrane su uvek redom opcija. */
  protected izaberi(p: PoljeZadatka, id: number): void {
    if (this.salje()) {
      return;
    }
    const ima = this.izabrane(p.kljuc);
    const nove = p.tip === 'JEDAN_TACAN'
      ? [id]
      : (p.opcije ?? []).map(o => o.id).filter(x => (x === id ? !ima.includes(x) : ima.includes(x)));
    this.vrednosti.update(s => ({ ...s, [p.kljuc]: nove }));
    this.oznaciIzmenu(p.kljuc);
  }

  /** Proveri brojeve (poruka uz polje), pa pošalji normalizovane vrednosti. */
  protected proveri1(): void {
    if (this.salje() || !this.sve()) {
      return;
    }
    const v = this.vrednosti();
    const polja = this.zadatak().polja;
    const greske: Record<string, string> = {};
    for (const p of polja) {
      const poruka = p.tip === 'BROJ' ? porukaZaBroj(v[p.kljuc] as string) : null;
      if (poruka) {
        greske[p.kljuc] = poruka;
      }
    }
    this.greske.set(greske);
    if (Object.keys(greske).length) {
      return;
    }
    const odgovor: Record<string, VrednostPolja> = {};
    for (const p of polja) {
      const x = v[p.kljuc];
      odgovor[p.kljuc] = typeof x === 'string' ? (p.tip === 'BROJ' ? normalizujBroj(x) : x.trim()) : x;
    }
    this.proveri.emit(odgovor);
  }

  private oznaciIzmenu(kljuc: string): void {
    if (this.provera()) {
      this.izmenjena.update(s => new Set([...s, kljuc]));
    }
  }
}
