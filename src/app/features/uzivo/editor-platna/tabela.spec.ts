import type { Celija, Ivica, TabelaSloj } from '../data-access/platno.models';
import { novaTabela } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { proveriKaoServer } from '../data-access/platno-provera';
import {
  MAX_REDOVA, celijaNaTacki, dodajKolonu, dodajRed, izmeniCelije, obrisiKolonu, obrisiRed, postaviIvice, prosiriOpseg, razdvoji,
  sledecaCelija, sirinaKolone, spoji, visinaReda, vlasnik,
} from './tabela';

/** Tekst ćelije (svi pasusi, spojeni sa "|"). */
const tekst = (c: Celija) => c.pasusi.map((p) => p.delovi.map((d) => d.tekst).join('')).join('|');

/** Tabela r x k iz teme sa tekstom "r,k" u svakoj ćeliji, kolone po 100 i redovi po 40. */
function tabela(redova = 3, kolona = 3): TabelaSloj {
  const t = novaTabela('T', 'NACRT', redova, kolona);
  const kolone = Array.from({ length: kolona }, () => 100);
  return {
    ...t, kolone, sirina: 100 * kolona,
    celije: t.celije.map((red, r) => red.map((c, k) => ({
      ...c, pasusi: c.pasusi.map((p) => ({ ...p, delovi: p.delovi.map((d) => ({ ...d, tekst: `${r},${k}` })) })),
    }))),
  };
}

/** Spajanje bez provere (postavka testa): sidro (r, k) sa datim rasponom, ostale pokrivene bez teksta. */
function saSpajanjem(t: TabelaSloj, r: number, k: number, dole: number, desno: number): TabelaSloj {
  const celije = t.celije.map((red, i) => red.map((c, j) => {
    if (i === r && j === k) return { ...c, spojDole: dole, spojDesno: desno };
    if (i >= r && i <= r + dole && j >= k && j <= k + desno) return { ...c, pokrivena: true, pasusi: [] };
    return c;
  }));
  return { ...t, celije };
}

const zbir = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;

/** Mreža je ispravna: svaka pokrivena ćelija pod tačno jednim sidrom, spajanja u granicama, mere = zbirovi, server prolazi. */
function proveriMrezu(t: TabelaSloj): void {
  expect(t.celije.length).toBe(t.redovi.length);
  const pokriva = t.celije.map((red) => red.map(() => 0));
  t.celije.forEach((red, r) => {
    expect(red.length).toBe(t.kolone.length);
    red.forEach((c, k) => {
      if (c.pokrivena) return;
      expect(r + c.spojDole).toBeLessThan(t.redovi.length);
      expect(k + c.spojDesno).toBeLessThan(t.kolone.length);
      for (let i = r; i <= r + c.spojDole; i++) for (let j = k; j <= k + c.spojDesno; j++) if (i !== r || j !== k) pokriva[i][j]++;
    });
  });
  t.celije.forEach((red, r) => red.forEach((c, k) => expect(pokriva[r][k]).toBe(c.pokrivena ? 1 : 0)));
  expect(t.sirina).toBe(zbir(t.kolone));
  expect(t.visina).toBe(zbir(t.redovi));
  expect(proveriKaoServer(platnoSaAnimacijama([], [t]))).toBeNull();
}

/** Ne-null rezultat (sa proverom mreže). */
function ok(t: TabelaSloj | null): TabelaSloj {
  expect(t).not.toBeNull();
  proveriMrezu(t!);
  return t!;
}

const ivica: Ivica = { boja: '#112233', debljina: 2, crtica: 'PUNA' };

