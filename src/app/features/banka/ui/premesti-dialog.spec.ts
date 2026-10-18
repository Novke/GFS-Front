import { describe, expect, it } from 'vitest';

import { GrupaCvor } from '../data-access/banka.models';
import { odredista } from './premesti-dialog';

function cvor(id: number, deca: GrupaCvor[] = [], izmena: Partial<GrupaCvor> = {}): GrupaCvor {
  return {
    id, naziv: `G${id}`, rb: id, tezina: deca.length ? null : 2, list: deca.length === 0, brojVarijanti: 0, brojAktivnih: 0,
    brojNacrta: 0, brojGresaka: 0, deca, ...izmena,
  };
}

/** G1 -> [G2 (list sa varijantama), G3 -> [G5]]; G4 prazan list u korenu. */
const STABLO: GrupaCvor[] = [
  cvor(1, [cvor(2, [], { brojVarijanti: 3 }), cvor(3, [cvor(5)])]),
  cvor(4),
];

const razlozi = (stablo: GrupaCvor[], id: number) => Object.fromEntries(odredista(stablo, id).map(o => [o.id, o.razlog]));

describe('odredista (Premesti u…)', () => {
  it('nudi koren prvi; podstablo premeštane grupe (ona i potomci) nije ponuđeno; dubina prati uvlaku', () => {
    const lista = odredista(STABLO, 3);
    expect(lista[0]).toEqual({ id: 0, naziv: 'Koren (vrh stabla)', dubina: 0, razlog: null });
    expect(lista.map(o => o.id)).toEqual([0, 1, 2, 4]);
    expect(lista.map(o => o.dubina)).toEqual([0, 1, 2, 1]);
  });

  it('sadašnji roditelj je onemogućen (za koren grupe: Koren)', () => {
    expect(razlozi(STABLO, 3)[1]).toBe('sada je ovde');
    expect(razlozi(STABLO, 4)[0]).toBe('sada je ovde');
    expect(razlozi(STABLO, 4)[1]).toBeNull();
  });

  it('list sa varijantama ne prima podgrupe; prazan list prima', () => {
    const r = razlozi(STABLO, 3);
    expect(r[2]).toBe('ima varijante');
    expect(r[4]).toBeNull();
  });

  it('cilj gde bi podstablo prešlo dubinu 6 je onemogućen', () => {
    // lanac dubine 5 (L1 -> ... -> L5) i grupa visine 2 (P -> P1) u korenu
    const lanac = cvor(11, [cvor(12, [cvor(13, [cvor(14, [cvor(15)])])])]);
    const stablo = [lanac, cvor(20, [cvor(21)])];
    const r = razlozi(stablo, 20);
    expect(r[0]).toBe('sada je ovde');
    // 1 + 2 = 3 ... 4 + 2 = 6 može; 5 + 2 = 7 ne
    expect([r[11], r[12], r[13], r[14]]).toEqual([null, null, null, null]);
    expect(r[15]).toBe('stablo bi bilo preduboko');
    // list (visina 1) sme i na dubinu 5
    expect(razlozi(stablo, 21)[15]).toBeNull();
  });

  it('nepoznata grupa: nema odredišta', () => {
    expect(odredista(STABLO, 99)).toEqual([]);
  });
});
