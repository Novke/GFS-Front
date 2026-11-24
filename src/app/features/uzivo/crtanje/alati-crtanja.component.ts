import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ALATI, BOJE, DEBLJINE } from './crtanje.models';
import { Crtac } from './crtac';
import { IkonaCrtanjaComponent } from './ikona-crtanja.component';

/** Zajednički izgled dugmadi crtanja (52 px, ikonica 28 px, izabrano = meka primarna). */
const DUGMAD = `
  .crt-ik { width: 52px; height: 52px; border-radius: 12px; border: 1px solid transparent; background: transparent; color: var(--ink);
    display: grid; place-items: center; position: relative; padding: 0; cursor: pointer; flex: none; }
  .crt-ik:hover:not(:disabled) { background: var(--surface-2); }
  .crt-ik[aria-pressed='true'] { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-soft-ink); }
  .crt-ik:disabled { opacity: 0.35; cursor: default; }
  .crt-ik:focus-visible, .crt-boja:focus-visible, .crt-debljina:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .crt-ik--opasno { color: var(--danger); }
  .crt-taster { position: absolute; right: 3px; bottom: 2px; font: 600 10px var(--font-mono, monospace); opacity: 0.75; }
`;

/** Kolona alata (7 alata, pa tri debljine); u uskoj konzoli jedan red ispod scene (`vodoravno`). */
@Component({
  selector: 'app-alati-crtanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IkonaCrtanjaComponent, MatTooltipModule],
  host: { class: 'crt-alati', role: 'toolbar', 'aria-label': 'Alati za crtanje', '[class.crt-alati--red]': 'vodoravno()',
    '[attr.aria-orientation]': 'vodoravno() ? "horizontal" : "vertical"' },
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; background: var(--surface);
      border: 1px solid var(--line); border-radius: 14px; overflow: auto; }
    :host(.crt-alati--red) { flex-direction: row; padding: 4px 8px; overflow-x: auto; }
    hr { border: 0; background: var(--line); width: 44px; height: 1px; margin: 6px 0; flex: none; }
    :host(.crt-alati--red) hr { width: 1px; height: 36px; margin: 0 6px; }
    .crt-debljina { width: 52px; height: 40px; border-radius: 10px; border: 1px solid transparent; background: transparent; display: grid;
      place-items: center; cursor: pointer; color: var(--ink); flex: none; padding: 0; }
    .crt-debljina[aria-pressed='true'] { background: var(--primary-soft); border-color: var(--primary); }
    .crt-debljina span { display: block; border-radius: 50%; background: currentColor; }
    ${DUGMAD}
  `,
  template: `
    @for (a of alati; track a.tip) {
      <button type="button" class="crt-ik" [attr.aria-pressed]="crtac().alat() === a.tip" [attr.aria-label]="a.ime"
              [attr.aria-keyshortcuts]="a.taster" [matTooltip]="a.ime + ' (' + a.taster + ')'" [matTooltipPosition]="vodoravno() ? 'above' : 'right'"
              (click)="crtac().izaberiAlat(a.tip)">
        <app-ikona-crtanja [ime]="a.tip" /><span class="crt-taster" aria-hidden="true">{{ a.taster }}</span>
      </button>
    }
    <hr>
    @for (d of debljine; track d.debljina) {
      <button type="button" class="crt-debljina" [attr.aria-pressed]="crtac().debljina() === d.debljina" [attr.aria-label]="d.ime"
              [matTooltip]="d.ime" [matTooltipPosition]="vodoravno() ? 'above' : 'right'" (click)="crtac().debljina.set(d.debljina)">
        <span [style.width.px]="d.debljina + 4" [style.height.px]="d.debljina + 4" [style.color]="crtac().boja()"></span>
      </button>
    }
  `,
})
export class AlatiCrtanjaComponent {
  readonly crtac = input.required<Crtac>();
  readonly vodoravno = input(false);
  protected readonly alati = ALATI;
  protected readonly debljine = DEBLJINE;
}

/**
 * Gornja traka crtanja: šest boja, poništi, vrati, obriši sve i „publika vidi alate” (oko). Na kraj trake ide sadržaj
 * stranice (znak "nije sačuvano", dugmad table).
 */
@Component({
  selector: 'app-traka-crtanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IkonaCrtanjaComponent, MatTooltipModule],
  host: { class: 'crt-traka', role: 'toolbar', 'aria-label': 'Boje i izmene crteža' },
  styles: `
    :host { display: flex; gap: 6px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
      padding: 6px 10px; flex-wrap: wrap; }
    .crt-boje { display: flex; gap: 10px; flex-wrap: wrap; }
    .crt-boja { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #fff; outline: 1px solid var(--line); padding: 0; cursor: pointer; }
    .crt-boja[aria-pressed='true'] { outline: 3px solid var(--ink); }
    .crt-razmak { flex: 1; }
    hr { border: 0; background: var(--line); width: 1px; height: 36px; margin: 0 6px; }
    ${DUGMAD}
  `,
  template: `
    <div class="crt-boje" role="group" aria-label="Boja">
      @for (b of boje; track b.hex) {
        <button type="button" class="crt-boja" [style.background]="b.hex" [attr.aria-label]="b.ime" [matTooltip]="b.ime"
                [attr.aria-pressed]="crtac().boja() === b.hex" (click)="crtac().izaberiBoju(b.hex)"></button>
      }
    </div>
    <span class="crt-razmak"></span>
    <ng-content />
    <button type="button" class="crt-ik" aria-label="Poništi" matTooltip="Poništi (Ctrl+Z)" aria-keyshortcuts="Control+Z"
            [disabled]="!crtac().mozePonisti()" (click)="crtac().ponisti()"><app-ikona-crtanja ime="ponisti" /></button>
    <button type="button" class="crt-ik" aria-label="Vrati" matTooltip="Vrati (Ctrl+Y)" aria-keyshortcuts="Control+Y"
            [disabled]="!crtac().mozeVrati()" (click)="crtac().vrati()"><app-ikona-crtanja ime="vrati" /></button>
    <button type="button" class="crt-ik crt-ik--opasno" aria-label="Obriši sve" matTooltip="Obriši sve (Poništi vraća)"
            [disabled]="!crtac().elementi().length" (click)="crtac().obrisiSve()"><app-ikona-crtanja ime="obrisi" /></button>
    <hr>
    <button type="button" class="crt-ik" aria-label="Publika vidi alate" matTooltip="Publika vidi alate"
            [attr.aria-pressed]="crtac().publikaVidiAlate()" (click)="crtac().prebaciPublikaVidi()"><app-ikona-crtanja ime="oko" /></button>
  `,
})
export class TrakaCrtanjaComponent {
  readonly crtac = input.required<Crtac>();
  protected readonly boje = BOJE;
}

export { DUGMAD as STIL_DUGMADI_CRTANJA };
