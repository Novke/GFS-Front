import { describe, expect, it, vi } from 'vitest';
import { prihvatiDodir, vibriraj } from './dodir';

describe('prihvatiDodir', () => {
  it('prvi dodir se prihvata', () => expect(prihvatiDodir(undefined, 0)).toBe(true));
  it('drugi dodir pre 300 ms se ignoriše', () => expect(prihvatiDodir(1000, 1299)).toBe(false));
  it('dodir tačno posle 300 ms se prihvata', () => expect(prihvatiDodir(1000, 1300)).toBe(true));
});

describe('vibriraj', () => {
  it('ne baca bez API-ja', () => {
    expect(() => vibriraj(undefined)).not.toThrow();
    expect(() => vibriraj({})).not.toThrow();
  });
  it('ne baca kad vibrate baci', () => {
    expect(() => vibriraj({ vibrate: () => { throw new Error('x'); } })).not.toThrow();
  });
  it('zove vibrate sa 12 ms', () => {
    const vibrate = vi.fn(() => true);
    vibriraj({ vibrate });
    expect(vibrate).toHaveBeenCalledWith(12);
  });
});
