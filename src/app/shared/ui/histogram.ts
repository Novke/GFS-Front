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
/** Preko ovoliko stubaca (ili u užem mestu) brojevi na vrhu se ne pišu (ostaju osa, opis stupca i `aria-label`). */
const MAX_BROJEVA = 12;
const MIN_MESTO_ZA_BROJ = 22;
/** Procena širine znaka labele (12 px IBM Plex Sans) za proređivanje labela. */
const SIRINA_ZNAKA = 6.6;

/** Broj za crtanje i opis: NaN, beskonačno i negativno su 0. */
function cist(broj: number): number {
  return Number.isFinite(broj) && broj > 0 ? broj : 0;
}

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
  return labela.length * SIRINA_ZNAKA > mesto && razmak > 0 ? [labela.slice(0, razmak + 1), labela.slice(razmak + 1)] : [labela];
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
              <path class="stubac" [attr.d]="s.putanja" [attr.data-visina]="s.visina" [attr.data-sirina]="g.debljina" />
              @if (g.brojevi) {
                <text class="broj" [attr.x]="s.centar" [attr.y]="g.osnova - s.visina - 5" text-anchor="middle">{{ s.broj }}</text>
              }
            }
            @if (s.labelaVidljiva) {
              <text class="x-labela" [attr.x]="s.centar" [attr.y]="g.osnova + 16" text-anchor="middle">
                @for (red of s.redovi; track $index) {
                  <tspan [attr.x]="s.centar" [attr.dy]="$index === 0 ? 0 : '1.15em'">{{ red }}</tspan>
                }
              </text>
            }
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
    const ukupno = v.reduce((z, s) => z + cist(s.broj), 0);
    const naslov = this.naslov();
    return `${naslov ? naslov + ': ' : ''}${v.map(s => `${s.labela}: ${cist(s.broj)}`).join(', ')}. Ukupno ${ukupno}.`;
  });

  protected readonly geometrija = computed(() => {
    const v = this.vrednosti();
    const sirina = Math.max(200, this.sirina());
    const osnova = GORE + VISINA_CRTEZA;
    const podeoci = lepiPodeoci(Math.max(0, ...v.map(s => cist(s.broj))));
    const vrh = podeoci[podeoci.length - 1];
    const y = (n: number) => osnova - (n / vrh) * VISINA_CRTEZA;
    const mesto = (sirina - LEVO - DESNO) / Math.max(1, v.length);
    // Razmak između stubaca je najmanje 2 px (ili 30 % mesta), pa se stupci nikad ne preklapaju.
    const debljina = Math.max(1, Math.min(MAX_DEBLJINA, mesto - Math.max(2, mesto * 0.3)));
    // Labele koje ne staju proređuju se: prikazuje se svaka k-ta (sve ostaju u `<title>` i `aria-label`).
    const redovi = v.map(s => redoviLabele(s.labela, mesto));
    const najsira = Math.max(...redovi.map(r => Math.max(...r.map(red => red.trim().length)))) * SIRINA_ZNAKA + 6;
    const svakaK = Math.max(1, Math.ceil(najsira / mesto));
    return {
      sirina,
      visina: osnova + DOLE,
      osnova,
      brojevi: v.length <= MAX_BROJEVA && mesto >= MIN_MESTO_ZA_BROJ,
      debljina,
      podeoci: podeoci.map(p => ({ vrednost: p, y: Math.round(y(p)) + 0.5 })),
      stubci: v.map((s, i) => {
        const broj = cist(s.broj);
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
          redovi: redovi[i],
          labelaVidljiva: i % svakaK === 0,
          opis: `${s.labela}: ${broj}`,
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
