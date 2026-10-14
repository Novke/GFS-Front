import { describe, expect, it } from 'vitest';

import { DatumPipe, formatDatum } from './datum.pipe';

describe('DatumPipe', () => {
  const pipe = new DatumPipe();

  it('ISO datum -> 14. 10. 2025.', () => {
    expect(pipe.transform('2025-10-14')).toBe('14. 10. 2025.');
    expect(pipe.transform('2025-01-05')).toBe('5. 1. 2025.');
  });

  it('datum i vreme sa servera (LocalDateTime) -> isti dan, bez pomeranja zone', () => {
    expect(pipe.transform('2025-10-14T00:30:00')).toBe('14. 10. 2025.');
    expect(pipe.transform('2025-10-14T14:05:09', 'sa-vremenom')).toBe('14. 10. 2025. 14:05');
  });

  it('Date objekat', () => {
    expect(pipe.transform(new Date(2025, 9, 14, 9, 3))).toBe('14. 10. 2025.');
    expect(formatDatum(new Date(2025, 9, 14, 9, 3), 'vreme')).toBe('09:03');
  });

  it('kratko: bez godine', () => {
    expect(pipe.transform('2025-10-14', 'kratko')).toBe('14. 10.');
  });

  it('null, undefined, prazno i neispravno -> —', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform('')).toBe('—');
    expect(pipe.transform('nije-datum')).toBe('—');
    expect(pipe.transform('2025-02-30')).toBe('—');
    expect(pipe.transform(new Date(Number.NaN))).toBe('—');
  });
});
