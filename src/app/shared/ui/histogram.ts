import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export interface StubacHistograma {
  labela: string;
  broj: number;
}

/**
 * Okrugli podeoci ose broja (celi koraci 1, 2, 5 × 10^k, oko četiri intervala); poslednji je ≥ `max`.
 * `lepiPodeoci(7)` -> `[0, 2, 4, 6, 8]`; bez podataka `[0, 1]`.
 */
export function lepiPodeoci(max: number): number[] {
  if (!Number.isFinite(max) || max <= 0) {
    return [0, 1];
  }
  const sirovo = max / 4;
  const red = 10 ** Math.floor(Math.log10(sirovo));
  const korak = Math.max(1, [1, 2, 5, 10].map(m => m * red).find(k => k >= sirovo) ?? 10 * red);
  const vrh = Math.ceil(max / korak) * korak;
  return Array.from({ length: Math.round(vrh / korak) + 1 }, (_, i) => i * korak);
}

/** Geometrija (px; SVG se crta u izmerenoj širini, pa tekst ostaje čitljive veličine i na telefonu). */
const LEVO = 36;
const DESNO = 8;
const GORE = 20; // mesto za broj na vrhu stupca
const VISINA_CRTEZA = 180;
const DOLE = 38; // labele kategorija, do dva reda
const MAX_DEBLJINA = 24; // tanki stupci (dataviz: ≤ 24 px)
const ZAOBLJENJE = 4; // zaobljen kraj sa podatkom, ravan na osnovi
const PODRAZUMEVANA_SIRINA = 480;
/** Preko ovoliko stubaca brojevi na vrhu se ne pišu (ostaju osa, opis stupca i `aria-label`). */
const MAX_BROJEVA = 12;

/** Stubac od osnove `y0` naviše, zaobljen samo na vrhu. */
function putanjaStupca(x: number, y0: number, sirina: number, visina: number): string {
  const r = Math.min(ZAOBLJENJE, visina, sirina / 2);
  const vrh = y0 - visina;
  return (
    `M${x},${y0} V${vrh + r} A${r},${r} 0 0 1 ${x + r},${vrh} H${x + sirina - r} ` +
    `A${r},${r} 0 0 1 ${x + sirina},${vrh + r} V${y0} Z`
  );
}

/** Labela kategorije u dva reda kad ne staje u širinu stupca ("nije položio" -> "nije" / "položio"). */
function redoviLabele(labela: string, mesto: number): string[] {
  const razmak = labela.indexOf(' ');
  return labela.length * 6.6 > mesto && razmak > 0 ? [labela.slice(0, razmak + 1), labela.slice(razmak + 1)] : [labela];
}

/**
 * Histogram jedne serije (raspodela ocena, korpe poena): SVG sa osama, okruglim podeocima i brojem na vrhu stupca.
 * Jedna serija -> jedna boja (`--primary`, tekst u tokenima teksta) i bez legende; naslov nosi ekran. `role="img"` i
 * `aria-label` sa svim vrednostima i ukupnim brojem; svaki stubac ima `<title>` za prelaz mišem. Širina prati kontejner.
 */
