import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { RangRed, RangTacnostiTabela } from './rang-tacnosti-tabela';

const red = (mesto: number | null, ime: string, procenat: number | null, prosekMs: number | null, zvezdice: number,
  indeks: string | null = null): RangRed => ({
  mesto, ime, gost: false, tacnih: 1, dugovanih: 2, procenat, prosekMs, zvezdice, studentId: mesto, indeks,
});

describe('RangTacnostiTabela', () => {
  function napravi(stavke: RangRed[]) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(RangTacnostiTabela);
    f.componentRef.setInput('stavke', stavke);
    f.detectChanges();
    return f;
  }

  const imena = (el: HTMLElement) => [...el.querySelectorAll('tbody .ime')].map(td => td.textContent!.trim());
  const sortDugme = (el: HTMLElement, opis: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('th button.sort')].find(b => b.textContent!.includes(opis))!;

  // redosled servera: ★, pa prosek; poslednji red je student grupe bez ijednog pitanja
  const stavke = [
    red(1, 'Ana', 50, 9000, 5, 'GD5'),
    red(2, 'Bojan', 100, 3000, 3, 'GD12/2025'),
    red(3, 'Cvele', 20, 2000, 1, 'GD7'),
    red(null, 'Dara', null, null, 0, 'GD9'),
  ];

  it('podrazumevano redom servera; indeks bez godine; tačnost obojena po pragovima', () => {
    const el = napravi(stavke).nativeElement as HTMLElement;
    expect(imena(el)).toEqual(['Ana', 'Bojan', 'Cvele', 'Dara']);
    expect([...el.querySelectorAll('thead th')].map(th => th.textContent!.replace(/\s+/g, ' ').trim()))
      .toEqual(['#', 'Indeks', 'Ime', '★Zvezdice▼', '✓Tačnost', '⏱Prosečno vreme odgovora']);
    expect([...el.querySelectorAll('tbody .indeks')].map(td => td.textContent!.trim())).toEqual(['GD5', 'GD12', 'GD7', 'GD9']);
    expect([...el.querySelectorAll('.pilula')].map(p => p.getAttribute('data-nivo'))).toEqual(['2', '4', '1']);
  });

  it('klik na ✓ sortira po tačnosti opadajuće, ponovni klik rastuće; ⏱ najbrži prvi; mesto ostaje, red bez mesta na dnu', () => {
    const f = napravi(stavke);
    const el = f.nativeElement as HTMLElement;
    sortDugme(el, 'Tačnost').click();
    f.detectChanges();
    expect(imena(el)).toEqual(['Bojan', 'Ana', 'Cvele', 'Dara']);
    expect(el.querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('descending');
    expect([...el.querySelectorAll('tbody .mesto')].map(td => td.textContent!.trim())).toEqual(['2', '1', '3', '—']);
    sortDugme(el, 'Tačnost').click();
    f.detectChanges();
    expect(imena(el)).toEqual(['Cvele', 'Ana', 'Bojan', 'Dara']);
    sortDugme(el, 'Prosečno').click();
    f.detectChanges();
    expect(imena(el)).toEqual(['Cvele', 'Bojan', 'Ana', 'Dara']);
    expect(el.querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending');
    sortDugme(el, 'Zvezdice').click();
    f.detectChanges();
    expect(imena(el)).toEqual(['Ana', 'Bojan', 'Cvele', 'Dara']);
  });

  it('bez indeksa (gosti, stari backend) nema kolone Indeks', () => {
    const el = napravi([red(1, 'Mile', 50, 1000, 1)]).nativeElement as HTMLElement;
    expect(el.querySelector('th.c-indeks')).toBeNull();
  });
});
