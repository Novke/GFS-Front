import { describe, expect, it } from 'vitest';
import { cssFonta, FONTOVI_PLATNA, fontoviPlatna } from './platno-fontovi';
import type { Celija, Deo, Pasus, Platno, TabelaSloj, TekstSloj } from '../data-access/platno.models';

const deo = (font: string): Deo => ({
  tekst: 'x', font, velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
});
const pasus = (...fontovi: string[]): Pasus => ({
  poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0,
  proredProcenat: 100, tabulatori: [], delovi: fontovi.map(deo),
});
const osnova = { naziv: null, x: 0, y: 0, sirina: 100, visina: 100, rotacija: 0, providnost: 1, zakljucan: false, senka: null };

describe('platno-fontovi', () => {
  it('katalog ima tačno osam fontova iz ugovora', () => {
    expect(FONTOVI_PLATNA.map((f) => f.naziv)).toEqual([
      'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'IBM Plex Sans', 'IBM Plex Mono', 'Atkinson Hyperlegible',
    ]);
  });

  it('cssFonta vraća css fonta, a za nepoznat font css Carlito-a', () => {
    expect(cssFonta('Carlito')).toBe("'Carlito', 'Calibri', sans-serif");
    expect(cssFonta('Tinos')).toContain("'Times New Roman'");
    expect(cssFonta('Nepostojeci')).toBe(cssFonta('Carlito'));
  });

  it('fontoviPlatna skuplja fontove iz teksta i ćelija tabele', () => {
    const tekst: TekstSloj = {
      ...osnova, id: 's1', tip: 'TEKST', pasusi: [pasus('Arimo', 'Tinos'), pasus('Arimo')],
      okvir: { unutraLevo: 0, unutraGore: 0, unutraDesno: 0, unutraDole: 0, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
      popuna: null, ivica: null,
    };
    const celija: Celija = {
      pasusi: [pasus('Cousine')], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null },
      spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'VRH',
    };
    const tabela: TabelaSloj = { ...osnova, id: 's2', tip: 'TABELA', kolone: [50, 50], redovi: [50], celije: [[celija, { ...celija, pasusi: [pasus('Caladea')] }]] };
    const p: Platno = { verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi: [tekst, tabela], animacije: [] };
    expect(fontoviPlatna(p)).toEqual(new Set(['Arimo', 'Tinos', 'Cousine', 'Caladea']));
  });
});
