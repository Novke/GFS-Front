import { DecimalPipe } from '@angular/common';
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

import { formatDatum, parseDatum } from '../../../shared/util/datum.pipe';
import { SerijaProseka } from '../data-access/predmeti.models';

const LEVO = 40;
const DESNO = 44; // mesto za direktnu labelu poslednje vrednosti
const GORE = 12;
const VISINA_CRTEZA = 120;
const DOLE = 24;
const PODEOCI = [0, 50, 100];

/** Vremenska osa zajednička za sve serije (male serije se tako porede po vremenu). */
export interface OpsegVremena {
  od: number;
  do: number;
}

export function opsegVremena(serije: readonly SerijaProseka[]): OpsegVremena | null {
  const vremena = serije.flatMap(s => s.tacke.map(t => parseDatum(t.datum)?.getTime())).filter((v): v is number => typeof v === 'number');
  return vremena.length === 0 ? null : { od: Math.min(...vremena), do: Math.max(...vremena) };
}

/** Jedna mala serija: linija proseka (% od max poena) kroz vreme, jedna boja, osa 0-100 %. */
@Component({
  selector: 'app-grafikon-proseka',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = geometrija();
    <svg role="img" [attr.aria-label]="opis()" [attr.width]="g.sirina" [attr.height]="g.visina" [attr.viewBox]="'0 0 ' + g.sirina + ' ' + g.visina">
      @for (p of g.podeoci; track p.vrednost) {
        <line class="mreza" [class.osnova]="p.vrednost === 0" [attr.x1]="levo" [attr.x2]="g.sirina - desno" [attr.y1]="p.y" [attr.y2]="p.y" />
        <text class="y-labela" [attr.x]="levo - 6" [attr.y]="p.y" dy="0.32em" text-anchor="end">{{ p.vrednost }} %</text>
      }
      @if (g.putanja) {
        <path class="linija" [attr.d]="g.putanja" />
      }
      @for (t of g.tacke; track t.id) {
        <g class="tacka">
          <title>{{ t.opis }}</title>
          <circle class="meta" [attr.cx]="t.x" [attr.cy]="t.y" r="12" />
          <circle class="marker" [attr.cx]="t.x" [attr.cy]="t.y" r="4" />
        </g>
      }
      @if (g.poslednja; as p) {
        <text class="direktna" [attr.x]="p.x + 8" [attr.y]="p.y" dy="0.32em">{{ p.labela }}</text>
      }
      <text class="x-labela" [attr.x]="levo" [attr.y]="g.visina - 6">{{ g.odLabela }}</text>
      @if (g.doLabela) {
        <text class="x-labela" [attr.x]="g.sirina - desno" [attr.y]="g.visina - 6" text-anchor="end">{{ g.doLabela }}</text>
      }
    </svg>
  `,
  styles: `
    :host { display: block; max-width: 100%; overflow: hidden; }
    svg { display: block; font-size: 12px; }
    .mreza { stroke: var(--line); stroke-width: 1; shape-rendering: crispEdges; }
    .mreza.osnova { stroke: var(--muted); }
    .y-labela, .x-labela { fill: var(--muted); font-variant-numeric: tabular-nums; }
    .linija { fill: none; stroke: var(--primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .marker { fill: var(--primary); stroke: var(--surface); stroke-width: 2; }
    .meta { fill: transparent; }
    .tacka:hover .marker { r: 6; }
    .direktna { fill: var(--ink-2); font-family: var(--font-mono); font-weight: 600; }
  `,
})
export class GrafikonProseka {
  readonly serija = input.required<SerijaProseka>();
  readonly opseg = input.required<OpsegVremena>();

  protected readonly levo = LEVO;
  protected readonly desno = DESNO;
  private readonly sirina = signal(360);

  protected readonly opis = computed(() => {
    const s = this.serija();
    return `Prosek, ${s.tip.naziv}: ${s.tacke.map(t => `${formatDatum(t.datum)} ${t.procenat} %`).join(', ')}.`;
  });

  protected readonly geometrija = computed(() => {
    const sirina = Math.max(220, this.sirina());
    const { od, do: doV } = this.opseg();
    const raspon = doV - od;
    const osnova = GORE + VISINA_CRTEZA;
    const sirinaCrteza = sirina - LEVO - DESNO;
    const x = (v: number) => (raspon > 0 ? LEVO + ((v - od) / raspon) * sirinaCrteza : LEVO + sirinaCrteza / 2);
    const y = (p: number) => osnova - (Math.max(0, Math.min(100, p)) / 100) * VISINA_CRTEZA;
    const tacke = this.serija().tacke.map(t => ({
      id: t.id,
      x: Math.round(x(parseDatum(t.datum)?.getTime() ?? od) * 10) / 10,
      y: Math.round(y(t.procenat) * 10) / 10,
      opis: `${formatDatum(t.datum)}${t.grupa ? ' · ' + t.grupa : ''}: prosek ${t.prosek.toLocaleString('sr-Latn', { maximumFractionDigits: 1 })} od ${t.maxPoena} (${t.procenat.toLocaleString('sr-Latn')} %)`,
      procenat: t.procenat,
    }));
    const poslednja = tacke.at(-1);
    return {
      sirina,
      visina: osnova + DOLE,
      podeoci: PODEOCI.map(p => ({ vrednost: p, y: Math.round(y(p)) + 0.5 })),
      tacke,
      putanja: tacke.length > 1 ? tacke.map((t, i) => `${i === 0 ? 'M' : 'L'}${t.x},${t.y}`).join(' ') : null,
      poslednja: poslednja ? { x: poslednja.x, y: poslednja.y, labela: `${Math.round(poslednja.procenat)} %` } : null,
      odLabela: formatDatum(new Date(od)),
      doLabela: raspon > 0 ? formatDatum(new Date(doV)) : null,
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

/**
 * H3: prosek testova po tipu kroz vreme (u % od max poena, iz `TestListItem.prosek`), kao male serije: jedan grafikon
 * po tipu, ista vremenska osa i ista osa 0-100 %, jedna boja (bez legende; naziv tipa je naslov). Tabela sa istim
 * podacima je ispod ("Prikaži kao tabelu"), za čitače ekrana i štampu.
 */
@Component({
  selector: 'app-prosek-po-tipu',
  imports: [DecimalPipe, GrafikonProseka],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (opseg(); as o) {
      <div class="serije">
        @for (s of serije(); track s.tip.id) {
          <figure>
            <figcaption>{{ s.tip.naziv }}</figcaption>
            <app-grafikon-proseka [serija]="s" [opseg]="o" />
          </figure>
        }
      </div>
      <details>
        <summary>Prikaži kao tabelu</summary>
        <div class="tabela-okvir"><table class="tabela-proseka">
          <caption class="sr-only">Prosek testova po tipu</caption>
          <thead>
            <tr><th scope="col">Tip</th><th scope="col">Datum</th><th scope="col">Grupa</th><th scope="col" class="broj">Prosek</th><th scope="col" class="broj">Max</th><th scope="col" class="broj">%</th></tr>
          </thead>
          <tbody>
            @for (s of serije(); track s.tip.id) {
              @for (t of s.tacke; track t.id) {
                <tr>
                  <td>{{ s.tip.naziv }}</td>
                  <td class="mono">{{ datum(t.datum) }}</td>
                  <td>{{ t.grupa ?? '—' }}</td>
                  <td class="broj mono">{{ t.prosek | number: '1.0-1' }}</td>
                  <td class="broj mono">{{ t.maxPoena }}</td>
                  <td class="broj mono">{{ t.procenat | number: '1.0-1' }}</td>
                </tr>
              }
            }
          </tbody>
        </table></div>
      </details>
    } @else {
      <p class="prazno">Nema testova sa upisanim poenima u ovoj školskoj godini.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .serije { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    figure { margin: 0; min-width: 0; }
    figcaption { margin-bottom: 4px; font-weight: 600; font-size: 14px; }
    details { margin-top: 12px; }
    summary { cursor: pointer; color: var(--primary); font-size: 13px; min-height: 32px; display: flex; align-items: center; }
    .tabela-proseka { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px; }
    .tabela-proseka th { color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; white-space: nowrap; }
    .tabela-proseka th, .tabela-proseka td { padding: 6px 10px; border-bottom: 1px solid var(--line); }
    .tabela-proseka .broj { text-align: right; }
    .prazno { margin: 0; color: var(--muted); }
  `,
})
export class ProsekPoTipu {
  readonly serije = input.required<readonly SerijaProseka[]>();
  protected readonly opseg = computed(() => opsegVremena(this.serije()));
  protected readonly datum = formatDatum;
}
