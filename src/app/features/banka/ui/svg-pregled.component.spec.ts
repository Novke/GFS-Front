import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { beforeEach, describe, expect, it } from 'vitest';

import type { RenderGreskaInfo } from '../data-access/banka.models';
import type { StanjePregleda } from '../data-access/render-proba';
import { ocistiSvg, SvgPregledComponent } from './svg-pregled.component';

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

describe('ocistiSvg', () => {
  const dom = (s: string | null) => new DOMParser().parseFromString(s!, 'image/svg+xml').documentElement;

  it('uklanja skripte, foreignObject, animacije i nepoznate elemente sa celim podstablom', () => {
    const s = ocistiSvg(`<svg ${NS}><script>alert(1)</script><g><path d="M0 0"/><foreignObject><div>x</div></foreignObject>`
      + `<set attributeName="onclick" to="alert(1)"/><animate attributeName="href" to="javascript:alert(1)"/><iframe src="x"/></g></svg>`, 'p-');
    expect(s).not.toMatch(/script|foreignObject|<set|animate|iframe/i);
    expect(dom(s).querySelector('path')).not.toBeNull();
  });

  it('uklanja on* atribute i javascript:/spoljne veze (i kodirane), a ostavlja data:image i unutrašnje reference', () => {
    const s = ocistiSvg(`<svg ${NS} onload="alert(1)"><a xlink:href="jav&#97;script:alert(1)"><path d="M0 0" onclick="x()"/></a>`
      + `<image xlink:href="data:image/png;base64,AAAA" width="1" height="1"/><image href="https://zlo.example/x.png"/>`
      + `<use xlink:href="#g1"/><rect style="fill:url(https://zlo.example/f)"/></svg>`, 'p-');
    const koren = dom(s);
    expect(s).not.toMatch(/onload|onclick|javascript|zlo\.example/i);
    expect(koren.querySelectorAll('image')[0].getAttribute('xlink:href')).toBe('data:image/png;base64,AAAA');
    expect(koren.querySelector('use')!.getAttribute('xlink:href')).toBe('#p-g1');
  });

  it('daje prefiks id-jevima i referencama na njih (dva SVG-a iz pdftocairo na istoj stranici se ne mešaju)', () => {
    const s = ocistiSvg(`<svg ${NS}><defs><g id="glyph-0-1"><path d="M0 0"/></g><clipPath id="clip-1"><rect/></clipPath></defs>`
      + `<g clip-path="url(#clip-1)"><use xlink:href="#glyph-0-1" x="1"/><use href="#glyph-0-1"/></g></svg>`, 'bk-1-');
    const koren = dom(s);
    expect([...koren.querySelectorAll('[id]')].map(e => e.id)).toEqual(['bk-1-glyph-0-1', 'bk-1-clip-1']);
    expect(koren.querySelector('g[clip-path]')!.getAttribute('clip-path')).toBe('url(#bk-1-clip-1)');
    expect([...koren.querySelectorAll('use')].map(u => u.getAttribute('xlink:href') ?? u.getAttribute('href'))).toEqual(['#bk-1-glyph-0-1', '#bk-1-glyph-0-1']);
  });

  it('neispravan XML ili koren koji nije svg daje null', () => {
    expect(ocistiSvg('<svg', 'p-')).toBeNull();
    expect(ocistiSvg('<html><body>x</body></html>', 'p-')).toBeNull();
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

  it('nedostupan render servis', async () => {
    f.componentInstance.stanje.set('nedostupan');
    await f.whenStable();
    expect(tekst()).toContain('Render servis trenutno nije dostupan');
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
