import {
  Animacija, CrtezSloj, FormulaSloj, Okvir, OblikSloj, Pasus, Platno, SlikaSloj, TabelaSloj, TekstSloj,
} from './platno.models';

const osnova = (id: string) => ({
  id, naziv: null, x: 10, y: 10, sirina: 200, visina: 100, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
});

export const okvirPodrazumevani: Okvir = {
  unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1,
};

export function pasus(tekst: string): Pasus {
  return {
    poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0,
    proredProcenat: 100, tabulatori: [], delovi: [{
      tekst, font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false,
      precrtano: false, polozaj: 'OBICAN',
    }],
  };
}

export function animacija(id: string, slojId: string, deo: Partial<Animacija> = {}): Animacija {
  return {
    id, slojId, pasus: null, vrsta: 'ULAZ', efekat: 'FADE', smer: null, okidac: 'KLIK', trajanjeMs: 500, kasnjenjeMs: 0, ...deo,
  };
}

export function platnoSaAnimacijama(animacije: Animacija[], slojevi: Platno['slojevi'] = []): Platno {
  return { verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi, animacije };
}

/** Važeće platno sa svih šest vrsta slojeva i 4 animacije: KLIK, SA_PRETHODNIM, POSLE_PRETHODNOG, KLIK. */
export function platno(): Platno {
  const tekst: TekstSloj = {
    ...osnova('tekst'), tip: 'TEKST', pasusi: [pasus('Prvi'), pasus('Drugi')], okvir: okvirPodrazumevani, popuna: null, ivica: null,
  };
  const slika: SlikaSloj = {
    ...osnova('slika'), tip: 'SLIKA', medijId: '00000000-0000-0000-0000-000000000001',
    isecak: { levo: 0, gore: 0, desno: 0, dole: 0 },
  };
  const oblik: OblikSloj = { ...osnova('oblik'), tip: 'OBLIK', oblik: 'ELIPSA', popuna: '#FFCC00', ivica: null, od: null, do: null };
  const tabela: TabelaSloj = {
    ...osnova('tabela'), tip: 'TABELA', kolone: [100, 100], redovi: [30],
    celije: [[0, 1].map(() => ({
      pasusi: [pasus('A')], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null },
      spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'VRH' as const,
    }))],
  };
  const formula: FormulaSloj = {
    ...osnova('formula'), tip: 'FORMULA', latex: 'x^2', boja: '#000000', velicina: 24, poravnanje: 'CENTAR', slikaIzvora: null,
  };
  const crtez: CrtezSloj = { ...osnova('crtez'), tip: 'CRTEZ', medijId: '00000000-0000-0000-0000-000000000002', potezi: null };
  return platnoSaAnimacijama([
    animacija('a1', 'tekst', { pasus: 0 }),
    animacija('a2', 'slika', { okidac: 'SA_PRETHODNIM', efekat: 'ZUM' }),
    animacija('a3', 'oblik', { okidac: 'POSLE_PRETHODNOG', efekat: 'POJAVI', trajanjeMs: 0 }),
    animacija('a4', 'oblik', { vrsta: 'IZLAZ' }),
  ], [tekst, slika, oblik, tabela, formula, crtez]);
}
