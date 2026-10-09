import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { DomaciListItem } from '../../../core/api/domaci.models';
import { DomaciTabela, uradjenoPrikaz, ZakljucanaKolona } from './domaci-tabela';

const gd = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 };

function domaci(izmene: Partial<DomaciListItem> = {}): DomaciListItem {
  return {
    id: 1,
    naslov: 'Domaći 3: petlje',
    datum: '2025-10-14',
    pregledan: false,
    predmet: { id: 2, naziv: 'Uvod u primenu računara' },
    grupa: gd,
    predavanje: { id: 12, rb: 7 },
    brojUradjenih: 28,
    brojStudenata: 38,
    ...izmene,
  };
}

@Component({
  imports: [DomaciTabela],
  template: `<app-domaci-tabela [stavke]="stavke()" [zakljucano]="zakljucano()" [sort]="sort()" [punDatum]="punDatum()" (otvori)="otvori($event)"
    (sortChange)="sortChange($event)" />`,
})
class Host {
  stavke = signal<DomaciListItem[]>([]);
  zakljucano = signal<ZakljucanaKolona[]>([]);
  sort = signal<string | null>('datum,desc');
  punDatum = signal(false);
  otvori = vi.fn();
  sortChange = vi.fn();
}

function napravi(stavke: DomaciListItem[], zakljucano: ZakljucanaKolona[] = []) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.stavke.set(stavke);
  f.componentInstance.zakljucano.set(zakljucano);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const celije = (red = 0) => [...el.querySelectorAll('tbody tr')[red].querySelectorAll('td')].map(td => td.textContent!.replace(/\s+/g, ' ').trim());
  const zaglavlja = () => [...el.querySelectorAll('thead th')].map(th => th.textContent!.replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim());
  return { f, el, h: f.componentInstance, celije, zaglavlja };
}

describe('uradjenoPrikaz', () => {
  it('x/y i procenat; bez grupe —', () => {
    expect(uradjenoPrikaz({ grupa: gd, brojUradjenih: 28, brojStudenata: 38 })).toEqual({ procenat: 74, tekst: '28/38' });
    expect(uradjenoPrikaz({ grupa: null, brojUradjenih: 0, brojStudenata: 0 })).toEqual({ procenat: null, tekst: '—' });
    expect(uradjenoPrikaz({ grupa: gd, brojUradjenih: 0, brojStudenata: 0 })).toEqual({ procenat: null, tekst: '0/0' });
    expect(uradjenoPrikaz({ grupa: gd, brojUradjenih: 50, brojStudenata: 38 }).procenat).toBe(100);
  });
});

describe('DomaciTabela', () => {
  it('kolone i ćelije: naslov, datum, predmet, grupa, predavanje (link), urađeno, status', () => {
    const { celije, zaglavlja, el } = napravi([domaci()]);
    expect(zaglavlja()).toEqual(['Naslov', 'Datum', 'Predmet', 'Grupa', 'Predavanje', 'Urađeno', 'Status']);
    expect(celije()).toEqual([
      'Domaći 3: petlje',
      '14. 10. 2025.',
      'Uvod u primenu računara',
      'GD-2025',
      'Predavanje 7',
      '28/38',
      'Za pregled',
      '14. 10. · Uvod u primenu računara · GD-2025 · urađeno 28/38 · Predavanje 7',
    ]);
    expect(el.querySelector('a.veza')?.getAttribute('href')).toBe('/predavanja/12');
  });

  it('domaći bez predavanja prikazuje —, bez grupe — i bez naslova opis', () => {
    const { celije, el } = napravi([domaci({ predavanje: null, grupa: null, naslov: null, datum: null, brojStudenata: 0 })]);
    const c = celije();
    expect(c[0]).toBe('Domaći bez naslova');
    expect(c[1]).toBe('—');
    expect(c[3]).toBe('—');
    expect(c[4]).toBe('—');
    expect(c[5]).toBe('—');
    expect(el.querySelector('a.veza')).toBeNull();
    expect(el.querySelector('.traka')).toBeNull();
    expect(c[7]).toBe('— · Uvod u primenu računara · — · urađeno —');
  });

  it('predavanje bez rednog broja prikazuje — (link i kartica)', () => {
    const { celije, el } = napravi([domaci({ predavanje: { id: 12, rb: null }, naslov: null })]);
    expect(celije()[4]).toBe('Predavanje —');
    expect(celije()[7]).toContain('Predavanje —');
    expect(celije()[0]).toBe('Domaći bez naslova');
    expect(el.querySelector('a.veza')?.getAttribute('href')).toBe('/predavanja/12');
  });

  it('naslov iz predavanja kad domaći nema naslov', () => {
    const { celije } = napravi([domaci({ naslov: '  ' })]);
    expect(celije()[0]).toBe('Domaći sa predavanja 7');
  });

  it('pregledan domaći ima oznaku "Pregledan"', () => {
    const { celije } = napravi([domaci({ pregledan: true })]);
    expect(celije()[6]).toBe('Pregledan');
  });

  it('zaključane kolone se ne prikazuju', () => {
    const { zaglavlja, celije } = napravi([domaci()], ['predmet', 'grupa']);
    expect(zaglavlja()).toEqual(['Naslov', 'Datum', 'Predavanje', 'Urađeno', 'Status']);
    expect(celije()[celije().length - 1]).toBe('14. 10. · urađeno 28/38 · Predavanje 7');
  });

  it('klik na red i na naslov otvara domaći; klik na predavanje ga ne otvara', () => {
    const { el, h } = napravi([domaci({ id: 9 })]);
    el.querySelector<HTMLButtonElement>('button.otvori')!.click();
    expect(h.otvori).toHaveBeenCalledTimes(1);
    expect(h.otvori).toHaveBeenCalledWith(9);
    el.querySelector<HTMLAnchorElement>('a.veza')!.addEventListener('click', e => e.preventDefault());
    el.querySelector<HTMLAnchorElement>('a.veza')!.click();
    expect(h.otvori).toHaveBeenCalledTimes(1);
    el.querySelector<HTMLTableRowElement>('tbody tr')!.click();
    expect(h.otvori).toHaveBeenCalledTimes(2);
  });

  it('sort: aria-sort na aktivnom zaglavlju i novi sort po kliku', () => {
    const { el, h } = napravi([domaci()]);
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Datum');
    el.querySelector<HTMLButtonElement>('button[data-sort="datum"]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('datum,asc');
    el.querySelector<HTMLButtonElement>('button[data-sort="naslov"]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('naslov,asc');
  });

  it('pun datum u kartici kad lista prikazuje više godina', () => {
    const { f, celije } = napravi([domaci()]);
    f.componentInstance.punDatum.set(true);
    f.detectChanges();
    expect(celije()[7]).toMatch(/^14\. 10\. 2025\. ·/);
  });
});
