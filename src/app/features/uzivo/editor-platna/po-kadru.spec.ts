import { PoKadru } from './po-kadru';

/** Lažan raspored kadrova: pamti zakazane funkcije, ništa ne zove sam. */
function lazniKadrovi() {
  const zakazani = new Map<number, () => void>();
  let sledeci = 1;
  return {
    zakazi: vi.fn((f: () => void) => {
      const id = sledeci++;
      zakazani.set(id, f);
      return id;
    }),
    otkazi: vi.fn((id: number) => {
      zakazani.delete(id);
    }),
    /** Pokreće sve zakazane (jedan kadar). */
    kadar() {
      const f = [...zakazani.values()];
      zakazani.clear();
      f.forEach((x) => x());
    },
    get brojZakazanih() {
      return zakazani.size;
    },
  };
}

describe('PoKadru', () => {
  it('tri dodaj pa kadar -> obradi jednom, sa poslednjom vrednošću (jedno zakazivanje)', () => {
    const k = lazniKadrovi();
    const obradi = vi.fn<(v: number) => void>();
    const pk = new PoKadru(obradi, k.zakazi, k.otkazi);
    pk.dodaj(1);
    pk.dodaj(2);
    pk.dodaj(3);
    expect(obradi).not.toHaveBeenCalled();
    expect(k.zakazi).toHaveBeenCalledTimes(1);
    k.kadar();
    expect(obradi).toHaveBeenCalledTimes(1);
    expect(obradi).toHaveBeenCalledWith(3);
  });

  it('posle kadra sledeće dodaj zakazuje nov kadar', () => {
    const k = lazniKadrovi();
    const obradi = vi.fn<(v: number) => void>();
    const pk = new PoKadru(obradi, k.zakazi, k.otkazi);
    pk.dodaj(1);
    k.kadar();
    pk.dodaj(2);
    expect(k.zakazi).toHaveBeenCalledTimes(2);
    k.kadar();
    expect(obradi.mock.calls).toEqual([[1], [2]]);
  });

  it('isprazni odmah obrađuje ono što čeka i otkazuje kadar (pointerup ne gubi poslednji pokret)', () => {
    const k = lazniKadrovi();
    const obradi = vi.fn<(v: number) => void>();
    const pk = new PoKadru(obradi, k.zakazi, k.otkazi);
    pk.dodaj(5);
    pk.dodaj(7);
    pk.isprazni();
    expect(obradi).toHaveBeenCalledTimes(1);
    expect(obradi).toHaveBeenCalledWith(7);
    expect(k.otkazi).toHaveBeenCalledWith(1);
    expect(k.brojZakazanih).toBe(0);
    k.kadar();
    expect(obradi).toHaveBeenCalledTimes(1);
  });

  it('isprazni bez zakazanog ne radi ništa', () => {
    const k = lazniKadrovi();
    const obradi = vi.fn<(v: number) => void>();
    const pk = new PoKadru(obradi, k.zakazi, k.otkazi);
    pk.isprazni();
    expect(obradi).not.toHaveBeenCalled();
    expect(k.otkazi).not.toHaveBeenCalled();
  });

  it('prekini odbacuje ono što čeka: ni kadar ni isprazni ne obrađuju', () => {
    const k = lazniKadrovi();
    const obradi = vi.fn<(v: number) => void>();
    const pk = new PoKadru(obradi, k.zakazi, k.otkazi);
    pk.dodaj(1);
    pk.prekini();
    expect(k.otkazi).toHaveBeenCalledWith(1);
    k.kadar();
    pk.isprazni();
    expect(obradi).not.toHaveBeenCalled();
  });
});
