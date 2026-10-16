// Pomoćnici za specove panela Svojstva (F6): provajderi (lažni sat istorije, Material bez animacija), traženje polja po
// labeli i kucanje u brojčano polje (vrednost, `input`, pa Enter ili `blur`).
import { type EnvironmentProviders, type Provider, provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { SAT_ISTORIJE } from './istorija';

/** Lažni sat istorije: `sat.t` pomera vreme (spajanje izmena istog ključa u roku od 1 s). */
export interface LazniSat { t: number; }

export function provajderiSvojstava(sat: LazniSat): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    { provide: SAT_ISTORIJE, useValue: () => sat.t },
  ];
}

/** Polje (input) u `mat-form-field`-u čija je labela tačno `oznaka`; null kad ga nema. */
export function polje(koren: ParentNode, oznaka: string): HTMLInputElement | null {
  const polja = Array.from(koren.querySelectorAll<HTMLElement>('mat-form-field'));
  const f = polja.find((p) => p.querySelector('mat-label')?.textContent?.trim() === oznaka);
  return f?.querySelector<HTMLInputElement>('input') ?? null;
}

/** Labele svih polja (`mat-label`) redom. */
export function oznakePolja(koren: ParentNode): string[] {
  return Array.from(koren.querySelectorAll('mat-form-field mat-label')).map((l) => l.textContent!.trim());
}

/** Dugme po `aria-label`-u ili, bez njega, po tekstu. */
export function dugme(koren: ParentNode, ime: string): HTMLButtonElement | null {
  const svi = Array.from(koren.querySelectorAll<HTMLButtonElement>('button'));
  return svi.find((b) => b.getAttribute('aria-label') === ime) ?? svi.find((b) => b.textContent?.trim() === ime) ?? null;
}

/** Kuca `tekst` u polje i potvrđuje Enter-om (ili izlaskom iz polja). */
export async function upisi(
  fixture: ComponentFixture<unknown>, el: HTMLInputElement, tekst: string, potvrda: 'enter' | 'blur' = 'enter',
): Promise<void> {
  el.focus();
  el.value = tekst;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  if (potvrda === 'enter') el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  else el.dispatchEvent(new FocusEvent('blur'));
  await fixture.whenStable();
}
