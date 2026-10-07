import { ChangeDetectionStrategy, Component, NgZone, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ServerskiSat } from '../data-access/sat';

export interface TajmerStanje { preostaloMs: number; sekunde: number; pauza: boolean; upozorenje: boolean; }

/** Ispod ovoliko preostalog vremena tajmer je crven. */
const UPOZORENJE_MS = 5_000;
const OSVEZAVANJE_MS = 250;
/** Obim kruga poluprečnika 45 u viewBox-u 100. */
const OBIM = 2 * Math.PI * 45;

/**
 * Stanje tajmera u trenutku `sadaServerMs` (serversko vreme). Pauza (`preostaloMs` != null) ima prednost nad rokom;
 * bez roka i bez pauze tajmera nema.
 */
export function stanjeTajmera(rokMs: number | null, preostaloMs: number | null, sadaServerMs: number): TajmerStanje | null {
  const pauza = preostaloMs !== null;
  if (!pauza && rokMs === null) {
    return null;
  }
  const preostalo = Math.max(0, pauza ? preostaloMs : rokMs! - sadaServerMs);
  return { preostaloMs: preostalo, sekunde: Math.ceil(preostalo / 1000), pauza, upozorenje: preostalo < UPOZORENJE_MS };
}

/** Deo prstena koji je preostao (0-1). */
export function udeoPrstena(preostaloMs: number, ukupnoMs: number): number {
  return ukupnoMs > 0 ? Math.min(1, Math.max(0, preostaloMs / ukupnoMs)) : 0;
}

/**
 * Tajmer kao prsten koji se prazni, sa sekundama u sredini; crven ispod 5 s, "⏸" u pauzi. Odbrojava po serverskom satu
 * (`sat`), pa telefon ili projektor sa pogrešnim satom vidi isti rok. Veličinu određuje roditelj (širina elementa).
 * Pun krug je `ukupnoMs` ako je poznat, inače najveće preostalo vreme viđeno od početka runde (+10 s ga povećava).
 */
@Component({
  selector: 'gfs-tajmer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'uz-tajmer',
    role: 'timer',
    '[class.uz-tajmer--upozorenje]': 'stanje()?.upozorenje',
    '[class.uz-tajmer--pauza]': 'stanje()?.pauza',
    '[attr.aria-label]': 'oznaka()',
  },
  template: `
    @if (stanje(); as s) {
      <svg class="uz-tajmer-prsten" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="uz-tajmer-staza" cx="50" cy="50" r="45" />
        <circle class="uz-tajmer-luk" cx="50" cy="50" r="45" transform="rotate(-90 50 50)"
                [attr.stroke-dasharray]="obim" [attr.stroke-dashoffset]="pomak()" />
      </svg>
      <span class="uz-tajmer-broj" aria-hidden="true">
        {{ s.sekunde }}
        @if (s.pauza) {
          <!-- ⏸ kao SVG: znak U+23F8 nema svaki font (projektor bez emoji fonta). -->
          <svg class="uz-tajmer-pauza" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" /></svg>
        }
      </span>
    }
  `,
})
export class TajmerComponent {
  /** Rok runde u serverskom epoch ms (dok tajmer radi). */
  readonly rokMs = input<number | null>(null);
  /** Preostalo u pauzi (null dok tajmer radi). */
  readonly preostaloMs = input<number | null>(null);
  readonly sat = input<ServerskiSat | null>(null);
  /** Trajanje punog kruga, npr. vreme pitanja; opciono. */
  readonly ukupnoMs = input<number | null>(null);

  protected readonly obim = OBIM;
  private readonly sada = signal(Date.now());
  private readonly najvise = signal(0);

  protected readonly stanje = computed(() => {
    const sat = this.sat();
    const sada = this.sada();
    return stanjeTajmera(this.rokMs(), this.preostaloMs(), sat ? sat.sada(sada) : sada);
  });
  protected readonly pomak = computed(() => {
    const s = this.stanje();
    if (!s) {
      return OBIM;
    }
    const ukupno = Math.max(this.ukupnoMs() ?? 0, this.najvise(), s.preostaloMs);
    return OBIM * (1 - udeoPrstena(s.preostaloMs, ukupno));
  });
  protected readonly oznaka = computed(() => {
    const s = this.stanje();
    if (!s) {
      return null;
    }
    return (s.pauza ? 'Tajmer je pauziran, preostalo ' : 'Preostalo vreme ') + s.sekunde + ' s';
  });

  constructor() {
    const zona = inject(NgZone);
    // Osvežavanje samo dok tajmer radi; interval je van zone, signal sam zakazuje osvežavanje prikaza.
    effect((onCleanup) => {
      const radi = this.rokMs() !== null && this.preostaloMs() === null;
      if (!radi) {
        return;
      }
      this.sada.set(Date.now());
      const id = zona.runOutsideAngular(() => setInterval(() => this.sada.set(Date.now()), OSVEZAVANJE_MS));
      onCleanup(() => clearInterval(id));
    });
    // Pun krug: najveće preostalo vreme od početka runde; posle isteka (0) ili bez tajmera kreće ispočetka.
    let prethodno = 0;
    effect(() => {
      const s = this.stanje();
      const preostalo = s?.preostaloMs ?? 0;
      untracked(() => this.najvise.update(m => (prethodno === 0 ? preostalo : Math.max(m, preostalo))));
      prethodno = preostalo;
    });
  }
}
