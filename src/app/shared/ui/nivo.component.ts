import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output } from '@angular/core';

/** Nivoi varijante zadatka unutar svog tipa: 1 = lakša, 2 = srednja, 3 = teža. */
export const NIVOI = [1, 2, 3] as const;

const OPISI: Readonly<Record<number, string>> = { 1: 'lakši', 2: 'srednji', 3: 'teži' };

/** "Nivo 2 od 3 (srednji)": tekst za `aria-label` i `title` nivoa 1-3. */
export function opisNivoa(nivo: number): string {
  return `Nivo ${nivo} od ${NIVOI.length} (${OPISI[nivo] ?? '?'})`;
}

/** "★★" (popunjene zvezdice nivoa): kratak tekstualni oblik za poruke i najave; reč "zvezdica" se za nivo ne koristi. */
export function zvezdiceNivoa(nivo: number): string {
  return '★'.repeat(Math.max(0, Math.min(nivo, NIVOI.length)));
}

/** Putanja petokrake zvezde u okviru 24 x 24. */
const ZVEZDA = 'M12 2.8l2.75 5.8 6.35.8-4.65 4.4 1.2 6.3L12 17l-5.65 3.1 1.2-6.3L2.9 9.4l6.35-.8z';

/**
 * Nivo varijante zadatka: ★ / ★★ / ★★★ (popunjene zvezdice do nivoa, prazne do 3), uz natpis "Nivo". Dva režima:
 * - prikaz (podrazumevano): jedna slika sa `aria-label` "Nivo N od 3 (lakši|srednji|teži)"; `nivo` `null` je "Svi nivoi";
 * - izbor (`izbor`): radio grupa (`role="radiogroup"`) sa po jednim `role="radio"` za svaki nivo, koji se bira klikom ili strelicama
 *   (levo/desno i gore/dole kruže, Home/End idu na prvi i poslednji; fokus i izbor idu zajedno, kao kod radio dugmadi). `saSvima`
 *   dodaje prvu opciju "Svi" (emituje `null`; slajd Zadatak i konzola). Izbor je kontrolisan: komponenta samo emituje
 *   `promena` i prikazuje ono što dobije kroz `nivo` (nadređeni optimistično menja vrednost, pa je vraća na grešku).
 * Boje kroz tokene (`--star`, `--warn`, `--muted`), bez hex vrednosti; zvezdice su SVG pa ne zavise od fonta.
 */
@Component({
  selector: 'gfs-nivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.nivo-izbor]': 'izbor()' },
  template: `
    @if (natpis()) {
      <span class="nivo-natpis" [id]="natpisId" [attr.aria-hidden]="izbor() ? null : true">{{ natpisTekst() }}</span>
    }
    @if (izbor()) {
      <span class="nivo-grupa" role="radiogroup" [attr.aria-labelledby]="natpis() ? natpisId : null"
        [attr.aria-label]="natpis() ? null : natpisTekst()" (keydown)="tastatura($event)">
        @if (saSvima()) {
          <button type="button" role="radio" class="nivo-svi" data-nivo="svi" [attr.aria-checked]="nivo() === null"
            [attr.aria-label]="brojevi() ? 'Svi nivoi, ' + opisBroja(zbir()) : null"
            [attr.tabindex]="fokusiran() === null ? 0 : -1" [disabled]="onemoguceno()" (click)="biraj(null)">Svi@if (brojevi()) {<span class="nivo-broj" aria-hidden="true">{{ zbir() }}</span>}</button>
        }
        @for (n of nivoi; track n) {
          <button type="button" role="radio" class="nivo-dugme" [attr.data-nivo]="n" [attr.aria-checked]="nivo() === n"
            [attr.aria-label]="opisSaBrojem(n)" [attr.title]="opisSaBrojem(n)" [attr.tabindex]="fokusiran() === n ? 0 : -1"
            [disabled]="onemoguceno()" (click)="biraj(n)">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" [class.puna]="nivo() !== null && n <= nivo()!">
              <path [attr.d]="zvezda" />
            </svg>
            @if (brojevi()) {
              <span class="nivo-broj" aria-hidden="true">{{ brojevi()![n - 1] ?? 0 }}</span>
            }
          </button>
        }
      </span>
    } @else {
      <span class="nivo-prikaz" role="img" [attr.aria-label]="opisPrikaza()" [attr.title]="opisPrikaza()" data-nivo-prikaz>
        @if (nivo() === null) {
          <span class="nivo-svi-tekst" aria-hidden="true">Svi</span>
        } @else {
          @for (n of nivoi; track n) {
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" [class.puna]="n <= nivo()!"><path [attr.d]="zvezda" /></svg>
          }
        }
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
    .nivo-natpis { color: var(--muted); font-size: 12px; }
    .nivo-prikaz, .nivo-grupa { display: inline-flex; align-items: center; gap: 2px; }
    .nivo-svi-tekst { color: var(--ink-2); font-size: 12px; font-weight: 600; }
    svg { width: 16px; height: 16px; fill: none; stroke: var(--muted); stroke-width: 1.6; stroke-linejoin: round; }
    svg.puna { fill: var(--star); stroke: var(--warn); }
    .nivo-broj { margin-left: 4px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    button { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 4px; border: 1px solid transparent;
      border-radius: var(--radius-sm); background: transparent; color: var(--ink-2); font: inherit; font-size: 13px; cursor: pointer; }
    button svg { width: 20px; height: 20px; }
    button:hover:not(:disabled) { background: var(--surface-2); }
    button:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    button:disabled { cursor: default; opacity: .6; }
    .nivo-svi { padding: 0 10px; font-weight: 600; }
    .nivo-svi[aria-checked='true'] { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-soft-ink); }
  `,
})
export class NivoComponent {
  private static brojilo = 0;

