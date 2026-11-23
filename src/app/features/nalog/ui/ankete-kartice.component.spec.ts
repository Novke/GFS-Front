import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnketeStudentaStore } from '../data-access/ankete-studenta.store';
import { anketaStudentu as a } from '../data-access/ankete-studenta.testing';
import { AnketeKarticeComponent } from './ankete-kartice.component';

describe('AnketeKarticeComponent', () => {
  let store: InstanceType<typeof AnketeStudentaStore>;
  const rez = { glasovi: [14, 6, 3], brojGlasalo: 23 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(AnketeStudentaStore);
    store.primi([
      a(1, { pitanje: 'Tempo?' }),
      a(2, { publika: 'GRUPA', pitanje: 'Kolokvijum 1: koji datum?', opcije: ['Sreda 3.12.', 'Petak 5.12.'], mojGlas: [1] }),
      a(3, { otvorena: false, rezultat: rez }),
      a(4, { otvorena: false }),
    ]);
  });

  function napravi(mesto: 'cas' | 'pocetna') {
    const f = TestBed.createComponent(AnketeKarticeComponent);
    f.componentRef.setInput('mesto', mesto);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('Čas: rezultat prvo (ishod i trake), pa otvorene; zatvorena bez rezultata se ne vidi', () => {
    const el = napravi('cas');
    const k = [...el.querySelectorAll('[data-anketa-kartica]')];
    expect(k.map(x => x.getAttribute('data-anketa-id'))).toEqual(['3', '1', '2']);
    expect(k[0].textContent).toContain('Rezultat ankete');
    expect(k[0].querySelector('[data-anketa-ishod]')?.textContent).toBe('Da, 10 min · 14 od 23 glasa');
    expect(k[0].querySelectorAll('[data-traka-ankete]').length).toBe(3);
    expect(k[0].querySelector('[data-anketa-glasaj]')).toBeNull();
    expect(k[1].querySelector('[data-anketa-glasaj]')?.textContent?.trim()).toBe('Glasaj');
    expect(k[2].querySelector('[data-anketa-glasaj]')?.textContent?.trim()).toBe('Promeni glas');
    expect(k[2].textContent).toContain('Glas je zabeležen ✓');
  });

  it('Početna: samo anketa za grupu, "Promeni glas" otvara list sa njom', () => {
    const el = napravi('pocetna');
    const k = [...el.querySelectorAll('[data-anketa-kartica]')];
    expect(k.length).toBe(1);
    expect(k[0].textContent).toContain('Anketa za grupu');
    expect(k[0].textContent).toContain('Sreda 3.12. · Petak 5.12.');
    k[0].querySelector<HTMLButtonElement>('[data-anketa-glasaj]')!.click();
    expect(store.list()?.id).toBe(2);
  });
});
