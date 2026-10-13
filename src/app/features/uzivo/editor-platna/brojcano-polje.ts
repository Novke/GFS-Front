// Brojčano polje panela Svojstva (F6): kuca se slobodno (zarez ili tačka), a vrednost se primenjuje tek na Enter ili pri
// izlasku iz polja, stegnuta u granice i na 2 decimale kao na serveru; neispravan unos ima `aria-invalid` dok se kuca i
// vraća prikazanu vrednost. Polje je van okvira platna, pa prečice platna ovde ne rade (odluka 24), a Ctrl+Z je polja.
import { ChangeDetectionStrategy, Component, computed, input, output, signal, viewChild } from '@angular/core';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';

/** Decimalni broj sa zarezom ili tačkom (bez eksponenta, razmaka u sredini i hiljadarki). */
const BROJ = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** Vrednost polja posle Enter/blur: broj u [min, max] sa 2 decimale, ili null (polje se vraća na staru vrednost). */
export function procitajBroj(tekst: string, min: number, max: number): number | null {
  const t = tekst.trim();
  if (!BROJ.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return z(Math.min(max, Math.max(min, n)));
}

/** Prikaz broja u polju: 2 decimale, decimalni zarez; null = prazno (npr. različite vrednosti više slojeva). */
export function formatBroja(n: number | null): string {
  return n === null ? '' : String(z(n)).replace('.', ',');
}

@Component({
  selector: 'app-brojcano-polje',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field subscriptSizing="dynamic">
      <mat-label>{{ oznaka() }}</mat-label>
      <input matInput inputmode="decimal" autocomplete="off" spellcheck="false" [value]="prikaz()"
             [disabled]="onemoguceno()" [errorStateMatcher]="greska" (input)="kucanje($event)"
             (keydown.enter)="potvrdi()" (keydown.escape)="odustani()" (blur)="potvrdi()">
      @if (jedinica()) { <span matTextSuffix>{{ jedinica() }}</span> }
    </mat-form-field>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    mat-form-field { width: 100%; }
  `,
})
export class BrojcanoPoljeComponent {
  readonly oznaka = input.required<string>();
  readonly vrednost = input<number | null>(null);
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly onemoguceno = input(false);
  /** Jedinica iza broja (`°`, `%`); prazno = bez nje. */
  readonly jedinica = input('');
  /** Nova vrednost (već stegnuta i zaokružena); ne emituje se kad je ista kao prikazana. */
  readonly promena = output<number>();

  private readonly polje = viewChild.required(MatInput);
  /** Tekst dok se kuca; null = polje prikazuje `vrednost`. */
  private readonly tekst = signal<string | null>(null);
  protected readonly prikaz = computed(() => this.tekst() ?? formatBroja(this.vrednost()));
  private readonly neispravno = computed(() => {
    const t = this.tekst();
    return t !== null && procitajBroj(t, this.min(), this.max()) === null;
  });
  /** `aria-invalid` i crvena ivica polja: MatInput bez forme ne računa grešku sam, pa je stanje naše. */
  protected readonly greska: ErrorStateMatcher = { isErrorState: () => this.neispravno() };

  protected kucanje(e: Event): void {
    this.tekst.set((e.target as HTMLInputElement).value);
    this.polje().updateErrorState();
  }

  protected potvrdi(): void {
    const t = this.tekst();
    if (t === null) return;
    this.tekst.set(null);
    this.polje().updateErrorState();
    const v = procitajBroj(t, this.min(), this.max());
    if (v !== null && v !== this.vrednost()) this.promena.emit(v);
  }

  protected odustani(): void {
    this.tekst.set(null);
    this.polje().updateErrorState();
  }
}
