import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RANG_NA_TABLI_KLJUC, RangNaTabli } from './rang-na-tabli';

describe('RangNaTabli', () => {
  beforeEach(() => localStorage.clear());

  it('podrazumevano 0 (svi); čuva samo 0, 10 i 5; nepoznata ili pokvarena vrednost pada na 0', () => {
    expect(TestBed.inject(RangNaTabli).broj()).toBe(0);
    localStorage.setItem(RANG_NA_TABLI_KLJUC, '7');
    TestBed.resetTestingModule();
    expect(TestBed.inject(RangNaTabli).broj()).toBe(0);
  });

  it('postavi pamti izbor u localStorage, nepoznat se ignoriše', () => {
    const r = TestBed.inject(RangNaTabli);
    r.postavi(5);
    expect(r.broj()).toBe(5);
    expect(localStorage.getItem(RANG_NA_TABLI_KLJUC)).toBe('5');
    r.postavi(3);
    expect(r.broj()).toBe(5);
    localStorage.setItem(RANG_NA_TABLI_KLJUC, '10');
    TestBed.resetTestingModule();
    expect(TestBed.inject(RangNaTabli).broj()).toBe(10);
  });
});
