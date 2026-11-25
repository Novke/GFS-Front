import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { FakeMatIconRegistry } from '@angular/material/icon/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { opisPlocice, PlocicaPrezentacije, PrezentacijaZaPlocicu } from './plocica-prezentacije';

describe('PlocicaPrezentacije', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: MatIconRegistry, useClass: FakeMatIconRegistry }] }));

  function prikazi(p: PrezentacijaZaPlocicu) {
    const f = TestBed.createComponent(PlocicaPrezentacije);
    f.componentRef.setInput('prezentacija', p);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    return {
      el,
      broj: el.querySelector('[data-broj-vezbe]')?.textContent ?? null,
      znaci: Array.from(el.querySelectorAll('[data-znak]')).map(z => z.getAttribute('data-znak')),
    };
  }

  it('gradivo: samo broj, bez znaka', () => {
    expect(prikazi({ vezba: 4, vrsta: 'GRADIVO' })).toMatchObject({ broj: '4', znaci: [] });
  });

  it('samo pitanja: upitnik; čim ima zadataka: olovka', () => {
    expect(prikazi({ vezba: 6, vrsta: 'PITANJA' })).toMatchObject({ broj: '6', znaci: ['PITANJA'] });
    expect(prikazi({ vezba: 5, vrsta: 'ZADACI' })).toMatchObject({ broj: '5', znaci: ['ZADACI'] });
  });

  it('strelica za fajl ne zavisi od vrste', () => {
    expect(prikazi({ vezba: 4, vrsta: 'GRADIVO', brojFajlova: 1 }).znaci).toEqual(['FAJL']);
    expect(prikazi({ vezba: 6, vrsta: 'PITANJA', brojFajlova: 2 }).znaci).toEqual(['PITANJA', 'FAJL']);
    expect(prikazi({ vezba: 5, vrsta: 'ZADACI', brojFajlova: 3 }).znaci).toEqual(['ZADACI', 'FAJL']);
    expect(prikazi({ vezba: 5, vrsta: 'ZADACI', brojFajlova: 0 }).znaci).toEqual(['ZADACI']);
  });

  it('bez broja vežbe: znak vrste je u sredini, jednom; vežba 0 (uvod) je broj', () => {
    expect(prikazi({ vezba: null, vrsta: 'PITANJA' })).toMatchObject({ broj: null, znaci: ['PITANJA'] });
    expect(prikazi({ vezba: null, vrsta: 'ZADACI', brojFajlova: 1 })).toMatchObject({ broj: null, znaci: ['ZADACI', 'FAJL'] });
    expect(prikazi({ vezba: 0, vrsta: 'GRADIVO' }).broj).toBe('0');
  });

  it('boja nosi vrstu, a tekst je za čitač ekrana i prelazak mišem', () => {
    const { el } = prikazi({ vezba: 5, vrsta: 'ZADACI', brojFajlova: 1 });
    expect(el.classList).toContain('vrsta-ZADACI');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Vežbe 5 · zadaci · ima fajlove za skidanje');
    expect(el.title).toBe('Vežbe 5 · zadaci · ima fajlove za skidanje');
    expect(opisPlocice({ vezba: null, vrsta: 'PITANJA' })).toBe('Bez broja vežbe · pitanja');
    expect(opisPlocice({ vezba: 0, vrsta: 'GRADIVO' })).toBe('Uvod · gradivo');
  });
});
