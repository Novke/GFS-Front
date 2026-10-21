import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MathLive, resetujMathLive, ucitajMathLive } from './mathlive-ucitavanje';

/** Lažni modul: statička svojstva `MathfieldElement`-a koja učitavanje postavlja. */
function lazni(): MathLive {
  const MathfieldElement = {
    fontsDirectory: './fonts' as string | null, soundsDirectory: './sounds' as string | null,
    keypressSound: 'keypress.wav' as unknown, plonkSound: 'plonk.wav' as string | null,
    openUrl: (href: string) => window.open(href),
  };
  return { MathfieldElement } as unknown as MathLive;
}

describe('ucitajMathLive', () => {
  afterEach(() => resetujMathLive());

  it('lokalni fontovi kao apsolutan URL (MathLive tada ne šalje HEAD ka sopstvenoj adresi ni CDN-u), bez zvukova, bez otvaranja linkova', async () => {
    const m = await ucitajMathLive(() => Promise.resolve(lazni()));
    const mf = m.MathfieldElement as unknown as Record<string, unknown>;
    expect(mf['fontsDirectory']).toBe(new URL('assets/mathlive/fonts/', document.baseURI).href);
    expect(String(mf['fontsDirectory'])).toMatch(/^https?:\/\/[^/]+\/.*assets\/mathlive\/fonts\/$/);
    expect(new URL(String(mf['fontsDirectory'])).origin).toBe(new URL(document.baseURI).origin);
    expect(mf['soundsDirectory']).toBeNull();
    expect(mf['keypressSound']).toBeNull();
    expect(mf['plonkSound']).toBeNull();
    const open = vi.spyOn(window, 'open');
    (mf['openUrl'] as (h: string) => void)('http://e.com');
    expect(open).not.toHaveBeenCalled();
  });

  it('jednom po prozoru; odbijeno se ne kešira', async () => {
    const pad = vi.fn(() => Promise.reject(new Error('chunk')));
    await expect(ucitajMathLive(pad)).rejects.toThrow('chunk');
    const uvezi = vi.fn(() => Promise.resolve(lazni()));
    const a = await ucitajMathLive(uvezi);
    const b = await ucitajMathLive(uvezi);
    expect(a).toBe(b);
    expect(pad).toHaveBeenCalledTimes(1);
    expect(uvezi).toHaveBeenCalledTimes(1);
  });
});
