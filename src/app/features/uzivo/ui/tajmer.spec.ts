import { stanjeTajmera, udeoPrstena } from './tajmer.component';

describe('stanjeTajmera', () => {
  it('bez roka i bez pauze nema tajmera', () => {
    expect(stanjeTajmera(null, null, 1_000)).toBeNull();
  });

  it('tajmer radi: preostalo po serverskom vremenu, sekunde naviše', () => {
    expect(stanjeTajmera(10_000, null, 4_200)).toEqual({ preostaloMs: 5_800, sekunde: 6, pauza: false, upozorenje: false });
  });

  it('ispod 5 s je upozorenje', () => {
    const s = stanjeTajmera(10_000, null, 5_500)!;
    expect(s.sekunde).toBe(5);
    expect(s.upozorenje).toBe(true);
    expect(stanjeTajmera(10_000, null, 5_000)!.upozorenje).toBe(false);
  });

  it('isteklo vreme je 0, nikad negativno', () => {
    expect(stanjeTajmera(10_000, null, 12_000)).toEqual({ preostaloMs: 0, sekunde: 0, pauza: false, upozorenje: true });
  });

  it('pauza: preostalo je zamrznuto, rok se ne gleda', () => {
    expect(stanjeTajmera(10_000, 12_000, 99_000)).toEqual({ preostaloMs: 12_000, sekunde: 12, pauza: true, upozorenje: false });
    expect(stanjeTajmera(null, 3_000, 0)!.pauza).toBe(true);
  });
});

describe('udeoPrstena', () => {
  it('deo punog kruga koji je preostao', () => {
    expect(udeoPrstena(15_000, 30_000)).toBe(0.5);
    expect(udeoPrstena(30_000, 30_000)).toBe(1);
    expect(udeoPrstena(0, 30_000)).toBe(0);
  });

  it('ograničen na 0-1 i bez deljenja nulom', () => {
    expect(udeoPrstena(40_000, 30_000)).toBe(1);
    expect(udeoPrstena(5_000, 0)).toBe(0);
  });
});
