import { afterEach, describe, expect, it, vi } from 'vitest';

import { kopirajTekst } from './kopiraj';

describe('kopirajTekst', () => {
  afterEach(() => vi.restoreAllMocks());

  function dokumentSa(clipboard: Partial<Clipboard> | undefined, execCommand?: (c: string) => boolean): Document {
    const d = document.implementation.createHTMLDocument('x');
    Object.defineProperty(d, 'defaultView', { value: { navigator: { clipboard } } });
    Object.defineProperty(d, 'execCommand', { value: execCommand, configurable: true });
    return d;
  }

  it('Clipboard API kad postoji', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await kopirajTekst('a; b', dokumentSa({ writeText }))).toBe(true);
    expect(writeText).toHaveBeenCalledWith('a; b');
  });

  it('bez Clipboard API-ja (nije secure context) pada na execCommand i sklanja pomoćno polje', async () => {
    const exec = vi.fn((c: string) => c === 'copy');
    const d = dokumentSa(undefined, exec);
    expect(await kopirajTekst('link', d)).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(d.querySelector('textarea')).toBeNull();
  });

  it('odbijen Clipboard API i bez execCommand: false', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowed'));
    expect(await kopirajTekst('x', dokumentSa({ writeText }, undefined))).toBe(false);
  });
});
