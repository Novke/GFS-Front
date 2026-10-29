import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { PonudaInstalacije } from '../../../core/pwa/instalacija';
import { karticaNaTelefonu, KLJUC_SKRIVENA_PONUDA } from '../../../core/pwa/instalacija.pravila';
import { UputstvoInstalacije } from '../../../core/pwa/uputstvo-instalacije.component';

function skrivena(): boolean {
  try {
    return localStorage.getItem(KLJUC_SKRIVENA_PONUDA) === '1';
  } catch {
    return false;
  }
}

function sakrij(): void {
  try {
    localStorage.setItem(KLJUC_SKRIVENA_PONUDA, '1');
  } catch {
    // bez skladišta: kartica se vraća pri sledećem otvaranju, ništa gore od toga
  }
}

/**
 * „Instaliraj GFS na telefon“ (spec „Aplikacija i obaveštenja“ 4.3, skica telefona A i B), samo za prijavljenog studenta.
 *
 * - `mesto="cas"`: kartica na vrhu taba Čas, samo na telefonu bez instalirane aplikacije i dok je student ne sakrije sa
 *   „Ne sada“ ili „Već sam dodao“ (pamti se u `localStorage` ovog uređaja).
 * - `mesto="ja"`: stalna stavka „Aplikacija na telefonu“ na tabu Ja (i za računar), bez „Ne sada“.
 */
@Component({
  selector: 'app-instalacija-kartica',
  imports: [UputstvoInstalacije],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vidljiva()) {
      <section class="kartica" [class.istaknuta]="mesto() === 'cas'" aria-labelledby="naslov-instalacije"
               [attr.data-instalacija]="mesto()">
        @if (mesto() === 'cas') {
          <h3 id="naslov-instalacije">{{ iphone() ? 'Dodaj GFS na početni ekran' : 'Instaliraj GFS na telefon' }}</h3>
          <p class="uvod">
            @if (iphone()) {
              Traje 20 sekundi. Bez toga podsetnici ne mogu da stignu na iPhone.
            } @else {
              Ikonica na početnom ekranu, čekiranje jednim dodirom, podsetnik za čas.
            }
          </p>
        } @else {
          <h3 id="naslov-instalacije">Aplikacija na telefonu</h3>
          @if (prikaz().uredjaj === 'racunar' && prikaz().nacin !== 'instalirano') {
            <p class="uvod">Možeš da je instaliraš i na računar.</p>
          }
        }
        <app-uputstvo-instalacije [nacin]="prikaz().nacin" (dodao)="dodao()" (ishod)="ishod($event)">
          @if (mesto() === 'cas') {
            <button dodatna-akcija type="button" class="dugme" (click)="neSada()" data-ne-sada>Ne sada</button>
          }
        </app-uputstvo-instalacije>
        @if (poruka(); as p) {
          <p class="poruka" role="status">{{ p }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .kartica { margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); }
    .kartica[data-instalacija='ja'] { margin: 16px 0 0; }
    .kartica.istaknuta { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-soft-ink); }
    h3 { margin: 0 0 4px; font-size: 16px; }
    .uvod { margin: 0; }
    .dugme { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .poruka { margin: 8px 0 0; font-size: 13px; }
  `,
})
export class InstalacijaKartica {
  private readonly ponuda = inject(PonudaInstalacije);

  readonly mesto = input<'cas' | 'ja'>('cas');

  protected readonly prikaz = this.ponuda.prikaz;
  protected readonly iphone = computed(() => this.prikaz().uredjaj === 'iphone');
  private readonly sakrivena = signal(skrivena());
  protected readonly poruka = signal<string | null>(null);

  protected readonly vidljiva = computed(() =>
    this.mesto() === 'ja' || (karticaNaTelefonu(this.prikaz()) && !this.sakrivena()));

  protected neSada(): void {
    sakrij();
    this.sakrivena.set(true);
  }

  protected dodao(): void {
    if (this.mesto() === 'cas') {
      this.neSada();
    } else {
      this.poruka.set('Otvori GFS sa početnog ekrana i tamo se prijavi.');
    }
  }

  protected ishod(i: 'prihvaceno' | 'odbijeno' | 'nema'): void {
    if (i === 'prihvaceno') {
      this.poruka.set('Ikonica GFS je na početnom ekranu.');
    }
  }
}
