import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PitanjeDetails } from '../data-access/uzivo.models';
import { decimalni } from './format';
import { OpcijaOblikComponent, oblikOpcije } from './opcija-oblik';

/**
 * Pločice opcija na projektoru: mreža 2x2 (do 4 opcije) ili 3x2 (5-6), svaka sa oblikom, slovom i tekstom. Za broj,
 * kratak tekst i skalu umesto pločica kratak opis šta se unosi na telefonu.
 * `tacne`: null = tačan odgovor se ne prikazuje; niz = prikazuje se (id-jevi tačnih opcija; za broj i kratak tekst
 * dovoljan je prazan niz, tada se prikazuju `brojTacno` ili `prihvatljiviOdgovori` iz pitanja).
 */
@Component({
  selector: 'app-pitanje-plocice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OpcijaOblikComponent],
  host: { class: 'uz-plocice' },
  template: `
    @switch (pitanje().tip) {
      @case ('BROJ') {
        <div class="uz-unos">
          <span class="uz-unos-ikona" aria-hidden="true">#</span>
          <p class="uz-unos-tekst">Unesi broj{{ pitanje().jedinica ? ' (' + pitanje().jedinica + ')' : '' }}</p>
          @if (tacanBroj(); as t) { <p class="uz-unos-tacno"><span class="uz-tacno-znak">✓</span> Tačan odgovor: <strong>{{ t }}</strong></p> }
        </div>
      }
      @case ('KRATAK_TEKST') {
        <div class="uz-unos">
          <span class="uz-unos-ikona" aria-hidden="true">Aa</span>
          <p class="uz-unos-tekst">Napiši kratak odgovor</p>
          @if (prihvatljivi(); as p) { <p class="uz-unos-tacno"><span class="uz-tacno-znak">✓</span> Tačno: <strong>{{ p }}</strong></p> }
        </div>
      }
      @case ('SKALA') {
        <div class="uz-unos">
          <ol class="uz-unos-skala" aria-hidden="true">
            @for (v of [1, 2, 3, 4, 5]; track v) { <li>{{ v }}</li> }
          </ol>
          <p class="uz-unos-tekst">Oceni od 1 do 5</p>
          @if (pitanje().skalaMinOznaka || pitanje().skalaMaxOznaka) {
            <p class="uz-unos-oznake">
              <span>1 = {{ pitanje().skalaMinOznaka || '–' }}</span><span>5 = {{ pitanje().skalaMaxOznaka || '–' }}</span>
            </p>
          }
        </div>
      }
      @default {
        <ul class="uz-plocice-mreza" [class.uz-plocice-mreza--tri]="opcije().length > 4">
          @for (o of opcije(); track o.id) {
            <li class="uz-plocica" [class.uz-plocica--tacna]="o.tacna" [class.uz-plocica--prigusena]="o.prigusena"
                [style.--uz-boja]="o.boja">
              <app-opcija-oblik class="uz-plocica-oblik" [indeks]="o.indeks" />
              <span class="uz-plocica-tekst">{{ o.tekst }}</span>
              @if (o.tacna) { <span class="uz-plocica-tacno"><span aria-hidden="true">✓</span> tačno</span> }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class PitanjePlociceComponent {
  readonly pitanje = input.required<PitanjeDetails>();
  readonly tacne = input<readonly number[] | null>(null);

  protected readonly opcije = computed(() => {
    const tacne = this.tacne() ?? [];
    const imaTacnih = tacne.length > 0;
    return [...this.pitanje().opcije]
      .sort((a, b) => a.rb - b.rb)
      .map((o, i) => {
        const tacna = imaTacnih && tacne.includes(o.id);
        return { id: o.id, indeks: i, boja: oblikOpcije(i).boja, tekst: o.tekst, tacna, prigusena: imaTacnih && !tacna };
      });
  });

  protected readonly tacanBroj = computed(() => {
    const p = this.pitanje();
    if (this.tacne() === null || p.brojTacno === null) {
      return null;
    }
    const jedinica = p.jedinica ? ' ' + p.jedinica : '';
    let tekst = decimalni(p.brojTacno) + jedinica;
    if (p.brojOdstupanje) {
      tekst += ' ± ' + decimalni(p.brojOdstupanje) + (p.odstupanjeTip === 'PROCENAT' ? ' %' : jedinica);
    }
    return tekst;
  });

  protected readonly prihvatljivi = computed(() => {
    const lista = this.pitanje().prihvatljiviOdgovori ?? [];
    return this.tacne() !== null && lista.length ? lista.join(', ') : null;
  });
}
