import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { StudentPredmetKartica } from '../../../core/api/studenti.api';
import { IKONE } from '../../../core/layout/icons';
import { PredmetKartica, procenatPrisustva } from './predmet-kartica';

const osnovna: StudentPredmetKartica = {
  predmet: { id: 2, naziv: 'UPR' }, prisutan: 12, predavanja: 14, zadaci: 5, zvezdice: 2, domaciUradjeno: 6, domaciUkupno: 8,
  domaciProsek: 7.4, testovi: [{ tipTesta: { id: 1, naziv: 'Kolokvijum 1' }, ostvarenoPoena: 40 }, { tipTesta: { id: 2, naziv: 'Kolokvijum 2' }, ostvarenoPoena: null }],
  ukupno: 72.633, predlogOcene: 8, doSledeceOcene: 8.367,
};

describe('PredmetKartica', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  function prikazi(k: StudentPredmetKartica): HTMLElement {
    const fixture = TestBed.createComponent(PredmetKartica);
    fixture.componentRef.setInput('kartica', k);
    fixture.componentRef.setInput('studentId', 5);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prikazuje prisustvo, zadatke, zvezdice, domaće sa prosekom, testove, ukupno i ocenu', () => {
    const el = prikazi(osnovna);
    expect(el.querySelector('[data-prisustvo]')!.textContent).toBe('12/14 (86%)');
    expect(el.querySelector('[data-zadaci]')!.textContent).toBe('5');
    expect(el.querySelector('[data-zvezdice]')!.textContent).toBe('2');
    expect(el.querySelector('[data-domaci]')!.textContent).toBe('6/8 · prosek 7,4');
    expect([...el.querySelectorAll('[data-test]')].map(e => e.textContent)).toEqual(['40', '—']);
    expect(el.querySelector('[data-ukupno]')!.textContent).toBe('72,6');
    expect(el.querySelector('[data-ocena]')!.textContent!.trim()).toBe('8');
    expect(el.querySelector('[data-sledeca]')!.textContent).toBe('do sledeće ocene: 8,4 poena');
    expect(el.querySelector('[data-predmet]')!.getAttribute('href')).toBe('/studenti/5/predmeti/2');
  });

  it('ocena 10: "najviša ocena" umesto poena do sledeće', () => {
    const el = prikazi({ ...osnovna, predlogOcene: 10, doSledeceOcene: null, ukupno: 95 });
    expect(el.querySelector('[data-sledeca]')!.textContent).toBe('najviša ocena');
    expect(el.querySelector('[data-ocena]')!.textContent!.trim()).toBe('10');
  });

  it('nije položio: oznaka umesto ocene i poeni do prve ocene', () => {
    const el = prikazi({ ...osnovna, predlogOcene: null, doSledeceOcene: 51, ukupno: 0, domaciProsek: null, testovi: [], predavanja: 0, prisutan: 0 });
    expect(el.querySelector('[data-ocena]')!.textContent).toContain('Nije položio');
    expect(el.querySelector('[data-sledeca]')!.textContent).toBe('do sledeće ocene: 51 poena');
    expect(el.querySelector('[data-prisustvo]')!.textContent).toBe('0/0');
    expect(el.querySelector('[data-domaci]')!.textContent).toBe('6/8');
    expect(el.querySelector('.testovi')).toBeNull();
  });

  it('procenatPrisustva: bez predavanja nema procenta, ne prelazi 100', () => {
    expect(procenatPrisustva(0, 0)).toBeNull();
    expect(procenatPrisustva(3, 2)).toBe(100);
    expect(procenatPrisustva(1, 3)).toBe(33);
  });
});
