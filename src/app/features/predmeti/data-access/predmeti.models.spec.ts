import { describe, expect, it } from 'vitest';

import { DomaciListItem } from '../../domaci/data-access/domaci.models';
import { PredavanjeListItem } from '../../predavanja/data-access/predavanja.models';
import { TestListItem } from '../../testovi/data-access/testovi.models';
import {
  grupeSaNastavom,
  grupeSaPredavanjima,
  parseGodinaHuba,
  parseGrupaHuba,
  serijeProsekaPoTipu,
  statistikaPredmeta,
  vremenskaLinija,
} from './predmeti.models';

const P = { id: 3, naziv: 'Statika' };
const G1 = { id: 1, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 20 };
const G2 = { id: 2, naziv: 'AR-2025', godinaUpisa: 2025, brojStudenata: 15 };

function predavanje(id: number, datum: string | null, grupa = G1, tema: string | null = `Tema ${id}`): PredavanjeListItem {
  return { id, rb: id, datum, tema, zavrseno: true, predmet: P, grupa, brojPrisutnih: 10, brojStarijihPrisutnih: 0, brojStudenata: 20 };
}
function domaci(id: number, datum: string | null, grupa: typeof G1 | null = G1): DomaciListItem {
  return { id, naslov: `Domaći ${id}`, datum, pregledan: false, predmet: P, grupa, predavanje: null, brojUradjenih: 3, brojStudenata: 20 };
}
function test(id: number, datum: string | null, tip: { id: number; naziv: string } | null, prosek: number | null, maxPoena: number | null = 40, grupa = G2): TestListItem {
  return {
    id, datum, tipTesta: tip, maxPoena, pragProlaza: null, pregledan: true, predmet: P, grupa, brojPolaganja: 5, prosek, procenatProlaznosti: null,
  };
}

describe('vremenska linija (H1)', () => {
  const nastava = {
    predavanja: [predavanje(1, '2025-10-07'), predavanje(2, '2025-10-21'), predavanje(3, null, G1, null)],
    domaci: [domaci(10, '2025-10-14'), domaci(11, '2025-10-07', null)],
    testovi: [test(20, '2025-10-21', { id: 7, naziv: 'Kolokvijum 1' }, 25)],
  };

  it('spaja tri izvora po datumu; isti dan: predavanje, domaći, test; bez datuma na kraju', () => {
    const linija = vremenskaLinija(nastava, null);
    expect(linija.map(s => `${s.tip}:${s.id}`)).toEqual(['predavanje:1', 'domaci:11', 'domaci:10', 'predavanje:2', 'test:20', 'predavanje:3']);
    expect(linija[0]).toMatchObject({ naslov: 'Predavanje 1 · Tema 1', url: ['/predavanja', 1], ikona: 'co_present' });
    expect(linija[1]).toMatchObject({ naslov: 'Domaći 11', url: ['/domaci', 11], ikona: 'description', grupa: null });
    expect(linija[4]).toMatchObject({ naslov: 'Kolokvijum 1', url: ['/testovi', 20], ikona: 'assignment' });
    expect(linija[5].naslov).toBe('Predavanje 3');
  });

  it('filter grupe: samo stavke te grupe (domaći bez grupe ne ulazi)', () => {
    expect(vremenskaLinija(nastava, 1).map(s => s.id)).toEqual([1, 10, 2, 3]);
    expect(vremenskaLinija(nastava, 2).map(s => s.id)).toEqual([20]);
    expect(vremenskaLinija({ predavanja: [], domaci: [], testovi: [] }, null)).toEqual([]);
  });

  it('grupe sa nastavom (po nazivu, bez duplikata) i grupe sa predavanjima', () => {
    expect(grupeSaNastavom(nastava).map(g => g.id)).toEqual([2, 1]);
    expect(grupeSaPredavanjima(nastava)).toEqual([1]);
  });
});

describe('parametri huba', () => {
  const sada = new Date(2025, 10, 1);
  it('godina: ispravna 2000-2100, sve ostalo je tekuća', () => {
    expect(parseGodinaHuba('2024', sada)).toBe(2024);
    for (const los of [undefined, null, '', 'abc', '1999', '2101', '2024.5', '20240']) {
      expect(parseGodinaHuba(los, sada)).toBe(2025);
    }
  });
  it('grupa: pozitivan ceo broj, inače bez grupe', () => {
    expect(parseGrupaHuba('4')).toBe(4);
    for (const los of [undefined, '', '-3', '0', 'x', '1.5']) {
      expect(parseGrupaHuba(los)).toBeNull();
    }
  });
});

describe('prosek po tipu kroz vreme (H3)', () => {
  it('serija po tipu, tačke po datumu u % od max poena; bez proseka, datuma ili max poena se preskaču', () => {
    const k1 = { id: 7, naziv: 'Kolokvijum 1' };
    const k2 = { id: 8, naziv: 'Kolokvijum 2' };
    const serije = serijeProsekaPoTipu([
      test(1, '2025-11-20', k1, 30, 40),
      test(2, '2025-11-10', k1, 20, 40),
      test(3, '2025-12-01', k2, 10, 0),
      test(4, '2025-12-02', k2, null),
      test(5, null, k2, 10),
      test(6, '2025-12-03', null, 10),
      test(7, '2025-12-05', k2, 15, 20),
    ]);
    expect(serije.map(s => s.tip.naziv)).toEqual(['Kolokvijum 1', 'Kolokvijum 2']);
    expect(serije[0].tacke.map(t => [t.id, t.procenat])).toEqual([
      [2, 50],
      [1, 75],
    ]);
    expect(serije[1].tacke.map(t => t.id)).toEqual([7]);
  });
});

describe('lista predmeta', () => {
  it('broj predavanja, testova i grupa po predmetu u godini', () => {
    const s = statistikaPredmeta(
      [predavanje(1, '2025-10-07'), predavanje(2, '2025-10-08', G2), { ...predavanje(3, '2025-10-09'), predmet: { id: 4, naziv: 'Beton' } }],
      [test(20, '2025-10-21', null, null)],
    );
    expect(s.get(3)).toEqual({ predavanja: 2, testovi: 1, grupe: ['AR-2025', 'GD-2025'] });
    expect(s.get(4)).toEqual({ predavanja: 1, testovi: 0, grupe: ['GD-2025'] });
    expect(s.get(5)).toBeUndefined();
  });
});
