import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { platnoIzDokumenta } from './pdf-crtac';
import { NAPRAVI_PLATNO_PDF, UCITAJ_PDFJS } from './pdf-token';

// Podrazumevane vrednosti tokena. `UCITAJ_PDFJS` se ovde ne poziva: pravi bi učitao pdf.js i napravio radnika.
describe('pdf-token', () => {
  it('NAPRAVI_PLATNO_PDF je podrazumevano platnoIzDokumenta', () => {
    expect(TestBed.inject(NAPRAVI_PLATNO_PDF)).toBe(platnoIzDokumenta);
  });

  it('UCITAJ_PDFJS je podrazumevano lenja fabrika (funkcija, ništa se ne učitava dok se ne pozove)', () => {
    expect(typeof TestBed.inject(UCITAJ_PDFJS)).toBe('function');
  });
});