@Component({
  selector: 'app-histogram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vrednosti().length === 0) {
      <p class="histogram-prazno">Nema podataka.</p>
    } @else {
      @let g = geometrija();
      <svg class="histogram" role="img" [attr.aria-label]="sazetak()" [attr.width]="g.sirina" [attr.height]="g.visina"
        [attr.viewBox]="'0 0 ' + g.sirina + ' ' + g.visina">
        @for (p of g.podeoci; track p.vrednost) {
          <line class="mreza" [class.osnova]="p.vrednost === 0" [attr.x1]="levo" [attr.x2]="g.sirina - desno"
            [attr.y1]="p.y" [attr.y2]="p.y" />
          <text class="y-labela" [attr.x]="levo - 6" [attr.y]="p.y" dy="0.32em" text-anchor="end">{{ p.vrednost }}</text>
        }
        @for (s of g.stubci; track $index) {
          <g class="kolona">
            <title>{{ s.opis }}</title>
            <rect class="meta" [attr.x]="s.mestoX" [attr.y]="gore" [attr.width]="s.mesto" [attr.height]="g.osnova - gore" />
            @if (s.visina > 0) {
              <path class="stubac" [attr.d]="s.putanja" [attr.data-visina]="s.visina" />
              @if (g.brojevi) {
                <text class="broj" [attr.x]="s.centar" [attr.y]="g.osnova - s.visina - 5" text-anchor="middle">{{ s.broj }}</text>
              }
            }
            <text class="x-labela" [attr.x]="s.centar" [attr.y]="g.osnova + 16" text-anchor="middle">
              @for (red of s.redovi; track $index) {
                <tspan [attr.x]="s.centar" [attr.dy]="$index === 0 ? 0 : '1.15em'">{{ red }}</tspan>
              }
            </text>
          </g>
        }
      </svg>
    }
  `,
  styles: `
    :host { display: block; max-width: 100%; overflow: hidden; }
    svg { display: block; font-size: 12px; }
    .mreza { stroke: var(--line); stroke-width: 1; shape-rendering: crispEdges; }
    .mreza.osnova { stroke: var(--muted); }
    .y-labela, .x-labela { fill: var(--muted); font-variant-numeric: tabular-nums; }
    .broj { fill: var(--ink-2); font-family: var(--font-mono); font-weight: 600; }
    .meta { fill: transparent; }
    .stubac { fill: var(--primary); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kolona:hover .stubac { fill: color-mix(in srgb, var(--primary) 80%, var(--ink)); }
    .kolona:hover .meta { fill: color-mix(in srgb, var(--primary) 6%, transparent); }
  `,
})
export class Histogram {
  /** Za `aria-label` ("Raspodela ocena: 5: 3, …"); vidljiv naslov daje ekran. */
  readonly naslov = input<string | null | undefined>(null);
  readonly vrednosti = input<readonly StubacHistograma[]>([]);

  protected readonly levo = LEVO;
  protected readonly desno = DESNO;
  protected readonly gore = GORE;
  private readonly sirina = signal(PODRAZUMEVANA_SIRINA);

  protected readonly sazetak = computed(() => {
    const v = this.vrednosti();
    const ukupno = v.reduce((z, s) => z + (Number.isFinite(s.broj) ? s.broj : 0), 0);
    const naslov = this.naslov();
    return `${naslov ? naslov + ': ' : ''}${v.map(s => `${s.labela}: ${s.broj}`).join(', ')}. Ukupno ${ukupno}.`;
  });

  protected readonly geometrija = computed(() => {
    const v = this.vrednosti();
    const sirina = Math.max(200, this.sirina());
    const osnova = GORE + VISINA_CRTEZA;
    const podeoci = lepiPodeoci(Math.max(0, ...v.map(s => (Number.isFinite(s.broj) ? s.broj : 0))));
    const vrh = podeoci[podeoci.length - 1];
    const y = (n: number) => osnova - (n / vrh) * VISINA_CRTEZA;
    const mesto = (sirina - LEVO - DESNO) / Math.max(1, v.length);
    const debljina = Math.min(MAX_DEBLJINA, Math.max(4, mesto - 8));
    return {
      sirina,
      visina: osnova + DOLE,
      osnova,
      brojevi: v.length <= MAX_BROJEVA,
      podeoci: podeoci.map(p => ({ vrednost: p, y: Math.round(y(p)) + 0.5 })),
      stubci: v.map((s, i) => {
        const broj = Number.isFinite(s.broj) && s.broj > 0 ? s.broj : 0;
        const mestoX = LEVO + i * mesto;
        const visina = (broj / vrh) * VISINA_CRTEZA;
        const x = mestoX + (mesto - debljina) / 2;
        return {
          broj,
          visina,
          mesto,
          mestoX,
          centar: mestoX + mesto / 2,
          putanja: putanjaStupca(x, osnova, debljina, visina),
          redovi: redoviLabele(s.labela, mesto),
          opis: `${s.labela}: ${s.broj}`,
        };
      }),
    };
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let posmatrac: ResizeObserver | undefined;
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      posmatrac = new ResizeObserver(([e]) => {
        const w = Math.floor(e.contentRect.width);
        if (w > 0 && w !== this.sirina()) {
          this.sirina.set(w);
        }
      });
      posmatrac.observe(host);
    });
    inject(DestroyRef).onDestroy(() => posmatrac?.disconnect());
  }
}
