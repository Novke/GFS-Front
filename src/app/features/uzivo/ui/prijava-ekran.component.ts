import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { bezProtokola, kodSaRazmakom } from './format';
import { QrKodComponent } from './qr-kod.component';

const MAKS_IMENA = 60;

/** Imena za čekaonicu: najnovija prva, najviše `maks`; `jos` = koliko prijavljenih nije prikazano. */
export function imenaZaPrikaz(imena: readonly string[], broj: number, maks = MAKS_IMENA): { imena: string[]; jos: number } {
  const prikaz = imena.slice(-maks).reverse();
  return { imena: prikaz, jos: Math.max(imena.length, broj) - prikaz.length };
}

/**
 * Čekaonica (spec 2.2, 6.4) na 16:9 platnu: veliki QR, link bez protokola, kod u krupnim ciframa, broj i imena
 * prijavljenih. `imena` su u redosledu prijave (najstarije prvo). Širinu određuje roditelj.
 */
@Component({
  selector: 'app-prijava-ekran',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrKodComponent],
  host: { class: 'uz-okvir' },
  template: `
    <section class="uz-platno uz-prijava" aria-label="Prijava učesnika">
      <app-qr-kod class="uz-prijava-qr" [tekst]="link()" [velicina]="720" />
      <div class="uz-prijava-info">
        <p class="uz-prijava-poziv">Skeniraj QR kod ili otvori</p>
        <p class="uz-prijava-link">{{ linkPrikaz() }}</p>
        <p class="uz-prijava-poziv">Kod</p>
        <p class="uz-prijava-kod" [attr.aria-label]="'Kod ' + kod().split('').join(' ')">{{ kodPrikaz() }}</p>
        <p class="uz-prijava-broj">
          @if (ukupno() > 0) { Prijavljeno: <strong>{{ ukupno() }}</strong> } @else { Čekamo prve učesnike… }
        </p>
      </div>
      @if (prikaz().imena.length) {
        <ul class="uz-prijava-imena" aria-label="Prijavljeni">
          @for (ime of prikaz().imena; track ime) { <li class="uz-cip">{{ ime }}</li> }
          @if (prikaz().jos > 0) { <li class="uz-cip uz-cip--jos">+{{ prikaz().jos }}</li> }
        </ul>
      }
    </section>
  `,
})
export class PrijavaEkranComponent {
  readonly kod = input.required<string>();
  /** Pun link za prijavu (`<origin><base>uzivo/<kod>`), ide u QR. */
  readonly link = input.required<string>();
  readonly imena = input<readonly string[]>([]);
  readonly broj = input<number>(0);

  protected readonly linkPrikaz = computed(() => bezProtokola(this.link()));
  protected readonly kodPrikaz = computed(() => kodSaRazmakom(this.kod()));
  protected readonly ukupno = computed(() => Math.max(this.broj(), this.imena().length));
  protected readonly prikaz = computed(() => imenaZaPrikaz(this.imena(), this.broj()));
}
