import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FajloviSlajda, oznakaVrste, velicinaFajla } from '../../../shared/util/fajlovi';

/**
 * Traka na projektoru (spec 2026-11-20, odeljak 6): „Fajlovi za vežbu:” + krupan link sa koda sa table. Stoji ISPOD slajda,
 * ne preko njega: podnožje slajda (kod za ulazak, „Odgovora”, „Zatvoreno”), pločice i dno platna ostaju vidljivi; scena
 * je zato za visinu trake viša (`uz-scena--fajlovi`, projektor je sužava da sve stane u ekran). Visina je stalna,
 * {@link VISINA_TRAKE_CQW} % širine scene, a slova u `cqw` (domaćin je `container-type: inline-size`), mono font iz
 * tokena. Boje su fiksne (tamna traka, svetla slova), pa je kontrast isti u svim temama. Samo za prikaz: ne zove HTTP.
 */
/** Visina trake u % širine scene; ista vrednost je u `.ft` dole i u širini scene projektora (`publika-scena`). */
export const VISINA_TRAKE_CQW = 5.4;

@Component({
  selector: 'app-fajlovi-traka',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-fajlovi-traka', role: 'status', '[attr.aria-label]': '"Fajlovi za vežbu: " + fajlovi().link' },
  styles: `
    :host { display: block; container-type: inline-size; }
    .ft { box-sizing: border-box; height: 5.4cqw; display: flex; align-items: center; justify-content: center; gap: 2cqw;
      padding: 0 2cqw; line-height: 1; white-space: nowrap; overflow: hidden; background: var(--snack-bg); color: var(--snack-ink); }
    .ft-natpis { font-size: 2.2cqw; font-weight: 600; }
    .ft-link { font-family: var(--font-mono); font-size: 3.6cqw; font-weight: 700; letter-spacing: 0.02em; }
  `,
  template: `<div class="ft"><span class="ft-natpis">Fajlovi za vežbu:</span><strong class="ft-link" data-fajlovi-link>{{ fajlovi().link }}</strong></div>`,
})
export class FajloviTrakaComponent {
  readonly fajlovi = input.required<FajloviSlajda>();
}

/** Kartica za konzolu i daljinski: isti link i imena fajlova trenutnog slajda (`kompaktno` = jedan red, za telefon). */
@Component({
  selector: 'app-fajlovi-kartica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-fajlovi-kartica', '[class.uz-fajlovi-kartica--kompaktno]': 'kompaktno()' },
  styles: `
    :host { display: block; }
    .fk-link { font-family: var(--font-mono); font-weight: 700; font-size: 1.25em; color: var(--ink); user-select: all; }
    .fk-lista { margin: 4px 0 0; padding-left: 1.2em; color: var(--ink-2); font-size: 0.9em; }
    .fk-meta { color: var(--muted); }
    :host(.uz-fajlovi-kartica--kompaktno) { padding: 6px 12px; font-size: 14px; color: var(--ink-2); }
    :host(.uz-fajlovi-kartica--kompaktno) .fk-lista { display: none; }
  `,
  template: `
    <p class="fk-red" style="margin:0">Fajlovi za studente: <span class="fk-link" data-fajlovi-link>{{ fajlovi().link }}</span></p>
    <ul class="fk-lista" data-fajlovi-imena>
      @for (f of fajlovi().fajlovi; track f.id) {
        <li>{{ f.naziv }} <span class="fk-meta">· {{ vrsta(f.vrsta) }}, {{ velicina(f.velicina) }}</span></li>
      }
    </ul>
    @if (kompaktno()) { <span class="fk-meta" data-fajlovi-sazetak>{{ sazetak() }}</span> }
  `,
})
export class FajloviKarticaComponent {
  readonly fajlovi = input.required<FajloviSlajda>();
  readonly kompaktno = input(false);
  protected readonly vrsta = oznakaVrste;
  protected readonly velicina = velicinaFajla;
  protected readonly sazetak = computed(() => this.fajlovi().fajlovi.map(f => f.naziv).join(', '));
}
