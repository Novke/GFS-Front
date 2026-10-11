import { praznaStatistika, saberi } from './izvestaj';

describe('statistika uvoza', () => {
  it('praznaStatistika ima nulu za svaki tip sloja i svaki efekat', () => {
    const s = praznaStatistika();
    expect(s.slojevi).toEqual({ TEKST: 0, SLIKA: 0, OBLIK: 0, TABELA: 0, FORMULA: 0, CRTEZ: 0 });
    expect(s.animacije).toEqual({ POJAVI: 0, FADE: 0, ULET: 0, PODELI: 0, BRISANJE: 0, ZUM: 0, ISCRTAJ: 0 });
    expect([s.beleske, s.efekataPptx, s.klikoviPptx, s.koraci]).toEqual([0, 0, 0, 0]);
    s.slojevi.TEKST = 5;
    expect(praznaStatistika().slojevi.TEKST).toBe(0);
  });

  it('saberi sabira svako polje i ne menja ulaze', () => {
    const a = praznaStatistika();
    a.slojevi.TEKST = 2;
    a.animacije.FADE = 1;
    a.beleske = 1;
    a.koraci = 3;
    const b = praznaStatistika();
    b.slojevi.TEKST = 1;
    b.slojevi.CRTEZ = 4;
    b.efekataPptx = 7;
    b.klikoviPptx = 2;
    const z = saberi(a, b);
    expect(z.slojevi).toEqual({ TEKST: 3, SLIKA: 0, OBLIK: 0, TABELA: 0, FORMULA: 0, CRTEZ: 4 });
    expect(z.animacije.FADE).toBe(1);
    expect([z.beleske, z.efekataPptx, z.klikoviPptx, z.koraci]).toEqual([1, 7, 2, 3]);
    expect(a.slojevi.TEKST).toBe(2);
    expect(b.slojevi.TEKST).toBe(1);
  });
});
