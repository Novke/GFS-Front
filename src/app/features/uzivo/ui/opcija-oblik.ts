import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SlovoOpcije = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface OblikOpcije {
  readonly slovo: SlovoOpcije;
  readonly simbol: string;
  readonly boja: string;
  /** Za `aria-label` (opcija se nikad ne prepoznaje samo po boji). */
  readonly naziv: string;
}

/** Oblici i boje opcija po redu (spec 2.13, Kahoot obrazac): beli simbol i slovo na boji. */
export const OBLICI: readonly OblikOpcije[] = Object.freeze([
  { slovo: 'A', simbol: '▲', boja: '#d6363c', naziv: 'crveni trougao' },
  { slovo: 'B', simbol: '◆', boja: '#2456a6', naziv: 'plavi romb' },
  { slovo: 'C', simbol: '●', boja: '#c98a00', naziv: 'žuti krug' },
  { slovo: 'D', simbol: '■', boja: '#1d7a55', naziv: 'zeleni kvadrat' },
  { slovo: 'E', simbol: '★', boja: '#7a4bd6', naziv: 'ljubičasta zvezda' },
  { slovo: 'F', simbol: '⬟', boja: '#0f7d8c', naziv: 'tirkizni petougao' },
] as const);

/** Oblik za opciju na mestu `indeks` (0-based, redosled po `rb`); van opsega kruži umesto da pukne. */
export function oblikOpcije(indeks: number): OblikOpcije {
  const n = OBLICI.length;
  return OBLICI[((Math.trunc(indeks) % n) + n) % n];
}

/** Simboli kao SVG putanje (viewBox 24), da ne zavise od fonta na projektoru ili telefonu. */
const PUTANJE: Record<SlovoOpcije, string> = {
  A: 'M12 3L21.53 19.5L2.47 19.5Z',
  B: 'M12 1.5L22.5 12L12 22.5L1.5 12Z',
  C: 'M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0Z',
  D: 'M3.5 3.5h17v17h-17Z',
  E: 'M12 1.9L14.7 9.18L22.46 9.5L16.37 14.32L18.47 21.8L12 17.5L5.53 21.8L7.63 14.32L1.54 9.5L9.3 9.18Z',
  F: 'M12 2.4L21.99 9.66L18.17 21.39L5.83 21.39L2.01 9.66Z',
};

/**
 * Značka opcije: obojena pločica sa belim oblikom i slovom. `velicina` je visina značke (broj = px, string = CSS dužina,
 * npr. `'3cqw'`); bez nje je 1.6em okolnog teksta.
 */
@Component({
  selector: 'app-opcija-oblik',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'uz-oblik',
    role: 'img',
    '[attr.aria-label]': 'oblik().slovo + ", " + oblik().naziv',
    '[style.--uz-boja]': 'oblik().boja',
    '[style.--uz-oblik-velicina]': 'velicinaCss()',
  },
  template: `
    <svg class="uz-oblik-simbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="putanja()" /></svg>
    <span class="uz-oblik-slovo" aria-hidden="true">{{ oblik().slovo }}</span>
  `,
})
export class OpcijaOblikComponent {
  readonly indeks = input.required<number>();
  readonly velicina = input<number | string | null>(null);

  protected readonly oblik = computed(() => oblikOpcije(this.indeks()));
  protected readonly putanja = computed(() => PUTANJE[this.oblik().slovo]);
  protected readonly velicinaCss = computed(() => {
    const v = this.velicina();
    return v === null ? null : typeof v === 'number' ? `${v}px` : v;
  });
}
