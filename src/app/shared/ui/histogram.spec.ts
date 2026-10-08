import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Histogram, lepiPodeoci, StubacHistograma } from './histogram';

@Component({
  imports: [Histogram],
  template: `<app-histogram naslov="Raspodela ocena" [vrednosti]="vrednosti()" />`,
})
class Host {
  vrednosti = signal<StubacHistograma[]>([
    { labela: '5', broj: 3 },
    { labela: '6', broj: 7 },
    { labela: '7', broj: 0 },
    { labela: 'nije položio', broj: 2 },
  ]);
}

describe('lepiPodeoci', () => {
  it('okrugli celi koraci (1, 2, 5 × 10^k), vrh je ≥ maksimuma', () => {
    expect(lepiPodeoci(7)).toEqual([0, 2, 4, 6, 8]);
    expect(lepiPodeoci(3)).toEqual([0, 1, 2, 3]);
    expect(lepiPodeoci(120)).toEqual([0, 50, 100, 150]);
    expect(lepiPodeoci(8)).toEqual([0, 2, 4, 6, 8]);
    expect(lepiPodeoci(0)).toEqual([0, 1]);
  });
});

describe('Histogram', () => {
  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, h: f.componentInstance };
  }

  it('SVG je role="img" sa tekstualnim sažetkom svih vrednosti', () => {
    const { el } = napravi();
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Raspodela ocena: 5: 3, 6: 7, 7: 0, nije položio: 2. Ukupno 12.');
  });

  it('stubac po vrednosti, visina srazmerna broju; nula nema stubac', () => {
    const { el } = napravi();
    const stubci = [...el.querySelectorAll<SVGPathElement>('path.stubac')];
    expect(stubci).toHaveLength(3);
    const visine = stubci.map(s => Number(s.dataset['visina']));
    expect(visine[1] / visine[0]).toBeCloseTo(7 / 3, 5);
  });

  it('ose: labele kategorija i okrugli podeoci', () => {
    const { el } = napravi();
    const x = [...el.querySelectorAll('.x-labela')].map(t => t.textContent!.trim());
    expect(x).toEqual(['5', '6', '7', 'nije položio']);
    const y = [...el.querySelectorAll('.y-labela')].map(t => t.textContent!.trim());
    expect(y).toEqual(['0', '2', '4', '6', '8']);
  });

  it('prazan niz prikazuje "Nema podataka."', () => {
    const { f, el, h } = napravi();
    h.vrednosti.set([]);
    f.detectChanges();
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('Nema podataka.');
  });
});
