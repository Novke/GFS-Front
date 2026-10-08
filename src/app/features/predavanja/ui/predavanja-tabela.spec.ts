import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { PredavanjeListItem } from '../data-access/predavanja.models';
import { PredavanjaTabela, prisutniPrikaz, ZakljucanaKolona } from './predavanja-tabela';

const gd = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 };

function predavanje(izmene: Partial<PredavanjeListItem> = {}): PredavanjeListItem {
  return {
    id: 1,
    rb: 12,
    datum: '2025-10-14',
    tema: 'Petlje i uslovi',
    zavrseno: false,
    predmet: { id: 2, naziv: 'Uvod u primenu računara' },
    grupa: gd,
    brojPrisutnih: 31,
    brojStarijihPrisutnih: 3,
    brojStudenata: 38,
    ...izmene,
  };
}

@Component({
  imports: [PredavanjaTabela],
  template: `<app-predavanja-tabela [stavke]="stavke()" [zakljucano]="zakljucano()" [sort]="sort()" [punDatum]="punDatum()" (otvori)="otvori($event)"
    (sortChange)="sortChange($event)" />`,
})
class Host {
  stavke = signal<PredavanjeListItem[]>([]);
  zakljucano = signal<ZakljucanaKolona[]>([]);
  sort = signal<string | null>('datum,desc');
  punDatum = signal(false);
  otvori = vi.fn();
  sortChange = vi.fn();
}

function napravi(stavke: PredavanjeListItem[], zakljucano: ZakljucanaKolona[] = []) {
  const f = TestBed.createComponent(Host);
  f.componentInstance.stavke.set(stavke);
  f.componentInstance.zakljucano.set(zakljucano);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const celije = (red = 0) => [...el.querySelectorAll('tbody tr')[red].querySelectorAll('td')].map(td => td.textContent!.replace(/\s+/g, ' ').trim());
  const zaglavlja = () => [...el.querySelectorAll('thead th')].map(th => th.textContent!.replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim());
  return { f, el, h: f.componentInstance, celije, zaglavlja };
}

describe('prisutniPrikaz', () => {
  it('prisutni iz grupe od ukupno i +N za starije (brojPrisutnih ih već sadrži)', () => {
    const p = prisutniPrikaz(predavanje());
    expect(p).toMatchObject({ izGrupe: 28, ukupno: 38, stariji: 3, brojevi: '28/38', tekst: '28/38 +3', procenat: 74 });
  });

  it('bez starijih nema +N', () => {
    expect(prisutniPrikaz(predavanje({ brojPrisutnih: 31, brojStarijihPrisutnih: 0 })).tekst).toBe('31/38');
  });

  it('predavanje bez grupe: samo broj prisutnih, bez trake', () => {
    expect(prisutniPrikaz(predavanje({ grupa: null, brojPrisutnih: 5, brojStarijihPrisutnih: 0, brojStudenata: 0 }))).toMatchObject({
      tekst: '5',
      procenat: null,
    });
  });

  it('prazna grupa (0 studenata) nema procenat, a neispravni brojači ne daju negativne vrednosti', () => {
    expect(prisutniPrikaz(predavanje({ brojStudenata: 0, brojPrisutnih: 0, brojStarijihPrisutnih: 0 })).procenat).toBeNull();
    expect(prisutniPrikaz(predavanje({ brojPrisutnih: 1, brojStarijihPrisutnih: 5 })).izGrupe).toBe(0);
  });
});