describe('tabela', () => {
  it('postavka testa je ispravna mreža', () => {
    proveriMrezu(tabela());
    proveriMrezu(saSpajanjem(tabela(), 0, 0, 1, 0));
  });

  describe('vlasnik i prosiriOpseg', () => {
    it('pokriveno polje pripada sidru, obično samom sebi', () => {
      const t = saSpajanjem(tabela(), 0, 0, 1, 1);
      expect(vlasnik(t, 1, 1)).toEqual({ r: 0, k: 0 });
      expect(vlasnik(t, 2, 2)).toEqual({ r: 2, k: 2 });
    });

    it('opseg koji seče spajanje se širi dok se ne ustali (i obrnut redosled ugla se sređuje)', () => {
      const t = saSpajanjem(saSpajanjem(tabela(), 0, 1, 1, 0), 1, 2, 1, 0);
      expect(prosiriOpseg(t, { r1: 0, k1: 0, r2: 0, k2: 1 })).toEqual({ r1: 0, k1: 0, r2: 1, k2: 1 });
      // (0,1)-(1,1) dodiruje spajanje (1,2)-(2,2) tek posle širenja na kolonu 2
      expect(prosiriOpseg(t, { r1: 1, k1: 2, r2: 0, k2: 1 })).toEqual({ r1: 0, k1: 1, r2: 2, k2: 2 });
    });
  });

  describe('redovi', () => {
    it('dodajRed(t, 0): 4 reda, nov red prazan na indeksu 1 sa formatom reda 0', () => {
      const t0 = tabela();
      const t = ok(dodajRed(t0, 0));
      expect(t.redovi).toHaveLength(4);
      const nov = t.celije[1];
      expect(nov.map(tekst)).toEqual(['', '', '']);
      expect(nov[0].popuna).toBe(t0.celije[0][0].popuna);
      expect(nov[0].pasusi[0].delovi[0]).toEqual({ ...t0.celije[0][0].pasusi[0].delovi[0], tekst: '' });
      expect(t.celije[2].map(tekst)).toEqual(['1,0', '1,1', '1,2']);
    });

    it('dodajRed(t, -1): nov prvi red', () => {
      const t = ok(dodajRed(tabela(), -1));
      expect(t.celije[0].map(tekst)).toEqual(['', '', '']);
      expect(t.celije[1].map(tekst)).toEqual(['0,0', '0,1', '0,2']);
    });

    it('nov red kroz vertikalno spajanje ga produžava (ćelija je pokrivena)', () => {
      const t = ok(dodajRed(saSpajanjem(tabela(), 0, 0, 1, 0), 0));
      expect(t.celije[0][0].spojDole).toBe(2);
      expect(t.celije[1][0].pokrivena).toBe(true);
      expect(t.celije[1][1].pokrivena).toBe(false);
    });

    it('obrisiRed reda unutar spajanja skraćuje spajanje', () => {
      expect(ok(obrisiRed(saSpajanjem(tabela(), 0, 0, 1, 0), 1)).celije[0][0].spojDole).toBe(0);
      const tri = ok(dodajRed(saSpajanjem(tabela(), 0, 0, 1, 0), 0));
      expect(ok(obrisiRed(tri, 1)).celije[0][0].spojDole).toBe(1);
    });

    it('obrisiRed(t, 0) kad sidro (0,0) ima spojDole 1: sidro prelazi u red ispod sa svojim tekstom', () => {
      const t = ok(obrisiRed(saSpajanjem(tabela(), 0, 0, 1, 0), 0));
      expect(t.redovi).toHaveLength(2);
      expect(t.celije[0][0]).toMatchObject({ spojDole: 0, pokrivena: false });
      expect(tekst(t.celije[0][0])).toBe('0,0');
      expect(tekst(t.celije[0][1])).toBe('1,1');
    });

    it('poslednji red se ne briše; preko 30 redova -> null', () => {
      expect(obrisiRed(tabela(1, 3), 0)).toBeNull();
      expect(dodajRed(tabela(MAX_REDOVA, 2), 0)).toBeNull();
    });
  });

  describe('kolone', () => {
    it('dodajKolonu(t, 0): nova prazna kolona na indeksu 1, sirina raste', () => {
      const t = ok(dodajKolonu(tabela(), 0));
      expect(t.kolone).toHaveLength(4);
      expect(t.sirina).toBe(400);
      expect(t.celije.map((red) => tekst(red[1]))).toEqual(['', '', '']);
      expect(t.celije[0][2].pasusi[0].delovi[0].tekst).toBe('0,1');
    });

    it('dodajKolonu(t, -1): nova prva kolona', () => {
      const t = ok(dodajKolonu(tabela(), -1));
      expect(t.celije.map((red) => tekst(red[0]))).toEqual(['', '', '']);
    });

    it('nova kolona kroz horizontalno spajanje ga produžava', () => {
      const t = ok(dodajKolonu(saSpajanjem(tabela(), 0, 0, 0, 1), 0));
      expect(t.celije[0][0].spojDesno).toBe(2);
      expect(t.celije[0][1].pokrivena).toBe(true);
      expect(t.celije[1][1].pokrivena).toBe(false);
    });

    it('obrisiKolonu: spajanje se skraćuje, a sidro prelazi u kolonu desno', () => {
      expect(ok(obrisiKolonu(saSpajanjem(tabela(), 0, 0, 0, 1), 1)).celije[0][0].spojDesno).toBe(0);
      const t = ok(obrisiKolonu(saSpajanjem(tabela(), 0, 0, 0, 1), 0));
      expect(t.celije[0][0]).toMatchObject({ spojDesno: 0, pokrivena: false });
      expect(tekst(t.celije[0][0])).toBe('0,0');
      expect(t.sirina).toBe(200);
    });

    it('poslednja kolona se ne briše; preko 30 kolona -> null', () => {
      expect(obrisiKolonu(tabela(2, 1), 0)).toBeNull();
      expect(dodajKolonu(tabela(2, 30), 0)).toBeNull();
    });
  });

  describe('spoji i razdvoji', () => {
    it('spoji (0,0)-(1,1): sidro 2 x 2 sa tekstom svih redom, ostale pokrivene', () => {
      const t = spoji(tabela(), { r1: 0, k1: 0, r2: 1, k2: 1 });
      proveriMrezu(t);
      expect(t.celije[0][0]).toMatchObject({ spojDesno: 1, spojDole: 1 });
      expect(tekst(t.celije[0][0])).toBe('0,0|0,1|1,0|1,1');
      expect([t.celije[0][1], t.celije[1][0], t.celije[1][1]].every((c) => c.pokrivena && !c.pasusi.length)).toBe(true);
    });

    it('prazno sidro: tekst pokrivenih ga zamenjuje', () => {
      const t0 = tabela();
      const prazno = izmeniCelije(t0, { r1: 0, k1: 0, r2: 0, k2: 0 }, (c) => ({
        ...c, pasusi: c.pasusi.map((p) => ({ ...p, delovi: p.delovi.map((d) => ({ ...d, tekst: '' })) })),
      }));
      expect(tekst(spoji(prazno, { r1: 0, k1: 0, r2: 0, k2: 1 }).celije[0][0])).toBe('0,1');
    });

    it('spoji opsega koji seče postojeće spajanje proširuje opseg', () => {
      const t = spoji(saSpajanjem(tabela(), 0, 1, 1, 0), { r1: 0, k1: 0, r2: 0, k2: 1 });
      proveriMrezu(t);
      expect(t.celije[0][0]).toMatchObject({ spojDesno: 1, spojDole: 1 });
    });

    it('spoji jedne ćelije vraća isti objekat', () => {
      const t = tabela();
      expect(spoji(t, { r1: 1, k1: 1, r2: 1, k2: 1 })).toBe(t);
    });

    it('razdvoji: 4 obične ćelije, 3 prazne sa formatom sidra', () => {
      const s = spoji(tabela(), { r1: 0, k1: 0, r2: 1, k2: 1 });
      const t = razdvoji(s, { r: 1, k: 1 });
      proveriMrezu(t);
      expect(t.celije[0][0]).toMatchObject({ spojDesno: 0, spojDole: 0 });
      expect(tekst(t.celije[0][0])).toBe('0,0|0,1|1,0|1,1');
      for (const c of [t.celije[0][1], t.celije[1][0], t.celije[1][1]]) {
        expect(c.pokrivena).toBe(false);
        expect(tekst(c)).toBe('');
        expect(c.popuna).toBe(s.celije[0][0].popuna);
        expect(c.pasusi[0].delovi[0].podebljano).toBe(s.celije[0][0].pasusi[0].delovi[0].podebljano);
      }
    });
  });

  describe('izmeniCelije i postaviIvice', () => {
    it('izmeniCelije menja samo vlasnike u opsegu; bez promene isti objekat', () => {
      const t0 = saSpajanjem(tabela(), 0, 0, 1, 0);
      const f = vi.fn((c: Celija) => ({ ...c, popuna: '#ABCDEF' }));
      const t = izmeniCelije(t0, { r1: 0, k1: 0, r2: 1, k2: 0 }, f);
      expect(f).toHaveBeenCalledTimes(1);
      expect(t.celije[0][0].popuna).toBe('#ABCDEF');
      expect(t.celije[0][1]).toBe(t0.celije[0][1]);
      expect(izmeniCelije(t0, { r1: 0, k1: 0, r2: 2, k2: 2 }, (c) => c)).toBe(t0);
    });

    it('SPOLJNE na 2 x 2 opsegu: spoljne strane dobijaju ivicu, unutrašnje su null', () => {
      const t = postaviIvice(tabela(), { r1: 0, k1: 0, r2: 1, k2: 1 }, 'SPOLJNE', ivica);
      expect(t.celije[0][0].ivice).toEqual({ gore: ivica, levo: ivica, dole: null, desno: null });
      expect(t.celije[1][1].ivice).toEqual({ gore: null, levo: null, dole: ivica, desno: ivica });
      expect(t.celije[2][2].ivice.gore).not.toBeNull(); // van opsega netaknuto
    });

    it('UNUTRASNJE, SVE i NIJEDNA', () => {
      const o = { r1: 0, k1: 0, r2: 1, k2: 1 };
      expect(postaviIvice(tabela(), o, 'UNUTRASNJE', ivica).celije[0][0].ivice).toEqual({ gore: null, levo: null, dole: ivica, desno: ivica });
      expect(postaviIvice(tabela(), o, 'SVE', ivica).celije[0][1].ivice).toEqual({ gore: ivica, levo: ivica, dole: ivica, desno: ivica });
      expect(postaviIvice(tabela(), o, 'NIJEDNA', ivica).celije[1][0].ivice).toEqual({ gore: null, levo: null, dole: null, desno: null });
    });
  });

  describe('mere i granica 2880 (Review Focus 4)', () => {
    it('sirinaKolone(t, 1, 300): sirina = 100 + 300 + 100', () => {
      const t = ok(sirinaKolone(tabela(), 1, 300));
      expect(t.kolone).toEqual([100, 300, 100]);
      expect(t.sirina).toBe(500);
    });

    it('2 reda po 1400 + dodajRed -> null', () => {
      const t = { ...tabela(2, 2), redovi: [1400, 1400], visina: 2800 };
      expect(dodajRed(t, 1)).toBeNull();
    });

    it('visinaReda(t, 0, 1500) uz red 1400 (zbir 2900) -> null', () => {
      const t = { ...tabela(2, 2), redovi: [40, 1400], visina: 1440 };
      expect(visinaReda(t, 0, 1500)).toBeNull();
      expect(ok(visinaReda(t, 0, 1480)).visina).toBe(2880);
    });

    it('sirinaKolone: zbir tačno 2880 -> tabela, 2880,01 -> null', () => {
      expect(ok(sirinaKolone(tabela(), 1, 2680)).sirina).toBe(2880);
      expect(sirinaKolone(tabela(), 1, 2680.01)).toBeNull();
    });

    it('tri kolone po 960 + dodajKolonu -> null', () => {
      const t = { ...tabela(2, 3), kolone: [960, 960, 960], sirina: 2880 };
      expect(dodajKolonu(t, 2)).toBeNull();
    });
  });

  describe('celijaNaTacki i sledecaCelija', () => {
    const pravougaonici = [
      { polje: { r: 0, k: 0 }, x: 0, y: 0, w: 100, h: 40 },
      { polje: { r: 0, k: 1 }, x: 100, y: 0, w: 100, h: 40 },
      { polje: { r: 1, k: 0 }, x: 0, y: 40, w: 200, h: 40 },
    ];

    it('pogođeno polje, null van svih', () => {
      expect(celijaNaTacki(pravougaonici, { x: 150, y: 10 })).toEqual({ r: 0, k: 1 });
      expect(celijaNaTacki(pravougaonici, { x: 150, y: 60 })).toEqual({ r: 1, k: 0 });
      expect(celijaNaTacki(pravougaonici, { x: 250, y: 10 })).toBeNull();
    });

    it('Tab ide na sledećeg vlasnika redom (preskače pokrivene), na kraju null', () => {
      const t = saSpajanjem(tabela(2, 3), 0, 0, 0, 1);
      expect(sledecaCelija(t, { r: 0, k: 0 }, 1)).toEqual({ r: 0, k: 2 });
      expect(sledecaCelija(t, { r: 0, k: 2 }, -1)).toEqual({ r: 0, k: 0 });
      expect(sledecaCelija(t, { r: 1, k: 2 }, 1)).toBeNull();
      expect(sledecaCelija(t, { r: 0, k: 0 }, -1)).toBeNull();
    });
  });
});
