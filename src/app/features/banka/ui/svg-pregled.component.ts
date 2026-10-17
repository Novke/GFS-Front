import { ChangeDetectionStrategy, Component, computed, inject, input, model, ViewEncapsulation } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import type { RenderGreskaInfo } from '../data-access/banka.models';
import type { StanjePregleda } from '../data-access/render-proba';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Elementi koje pdftocairo (cairo SVG) pravi; sve ostalo (script, foreignObject, set, animate, style, ...) se briše. */
const DOZVOLJENI = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'clipPath', 'mask', 'pattern', 'image', 'linearGradient', 'radialGradient', 'stop', 'filter', 'feColorMatrix', 'feComposite',
  'feFlood', 'feGaussianBlur', 'feOffset', 'feBlend', 'feMerge', 'feMergeNode', 'title', 'desc',
]);
const SLIKA_U_PODACIMA = /^data:image\/(png|jpeg|gif|webp);/i;
const URL_REF = /url\(\s*(['"]?)([^'")]*)\1\s*\)/g;

/**
 * SVG render-probe (tekst sa našeg servera, `pdftocairo`) spreman za umetanje u stranicu, ili `null` kad nije ispravan SVG.
 * Dodatna zaštita (render ga pravi sam server, bez skripti): briše elemente van {@link DOZVOLJENI} sa podstablom, `on*`
 * atribute, `javascript:` vrednosti i veze van dokumenta (`href` sme samo `#id` ili `data:image/...`, `url()` samo `#id`).
 * Radi nad DOM-om (`DOMParser`), pa vidi i kodirane vrednosti (`jav&#97;script:`). Id-jevi i reference na njih dobijaju
 * `prefiks`: dva umetnuta SVG-a (tekst i rešenje) imaju iste id-jeve glifova (`glyph-0-1`), a `<use>` bi uzeo prvi u stranici.
 */
export function ocistiSvg(svg: string, prefiks: string): string | null {
  const dok = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const koren = dok.documentElement;
  if (koren.localName !== 'svg' || koren.namespaceURI !== SVG_NS || dok.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  const svi = [koren, ...koren.querySelectorAll('*')];
  for (const el of svi) {
    if (el !== koren && (el.namespaceURI !== SVG_NS || !DOZVOLJENI.has(el.localName))) {
      el.remove();
    }
  }
  for (const el of [koren, ...koren.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      const ime = a.localName.toLowerCase();
      let v = a.value;
      let ostaje = !ime.startsWith('on') && !/javascript:|vbscript:/i.test(v.replace(/\s/g, ''));
      if (ostaje && ime === 'href') {
        ostaje = v.startsWith('#') || SLIKA_U_PODACIMA.test(v.trim());
        if (v.startsWith('#')) {
          v = `#${prefiks}${v.slice(1)}`;
        }
      }
      if (ostaje && v.includes('url(')) {
        ostaje = [...v.matchAll(URL_REF)].every(m => m[2].trim().startsWith('#'));
        v = v.replace(URL_REF, (_c, _n, ref: string) => `url(#${prefiks}${ref.trim().slice(1)})`);
      }
      if (ostaje && ime === 'id' && !a.prefix) {
        v = prefiks + v;
      }
      if (!ostaje) {
        el.removeAttributeNode(a);
      } else if (v !== a.value) {
        a.value = v;
      }
    }
  }
  return new XMLSerializer().serializeToString(koren);
}

let sledeci = 0;

/**
 * Pregled render-probe jednog dela varijante (zadatak ili rešenje): SVG u okviru širine 84 mm, kao na telefonu u
 * portretu (render je `varwidth=84mm`, telefon ga širi na 100%), na beloj podlozi i noću (`.rezim-dan`), sa prekidačem
 * "Puna širina" dok ima SVG (`punaSirina`, dvosmerno; ime prekidača nosi naslov, jer stranica ima dva pregleda). SVG ide u stranicu kroz
 * `bypassSecurityTrustHtml` samo posle {@link ocistiSvg}; telo sme biti samo odgovor `render-proba` našeg servera.
 *
 * Stanja (`Pregled.stanje`): `prazno` (poruka `praznaPoruka`), `ceka` (stari SVG prigušen ili "Renderuje se…"), `ok`,
 * `greska` (poruka sa linijom u elementu `greskaId`, na koji se editor poziva kroz `aria-describedby`), `nedostupan`.
 * Ishod se najavljuje učtivo (`role="status"`); čekanje ne, da kucanje ne bi stalno pričalo.
 */
@Component({
  selector: 'app-svg-pregled',
  imports: [MatProgressSpinner, MatSlideToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './svg-pregled.component.css',
  template: `
    <section class="bk-sp" [attr.aria-labelledby]="idNaslova">
      <header class="bk-sp-zaglavlje">
        <h3 class="bk-sp-naslov" [id]="idNaslova">{{ naslov() }}</h3>
        @if (stanje() === 'ceka') {
          <span class="bk-sp-ceka"><mat-progress-spinner mode="indeterminate" diameter="16" aria-hidden="true" />Renderuje se…</span>
        }
        @if (prikaz()) {
          <mat-slide-toggle class="bk-sp-sirina" [checked]="punaSirina()" [aria-label]="'Puna širina, ' + naslov()"
            (change)="punaSirina.set($event.checked)">Puna širina</mat-slide-toggle>
        }
      </header>
      <span class="sr-only" role="status">{{ najava() }}</span>
      @switch (stanje()) {
        @case ('greska') {
          <p class="bk-sp-greska" [id]="greskaId()" data-greska-pregleda>{{ porukaGreske() }}</p>
        }
        @case ('nedostupan') {
          <p class="bk-sp-poruka" data-nedostupan>Render servis trenutno nije dostupan. Pregled stiže kad nastaviš da kucaš ili pritisneš Ctrl+Enter.</p>
        }
        @case ('prazno') {
          <p class="bk-sp-poruka">{{ praznaPoruka() ?? 'Pregled se pojavljuje kad počneš da kucaš.' }}</p>
        }
      }
      @if (prikaz(); as html) {
        <div class="bk-sp-okvir rezim-dan" [class.bk-sp-puna]="punaSirina()" [class.bk-sp-zastarelo]="stanje() === 'ceka'">
          <div class="bk-sp-svg" role="img" [attr.aria-label]="'Pregled: ' + naslov()" [innerHTML]="html"></div>
        </div>
        <p class="bk-sp-napomena">{{ punaSirina() ? 'Uvećano na širinu kolone' : 'Širina kao na telefonu (84 mm)' }}</p>
      } @else if (stanje() === 'ok') {
        <p class="bk-sp-poruka">Render nije moguće prikazati.</p>
      } @else if (stanje() === 'ceka') {
        <p class="bk-sp-poruka">Renderuje se…</p>
      }
    </section>
  `,
})
export class SvgPregledComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly naslov = input.required<string>();
  /** SVG kao tekst (`RenderProbaInfo.svg`); prikazuje se u stanjima `ok` i `ceka`. */
  readonly svg = input<string | null>(null);
  readonly greska = input<RenderGreskaInfo | null>(null);
  readonly stanje = input<StanjePregleda>('prazno');
  /** Id poruke greške (editor ga stavlja u `aria-describedby`). */
  readonly greskaId = input<string | null>(null);
  /** Poruka stanja `prazno` (npr. "Rešenje nije uneto."); `null` = podrazumevana. */
  readonly praznaPoruka = input<string | null>(null);
  readonly punaSirina = model(false);

  private readonly prefiks = `bk-sp-${++sledeci}-`;
  protected readonly idNaslova = `${this.prefiks}naslov`;

  private readonly ociscen = computed(() => {
    const svg = this.svg();
    return svg ? ocistiSvg(svg, this.prefiks) : null;
  });
  protected readonly prikaz = computed<SafeHtml | null>(() => {
    const s = this.stanje();
    const html = this.ociscen();
    return (s === 'ok' || s === 'ceka') && html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });
  protected readonly porukaGreske = computed(() => {
    const g = this.greska();
    if (!g) {
      return 'Render nije uspeo.';
    }
    return g.linija === null ? g.poruka : `Greška u liniji ${g.linija}: ${g.poruka}`;
  });
  protected readonly najava = computed(() => {
    const n = this.naslov();
    switch (this.stanje()) {
      case 'ok':
        return `${n}: pregled je osvežen.`;
      case 'greska': {
        const linija = this.greska()?.linija;
        return linija ? `${n}: greška u liniji ${linija}.` : `${n}: render nije uspeo.`;
      }
      case 'nedostupan':
        return `${n}: render servis nije dostupan.`;
      default:
        return '';
    }
  });
}
