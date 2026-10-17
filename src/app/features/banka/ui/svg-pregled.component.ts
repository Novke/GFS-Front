import {
  afterRenderEffect, ChangeDetectionStrategy, Component, computed, DOCUMENT, ElementRef, inject, input, model, viewChild, ViewEncapsulation,
} from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSlideToggle } from '@angular/material/slide-toggle';

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
/**
 * Svojstva u atributu `style` koja cairo piše (pdftocairo u render kontejneru: potez, ispuna, prelaz gradijenta); ostala
 * (`position`, `z-index`, `background`, `cursor`, ...) se brišu, da SVG ne bi mogao da prekrije stranicu ili da učita nešto spolja.
 */
const SVOJSTVA_STILA = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-rule', 'stop-color', 'stop-opacity',
]);
/** Atributi transformacije i funkcije koje u njima smeju (`matrix(...)` iz cairo-a). */
const TRANSFORMACIJE = new Set(['transform', 'gradienttransform', 'patterntransform']);
const FUNKCIJE_TRANSFORMACIJE = new Set(['matrix', 'translate', 'scale', 'rotate', 'skewx', 'skewy']);
/** Ostale vrednosti: osim `url(#id)` samo boja `rgb(...)`, kako je cairo piše. */
const FUNKCIJE_BOJE = new Set(['rgb']);
/** Ime CSS funkcije pred zagradom (i prazno za golu zagradu). */
const FUNKCIJA = /([a-z0-9_-]*)\s*\(/gi;
const URL_REF = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/**
 * Vrednost atributa ili deklaracije sa prefiksom u `url(#id)`, ili `null` kad ne sme da ostane: CSS escape (`\`),
 * `javascript:`, bilo koja funkcija osim `url(#id)` i dozvoljenih, i `url()` koji ne pokazuje u sam dokument. Imena funkcija
 * se porede bez obzira na velika slova (`URL(`), a funkcija koju regex ne prepozna kao `url(#...)` se računa kao zabranjena.
 */
function cistaVrednost(v: string, funkcije: ReadonlySet<string>, prefiks: string): string | null {
  if (v.includes('\\') || /javascript:|vbscript:/i.test(v.replace(/\s/g, ''))) {
    return null;
  }
  const imena = [...v.matchAll(FUNKCIJA)].map(m => m[1].toLowerCase());
  if (imena.some(f => f !== 'url' && !funkcije.has(f))) {
    return null;
  }
  const veze = [...v.matchAll(URL_REF)];
  if (veze.length !== imena.filter(f => f === 'url').length || veze.some(m => !m[2].trim().startsWith('#'))) {
    return null;
  }
  return v.replace(URL_REF, (_c, _n, ref: string) => `url(#${prefiks}${ref.trim().slice(1)})`);
}

/** `style` sa samo dozvoljenim svojstvima i čistim vrednostima (`fill:rgb(0%,0%,0%);stroke-width:0.4`); prazno kad ne ostane ništa. */
function cistStil(v: string, prefiks: string): string {
  return v.split(';').flatMap(deklaracija => {
    const i = deklaracija.indexOf(':');
    const ime = deklaracija.slice(0, i).trim().toLowerCase();
    const vrednost = deklaracija.slice(i + 1).trim();
    const cista = i > 0 && SVOJSTVA_STILA.has(ime) && vrednost !== '' ? cistaVrednost(vrednost, FUNKCIJE_BOJE, prefiks) : null;
    return cista === null ? [] : [`${ime}:${cista}`];
  }).join(';');
}

/**
 * Očišćen koren SVG-a render-probe (tekst sa našeg servera, `pdftocairo`), za umetanje kroz `importNode` (nikad kao HTML
 * tekst), ili `null` kad nije ispravan SVG. Dodatna zaštita (render ga pravi sam server, bez skripti): briše elemente van
 * {@link DOZVOLJENI} sa podstablom, komentare, PI i CDATA (CDATA postaje tekst), `on*` atribute, `javascript:` vrednosti,
 * CSS escape-ove, funkcije osim `url(#id)`, `rgb(...)` i transformacija, veze van dokumenta (`href` sme samo `#id` ili
 * `data:image/...` rasterske slike) i svojstva stila van {@link SVOJSTVA_STILA}. Radi nad DOM-om (`DOMParser`), pa vidi i
 * kodirane vrednosti (`jav&#97;script:`). Id-jevi i reference na njih dobijaju `prefiks`: dva umetnuta SVG-a (tekst i
 * rešenje) imaju iste id-jeve glifova (`glyph-0-1`), a `<use>` bi uzeo prvi u stranici.
 */
export function ocistiSvg(svg: string, prefiks: string): Element | null {
  const dok = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const koren = dok.documentElement;
  if (koren.localName !== 'svg' || koren.namespaceURI !== SVG_NS || dok.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  for (const el of [...koren.querySelectorAll('*')]) {
    if (el.namespaceURI !== SVG_NS || !DOZVOLJENI.has(el.localName)) {
      el.remove();
    }
  }
  // komentar, PI i CDATA: ni element ni tekst (komentar i PI su put za mXSS kad se SVG ponovo parsira kao HTML)
  const setac = dok.createTreeWalker(koren, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION);
  const ostali: Node[] = [];
  while (setac.nextNode()) {
    ostali.push(setac.currentNode);
  }
  for (const n of ostali) {
    if (n.nodeType === Node.CDATA_SECTION_NODE) {
      n.parentNode?.replaceChild(dok.createTextNode((n as CDATASection).data), n);
    } else {
      n.parentNode?.removeChild(n);
    }
  }
  for (const el of [koren, ...koren.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      const ime = a.localName.toLowerCase();
      let v: string | null = a.value;
      if (ime.startsWith('on')) {
        v = null;
      } else if (ime === 'style') {
        v = cistStil(v, prefiks) || null;
      } else if (ime === 'href') {
        v = v.startsWith('#') ? `#${prefiks}${v.slice(1)}` : SLIKA_U_PODACIMA.test(v.trim()) ? v : null;
      } else {
        v = cistaVrednost(v, TRANSFORMACIJE.has(ime) ? FUNKCIJE_TRANSFORMACIJE : FUNKCIJE_BOJE, prefiks);
        if (v !== null && ime === 'id' && !a.prefix) {
          v = prefiks + v;
        }
      }
      if (v === null) {
        el.removeAttributeNode(a);
      } else if (v !== a.value) {
        a.value = v;
      }
    }
  }
  return koren;
}

let sledeci = 0;

/**
 * Pregled render-probe jednog dela varijante (zadatak ili rešenje): SVG u okviru širine 84 mm, kao na telefonu u
 * portretu (render je `varwidth=84mm`, telefon ga širi na 100%), na beloj podlozi i noću (`.rezim-dan`), sa prekidačem
 * "Puna širina" dok ima SVG (`punaSirina`, dvosmerno; ime prekidača nosi naslov, jer stranica ima dva pregleda). SVG ide u
 * stranicu kao čvorovi (`importNode` očišćenog korena iz {@link ocistiSvg}), nikad kroz `innerHTML`, pa se nikad ne parsira kao
 * HTML; telo sme biti samo odgovor `render-proba` našeg servera.
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
      @if (prikaz()) {
        <div class="bk-sp-okvir rezim-dan" [class.bk-sp-puna]="punaSirina()" [class.bk-sp-zastarelo]="stanje() === 'ceka'">
          <div #slika class="bk-sp-svg" role="img" [attr.aria-label]="'Pregled: ' + naslov()"></div>
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
  private readonly document = inject(DOCUMENT);

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
  /** Očišćen SVG koji se prikazuje (stanja `ok` i `ceka`) ili `null`. */
  protected readonly prikaz = computed(() => {
    const s = this.stanje();
    return s === 'ok' || s === 'ceka' ? this.ociscen() : null;
  });
  private readonly slika = viewChild<ElementRef<HTMLElement>>('slika');
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

  constructor() {
    // očišćen DOM ide u stranicu kao čvorovi (kopija iz XML dokumenta), nikad kao HTML tekst: nema ponovnog parsiranja
    afterRenderEffect(() => {
      const svg = this.prikaz();
      this.slika()?.nativeElement.replaceChildren(...(svg ? [this.document.importNode(svg, true)] : []));
    });
  }
}
