import { signal } from '@angular/core';
import { GotoBafer, TasterAkcija, tasterUAkciju, uPoljuZaUnos } from '../tastatura';

/** Elementi koji sami koriste strelice, Enter ili Space (Material select, meni, tabovi, radio, klizač) i overlay-i. */
const SVOJA_TASTATURA = [
  '[role="combobox"]', '[role="listbox"]', '[role="option"]', '[role="textbox"]', '[role="menu"]', '[role="menuitem"]',
  '[role="tablist"]', '[role="tab"]', '[role="radiogroup"]', '[role="radio"]', '[role="slider"]', '[role="spinbutton"]',
  '[role="dialog"]', '.cdk-overlay-container',
].join(',');

/** Fokusirano dugme ili link sam obrađuje Enter i Space (inače bi jedan pritisak poslao dve komande). */
const AKTIVIRA_SE = 'button, a[href], [role="button"], [role="switch"], [role="checkbox"], summary';

/**
 * Da li prečicu treba preskočiti: ponavljanje držanjem tastera, otvoren dijalog, fokus u polju za unos ili u
 * Material kontroli koja sama koristi tastere, Enter/Space na fokusiranom dugmetu.
 */
export function preskociPrecicu(e: KeyboardEvent, dijalogOtvoren: boolean): boolean {
  if (e.defaultPrevented || e.repeat || dijalogOtvoren || uPoljuZaUnos(e.target)) return true;
  const el = e.target instanceof Element ? e.target : null;
  if (el?.closest(SVOJA_TASTATURA)) return true;
  return (e.key === 'Enter' || e.key === ' ') && !!el?.closest(AKTIVIRA_SE);
}

/** Koliko dugo se vidi "Idi na: 12" posle poslednjeg tastera (koliko i `GotoBafer` čeka). */
const GOTO_PRIKAZ_MS = 3000;

/**
 * Tastatura izvođenja (ista u publici i konzoli): `G` + broj + `Enter` kroz `GotoBafer` sa indikatorom
 * (`gotoUnos`, sam se sakrije posle 3 s), ostalo kroz `tasterUAkciju`.
 */
export class TastaturaIzvodjenja {
  /** `null` = nije u G režimu; inače do sada otkucane cifre. */
  readonly gotoUnos = signal<string | null>(null);
  private readonly goto = new GotoBafer();
  private tajmer: ReturnType<typeof setTimeout> | undefined;

  /** Akcija za taster ili `null`; kad je taster prečica, poziva `preventDefault` (Space ne skroluje, Enter ne klikne). */
  akcija(e: KeyboardEvent, brojSlajdova: number, dijalogOtvoren: boolean): TasterAkcija | null {
    if (preskociPrecicu(e, dijalogOtvoren)) return null;
    const g = e.ctrlKey || e.metaKey || e.altKey ? null : this.goto.obradi(e.key);
    this.prikaziGoto();
    if (g === 'progutao') {
      e.preventDefault();
      return null;
    }
    const a = g ?? tasterUAkciju(e, brojSlajdova);
    if (a) e.preventDefault();
    return a;
  }

  unisti(): void {
    clearTimeout(this.tajmer);
  }

  private prikaziGoto(): void {
    const unos = this.goto.unos;
    this.gotoUnos.set(unos);
    clearTimeout(this.tajmer);
    if (unos !== null) {
      this.tajmer = setTimeout(() => this.gotoUnos.set(null), GOTO_PRIKAZ_MS);
    }
  }
}

/** Ceo ekran (lokalno, `F`): uključi ili isključi. */
export function prebaciCeoEkran(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
  } else {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
}
