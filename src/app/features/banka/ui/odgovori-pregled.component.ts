import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { OdgovorPolja, Polje, TipPolja } from '../data-access/banka.models';
import { prikazBroja } from './polja-editor.component';

const NAZIV_TIPA: Record<TipPolja, string> = { BROJ: 'Broj', TEKST: 'Tekst', JEDAN_TACAN: 'Jedan tačan', VISE_TACNIH: 'Više tačnih' };

/**
 * Tačan odgovor polja za prikaz, jedna stavka po vrednosti: BROJ "45 ± 0,1 m" (apsolutno odstupanje) ili "45 kN ± 10 %"
 * (procenat), bez odstupanja samo broj sa jedinicom; TEKST svi prihvatljivi; JEDAN_TACAN tekst opcije; VISE_TACNIH tekstovi
 * opcija redom polja. Nema odgovora (ili pokazuje na opciju koje nema): prazno.
 */
export function tacanOdgovor(p: Polje, o: OdgovorPolja | undefined): string[] {
  switch (p.tip) {
    case 'BROJ': {
      if (o?.broj === null || o?.broj === undefined || Number.isNaN(o.broj)) {
        return [];
      }
      const jedinica = p.jedinica ? ` ${p.jedinica}` : '';
      const odstupanje = p.odstupanje ?? 0;
      if (odstupanje === 0) {
        return [`${prikazBroja(o.broj)}${jedinica}`];
      }
      return [p.odstupanjeTip === 'PROCENAT'
        ? `${prikazBroja(o.broj)}${jedinica} ± ${prikazBroja(odstupanje)} %`
        : `${prikazBroja(o.broj)} ± ${prikazBroja(odstupanje)}${jedinica}`];
    }
    case 'TEKST':
      return [...(o?.prihvatljivi ?? [])];
    case 'JEDAN_TACAN':
      return (p.opcije ?? []).filter(x => x.id === o?.tacna).map(x => x.tekst);
    case 'VISE_TACNIH':
      return (p.opcije ?? []).filter(x => o?.tacne?.includes(x.id)).map(x => x.tekst);
  }
}

/**
 * Tačni odgovori varijante po šemi polja, samo za čitanje (pregled nacrta): po polju oznaka, tip i tačno ({@link tacanOdgovor};
 * više vrednosti kao lista, bez odgovora "Nedostaje"). Tekst opcija se prikazuje kako je zapisan (sa `$formulama$`).
 */
@Component({
  selector: 'app-odgovori-pregled',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (polja().length === 0) {
      <p class="bk-op-prazno">Grupa nema polja odgovora: zadatak se radi na papiru.</p>
    } @else {
      <dl class="bk-op">
        @for (p of polja(); track p.kljuc) {
          @let t = tacno(p);
          <div class="bk-op-red" [attr.data-polje]="p.kljuc">
            <dt><span class="bk-op-oznaka">{{ p.oznaka }}</span> <span class="bk-op-tip">{{ nazivTipa[p.tip] }}</span></dt>
            <dd>
              @if (t.length === 0) {
                <span class="bk-op-nema">Nedostaje</span>
              } @else if (t.length === 1) {
                {{ t[0] }}
              } @else {
                <ul class="bk-op-lista">
                  @for (x of t; track $index) {
                    <li>{{ x }}</li>
                  }
                </ul>
              }
            </dd>
          </div>
        }
      </dl>
    }
  `,
  styles: `
    :host { display: block; }
    .bk-op { display: grid; gap: 8px; margin: 0; }
    .bk-op-red { display: grid; gap: 2px; }
    dt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
    .bk-op-oznaka { font-weight: 600; overflow-wrap: anywhere; }
    .bk-op-tip, .bk-op-prazno { color: var(--muted); font-size: 13px; }
    dd { margin: 0; font-family: var(--font-mono); overflow-wrap: anywhere; }
    .bk-op-lista { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
    .bk-op-nema { color: var(--warn); font-family: var(--font); font-weight: 600; }
    .bk-op-prazno { margin: 0; }
  `,
})
export class OdgovoriPregledComponent {
  readonly polja = input.required<readonly Polje[]>();
  readonly odgovori = input.required<Readonly<Record<string, OdgovorPolja>>>();

  protected readonly nazivTipa = NAZIV_TIPA;

  protected tacno(p: Polje): string[] {
    return tacanOdgovor(p, this.odgovori()[p.kljuc]);
  }
}
