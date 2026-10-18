import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PorukaPosleCuvanja } from './poruka-posle-cuvanja';

describe('PorukaPosleCuvanja', () => {
  it('poruka se preuzima jednom i samo za svoju varijantu', () => {
    const p = TestBed.inject(PorukaPosleCuvanja);
    p.ostavi(15, 'Render nije uspeo.');
    expect(p.preuzmi(16)).toBeNull();
    expect(p.preuzmi(15)).toBe('Render nije uspeo.');
    expect(p.preuzmi(15)).toBeNull();
  });
});
