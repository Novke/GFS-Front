import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Heatmap, HeatmapKolona, HeatmapRed, StanjePrisustva } from './heatmap';

const REDOVI: HeatmapRed[] = [
  { kljuc: 1, labela: 'Andrej Radić', podlabela: 'GD2/2025' },
  { kljuc: 2, labela: 'Danica Vuković', podlabela: 'GD3/2025' },
];
const KOLONE: HeatmapKolona[] = [
  { kljuc: 10, labela: '1', naslov: 'Predavanje 1 · 1. 10. 2025.' },
  { kljuc: 11, labela: '2', naslov: 'Predavanje 2 · 8. 10. 2025.' },
];
const MATRICA: Record<number, Record<number, StanjePrisustva>> = { 1: { 10: 0, 11: 1 }, 2: { 10: 2, 11: 3 } };

@Component({
  imports: [Heatmap],
  template: `<app-heatmap naslov="Prisustvo GD-2025" [redovi]="redovi" [kolone]="kolone" [vrednost]="vrednost" />`,
})
class Host {
  redovi = REDOVI;
  kolone = KOLONE;
  vrednost = (r: HeatmapRed, k: HeatmapKolona) => MATRICA[r.kljuc as number][k.kljuc as number];
}

describe('Heatmap', () => {
  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('tabela sa naslovom, zaglavljem kolona i redovima', () => {
    const el = napravi();
    expect(el.querySelector('table caption')!.textContent).toContain('Prisustvo GD-2025');
    expect([...el.querySelectorAll('thead th[scope=col]')].map(t => t.textContent!.trim())).toContain('1');
    expect([...el.querySelectorAll('tbody th[scope=row]')].map(t => t.textContent!.replace(/\s+/g, ' ').trim()))
      .toEqual(['Andrej Radić GD2/2025', 'Danica Vuković GD3/2025']);
  });

  it('svaka ćelija ima tekst stanja (ne samo boju), zadatak i zvezdica imaju ikonu', () => {
    const el = napravi();
    const celije = [...el.querySelectorAll<HTMLElement>('tbody td.celija')];
    expect(celije.map(c => c.querySelector('.sr-only')!.textContent!.trim())).toEqual(['odsutan', 'prisutan', 'zadatak', 'zvezdica']);
    expect(celije[2].querySelector('mat-icon')!.getAttribute('svgIcon')).toBe('task_alt');
    expect(celije[3].querySelector('mat-icon')!.getAttribute('svgIcon')).toBe('star');
    expect(celije[0].querySelector('mat-icon')).toBeNull();
    expect(celije[3].getAttribute('title')).toBe('Danica Vuković · Predavanje 2 · 8. 10. 2025.: zvezdica');
  });

  it('kolona "Ukupno" broji prisustva (1, 2 i 3) po studentu', () => {
    const el = napravi();
    expect([...el.querySelectorAll('tbody td.ukupno')].map(t => t.textContent!.trim())).toEqual(['1/2', '2/2']);
  });

  it('legenda navodi sva četiri stanja', () => {
    const el = napravi();
    const legenda = [...el.querySelectorAll('.legenda li')].map(l => l.textContent!.trim());
    expect(legenda).toEqual(['odsutan', 'prisutan', 'zadatak', 'zvezdica']);
  });

  it('vrednost van 0-3 ili nedostajuća (rupa u podacima) prikazuje se kao odsutan, bez izuzetka', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.vrednost = (r, k) =>
      (r.kljuc === 1 ? (k.kljuc === 10 ? 7 : undefined) : Number.NaN) as unknown as StanjePrisustva;
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const stanja = [...el.querySelectorAll('tbody td.celija .sr-only')].map(s => s.textContent!.trim());
    expect(stanja).toEqual(['odsutan', 'odsutan', 'odsutan', 'odsutan']);
    expect([...el.querySelectorAll('tbody td.ukupno')].map(t => t.textContent!.trim())).toEqual(['0/2', '0/2']);
  });

  it('bez redova ili bez kolona: "Nema podataka.", bez tabele i legende', () => {
    for (const [redovi, kolone] of [[[], KOLONE], [REDOVI, []]] as [HeatmapRed[], HeatmapKolona[]][]) {
      const f = TestBed.createComponent(Host);
      f.componentInstance.redovi = redovi;
      f.componentInstance.kolone = kolone;
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Nema podataka.');
      expect(el.querySelector('table')).toBeNull();
      expect(el.querySelector('.legenda')).toBeNull();
    }
  });
});
