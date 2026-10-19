import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { SerijaInfo } from '../data-access/banka.models';
import { SerijeComponent } from './serije.component';

function serija(ime: string, poslednja: string, izmena: Partial<SerijaInfo> = {}): SerijaInfo {
  return { serija: ime, nacrta: 0, odobrenih: 0, grupa: 0, prezentacija: 0, slajdova: 0, poslednja, ...izmena };
}

@Component({
  imports: [SerijeComponent],
  template: `<app-serije [serije]="serije()" [predmetId]="predmetId()" />`,
})
class Host {
  serije = signal<SerijaInfo[]>([
    serija('stari-uvoz', '2026-10-01T09:00:00', { nacrta: 1, odobrenih: 4, grupa: 2 }),
    serija('uvoz-kol1-2024', '2026-10-18T10:40:00', { nacrta: 3, odobrenih: 1, grupa: 1, slajdova: 5 }),
  ]);
  predmetId = signal(1);
}

describe('SerijeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function napravi() {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement, h: f.componentInstance };
  }
  const tekst = (e: Element | null) => e!.textContent!.replace(/\s+/g, ' ').trim();

  it('poslednje prve, sa imenom, brojačima (nacrta, odobrenih, grupa, slajdova) i vremenom poslednjeg upisa', async () => {
    const { el } = await napravi();
    const sekcija = el.querySelector('section')!;
    expect(sekcija.getAttribute('aria-labelledby')).toBe(sekcija.querySelector('h2')!.id);
    expect(tekst(sekcija.querySelector('h2'))).toBe('Klodove serije');
    const stavke = [...el.querySelectorAll<HTMLElement>('[data-serija]')];
    expect(stavke.map(s => s.dataset['serija'])).toEqual(['uvoz-kol1-2024', 'stari-uvoz']);
    expect(tekst(stavke[0].querySelector('.bk-sr-ime'))).toBe('uvoz-kol1-2024');
    expect(tekst(stavke[0].querySelector('.bk-sr-brojaci'))).toBe('3 nacrta, 1 odobrena, 1 grupa, 5 slajdova');
    expect(tekst(stavke[1].querySelector('.bk-sr-brojaci'))).toBe('1 nacrt, 4 odobrene, 2 grupe, 0 slajdova');
    expect(tekst(stavke[0].querySelector('.bk-sr-vreme'))).toBe('poslednji upis 18. 10. 2026. 10:40');
  });

  it('"Pregledaj" vodi na pregled nacrta predmeta i serije', async () => {
    const { el } = await napravi();
    const veza = el.querySelector<HTMLAnchorElement>('[data-serija="uvoz-kol1-2024"] a[data-pregledaj]')!;
    expect(tekst(veza)).toBe('Pregledaj');
    expect(veza.getAttribute('aria-label')).toBe('Pregledaj seriju uvoz-kol1-2024');
    expect(veza.getAttribute('href')).toBe('/banka/pregled?predmet=1&serija=uvoz-kol1-2024');
  });

  it('prazna lista ne prikazuje sekciju', async () => {
    const { f, el, h } = await napravi();
    h.serije.set([]);
    await f.whenStable();
    expect(el.querySelector('section')).toBeNull();
  });
});
