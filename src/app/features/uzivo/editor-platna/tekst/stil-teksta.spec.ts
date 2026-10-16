import type { Pasus } from '../../data-access/platno.models';
import { deo, pasusSa } from './pm.testing';
import {
  MAX_NIVO, VELICINE_SLOVA, jedna, listaSvima, nivoSvima, novaLista, pasusSvima, stanjeDelova, stilSvima, uvlacenjeListe,
} from './stil-teksta';

const znak = (p: Pasus = pasusSa([deo('x')])): Pasus => ({ ...p, lista: novaLista('ZNAK'), uvlacenje: uvlacenjeListe(p.nivo) });

describe('stil-teksta (panel teksta nad celim slojem, F13)', () => {
  it('VELICINE_SLOVA: meni veličina kao PowerPoint, rastuće, u granicama servera', () => {
    expect(VELICINE_SLOVA).toEqual([10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72]);
  });

  it('uvlacenjeListe(2) -> {90, -18}', () => {
    expect(uvlacenjeListe(2)).toEqual({ levo: 90, prviRed: -18 });
  });

  describe('stanjeDelova', () => {
    it('završni talas (rr m3): bez ijednog dela daje podrazumevani stil, ne "mešano"', () => {
      expect(stanjeDelova([pasusSa([])])).toMatchObject({ font: 'Carlito', velicina: 18, boja: '#000000', polozaji: ['OBICAN'] });
    });
    it('dva dela Carlito i Tinos -> font null; isti font -> naziv', () => {
      expect(stanjeDelova([pasusSa([deo('a'), deo('b', { font: 'Tinos' })])]).font).toBeNull();
      expect(stanjeDelova([pasusSa([deo('a', { font: 'Tinos' })]), pasusSa([deo('b', { font: 'Tinos' })])]).font).toBe('Tinos');
    });

    it('podebljano mešano -> null; svi -> true; nijedan -> false', () => {
      expect(stanjeDelova([pasusSa([deo('a', { podebljano: true }), deo('b')])]).podebljano).toBeNull();
      expect(stanjeDelova([pasusSa([deo('a', { podebljano: true })]), pasusSa([deo('b', { podebljano: true })])]).podebljano).toBe(true);
      expect(stanjeDelova([pasusSa([deo('a')])]).podebljano).toBe(false);
    });

    it('prazni delovi ne mešaju stanje vidljivog teksta; sloj bez teksta daje stil praznih delova', () => {
      const pasusi = [pasusSa([deo('Naslov', { velicina: 40 })]), pasusSa([deo('', { velicina: 18 })])];
      expect(stanjeDelova(pasusi).velicina).toBe(40);
      expect(stanjeDelova([pasusSa([deo('', { velicina: 30 })])]).velicina).toBe(30);
    });

    it('polozaji i liste: samo vrednosti prisutne u sloju (redom pojavljivanja)', () => {
      const s = stanjeDelova([pasusSa([deo('a'), deo('b', { polozaj: 'EKSPONENT' })]), znak()]);
      expect([s.polozaj, s.polozaji, s.lista, s.liste]).toEqual([null, ['OBICAN', 'EKSPONENT'], null, ['BEZ', 'ZNAK']]);
    });

    it('atributi pasusa: poravnanje, lista (BEZ / vrsta / mešano), nivo, prored i razmaci', () => {
      const a = pasusSa([deo('a')], { poravnanje: 'CENTAR', proredProcenat: 120, razmakPre: 6, razmakPosle: 0 });
      const b = { ...znak(pasusSa([deo('b')], { poravnanje: 'CENTAR', proredProcenat: 120, razmakPre: 6, razmakPosle: 12 })) };
      const s = stanjeDelova([a, b]);
      expect(s).toMatchObject({ poravnanje: 'CENTAR', lista: null, nivo: 0, proredProcenat: 120, razmakPre: 6, razmakPosle: null });
      expect(stanjeDelova([a]).lista).toBe('BEZ');
      expect(stanjeDelova([b, znak()]).lista).toBe('ZNAK');
    });
  });

  describe('stilSvima', () => {
    it('menja svaki deo, i prazan deo praznog pasusa; ostali atributi dela ostaju', () => {
      const pasusi = [pasusSa([deo('a', { kurziv: true }), deo('b', { font: 'Tinos' })]), pasusSa([deo('')])];
      const r = stilSvima(pasusi, { velicina: 30 });
      expect(r.flatMap((p) => p.delovi.map((d) => d.velicina))).toEqual([30, 30, 30]);
      expect(r[0].delovi.map((d) => [d.tekst, d.font, d.kurziv])).toEqual([['a', 'Carlito', true], ['b', 'Tinos', false]]);
      expect(pasusi[0].delovi[0].velicina).toBe(18);
    });

    it('pasus bez delova (`delovi: []`) dobija prazan deo u stilu prethodnog teksta, sa izmenom', () => {
      const r = stilSvima([pasusSa([deo('a', { font: 'Tinos', velicina: 40 })]), pasusSa([])], { boja: '#FF0000' });
      expect(r[1].delovi).toEqual([deo('', { font: 'Tinos', velicina: 40, boja: '#FF0000' })]);
    });

    it('pasus bez delova na početku: osnova je prvi sledeći deo sa tekstom (ne podrazumevani Carlito 18)', () => {
      const r = stilSvima([pasusSa([]), pasusSa([deo('')]), pasusSa([deo('a', { font: 'Tinos', velicina: 40 })])], { kurziv: true });
      expect(r[0].delovi).toEqual([deo('', { font: 'Tinos', velicina: 40, kurziv: true })]);
    });

    it('jedna: ista vrednost ili null (mešano i prazno)', () => {
      expect([jedna([1, 1]), jedna([1, 2]), jedna([])]).toEqual([1, null, null]);
    });

    it('bez promene vraća isti niz i iste pasuse (nema koraka istorije ni PUT-a)', () => {
      const pasusi = [pasusSa([deo('a', { velicina: 30 })]), pasusSa([deo('', { velicina: 30 })])];
      expect(stilSvima(pasusi, { velicina: 30 })).toBe(pasusi);
      const r = stilSvima([pasusi[0], pasusSa([deo('b')])], { velicina: 30 });
      expect(r[0]).toBe(pasusi[0]);
    });
  });

  describe('pasusSvima', () => {
    it('menja atribute svih pasusa, delovi ostaju; bez promene isti niz', () => {
      const pasusi = [pasusSa([deo('a')]), pasusSa([deo('b')], { poravnanje: 'DESNO' })];
      const r = pasusSvima(pasusi, { poravnanje: 'CENTAR', proredProcenat: 150 });
      expect(r.map((p) => [p.poravnanje, p.proredProcenat])).toEqual([['CENTAR', 150], ['CENTAR', 150]]);
      expect(r[0].delovi).toBe(pasusi[0].delovi);
      expect(pasusSvima(r, { poravnanje: 'CENTAR' })).toBe(r);
    });

    it('objekat u izmeni (uvlačenje) se ne deli među pasusima ni sa pozivaocem', () => {
      const uvlacenje = { levo: 10, prviRed: 0 };
      const r = pasusSvima([pasusSa([deo('a')]), pasusSa([deo('b')])], { uvlacenje });
      expect(r[0].uvlacenje).toEqual(uvlacenje);
      expect(r[0].uvlacenje).not.toBe(uvlacenje);
      expect(r[0].uvlacenje).not.toBe(r[1].uvlacenje);
    });
  });

  describe('listaSvima', () => {
    it('nad [ZNAK, ZNAK] -> bez liste i uvlačenje {0, 0}', () => {
      const r = listaSvima([znak(), znak()], 'ZNAK');
      expect(r.map((p) => [p.lista, p.uvlacenje])).toEqual([[null, { levo: 0, prviRed: 0 }], [null, { levo: 0, prviRed: 0 }]]);
    });

    it('nad [ZNAK, bez] -> oba ZNAK `•` sa uvlacenjeListe(nivo); postojeća lista te vrste ostaje', () => {
      const prvi: Pasus = { ...znak(), lista: { vrsta: 'ZNAK', znak: '–', boja: null, format: null, pocetak: null } };
      const r = listaSvima([prvi, pasusSa([deo('b')], { nivo: 2 })], 'ZNAK');
      expect(r[0].lista).toBe(prvi.lista);
      expect(r[1].lista).toEqual({ vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null });
      expect(r.map((p) => p.uvlacenje)).toEqual([uvlacenjeListe(0), uvlacenjeListe(2)]);
    });

    it('BROJ: ARAPSKI_TACKA od 1, i preko liste znakova', () => {
      const r = listaSvima([znak(), pasusSa([deo('b')])], 'BROJ');
      expect(r.map((p) => p.lista)).toEqual([novaLista('BROJ'), novaLista('BROJ')]);
      expect(novaLista('BROJ')).toEqual({ vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: 1 });
    });
  });

  describe('nivoSvima', () => {
    it('nivo 8 + 1 -> 8 (bez promene: isti niz); nivo 0 - 1 -> 0', () => {
      const osmi = [{ ...znak(pasusSa([deo('a')], { nivo: MAX_NIVO })) }];
      expect(nivoSvima(osmi, 1)).toBe(osmi);
      const nulti = [znak()];
      expect(nivoSvima(nulti, -1)).toBe(nulti);
    });

    it('pasus liste dobija nivo i uvlačenje nivoa; pasus bez liste je nepromenjen', () => {
      const bez = pasusSa([deo('b')]);
      const r = nivoSvima([znak(), bez], 1);
      expect([r[0].nivo, r[0].uvlacenje]).toEqual([1, uvlacenjeListe(1)]);
      expect(r[1]).toBe(bez);
    });
  });
});