describe('PredavanjaTabela', () => {
  it('red: #, tema, datum, predmet, grupa, prisutni i status', () => {
    const { celije, zaglavlja } = napravi([predavanje()]);
    expect(zaglavlja()).toEqual(['#', 'Tema', 'Datum', 'Predmet', 'Grupa', 'Prisutni', 'Status']);
    const c = celije();
    expect(c[0]).toBe('12');
    expect(c[1]).toContain('Petlje i uslovi');
    expect(c[2]).toBe('14. 10. 2025.');
    expect(c[3]).toBe('Uvod u primenu računara');
    expect(c[4]).toBe('GD-2025');
    expect(c[5]).toContain('28/38');
    expect(c[5]).toContain('+3');
    expect(c[6]).toContain('U toku');
  });

  it('predavanje bez grupe prikazuje — u koloni grupe i ne puca na praznim poljima (Review Focus 4)', () => {
    const { celije } = napravi([predavanje({ grupa: null, datum: null, tema: null, zavrseno: true, brojPrisutnih: 2, brojStarijihPrisutnih: 0, brojStudenata: 0 })]);
    const c = celije();
    expect(c[1]).toContain('—');
    expect(c[2]).toBe('—');
    expect(c[4]).toBe('—');
    expect(c[5]).toBe('2');
    expect(c[6]).toContain('Završeno');
  });

  it('zaključane kolone predmet i grupa se ne prikazuju (hub grupe / predmeta)', () => {
    expect(napravi([predavanje()], ['grupa']).zaglavlja()).toEqual(['#', 'Tema', 'Datum', 'Predmet', 'Prisutni', 'Status']);
    expect(napravi([predavanje()], ['predmet']).zaglavlja()).toEqual(['#', 'Tema', 'Datum', 'Grupa', 'Prisutni', 'Status']);
    const oba = napravi([predavanje()], ['predmet', 'grupa']);
    expect(oba.zaglavlja()).toEqual(['#', 'Tema', 'Datum', 'Prisutni', 'Status']);
    expect(oba.celije().length).toBe(6); // + red kartice za telefon
  });

  it('red kartice za telefon: datum, predmet, grupa i prisutni (bez zaključanih)', () => {
    const { el } = napravi([predavanje()]);
    expect(el.querySelector('.c-meta')!.textContent).toBe('14. 10. · Uvod u primenu računara · GD-2025 · 28/38 +3');
    const hub = napravi([predavanje()], ['predmet', 'grupa']);
    expect(hub.el.querySelector('.c-meta')!.textContent).toBe('14. 10. · 28/38 +3');
  });

  it('kartica na telefonu: kratak datum, a pun (sa godinom) kad lista prikazuje sve školske godine', () => {
    const { f, el, h } = napravi([predavanje()]);
    expect(el.querySelector('.c-meta')!.textContent!.startsWith('14. 10. · ')).toBe(true);
    h.punDatum.set(true);
    f.detectChanges();
    expect(el.querySelector('.c-meta')!.textContent!.startsWith('14. 10. 2025. · ')).toBe(true);
  });

  it('predmet koji nedostaje je — i u koloni i u kartici, bez izuzetka', () => {
    const { celije, el } = napravi([predavanje({ predmet: null as unknown as PredavanjeListItem['predmet'] })]);
    expect(celije()[3]).toBe('—');
    expect(el.querySelector('.c-meta')!.textContent).toBe('14. 10. · — · GD-2025 · 28/38 +3');
  });

  it('klik na red i klik na temu emituju otvori(id) tačno jednom', () => {
    const { el, h } = napravi([predavanje({ id: 41 })]);
    el.querySelector<HTMLElement>('tbody tr')!.click();
    expect(h.otvori).toHaveBeenCalledExactlyOnceWith(41);
    h.otvori.mockClear();
    el.querySelector<HTMLButtonElement>('button.otvori')!.click();
    expect(h.otvori).toHaveBeenCalledExactlyOnceWith(41);
  });

  it('zaglavlje: aria-sort prati sort, a klik menja smer ili bira novo polje', () => {
    const { f, el, h } = napravi([predavanje()]);
    const th = (polje: string) => el.querySelector(`button[data-sort=${polje}]`)!.closest('th')!;
    expect(th('datum').getAttribute('aria-sort')).toBe('descending');
    expect(th('tema').getAttribute('aria-sort')).toBe('none');

    el.querySelector<HTMLButtonElement>('button[data-sort=datum]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('datum,asc');
    el.querySelector<HTMLButtonElement>('button[data-sort=tema]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('tema,asc');
    el.querySelector<HTMLButtonElement>('button[data-sort=rb]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('rb,desc');

    h.sort.set('tema,asc');
    f.detectChanges();
    expect(th('tema').getAttribute('aria-sort')).toBe('ascending');
    el.querySelector<HTMLButtonElement>('button[data-sort=tema]')!.click();
    expect(h.sortChange).toHaveBeenLastCalledWith('tema,desc');
  });
});