  /** 1-3 ili `null` (svi nivoi). */
  readonly nivo = input<number | null | undefined>(null);
  /** Režim izbora (radio grupa) umesto prikaza. */
  readonly izbor = input(false, { transform: booleanAttribute });
  /** Uz izbor: prva opcija "Svi" (emituje `null`). */
  readonly saSvima = input(false, { transform: booleanAttribute });
  /** Vidljiv natpis "Nivo" ispred zvezdica. */
  readonly natpis = input(true, { transform: booleanAttribute });
  /** Tekst natpisa (i naziv radio grupe): "Nivo", a gde na ekranu ima više grupa, razlikovan ("Prikaži nivo"). */
  readonly natpisTekst = input('Nivo');
  /** Uz izbor: broj kandidata po nivoima (nivo 1, 2, 3); prikazuje se uz svaku opciju ("Svi" = zbir) i ulazi u njen naziv. */
  readonly brojevi = input<readonly number[] | null | undefined>(null);
  readonly onemoguceno = input(false, { transform: booleanAttribute });
  /** Izabrana vrednost: nivo 1-3 ili `null` ("Svi"). */
  readonly promena = output<number | null>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly nivoi = NIVOI;
  protected readonly zvezda = ZVEZDA;
  protected readonly opis = opisNivoa;
  protected readonly natpisId = `gfs-nivo-natpis-${NivoComponent.brojilo++}`;

  /** Radio sa tabindex 0 (roving): izabrani, a kad izbora nema (ili nije u ponudi) prvi u grupi (`null` = "Svi"). */
  protected readonly fokusiran = computed<number | null>(() => {
    const n = this.nivo();
    if (n !== null && n !== undefined && n >= 1 && n <= NIVOI.length) {
      return n;
    }
    return this.saSvima() ? null : NIVOI[0];
  });

  protected readonly zbir = computed(() => (this.brojevi() ?? []).reduce((a, b) => a + b, 0));

  protected opisBroja(n: number): string {
    return n === 1 ? '1 varijanta' : `${n} varijanti`;
  }

  protected opisSaBrojem(n: number): string {
    const b = this.brojevi();
    return b ? `${opisNivoa(n)}, ${this.opisBroja(b[n - 1] ?? 0)}` : opisNivoa(n);
  }

  protected readonly opisPrikaza = computed(() => {
    const n = this.nivo();
    return n === null || n === undefined ? 'Svi nivoi' : opisNivoa(n);
  });

  protected biraj(n: number | null): void {
    if (!this.onemoguceno() && n !== (this.nivo() ?? null)) {
      this.promena.emit(n);
    }
  }

  protected tastatura(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    const ponuda: (number | null)[] = this.saSvima() ? [null, ...NIVOI] : [...NIVOI];
    const tekuci = this.fokusiran();
    const i = Math.max(0, ponuda.indexOf(tekuci));
    let sledeci: number;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': sledeci = (i + 1) % ponuda.length; break;
      case 'ArrowLeft': case 'ArrowUp': sledeci = (i - 1 + ponuda.length) % ponuda.length; break;
      case 'Home': sledeci = 0; break;
      case 'End': sledeci = ponuda.length - 1; break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    const n = ponuda[sledeci];
    this.biraj(n);
    this.host.nativeElement.querySelector<HTMLElement>(`[data-nivo="${n === null ? 'svi' : n}"]`)?.focus();
  }
}
