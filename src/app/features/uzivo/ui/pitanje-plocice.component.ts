import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PitanjeDetails } from '../data-access/uzivo.models';
import { decimalni } from './format';
import { meriFormule } from './mera-formule';
import { OpcijaOblikComponent, oblikOpcije } from './opcija-oblik';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';

/** Natpis na tabli iznad opcija pitanja sa više tačnih (isto pravilo kao na telefonu: za svako VISE_TACNIH). */
export const NATPIS_VISE_TACNIH_TABLA = 'Može biti više tačnih';

/**
 * Pločice opcija na projektoru: mreža 2x2 (do 4 opcije) ili 3x2 (5-6), svaka sa oblikom, slovom i tekstom. Za broj,
 * kratak tekst i skalu umesto pločica kratak opis šta se unosi na telefonu.
 * `tacne`: null = tačan odgovor se ne prikazuje; niz = prikazuje se (id-jevi tačnih opcija; za broj i kratak tekst
 * dovoljan je prazan niz, tada se prikazuju `brojTacno` ili `prihvatljiviOdgovori` iz pitanja).
 */
@Component({
  selector: 'app-pitanje-plocice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [OpcijaOblikComponent, TekstFormuleComponent],
  host: {
    class: 'uz-plocice', '[class.uz-plocice--sazeto]': 'sazeto()',
    '[class.uz-plocice--natpis]': "pitanje().tip === 'VISE_TACNIH'",
  },
  // Sažeti oblik (pitanje sa velikom slikom): stil je ovde, ne u globalnom `uzivo-tokeni.css` (ulazi u početni paket i
  // na telefon). Sve mere u cqw/em, pa isto radi u umanjenim prikazima.
  styles: `
    .uz-natpis-vise { flex: none; margin: 0 0 0.6cqw; font-size: 1.8cqw; font-weight: 700; color: var(--muted); }
    /* natpis iznad mreže: domaćin ima overflow: hidden (uzivo-tokeni.css), pa mreža deli visinu sa natpisom umesto
       height: 100% (donji red bi se sekao); sažeti oblik ostaje kakav jeste */
    :host(.uz-plocice--natpis:not(.uz-plocice--sazeto)) { display: flex; flex-direction: column; }
    :host(.uz-plocice--natpis:not(.uz-plocice--sazeto)) .uz-plocice-mreza { flex: 1; min-height: 0; height: auto; }
    .uz-sazeto-red { display: flex; align-items: center; justify-content: flex-end; gap: 2cqw; }
    .uz-sazeto-tacno { margin: 0; font-size: 2.4cqw; }
    .uz-sazeto-unos {
      display: inline-flex; align-items: baseline; gap: 0.5em; margin: 0; padding: 0.4em 0.9em;
      border: 0.1em dashed var(--line); border-radius: 0.5em; background: var(--surface-2);
      font-size: 1.7cqw; font-weight: 600;
    }
    .uz-sazeto-ikona { color: var(--primary); font-weight: 700; }
    .uz-sazeto-oznake { color: var(--muted); font-weight: 400; }
    :host(.uz-plocice--sazeto) .uz-plocice-mreza {
      height: auto; grid-template-columns: repeat(var(--uz-n, 4), minmax(0, 1fr)); grid-auto-rows: auto;
    }
    :host(.uz-plocice--sazeto) .uz-plocica { min-height: 7cqw; }
    :host(.uz-plocice--sazeto) .uz-plocica { position: relative; flex-wrap: nowrap; overflow: visible; }
    :host(.uz-plocice--sazeto) .uz-plocica--tacna { border-width: 0.12em; box-shadow: 0 0 0 0.06em var(--ok); }
    :host(.uz-plocice--sazeto) .uz-plocica-tacno {
      position: absolute; top: -0.6cqw; right: 0.8cqw; font-size: 0.62em; line-height: 1.3;
    }
  `,
  template: `
    @if (sazeto() && unos()) {
      <div class="uz-sazeto-red">
        @if (tacanBroj(); as t) { <p class="uz-sazeto-tacno"><span class="uz-tacno-znak">✓</span> Tačan odgovor: <strong>{{ t }}</strong></p> }
        @if (prihvatljivi(); as p) { <p class="uz-sazeto-tacno"><span class="uz-tacno-znak">✓</span> Tačno: <strong>{{ p }}</strong></p> }
        <p class="uz-sazeto-unos">
          <span class="uz-sazeto-ikona" aria-hidden="true">{{ pitanje().tip === 'BROJ' ? '#' : pitanje().tip === 'SKALA' ? '1–5' : 'Aa' }}</span>
          <span>{{ pitanje().tip === 'BROJ' ? 'Unesi broj' + (pitanje().jedinica ? ' (' + pitanje().jedinica + ')' : '')
            : pitanje().tip === 'SKALA' ? 'Oceni od 1 do 5' : 'Napiši kratak odgovor' }}</span>
          @if (pitanje().tip === 'SKALA' && (pitanje().skalaMinOznaka || pitanje().skalaMaxOznaka)) {
            <span class="uz-sazeto-oznake">1 = {{ pitanje().skalaMinOznaka || '–' }} · 5 = {{ pitanje().skalaMaxOznaka || '–' }}</span>
          }
        </p>
      </div>
    } @else {
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
        @if (pitanje().tip === 'VISE_TACNIH') { <p class="uz-natpis-vise" data-natpis-vise>{{ natpisVise }}</p> }
        <ul class="uz-plocice-mreza" [class.uz-plocice-mreza--tri]="opcije().length > 4 && !sazeto()"
            [style.--uz-n]="sazeto() ? opcije().length : null">
          @for (o of opcije(); track o.id) {
            <li class="uz-plocica" [class.uz-plocica--tacna]="o.tacna" [class.uz-plocica--prigusena]="o.prigusena"
                [style.--uz-boja]="o.boja">
              <app-opcija-oblik class="uz-plocica-oblik" [indeks]="o.indeks" />
              <app-tekst-formule class="uz-plocica-tekst" [tekst]="o.tekst" />
              @if (o.tacna) { <span class="uz-plocica-tacno"><span aria-hidden="true">✓</span> tačno</span> }
            </li>
          }
        </ul>
      }
    }
    }
  `,
})
export class PitanjePlociceComponent {
  readonly pitanje = input.required<PitanjeDetails>();
  readonly tacne = input<readonly number[] | null>(null);
  /** Sažeti oblik uz veliku sliku: unos kao mala pločica u ćošku, kratke opcije u jednom redu. */
  readonly sazeto = input(false);

  protected readonly natpisVise = NATPIS_VISE_TACNIH_TABLA;
  protected readonly unos = computed(() => ['BROJ', 'KRATAK_TEKST', 'SKALA'].includes(this.pitanje().tip));

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
