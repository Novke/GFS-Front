import { afterEach, describe, expect, it, vi } from 'vitest';

import { javiNovoIzvodjenje, KANAL_IZVODJENJA, pratiNovoIzvodjenje } from './novo-izvodjenje';

/** Lažni BroadcastChannel: poruka ide svim drugim otvorenim kanalima istog imena (kao u pregledaču). */
class LazniKanal {
  static otvoreni: LazniKanal[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(readonly name: string) { LazniKanal.otvoreni.push(this); }
  postMessage(data: unknown): void {
    for (const k of LazniKanal.otvoreni) if (k !== this && k.name === this.name) k.onmessage?.({ data } as MessageEvent);
  }
  close(): void { LazniKanal.otvoreni = LazniKanal.otvoreni.filter(k => k !== this); }
}

describe('novo izvođenje između prozora', () => {
  afterEach(() => { vi.unstubAllGlobals(); LazniKanal.otvoreni = []; });

  it('prozor koji prati dobija staro i novo izvođenje; posle odjave više ništa', () => {
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    const primljeno = vi.fn();
    const odjavi = pratiNovoIzvodjenje(primljeno);
    javiNovoIzvodjenje(7, 8);
    expect(primljeno).toHaveBeenCalledWith({ tip: 'novo-izvodjenje', staro: 7, novo: 8 });
    odjavi();
    javiNovoIzvodjenje(8, 9);
    expect(primljeno).toHaveBeenCalledTimes(1);
    expect(LazniKanal.otvoreni).toEqual([]);
  });

  it('tuđe ili neispravne poruke se odbacuju', () => {
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    const primljeno = vi.fn();
    pratiNovoIzvodjenje(primljeno);
    const stran = new LazniKanal(KANAL_IZVODJENJA);
    for (const d of [null, 'x', { tip: 'drugo', staro: 1, novo: 2 }, { tip: 'novo-izvodjenje', staro: 1, novo: 0 },
      { tip: 'novo-izvodjenje', staro: '1', novo: 2 }]) stran.postMessage(d);
    expect(primljeno).not.toHaveBeenCalled();
  });

  it('bez BroadcastChannel ništa ne puca', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(() => { javiNovoIzvodjenje(1, 2); pratiNovoIzvodjenje(() => undefined)(); }).not.toThrow();
  });
});
