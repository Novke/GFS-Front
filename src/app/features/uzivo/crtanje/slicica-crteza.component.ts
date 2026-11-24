import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import type { SlajdZaPrikaz, Tema } from '../ui/slajd-za-prikaz';
import { ElementCrteza } from './crtanje.models';
import { SlojCrtezaComponent } from './sloj-crteza.component';

/** PLATNO i INFO slajd u sličici: svi koraci otkriveni (krajnje stanje, kao studentski pregled). */
const SVI_KORACI = 10_000;

/**
 * Sličica strane: slajd (ili bela pozadina kad je `slajd` `null`) i crtež preko njega, 16:9. Koriste je panel „Ranije
 * ovde”, pregled izvođenja i tabla predavanja na stranici predavanja.
 */
@Component({
  selector: 'app-slicica-crteza',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlajdPrikazComponent, SlojCrtezaComponent],
  host: { class: 'crt-slicica rezim-dan uz-dan' },
  styles: `
    :host { position: relative; display: block; aspect-ratio: 16 / 9; overflow: hidden; background: #fff; border-radius: 4px; }
    app-slajd-prikaz { position: absolute; inset: 0; pointer-events: none; }
  `,
  template: `
    @if (slajd(); as s) { <app-slajd-prikaz [slajd]="s" [korak]="sviKoraci" [tema]="tema()" /> }
    <app-sloj-crteza [elementi]="elementi()" />
  `,
})
export class SlicicaCrtezaComponent {
  readonly slajd = input<SlajdZaPrikaz | null>(null);
  readonly tema = input<Tema>('NACRT');
  readonly elementi = input<readonly ElementCrteza[]>([]);
  protected readonly sviKoraci = SVI_KORACI;
}
