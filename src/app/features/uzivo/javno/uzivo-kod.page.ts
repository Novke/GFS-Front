import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppRoutes } from '../../../app.routes';
import { razlogGreske } from '../data-access/razlog-greske';
import { JavnoApi } from './javno.api';

/** Samo cifre, najviše šest (lepljenje "123 456" ili "kod: 123456" radi). */
export function samoCifre(unos: string): string {
  return unos.replace(/\D/g, '').slice(0, 6);
}

/**
 * Javni ulaz `uzivo` (spec 6.5): 6-cifren kod kao Kahoot PIN. Na šestu cifru "Uđi" kreće sam: provera koda
 * (`GET api/public/uzivo/{kod}`), pa `uzivo/:kod`. Greška ostaje ovde, uz polje.
 */
@Component({
  selector: 'app-uzivo-kod',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-st uz-dan', lang: 'sr-Latn' },
  template: `
    <main class="uz-st-sredina">
      <h1 class="uz-st-naslov">Uživo</h1>
      <form class="uz-st-forma" (submit)="$event.preventDefault(); udji()">
        <label class="uz-st-oznaka" for="uz-st-kod">Kod sa table</label>
        <input id="uz-st-kod" class="uz-st-polje uz-st-polje--kod" type="text" inputmode="numeric" pattern="[0-9]*"
               autocomplete="one-time-code" placeholder="123456" [value]="kod()" [readOnly]="proverava()"
               [attr.aria-invalid]="greska() ? 'true' : null" aria-describedby="uz-st-kod-poruka"
               (input)="promena($event)" />
        <p id="uz-st-kod-poruka" class="uz-st-poruka-polja" role="alert">{{ greska() }}</p>
        <button type="submit" class="uz-st-dugme uz-st-dugme--glavno" [disabled]="kod().length !== 6 || proverava()">
          {{ proverava() ? 'Proveravam…' : 'Uđi' }}
        </button>
      </form>
    </main>
  `,
})
export class UzivoKodPage {
  private readonly api = inject(JavnoApi);
  private readonly router = inject(Router);

  protected readonly kod = signal('');
  protected readonly greska = signal<string | null>(null);
  protected readonly proverava = signal(false);
  private provera = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.provera.unsubscribe());
  }

  protected promena(e: Event): void {
    const polje = e.target as HTMLInputElement;
    const cifre = samoCifre(polje.value);
    polje.value = cifre;
    this.kod.set(cifre);
    this.greska.set(null);
    if (cifre.length === 6) this.udji();
  }

  protected udji(): void {
    const kod = this.kod();
    if (kod.length !== 6 || this.proverava()) return;
    this.proverava.set(true);
    this.provera.unsubscribe();
    this.provera = this.api.info(kod).subscribe({
      next: () => void this.router.navigate([AppRoutes.uzivoKod(kod)]),
      error: e => {
        this.proverava.set(false);
        this.greska.set(razlogGreske(e, 'Kod nije proveren. Pokušaj ponovo.'));
      },
    });
  }
}
