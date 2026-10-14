import { describe, expect, it } from 'vitest';

import { formatIndeks, IndeksPipe } from './indeks.pipe';

describe('IndeksPipe', () => {
  const pipe = new IndeksPipe();

  it('GD12 i 2025 -> GD12/2025', () => {
    expect(pipe.transform('GD12', 2025)).toBe('GD12/2025');
  });

  it('bez godine -> samo indeks', () => {
    expect(pipe.transform('GD12')).toBe('GD12');
    expect(pipe.transform('GD12', null)).toBe('GD12');
  });

  it('null, undefined i prazan indeks -> —', () => {
    expect(pipe.transform(null, 2025)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform('  ', 2025)).toBe('—');
  });

  it('indeks koji već ima godinu se ne duplira', () => {
    expect(formatIndeks('GD12/2025', 2025)).toBe('GD12/2025');
  });

  it('razmaci oko indeksa se uklanjaju', () => {
    expect(formatIndeks(' GD12 ', 2025)).toBe('GD12/2025');
  });
});
