import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FajlKratko, oznakaVrste, velicinaFajla } from '../util/fajlovi';
import type { PorukaFajla } from '../util/fajlovi-mejl';

/**
 * Spisak fajlova uz prezentaciju (nalog studenta, telefon uživo): naziv, vrsta i veličina, „Preuzmi” (kad je `hrefZa`
 * zadat) i „Pošalji mi na mejl” (kad je `mejl`). Prezentacioni: bez HTTP-a i store-a, uvozi samo @angular/* i
 * `shared/util/fajlovi*`. Sa `prijavaNazad` (npr. `uzivo/1234`) dugme za mejl je link „Prijavi se da ti pošaljemo fajl”
 * na `nalog?nazad=...`.
 */
@Component({
  selector: 'app-fajlovi-spisak',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="fs">
      @for (f of fajlovi(); track f.id) {
        <li class="fs-stavka" [attr.data-fajl]="f.id">
          <span class="fs-naziv">{{ f.naziv }}</span>
          <span class="fs-opis">{{ oznaka(f.vrsta) }} · {{ velicina(f.velicina) }}</span>
          <span class="fs-akcije">
            @if (hrefZa(); as h) {
              <a class="fs-dugme fs-dugme--glavno" [href]="h(f)" download data-preuzmi>Preuzmi</a>
            }
            @if (mejl()) {
              @if (prijavaNazad(); as nazad) {
                <a class="fs-dugme" routerLink="/nalog" [queryParams]="{ nazad: nazad }" data-prijava>Prijavi se da ti pošaljemo fajl</a>
              } @else {
                <button type="button" class="fs-dugme" [disabled]="poruke()[f.id]?.vrsta === 'salje'"
                        (click)="posaljiMejl.emit(f)" data-mejl>Pošalji mi na mejl</button>
              }
            }
          </span>
          @if (poruke()[f.id]; as p) {
            <p class="fs-poruka" [class.fs-poruka--greska]="p.vrsta === 'greska'"
               [attr.role]="p.vrsta === 'greska' ? 'alert' : 'status'" data-poruka>{{ p.tekst }}</p>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .fs { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .fs-stavka { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); }
    .fs-naziv { font-weight: 600; overflow-wrap: anywhere; }
    .fs-opis { color: var(--ink-2); font-size: 14px; }
    .fs-akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .fs-dugme { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 14px;
      border: 1px solid var(--primary); border-radius: var(--radius-sm); background: transparent; color: var(--primary);
      font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    .fs-dugme--glavno { background: var(--primary); color: var(--primary-ink); }
    .fs-dugme:disabled { opacity: 0.6; cursor: default; }
    .fs-dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .fs-poruka { margin: 0; font-size: 14px; color: var(--ink-2); overflow-wrap: anywhere; }
    .fs-poruka--greska { color: var(--danger); }
  `,
})
export class FajloviSpisakComponent {
  readonly fajlovi = input.required<FajlKratko[]>();
  /** Adresa za „Preuzmi”; `null` = bez preuzimanja. */
  readonly hrefZa = input<((f: FajlKratko) => string) | null>(null);
  readonly mejl = input(false);
  readonly poruke = input<Record<number, PorukaFajla>>({});
  /** Telefon uživo bez prijave: kod za `nalog?nazad=<ovo>` umesto dugmeta za mejl. */
  readonly prijavaNazad = input<string | null>(null);
  readonly posaljiMejl = output<FajlKratko>();

  protected readonly oznaka = oznakaVrste;
  protected readonly velicina = velicinaFajla;
}
