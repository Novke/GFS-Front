// Svojstva formule (F16, odluka 20): "Uredi formulu" (dijalog, lenji chunk), "Boja", "Veličina" (pt, 1-400) i
// "Poravnanje". Svaka izmena ide kroz `primeniFormulu`, pa i boja, veličina i poravnanje brišu `slikaIzvora` (slika iz
// PowerPointa bi inače pokazivala staro); uz napomenu kad je formula uvezena kao slika. Zaključan sloj: sve onemogućeno.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import type { FormulaSloj, Poravnanje, Tema } from '../data-access/platno.models';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { formulaEditora } from './formula/formula-otvarac';
import { unosFormule } from './formula/formula-pravila';
import { IzborBojeComponent } from './izbor-boje.component';

const PORAVNANJA: readonly { v: Poravnanje; naziv: string; ikona: string }[] = [
  { v: 'LEVO', naziv: 'Levo', ikona: 'format_align_left' },
  { v: 'CENTAR', naziv: 'Centar', ikona: 'format_align_center' },
  { v: 'DESNO', naziv: 'Desno', ikona: 'format_align_right' },
];

@Component({
  selector: 'app-svojstva-formule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrojcanoPoljeComponent, IzborBojeComponent, MatButtonModule, MatButtonToggleModule, MatIconModule],
  template: `
    @let s = sloj();
    @let z = s.zakljucan;
    <h3 class="uz-ep-odeljak">Formula</h3>
    @if (s.slikaIzvora) {
      <p class="uz-ep-napomena">Ova formula je uvezena kao slika iz PowerPointa. Posle čuvanja crta se iz LaTeX-a.</p>
    }
    <button mat-stroked-button type="button" [disabled]="z" (click)="uredi()">Uredi formulu</button>
    <app-izbor-boje oznaka="Boja" [tema]="tema()" [vrednost]="s.boja" [onemoguceno]="z" (izbor)="postaviBoju($event)" />
    <app-brojcano-polje oznaka="Veličina" jedinica="pt" [vrednost]="s.velicina" [min]="1" [max]="400" [stegni]="false"
                        [onemoguceno]="z" (promena)="izmeni({ velicina: $event }, 'velicina')" />
    <mat-button-toggle-group aria-label="Poravnanje" hideSingleSelectionIndicator [value]="s.poravnanje" [disabled]="z"
                             (change)="izmeni({ poravnanje: $event.value })">
      @for (p of poravnanja; track p.v) {
        <mat-button-toggle [value]="p.v" [aria-label]="p.naziv" [title]="p.naziv"><mat-icon [svgIcon]="p.ikona" /></mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-napomena { margin: 0; font-size: 13px; color: var(--ink-2); }
    :host > button, mat-button-toggle-group { justify-self: start; }
  `,
})
export class SvojstvaFormuleComponent {
  readonly sloj = input.required<FormulaSloj>();
  readonly tema = input.required<Tema>();

  private readonly formula = formulaEditora();
  protected readonly poravnanja = PORAVNANJA;

  /** Dijalog; posle zatvaranja fokus se vraća na dugme (`restoreFocus`). */
  protected uredi(): void {
    if (!this.sloj().zakljucan) void this.formula.uredi(this.sloj().id, this.tema());
  }

  protected postaviBoju(boja: string | null): void {
    if (boja) this.izmeni({ boja });
  }

  /** Uzastopne izmene istog polja u roku od 1 s su jedan korak (ključ polja i sloja). */
  protected izmeni(deo: Partial<ReturnType<typeof unosFormule>>, polje?: string): void {
    const id = this.sloj().id;
    this.formula.primeni(id, (s) => ({ ...unosFormule(s), ...deo }), polje && `polje-formula-${polje}:${id}`);
  }
}
