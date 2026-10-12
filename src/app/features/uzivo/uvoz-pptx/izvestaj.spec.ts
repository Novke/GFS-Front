import { izvestajKaoTekst, praznaStatistika, saberi } from './izvestaj';

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

describe('izvestajKaoTekst', () => {
  const slajd = (indeks: number, tekst: number, slika: number, fade: number, beleske: number, koraci: number, klikova: number) => {
    const s = praznaStatistika();
    s.slojevi.TEKST = tekst;
    s.slojevi.SLIKA = slika;
    s.animacije.FADE = fade;
    s.beleske = beleske;
    s.koraci = koraci;
    s.klikoviPptx = klikova;
    return { indeks, statistika: s };
  };
  const rezultat = {
    imeFajla: 'predavanje.pptx',
    ukupnoSlajdova: 4,
    slajdovi: [slajd(2, 3, 1, 2, 1, 2, 3), slajd(3, 2, 0, 0, 0, 0, 0)],
    greske: [{ slajd: 4, poruka: 'Slajd ima više od 300 objekata.' }],
    upozorenja: [
      { slajd: 3, kod: 'SENKA' as const, poruka: 'Senka teksta nije prenesena.' },
      { slajd: null, kod: 'FORMAT_SLAJDA' as const, poruka: 'Format slajda je 4:3.' },
      { slajd: 2, kod: 'FONT_ZAMENJEN' as const, poruka: 'Font Calibri je zamenjen.' },
      { slajd: 2, kod: 'KLIK_IZGUBLJEN' as const, poruka: 'Klik je izgubljen.' },
    ],
  };

  it('tačan tekst izveštaja (redosled upozorenja: slajdovi, pa nastanak, bez slajda na kraju)', () => {
    expect(izvestajKaoTekst(rezultat)).toBe([
      'Uvoz: predavanje.pptx',
      'Slajdovi: 2 od 4 (s02-s03)',
      'Slojevi: 6 (TEKST 5, SLIKA 1)',
      'Animacije: 2 (FADE 2); koraci: 2 (PowerPoint klikova: 3)',
      'Beleške: 1',
      'Greške: 1',
      's04: Slajd ima više od 300 objekata.',
      'Upozorenja (4):',
      's02: Font Calibri je zamenjen.',
      's02: Klik je izgubljen.',
      's03: Senka teksta nije prenesena.',
      '—: Format slajda je 4:3.',
    ].join('\n'));
  });

  it('izbor ograničava slajdove, greške i upozorenja slajdova (upozorenja celog fajla ostaju); dodatna upozorenja slanja se dodaju', () => {
    const t = izvestajKaoTekst(rezultat, { od: 3, do: 3 }, [{ slajd: 3, kod: 'GRANICA', poruka: 'Slika je smanjena.' }]);
    expect(t).toBe([
      'Uvoz: predavanje.pptx',
      'Slajdovi: 1 od 4 (s03-s03)',
      'Slojevi: 2 (TEKST 2)',
      'Animacije: 0; koraci: 0 (PowerPoint klikova: 0)',
      'Beleške: 0',
      'Greške: 0',
      'Upozorenja (3):',
      's03: Senka teksta nije prenesena.',
      's03: Slika je smanjena.',
      '—: Format slajda je 4:3.',
    ].join('\n'));
  });

  it('prazan rezultat nema opseg', () => {
    expect(izvestajKaoTekst({ imeFajla: 'a.pptx', ukupnoSlajdova: 0, slajdovi: [], greske: [], upozorenja: [] })).toContain('Slajdovi: 0 od 0\n');
  });
});
