import { describe, expect, it } from 'vitest';

import { formatSkolskaGodina, opcijeSkolskihGodina, skolskaGodinaZa, tekucaSkolskaGodina } from './skolska-godina';

describe('školska godina', () => {
  it('formatSkolskaGodina(2025) === "2025/26"', () => {
    expect(formatSkolskaGodina(2025)).toBe('2025/26');
    expect(formatSkolskaGodina(2009)).toBe('2009/10');
    expect(formatSkolskaGodina(2099)).toBe('2099/00');
  });

  it('formatSkolskaGodina bez godine daje "—"', () => {
    expect(formatSkolskaGodina(null)).toBe('—');
    expect(formatSkolskaGodina(undefined)).toBe('—');
    expect(formatSkolskaGodina(Number.NaN)).toBe('—');
  });

  it('30. 9. pripada prethodnoj, 1. 10. novoj školskoj godini', () => {
    expect(skolskaGodinaZa(new Date(2026, 8, 30))).toBe(2025);
    expect(skolskaGodinaZa(new Date(2026, 9, 1))).toBe(2026);
    expect(skolskaGodinaZa(new Date(2026, 0, 15))).toBe(2025);
    expect(skolskaGodinaZa(new Date(2025, 11, 31))).toBe(2025);
  });

  it('ISO datum (string) se čita kao lokalni dan, bez pomeranja zbog vremenske zone', () => {
    expect(skolskaGodinaZa('2026-09-30')).toBe(2025);
    expect(skolskaGodinaZa('2026-10-01')).toBe(2026);
    expect(skolskaGodinaZa('2026-10-01T00:30:00')).toBe(2026);
  });

  it('skolskaGodinaZa bez datuma ili sa neispravnim datumom daje null (bez izuzetka)', () => {
    expect(skolskaGodinaZa(null)).toBeNull();
    expect(skolskaGodinaZa(undefined)).toBeNull();
    expect(skolskaGodinaZa('')).toBeNull();
    expect(skolskaGodinaZa('2025-02-30')).toBeNull();
    expect(skolskaGodinaZa(new Date(Number.NaN))).toBeNull();
    expect(formatSkolskaGodina(skolskaGodinaZa(null))).toBe('—');
  });

  it('tekucaSkolskaGodina prima "sada" (za testove), podrazumevano današnji dan', () => {
    expect(tekucaSkolskaGodina(new Date(2026, 9, 8))).toBe(2026);
    expect(tekucaSkolskaGodina(new Date(2026, 4, 8))).toBe(2025);
    expect(tekucaSkolskaGodina()).toBe(skolskaGodinaZa(new Date()));
  });

  it('opcijeSkolskihGodina: tekuća i prethodne, najnovija prva', () => {
    expect(opcijeSkolskihGodina(3, new Date(2026, 9, 8))).toEqual([
      { vrednost: 2026, labela: '2026/27' },
      { vrednost: 2025, labela: '2025/26' },
      { vrednost: 2024, labela: '2024/25' },
    ]);
  });
});
