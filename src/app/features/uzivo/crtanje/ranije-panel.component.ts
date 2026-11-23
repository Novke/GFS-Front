import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDatum } from '../../../shared/util/datum.pipe';
import type { SlajdZaPrikaz, Tema } from '../ui/slajd-za-prikaz';
import { RanijiCrtez } from './crtanje.models';
import { IkonaCrtanjaComponent } from './ikona-crtanja.component';
import { SlicicaCrtezaComponent } from './slicica-crteza.component';

/** "Grupa · 12. 11. 2026." za sličicu ranijeg crteža (bez grupe samo datum). */
export function oznakaRanijeg(r: Pick<RanijiCrtez, 'grupa' | 'pocetak'>): string {
  return [r.grupa, formatDatum(r.pocetak)].filter(Boolean).join(' · ');
}

/**
 * Panel „Ranije ovde” u režimu crtanja (spec 5.4): sličice crteža drugih izvođenja na ovoj strani (slajd ili bela
 * pozadina), sa grupom i datumom. Klik dodaje stare elemente na trenutnu stranu (jedan korak, poništi ga vraća).
 */
@Component({
  selector: 'app-ranije-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IkonaCrtanjaComponent, SlicicaCrtezaComponent],
  host: { class: 'crt-ranije', role: 'region', 'aria-label': 'Ranije ovde' },
  styles: `
    :host { width: 200px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: flex;
      flex-direction: column; gap: 10px; overflow: auto; }
    h2 { font-size: 13px; margin: 0; display: flex; gap: 6px; align-items: center; }
    h2 app-ikona-crtanja { width: 16px; height: 16px; color: var(--warn); }
    button { padding: 0; border: 2px solid var(--line); border-radius: 6px; width: 100%; position: relative; display: block; text-align: left;
      background: none; cursor: pointer; color: inherit; font: inherit; }
    button:hover { border-color: var(--primary); }
    button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    small { display: block; font-size: 11px; color: var(--muted); padding: 3px 4px 2px; }
    .crt-dodaj { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; border-radius: 50%; background: var(--primary);
      color: var(--primary-ink); display: grid; place-items: center; }
    .crt-dodaj app-ikona-crtanja { width: 16px; height: 16px; }
    p { font-size: 12px; color: var(--muted); margin: 0; }
  `,
  template: `
    <h2><app-ikona-crtanja ime="sat" /> Ranije ovde</h2>
    @for (r of crtezi(); track $index) {
      <button type="button" [attr.aria-label]="'Ubaci raniji crtež: ' + oznaka(r)" (click)="izabran.emit(r)">
        <app-slicica-crteza [slajd]="slajd()" [tema]="tema()" [elementi]="r.elementi" />
        <small>{{ oznaka(r) }}</small>
        <span class="crt-dodaj" aria-hidden="true"><app-ikona-crtanja ime="plus" /></span>
      </button>
    }
    <p>Klik ubacuje stari crtež; dalje crtaš preko njega.</p>
  `,
})
export class RanijePanelComponent {
  readonly crtezi = input.required<readonly RanijiCrtez[]>();
  /** Slajd ispod crteža; `null` = bela pozadina. */
  readonly slajd = input<SlajdZaPrikaz | null>(null);
  readonly tema = input<Tema>('NACRT');
  readonly izabran = output<RanijiCrtez>();
  protected readonly oznaka = oznakaRanijeg;
}
