import { signal } from '@angular/core';
import { GotoBafer, TasterAkcija, kljucPrecice, tasterUAkciju, uPoljuZaUnos } from '../tastatura';

/** Elementi koji sami koriste strelice, Enter ili Space (Material select, meni, tabovi, radio, klizač) i overlay-i. */
const SVOJA_TASTATURA = [
  '[role="combobox"]', '[role="listbox"]', '[role="option"]', '[role="textbox"]', '[role="menu"]', '[role="menuitem"]',
  '[role="tablist"]', '[role="tab"]', '[role="radiogroup"]', '[role="radio"]', '[role="slider"]', '[role="spinbutton"]',
  '[role="dialog"]', '.cdk-overlay-container',
].join(',');

/** Fokusirano dugme ili link sam obrađuje Enter (inače bi jedan pritisak poslao dve komande). */
const AKTIVIRA_SE = 'button, a[href], [role="button"], [role="switch"], [role="checkbox"], summary';
/** Prekidači zadržavaju i Space (u konzoli ih nema, ali Space na njima ne sme da pošalje komandu). */
const PREKIDAC = '[role="switch"], [role="checkbox"]';

/**
 * Da li prečicu treba preskočiti: ponavljanje držanjem tastera, otvoren dijalog, fokus u polju za unos ili u
 * Material kontroli koja sama koristi tastere, Enter na fokusiranom dugmetu ili linku. Space je uvek REZULTATI
 * (spec 6.4), i kad je fokus na dugmetu posle klika mišem; `TastaturaIzvodjenja` tada sprečava klik tog dugmeta.
 */
export function preskociPrecicu(e: KeyboardEvent, dijalogOtvoren: boolean): boolean {
  if (e.defaultPrevented || e.repeat || dijalogOtvoren || uPoljuZaUnos(e.target)) return true;
  const el = e.target instanceof Element ? e.target : null;
  if (el?.closest(SVOJA_TASTATURA)) return true;
  if (e.key === 'Enter') return !!el?.closest(AKTIVIRA_SE);
  if (e.key === ' ') return !!el?.closest(PREKIDAC);
  return false;
}

/**
 * Dugme komande posle klika mišem ili dodirom ne zadržava fokus, pa sledeći Enter ide na prečicu (`→`), a ne na to
 * dugme. Klik sa tastature (`detail === 0`) zadržava fokus, da Tab navigacija radi.
 */
export function pustiFokusPosleKlika(e: MouseEvent): void {
  if (e.detail > 0 && e.currentTarget instanceof HTMLElement) e.currentTarget.blur();
}

/** Koliko dugo se vidi "Idi na: 12" posle poslednjeg tastera (koliko i `GotoBafer` čeka). */
const GOTO_PRIKAZ_MS = 3000;

/**
 * Tastatura izvođenja (ista u publici i konzoli): `G` + broj + `Enter` kroz `GotoBafer` sa indikatorom
 * (`gotoUnos`, sam se sakrije posle 3 s), ostalo kroz `tasterUAkciju`. Slova rade i na ćiriličnom rasporedu
 * (`kljucPrecice`: `e.code` kad je `e.key` slovo van ASCII-ja).
 */
export class TastaturaIzvodjenja {
  /** `null` = nije u G režimu; inače do sada otkucane cifre. */
  readonly gotoUnos = signal<string | null>(null);
  private readonly goto = new GotoBafer();
  private tajmer: ReturnType<typeof setTimeout> | undefined;
  /** Space je na keydown postao prečica: na keyup se sprečava i klik fokusiranog dugmeta (Firefox klikće na keyup). */
  private spaceProgutan = false;

  /** Akcija za taster ili `null`; kad je taster prečica, poziva `preventDefault` (Space ne skroluje, Enter ne klikne). */
  akcija(e: KeyboardEvent, brojSlajdova: number, dijalogOtvoren: boolean): TasterAkcija | null {
    if (preskociPrecicu(e, dijalogOtvoren)) return null;
    const g = e.ctrlKey || e.metaKey || e.altKey ? null : this.goto.obradi(kljucPrecice(e));
    this.prikaziGoto();
    if (g === 'progutao') {
      e.preventDefault();
      return null;
    }
    const a = g ?? tasterUAkciju(e, brojSlajdova);
    if (a) {
      e.preventDefault();
      if (e.key === ' ') this.spaceProgutan = true;
    }
    return a;
  }

  /** `document:keyup`: Space koji je bio prečica ne sme da aktivira fokusirano dugme. */
  pusten(e: KeyboardEvent): void {
    if (e.key === ' ' && this.spaceProgutan) {
      e.preventDefault();
      this.spaceProgutan = false;
    }
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
