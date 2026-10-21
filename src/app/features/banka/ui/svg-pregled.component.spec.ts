import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderGreskaInfo } from '../data-access/banka.models';
import type { StanjePregleda } from '../data-access/render-proba';
import { ocistiSvg, SvgPregledComponent } from './svg-pregled.component';

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAABmJLR0QA/wD/AP+gvaeTAAAAJ0lEQVRIiWM8ISfHMBCAaUBsHbV41OJRi0ctHrV41OJRi0ctHhAAAF+MASwfHtbvAAAAAElFTkSuQmCC';

/*
 * Isečci pravog izlaza `pdftocairo -svg` nad izmišljenim zadatkom (tekst, TikZ sa providnošću, isprekidanom linijom,
 * linearnim i radijalnim senčenjem, fading-om i transparency group-om, što daje mask i filter, PNG prilog), skraćene putanje:
 * render kontejner (poppler 22.12, cairo 1.16, stil u `style`) i noviji cairo (poppler 24.02, cairo 1.18, prezentacioni atributi).
 */
const CAIRO_116 = `<?xml version="1.0" encoding="UTF-8"?>
<svg ${NS} width="224.753pt" height="137.623pt" viewBox="0 0 224.753 137.623" version="1.2">
<defs>
<g>
<symbol overflow="visible" id="glyph0-0">
<path style="stroke:none;" d=""/>
</symbol>
<symbol overflow="visible" id="glyph0-1">
<path style="stroke:none;" d="M 0.46875 -7.4375 L 0.46875 -7.109375 L 0.828125 -7.109375 Z"/>
</symbol>
</g>
<image id="image5" width="40" height="20" xlink:href="${PNG}"/>
<clipPath id="clip1">
  <path d="M 0.183594 57 L 41 57 L 41 97 L 0.183594 97 Z M 0.183594 57 "/>
</clipPath>
<linearGradient id="linear0" gradientUnits="userSpaceOnUse" x1="0" y1="25.002787" x2="0" y2="74.997178" gradientTransform="matrix(0,-0.565451,-0.565451,0,147.693574,90.96642)">
<stop offset="0" style="stop-color:rgb(100%,99.993896%,0%);stop-opacity:1;"/>
<stop offset="1" style="stop-color:rgb(100%,0%,0%);stop-opacity:1;"/>
</linearGradient>
<radialGradient id="radial0" gradientUnits="userSpaceOnUse" cx="22.591729" cy="22.591729" fx="18.073386" fy="27.110071" r="22.591729" gradientTransform="matrix(1,0,0,-1,153.726422,202.305652)">
<stop offset="0" style="stop-color:rgb(100%,100%,100%);stop-opacity:1;"/>
</radialGradient>
<filter id="alpha" filterUnits="objectBoundingBox" x="0%" y="0%" width="100%" height="100%">
  <feColorMatrix type="matrix" in="SourceGraphic" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
</filter>
<mask id="mask0">
  <g filter="url(#alpha)">
<rect x="0" y="0" width="229.112" height="243.073" style="fill:rgb(0%,0%,0%);fill-opacity:0.6;stroke:none;"/>
  </g>
</mask>
<g id="surface12">
<path style=" stroke:none;fill-rule:nonzero;fill:url(#radial0);" d="M 45.183594 22.589844 Z"/>
</g>
</defs>
<use xlink:href="#surface12" transform="matrix(1,0,0,1,-0.000000000000003553,85)" mask="url(#mask0)"/>
<rect x="0" y="0" width="229.112" height="243.073" style="fill:rgb(100%,0%,0%);fill-opacity:1;stroke:none;" mask="url(#mask0)"/>
<g style="fill:rgb(0%,0%,0%);fill-opacity:1;">
  <use xlink:href="#glyph0-1" x="6.145506" y="13.454144"/>
</g>
<use xlink:href="#image5" transform="matrix(1.413498,0,0,1.413498,161.823048,16.079552)"/>
<path style=" stroke:none;fill-rule:nonzero;fill:rgb(79.998779%,79.998779%,100%);fill-opacity:0.5;" d="M 34.613281 76.828125 Z"/>
<g clip-path="url(#clip1)" clip-rule="nonzero">
<path style="fill:none;stroke-width:0.99628;stroke-linecap:butt;stroke-linejoin:miter;stroke:rgb(0%,50%,0%);stroke-opacity:1;stroke-dasharray:2.98883,2.98883;stroke-miterlimit:10;" d="M 28.345287 0.000414516 L 55.697353 0"/>
</g>
<path style=" stroke:none;fill-rule:nonzero;fill:url(#linear0);" d="M 133.554688 76.828125 L 105.285156 76.828125 Z"/>
</svg>`;
const CAIRO_118 = `<?xml version="1.0" encoding="UTF-8"?>
<svg ${NS} width="224.753" height="137.623" viewBox="0 0 224.753 137.623">
<defs>
<g>
<g id="glyph-0-0">
<path d="M 0.46875 -7.4375 L 0.46875 -7.109375 Z"/>
</g>
</g>
<image id="source-5" x="0" y="0" width="40" height="20" xlink:href="${PNG}"/>
<clipPath id="clip-0">
<path clip-rule="nonzero" d="M 0.183594 57 L 41 57 L 41 97 Z"/>
</clipPath>
<linearGradient id="linear-pattern-0" gradientUnits="userSpaceOnUse" x1="0" y1="25.002787" x2="0" y2="74.997178" gradientTransform="matrix(0, -0.565451, -0.565451, 0, 147.693574, 90.96642)">
<stop offset="0" stop-color="rgb(100%, 99.993896%, 0%)" stop-opacity="1"/>
</linearGradient>
<radialGradient id="radial-pattern-0" gradientUnits="userSpaceOnUse" cx="22.591729" cy="22.591729" fx="18.073386" fy="27.110071" r="22.591729" gradientTransform="matrix(1, 0, 0, -1, 153.726422, 202.305652)">
<stop offset="0" stop-color="rgb(100%, 100%, 100%)" stop-opacity="1"/>
</radialGradient>
<filter id="filter-remove-color" x="0%" y="0%" width="100%" height="100%">
<feColorMatrix color-interpolation-filters="sRGB" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
</filter>
<mask id="mask-0">
<g filter="url(#filter-remove-color)">
<rect x="-22.9112" y="-24.3073" width="274.9344" height="291.6876" fill="rgb(0%, 0%, 0%)" fill-opacity="0.6"/>
</g>
</mask>
</defs>
<g mask="url(#mask-0)">
<path fill-rule="nonzero" fill="url(#radial-pattern-0)" d="M 45.183594 22.589844 Z"/>
</g>
<g fill="rgb(0%, 0%, 0%)" fill-opacity="1">
<use xlink:href="#glyph-0-0" x="6.145506" y="13.454144"/>
</g>
<g clip-path="url(#clip-0)">
<path fill="none" stroke-width="0.99628" stroke-linecap="butt" stroke-linejoin="miter" stroke="rgb(0%, 50%, 0%)" stroke-opacity="1" stroke-dasharray="2.98883 2.98883" stroke-miterlimit="10" transform="matrix(0.997268, 0, 0, -0.997268, 20.478243, 76.828538)" d="M 28.345287 0.000414516 L 55.697353 0"/>
</g>
<path fill-rule="nonzero" fill="url(#linear-pattern-0)" d="M 133.554688 76.828125 Z"/>
</svg>`;

