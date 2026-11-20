import { describe, expect, it } from 'vitest';
import { ispravanKod, oznakaVrste, urlFajlaCasa, urlFajlaNaloga, velicinaFajla } from './fajlovi';

describe('fajlovi', () => {
  it('kod je tačno 4 cifre', () => {
    expect(ispravanKod('1234')).toBe(true);
    expect(ispravanKod('0123')).toBe(true);
    expect(ispravanKod('123')).toBe(false);
    expect(ispravanKod('12345')).toBe(false);
    expect(ispravanKod('12a4')).toBe(false);
    expect(ispravanKod(1234)).toBe(false);
  });

  it('veličina za ljude', () => {
    expect(velicinaFajla(850)).toBe('850 B');
    expect(velicinaFajla(12 * 1024)).toBe('12 KB');
    expect(velicinaFajla(1.4 * 1024 * 1024)).toBe('1,4 MB');
    expect(velicinaFajla(-1)).toBe('');
  });

  it('oznaka vrste', () => {
    expect(oznakaVrste('DOCX')).toBe('Word');
    expect(oznakaVrste('XLSX')).toBe('Excel');
  });

  it('relativni URL-ovi samo pod api/public', () => {
    expect(urlFajlaCasa('1234', 7)).toBe('api/public/fajlovi/1234/7');
    expect(urlFajlaNaloga(7)).toBe('api/public/nalog/fajlovi/7');
  });
});
