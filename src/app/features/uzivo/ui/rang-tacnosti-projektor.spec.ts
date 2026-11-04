import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { JavnaRangTacnostiStavka } from '../data-access/uzivo.models';
import { RangTacnostiProjektorComponent, velicinaSlova } from './rang-tacnosti-projektor.component';

const red = (mesto: number): JavnaRangTacnostiStavka => ({
  mesto, ime: `Učesnik ${mesto}.`, gost: false, tacnih: 2, dugovanih: 3, odgovorenih: 3, procenat: 67, prosekMs: 4000,
  zvezdice: 2, poeni: null,
});

describe('RangTacnostiProjektorComponent', () => {
  function kolone(n: number) {
    const f = TestBed.createComponent(RangTacnostiProjektorComponent);
    f.componentRef.setInput('stavke', Array.from({ length: n }, (_, i) => red(i + 1)));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    return { el, kolone: [...el.querySelectorAll('.uz-rt-kolona')].map(k => k.querySelectorAll('ol .uz-rang-red').length) };
  }

  it('jedna kolona dok dve ne daju veća slova; slova se smanjuju sa brojem redova i širinom (ime ostaje čitljivo)', () => {
    expect(kolone(5).kolone).toEqual([5]);
    expect(kolone(10).kolone).toEqual([10]);
    expect(kolone(20).kolone).toEqual([10, 10]);
    expect(kolone(30).kolone).toEqual([15, 15]);
    expect(velicinaSlova(5, 1)).toBeCloseTo(91 / 32.4);
    expect(velicinaSlova(10, 1)).toBeCloseTo(19 / 11);
    // dve kolone ograničava širina: sa 18,8 em kolona brojeva, ime od 8 em mora da stane u pola slajda
    expect(velicinaSlova(10, 2)).toBeCloseTo(91 / (2 * 32.4 + 1.6));
    // 30 redova: visina je uža od širine
    expect(velicinaSlova(30, 2)).toBeCloseTo(19 / 16);
    expect(kolone(30).el.style.fontSize).toMatch(/cqw$/);
  });
});