/** Element posle čišćenja (ili pada test). */
function cist(svg: string, prefiks = 'p-'): Element {
  const el = ocistiSvg(svg, prefiks);
  expect(el).not.toBeNull();
  return el!;
}
/** Kao što ga komponenta umeće: kopija čvorova u HTML dokument. */
function uStranici(el: Element): HTMLElement {
  const div = document.createElement('div');
  div.replaceChildren(document.importNode(el, true));
  return div;
}
function komentari(koren: Node): number {
  const s = document.createTreeWalker(koren, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION);
  let n = 0;
  while (s.nextNode()) {
    n++;
  }
  return n;
}
/** Deklaracije stila bez razmaka i praznih (`" stroke:none;"` -> `["stroke:none"]`). */
const deklaracije = (stil: string | null) => (stil ?? '').split(';').map(d => d.replace(/\s+/g, '')).filter(Boolean);

describe('ocistiSvg', () => {
  it('uklanja skripte, foreignObject, animacije i nepoznate elemente sa celim podstablom', () => {
    const el = cist(`<svg ${NS}><script>alert(1)</script><g><path d="M0 0"/><foreignObject><div>x</div></foreignObject>`
      + `<set attributeName="onclick" to="alert(1)"/><animate attributeName="href" to="javascript:alert(1)"/><iframe src="x"/></g></svg>`);
    expect(el.querySelectorAll('script, foreignObject, set, animate, iframe').length).toBe(0);
    expect(el.querySelector('path')).not.toBeNull();
  });

  it('uklanja on* atribute i javascript:/spoljne veze (i kodirane), a ostavlja data:image i unutrašnje reference', () => {
    const el = cist(`<svg ${NS} onload="alert(1)"><a xlink:href="jav&#97;script:alert(1)"><path d="M0 0" onclick="x()"/></a>`
      + `<image xlink:href="data:image/png;base64,AAAA" width="1" height="1"/><image href="https://zlo.example/x.png"/>`
      + `<use xlink:href="#g1"/><rect style="fill:url(https://zlo.example/f)"/></svg>`);
    expect(new XMLSerializer().serializeToString(el)).not.toMatch(/onload|onclick|javascript|zlo\.example/i);
    expect(el.querySelectorAll('image')[0].getAttribute('xlink:href')).toBe('data:image/png;base64,AAAA');
    expect(el.querySelector('use')!.getAttribute('xlink:href')).toBe('#p-g1');
  });

  it('daje prefiks id-jevima i referencama na njih (dva SVG-a iz pdftocairo na istoj stranici se ne mešaju)', () => {
    const el = cist(`<svg ${NS}><defs><g id="glyph-0-1"><path d="M0 0"/></g><clipPath id="clip-1"><rect/></clipPath></defs>`
      + `<g clip-path="url(#clip-1)"><use xlink:href="#glyph-0-1" x="1"/><use href="#glyph-0-1"/></g></svg>`, 'bk-1-');
    expect([...el.querySelectorAll('[id]')].map(e => e.id)).toEqual(['bk-1-glyph-0-1', 'bk-1-clip-1']);
    expect(el.querySelector('g[clip-path]')!.getAttribute('clip-path')).toBe('url(#bk-1-clip-1)');
    expect([...el.querySelectorAll('use')].map(u => u.getAttribute('xlink:href') ?? u.getAttribute('href'))).toEqual(['#bk-1-glyph-0-1', '#bk-1-glyph-0-1']);
  });

  it('neispravan XML ili koren koji nije svg daje null', () => {
    expect(ocistiSvg('<svg', 'p-')).toBeNull();
    expect(ocistiSvg('<html><body>x</body></html>', 'p-')).toBeNull();
  });

  describe('mXSS: komentar, PI i CDATA ne preživljavaju', () => {
    const PAYLOADI: [string, string][] = [
      ['<!--> zatvara komentar u HTML-u', `<svg ${NS}><path d="M0 0"/><!--><img src=x onerror=alert(1)>--></svg>`],
      ['<!---> zatvara komentar u HTML-u', `<svg ${NS}><path d="M0 0"/><!---><img src=x onerror=alert(1)>--></svg>`],
      ['<?x > je lažni komentar u HTML-u', `<svg ${NS}><path d="M0 0"/><?x ><img src=x onerror=alert(1)>?></svg>`],
      ['komentar unutar grupe', `<svg ${NS}><g><!--<style>--><path d="M0 0"/></g></svg>`],
    ];

    for (const [opis, payload] of PAYLOADI) {
      it(`${opis}: ni u stranici ni kao HTML tekst nema img, onerror ni komentara`, () => {
        const el = cist(payload);
        expect(komentari(el)).toBe(0);
        // kao komponenta (importNode)
        const div = uStranici(el);
        expect(div.querySelector('img, [onerror]')).toBeNull();
        expect(komentari(div)).toBe(0);
        // i kad bi ga neko ipak serijalizovao i dao HTML parseru (stari put): nema šta da se probije
        const html = document.createElement('div');
        html.innerHTML = new XMLSerializer().serializeToString(el);
        expect(html.querySelector('img, [onerror]')).toBeNull();
        expect(html.querySelector('svg path')).not.toBeNull();
      });
    }

    it('CDATA postaje običan tekst (bez oznaka)', () => {
      const el = cist(`<svg ${NS}><text x="1" y="1"><![CDATA[</text><img src=x onerror=alert(1)>]]></text></svg>`);
      const div = uStranici(el);
      expect(div.querySelector('img')).toBeNull();
      expect(div.querySelector('text')!.textContent).toBe('</text><img src=x onerror=alert(1)>');
      expect(div.querySelector('text')!.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    });
  });

  describe('vrednosti i stil', () => {
    it('url() van dokumenta se briše bez obzira na velika slova, i u stilu i u atributu', () => {
      const el = cist(`<svg ${NS}><rect style="fill:URL(http://zlo.example/f);stroke:rgb(0%,0%,0%)" fill="Url( 'https://zlo.example/f' )"/>`
        + `<rect mask="url(#m)" filter="uRl(//zlo.example/f)"/></svg>`);
      const [a, b] = el.querySelectorAll('rect');
      expect(a.getAttribute('style')).toBe('stroke:rgb(0%,0%,0%)');
      expect(a.hasAttribute('fill')).toBe(false);
      expect(b.getAttribute('mask')).toBe('url(#p-m)');
      expect(b.hasAttribute('filter')).toBe(false);
    });

    it('image-set(), CSS escape (u\\72l) i nepoznate funkcije se brišu', () => {
      const el = cist(`<svg ${NS}><rect style="fill:image-set('http://zlo.example/x' 1x);stroke:u\\72l(http://zlo.example/f);opacity:0.5"`
        + ` mask="image-set('http://zlo.example/x' 1x)" fill="u\\72l(http://zlo.example/f)" stroke="var(--x)" filter="url(#f)"/></svg>`);
      const r = el.querySelector('rect')!;
      expect(r.getAttribute('style')).toBe('opacity:0.5');
      expect(r.hasAttribute('mask')).toBe(false);
      expect(r.hasAttribute('fill')).toBe(false);
      expect(r.hasAttribute('stroke')).toBe(false);
      expect(r.getAttribute('filter')).toBe('url(#p-f)');
    });

    it('atributi samo sa liste onih koje cairo piše: class, cursor, tabindex, data-*, strani namespace i ostalo se brišu', () => {
      const el = cist(`<svg ${NS} xmlns:ev="http://www.w3.org/2001/xml-events" class="cdk-overlay-container" tabindex="0">`
        + `<g class="mat-sys" cursor="pointer" data-x="1" ev:event="click" pointer-events="all" display="block" fill="rgb(0%,0%,0%)">`
        + `<path d="M0 0" class="x" stroke-width="1" requiredExtensions="x"/></g></svg>`);
      const atributi = (e: Element) => [...e.attributes].map(a => a.name).filter(n => !n.startsWith('xmlns'));
      expect(atributi(el)).toEqual([]);
      expect(atributi(el.querySelector('g')!)).toEqual(['fill']);
      expect(atributi(el.querySelector('path')!)).toEqual(['d', 'stroke-width']);
      // root bez class: globalni CSS (npr. .cdk-overlay-container { position: fixed }) ga ne dohvata
      expect(uStranici(el).querySelector('.cdk-overlay-container, [class]')).toBeNull();
    });

    it('stil zadržava samo svojstva crteža: position, inset, z-index i ostalo se briše; prazan stil nestaje', () => {
      const el = cist(`<svg ${NS}><rect style="position:fixed;inset:0;z-index:2147483647;fill:rgb(100%,0%,0%);Fill-Opacity:0.3"/>`
        + `<rect style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:red"/></svg>`);
      const [a, b] = el.querySelectorAll('rect');
      expect(a.getAttribute('style')).toBe('fill:rgb(100%,0%,0%);fill-opacity:0.3');
      expect(b.hasAttribute('style')).toBe(false);
    });

    it('transform sme matrix/translate/scale, ali ne url ka spolja ni druge funkcije', () => {
      const el = cist(`<svg ${NS}><g transform="matrix(1,0,0,1,2,3) translate(1 2) scale(2)"/><g transform="calc(1px)"/></svg>`);
      const [a, b] = el.querySelectorAll('g');
      expect(a.getAttribute('transform')).toBe('matrix(1,0,0,1,2,3) translate(1 2) scale(2)');
      expect(b.hasAttribute('transform')).toBe(false);
    });
  });

  describe('pravi izlaz pdftocairo ostaje netaknut (osim prefiksa id-jeva)', () => {
    for (const [ime, svg] of [['cairo 1.16 (stil u style)', CAIRO_116], ['cairo 1.18 (atributi)', CAIRO_118]] as const) {
      it(ime, () => {
        const pre = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
        const posle = cist(svg);
        const elementi = (k: Element) => [k, ...k.querySelectorAll('*')];
        expect(elementi(posle).map(e => e.localName)).toEqual(elementi(pre).map(e => e.localName));
        elementi(pre).forEach((e, i) => {
          const p = elementi(posle)[i];
          expect([...p.attributes].map(a => a.name), `atributi <${e.localName}>`).toEqual([...e.attributes].map(a => a.name));
          for (const a of e.attributes) {
            const novo = p.getAttribute(a.name)!.replace(/^p-/, '').replace(/#p-/g, '#');
            if (a.name === 'style') {
              expect(deklaracije(novo)).toEqual(deklaracije(a.value));
            } else {
              expect(novo, `${e.localName}@${a.name}`).toBe(a.value);
            }
          }
        });
        expect(uStranici(posle).querySelector('svg image')!.getAttribute('xlink:href')).toBe(PNG);
      });
    }
  });
});

@Component({
  imports: [SvgPregledComponent],
  template: `<app-svg-pregled naslov="Zadatak" [svg]="svg()" [greska]="greska()" [stanje]="stanje()" greskaId="gr-1" [(punaSirina)]="puna" />`,
})
class Domacin {
  readonly svg = signal<string | null>(null);
  readonly greska = signal<RenderGreskaInfo | null>(null);
  readonly stanje = signal<StanjePregleda>('prazno');
  puna = false;
}

describe('SvgPregledComponent', () => {
  let f: ComponentFixture<Domacin>;
  const el = () => f.nativeElement as HTMLElement;
  const tekst = () => el().textContent!.replace(/\s+/g, ' ');

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    f = TestBed.createComponent(Domacin);
    await f.whenStable();
  });

  it('prazno, ceka, ok: poruke i SVG u okviru od 84 mm na beloj podlozi', async () => {
    expect(tekst()).toContain('Pregled se pojavljuje kad počneš da kucaš');
    f.componentInstance.stanje.set('ceka');
    await f.whenStable();
    expect(tekst()).toContain('Renderuje se');

    f.componentInstance.svg.set(`<svg ${NS} width="250pt" height="40pt" viewBox="0 0 250 40"><path d="M0 0" onclick="x()"/></svg>`);
    f.componentInstance.stanje.set('ok');
    await f.whenStable();
    const okvir = el().querySelector('.bk-sp-okvir')!;
    expect(okvir.classList).toContain('rezim-dan');
    expect(okvir.classList).not.toContain('bk-sp-puna');
    const slika = okvir.querySelector('[role="img"]')!;
    expect(slika.getAttribute('aria-label')).toBe('Pregled: Zadatak');
    expect(slika.querySelector('svg path')).not.toBeNull();
    expect(slika.innerHTML).not.toContain('onclick');
  });

  it('dok čeka nov render, stari SVG ostaje (prigušen) uz oznaku', async () => {
    f.componentInstance.svg.set(`<svg ${NS}><path d="M0 0"/></svg>`);
    f.componentInstance.stanje.set('ceka');
    await f.whenStable();
    expect(el().querySelector('.bk-sp-okvir svg')).not.toBeNull();
    expect(el().querySelector('.bk-sp-okvir')!.classList).toContain('bk-sp-zastarelo');
    expect(tekst()).toContain('Renderuje se');
  });

  it('greška sa linijom i bez nje; poruka nosi greskaId (za aria-describedby editora)', async () => {
    f.componentInstance.stanje.set('greska');
    f.componentInstance.greska.set({ linija: 3, poruka: 'Undefined control sequence \\foo' });
    await f.whenStable();
    const poruka = el().querySelector('#gr-1')!;
    expect(poruka.textContent!.replace(/\s+/g, ' ').trim()).toBe('Greška u liniji 3: Undefined control sequence \\foo');
    expect(el().querySelector('.bk-sp-okvir svg')).toBeNull();

    f.componentInstance.greska.set({ linija: null, poruka: 'Komanda \\input nije dozvoljena.' });
    await f.whenStable();
    expect(el().querySelector('#gr-1')!.textContent!.trim()).toBe('Komanda \\input nije dozvoljena.');
  });

  it('SVG ide u host kao čvorovi: payload sa komentarom ne pravi img ni onerror', async () => {
    f.componentInstance.svg.set(`<svg ${NS}><path d="M0 0"/><!--><img src=x onerror=alert(1)>--><?x ><img src=y onerror=alert(2)>?></svg>`);
    f.componentInstance.stanje.set('ok');
    await f.whenStable();
    const slika = el().querySelector('.bk-sp-svg')!;
    expect(slika.querySelector('svg path')).not.toBeNull();
    expect(el().querySelector('img, [onerror]')).toBeNull();
    expect(komentari(slika)).toBe(0);
  });

  it('nedostupan render servis i zauzet (429) imaju različite poruke i najave', async () => {
    const najava = () => el().querySelector('[role="status"]')!.textContent!.trim();
    f.componentInstance.stanje.set('nedostupan');
    await f.whenStable();
    expect(tekst()).toContain('Render servis trenutno nije dostupan');
    expect(najava()).toBe('Zadatak: render servis nije dostupan.');
    f.componentInstance.stanje.set('zauzet');
    await f.whenStable();
    expect(el().querySelector('[data-zauzet]')!.textContent).toContain('Render servis je zauzet, pokušaj za koji trenutak');
    expect(tekst()).not.toContain('nije dostupan');
    expect(najava()).toBe('Zadatak: render servis je zauzet.');
  });

  it('napomena o širini: 84 mm, uvećano, a "umanjeno" kad je kolona uža od 84 mm', async () => {
    const posmatrani: { cb: () => void; el: Element }[] = [];
    const sirina = { px: 400 };
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly cb: () => void) {}
      observe(e: Element) { posmatrani.push({ cb: this.cb, el: e }); this.cb(); }
      disconnect = vi.fn();
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: sirina.px }) as DOMRect);
    try {
      f.componentInstance.svg.set(`<svg ${NS}><path d="M0 0"/></svg>`);
      f.componentInstance.stanje.set('ok');
      await f.whenStable();
      const napomena = () => el().querySelector('.bk-sp-napomena')!.textContent!.trim();
      expect(napomena()).toBe('Širina kao na telefonu (84 mm)');
      sirina.px = 275;
      posmatrani.at(-1)!.cb();
      await f.whenStable();
      expect(napomena()).toBe('Umanjeno: kolona je uža od telefona (84 mm)');
      el().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
      await f.whenStable();
      expect(napomena()).toBe('Umanjeno: kolona je uža od telefona (84 mm)');
      sirina.px = 600;
      posmatrani.at(-1)!.cb();
      await f.whenStable();
      expect(napomena()).toBe('Uvećano na širinu kolone');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('"Puna širina" širi okvir preko cele kolone (dvosmerno vezano)', async () => {
    f.componentInstance.svg.set(`<svg ${NS}><path d="M0 0"/></svg>`);
    f.componentInstance.stanje.set('ok');
    await f.whenStable();
    const prekidac = el().querySelector<HTMLButtonElement>('mat-slide-toggle button')!;
    expect(prekidac.getAttribute('aria-label')).toBe('Puna širina, Zadatak');
    prekidac.click();
    await f.whenStable();
    expect(f.componentInstance.puna).toBe(true);
    expect(el().querySelector('.bk-sp-okvir')!.classList).toContain('bk-sp-puna');
  });

  it('najava stanja za čitač ekrana (polite), bez "Renderuje se" pri svakom kucanju', async () => {
    const najava = () => el().querySelector('[role="status"]')!.textContent!.trim();
    f.componentInstance.stanje.set('ceka');
    await f.whenStable();
    expect(najava()).toBe('');
    f.componentInstance.stanje.set('greska');
    f.componentInstance.greska.set({ linija: 2, poruka: 'X' });
    await f.whenStable();
    expect(najava()).toBe('Zadatak: greška u liniji 2.');
    f.componentInstance.stanje.set('ok');
    f.componentInstance.svg.set(`<svg ${NS}/>`);
    await f.whenStable();
    expect(najava()).toBe('Zadatak: pregled je osvežen.');
  });
});
