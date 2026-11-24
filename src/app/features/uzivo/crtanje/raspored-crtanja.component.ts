import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AlatiCrtanjaComponent, TrakaCrtanjaComponent } from './alati-crtanja.component';
import { Crtac } from './crtac';

/**
 * Telo režima crtanja (spec 5.1, maketa): levo kolona alata, gore boje i izmene, u sredini što veća scena 16:9
 * (`[crt-scena]`: scena i površina), desno „Ranije ovde” (`[crt-ranije]`, samo kad ima šta). Uska konzola: traka, scena,
 * pa alati u jednom redu ispod scene. Na kraj gornje trake ide `[crt-traka]` (znak "nije sačuvano").
 */
@Component({
  selector: 'app-raspored-crtanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AlatiCrtanjaComponent, TrakaCrtanjaComponent],
  host: { class: 'crt-raspored', '[class.crt-raspored--usko]': 'usko()' },
  styles: `
    :host { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; grid-template-areas: 'alati sredina desno'; gap: 12px;
      padding: 12px; min-height: 0; box-sizing: border-box; }
    :host(.crt-raspored--usko) { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'sredina' 'alati' 'desno'; padding: 8px; gap: 8px; }
    app-alati-crtanja { grid-area: alati; }
    .crt-r-sredina { grid-area: sredina; display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
    .crt-r-okvir { flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; }
    .crt-r-scena { position: relative; width: min(100cqw, 100cqh * 16 / 9); aspect-ratio: 16 / 9; overflow: hidden; border-radius: 6px;
      box-shadow: 0 2px 12px rgb(18 26 42 / 0.12); background: #fff; }
    :host(.crt-raspored--usko) .crt-r-okvir { container-type: normal; flex: none; }
    :host(.crt-raspored--usko) .crt-r-scena { width: 100%; }
    .crt-r-desno { grid-area: desno; display: flex; min-height: 0; }
    .crt-r-desno:empty { display: none; }
    :host(.crt-raspored--usko) .crt-r-desno > * { width: 100%; }
  `,
  template: `
    <app-alati-crtanja [crtac]="crtac()" [vodoravno]="usko()" />
    <div class="crt-r-sredina">
      <app-traka-crtanja [crtac]="crtac()"><ng-content select="[crt-traka]" /></app-traka-crtanja>
      <div class="crt-r-okvir"><div class="crt-r-scena" data-crt-scena><ng-content select="[crt-scena]" /></div></div>
    </div>
    <div class="crt-r-desno"><ng-content select="[crt-ranije]" /></div>
  `,
})
export class RasporedCrtanjaComponent {
  readonly crtac = input.required<Crtac>();
  readonly usko = input(false);
}
