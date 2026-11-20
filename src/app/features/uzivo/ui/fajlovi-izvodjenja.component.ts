import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FajloviSlajda, oznakaVrste, velicinaFajla } from '../../../shared/util/fajlovi';

/**
 * Traka na projektoru (spec 2026-11-20, odeljak 6): „Fajlovi za vežbu:” + krupan link sa koda sa table. Veličine su u `cqw`
 * (domaćin je `container-type: inline-size`): slova oko 3,2 % visine scene 16:9, mono font iz tokena. Boje su fiksne
 * (tamna traka, svetla slova), pa je kontrast isti u svim temama prezentacije. Samo za prikaz: ne zove HTTP.
 */
@Component({
  selector: 'app-fajlovi-traka',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-fajlovi-traka', role: 'status', '[attr.aria-label]': '"Fajlovi za vežbu: " + fajlovi().link' },
  styles: `
    :host { position: absolute; left: 0; right: 0; bottom: 0; z-index: 1; container-type: inline-size; pointer-events: none; }
    .ft { display: flex; align-items: baseline; justify-content: center; gap: 2cqw; padding: 0.7cqw 2cqw; background: var(--snack-bg); color: var(--snack-ink); }
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
