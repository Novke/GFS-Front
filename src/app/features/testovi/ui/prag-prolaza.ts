import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';

import { SaveStatus, StanjeCuvanja } from '../../../shared/ui/save-status';
import { PORUKA_PRAGA } from '../data-access/test.store';

/** Tekst polja -> prag: prazno `null` (bez praga), ceo broj 0-max, inače poruka greške. */
export function parsirajPrag(tekst: string, max: number | null | undefined): { prag: number | null } | { greska: string } {
  const t = tekst.trim();
  if (t === '') {
    return { prag: null };
  }
  if (!/^\d+$/.test(t)) {
    return { greska: 'Unesi ceo broj poena (ili ostavi prazno).' };
  }
  const prag = Number(t);
  return max !== null && max !== undefined && prag > max ? { greska: PORUKA_PRAGA } : { prag };
}

/**
 * Prag prolaza testa (poeni) u zaglavlju: polje koje se čuva samo (Enter ili napuštanje polja), sa `SaveStatus`, i na
 * evidentiranom testu (`PATCH test/{id}/prag-prolaza`, odvojeno od izmene zaglavlja). Prazno = bez praga. Greška (klijent
 * ili server, npr. prag > max) se prikazuje ispod polja.
 */
@Component({
  selector: 'app-prag-prolaza',
  imports: [SaveStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="prag">
      <span class="labela">Prag prolaza (poeni)</span>
      <span class="red">
        <input class="unos mono" type="text" inputmode="numeric" autocomplete="off" data-prag placeholder="—"
          [value]="tekst()" [attr.aria-invalid]="greska() ? 'true' : null" aria-describedby="prag-opis"
          (input)="kucaj($any($event.target).value)" (keydown.enter)="sacuvajPolje($event)" (blur)="sacuvajPolje()" />
        @if (max() !== null) {
          <span class="od" aria-hidden="true">/ {{ max() }}</span>
        }
        <app-save-status kompaktno [stanje]="stanje()" (ponovo)="sacuvaj()" />
      </span>
    </label>
    <span id="prag-opis" class="opis" [class.greska]="!!greska()" data-prag-opis>{{ greska() ?? 'Bez praga test nema prolaznost.' }}</span>
  `,
  styles: `
    :host { display: inline-flex; flex-direction: column; gap: 2px; }
    .prag { display: flex; align-items: center; gap: 8px; }
    .labela { font-size: 12.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
    .red { display: inline-flex; align-items: center; gap: 6px; }
    .unos { width: 64px; height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; text-align: right; }
    .unos:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; border-color: var(--primary); }
    .unos[aria-invalid='true'] { border-color: var(--danger); }
    .od, .opis { color: var(--muted); font-size: 12px; }
    .opis.greska { color: var(--danger); }
    @media (max-width: 599.98px) { .unos { height: 44px; font-size: 16px; } }
  `,
})
export class PragProlaza {
  readonly prag = input<number | null>(null);
  readonly max = input<number | null>(null);
  /** Čuva prag; vraća `null` kad je sačuvano, inače razlog greške. */
  readonly cuvaj = input.required<(prag: number | null) => Promise<string | null>>();

  protected readonly tekst = signal('');
  protected readonly greska = signal<string | null>(null);
  protected readonly stanje = signal<StanjeCuvanja | null>(null);
  private readonly menja = signal(false);
  private readonly sacuvan = computed(() => (this.prag() === null ? '' : String(this.prag())));

  constructor() {
    // vrednost sa servera prepisuje polje samo dok korisnik ne kuca
    effect(() => {
      const v = this.sacuvan();
      if (!untracked(this.menja)) {
        this.tekst.set(v);
      }
    });
  }

  protected kucaj(v: string): void {
    this.tekst.set(v);
    this.menja.set(true);
    this.greska.set(null);
    if (this.stanje() !== 'cuva') {
      this.stanje.set(null);
    }
  }

  protected sacuvajPolje(e?: Event): void {
    e?.preventDefault();
    if (this.menja()) {
      void this.sacuvaj();
    }
  }

  protected async sacuvaj(): Promise<void> {
    const r = parsirajPrag(this.tekst(), this.max());
    if ('greska' in r) {
      this.greska.set(r.greska);
      return;
    }
    if (r.prag === this.prag() && this.stanje() !== 'greska') {
      this.menja.set(false);
      return;
    }
    this.stanje.set('cuva');
    const greska = await this.cuvaj()(r.prag);
    this.greska.set(greska);
    this.stanje.set(greska ? 'greska' : 'sacuvano');
    if (!greska) {
      this.menja.set(false);
      this.tekst.set(this.sacuvan());
    }
  }
}
