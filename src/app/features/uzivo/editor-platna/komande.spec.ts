import type {
  CrtezSloj, OblikSloj, Platno, Sloj, SlikaSloj, TabelaSloj, TekstSloj, VrstaOblika,
} from '../data-access/platno.models';
import { animacija, celija, pasus, platno, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { novaFormula, novaSlika, novaTabela, noviOblik, noviTekst, uSredini } from '../data-access/platno-novo';
import { proveriKaoServer } from '../data-access/platno-provera';
import { kutijaSloja } from './geometrija';
import {
  POMAK_KOPIJE, type SmerZ, dodajSloj, izmeniSlojeve, kopijeSlojeva, medjuspremnik, nazivSloja, noviId, obrisiSlojeve,
  pomeriSlojeve, postaviKutiju, premestiSloj, slobodnoMesto, zOsa,
} from './komande';

const MEDIJ = '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87';

/** Pravougaonik na (x, y), 100 x 50 (Nacrt). */
function oblik(id: string, x = 100, y = 100, deo: Partial<OblikSloj> = {}): OblikSloj {
  return { ...noviOblik(id, 'NACRT', 'PRAVOUGAONIK'), x, y, sirina: 100, visina: 50, ...deo };
}
const dok = (slojevi: Sloj[], animacije: Platno['animacije'] = []): Platno => platnoSaAnimacijama(animacije, slojevi);
const ids = (p: Platno) => p.slojevi.map((s) => s.id);
function prolazi(p: Platno): void {
  expect(proveriKaoServer(p)).toBeNull();
}

describe('komande: noviId', () => {
  it('zajednički skup slojeva i animacija: slojevi [s1, s3] i animacija s2 -> s4', () => {
    const p = dok([oblik('s1'), oblik('s3')], [animacija('s2', 's1')]);
    expect(noviId(p, 's')).toBe('s4');
  });

  it('animacije [a1] -> a2', () => {
    const p = dok([oblik('s1')], [animacija('a1', 's1')]);
    expect(noviId(p, 'a')).toBe('a2');
  });

  it('zauzeti {s4} -> s5', () => {
    const p = dok([oblik('s1'), oblik('s3')], [animacija('s2', 's1')]);
    expect(noviId(p, 's', new Set(['s4']))).toBe('s5');
  });

  it('prazan dokument -> s1 i a1', () => {
    expect(noviId(dok([]), 's')).toBe('s1');
    expect(noviId(dok([]), 'a')).toBe('a1');
  });
});

describe('komande: dodajSloj, obrisiSlojeve, izmeniSlojeve', () => {
  it('dodajSloj ide na vrh z-ose (kraj niza)', () => {
    const p = dok([oblik('s1'), oblik('s2')]);
    const posle = dodajSloj(p, oblik('s3'));
    expect(ids(posle)).toEqual(['s1', 's2', 's3']);
    expect(ids(p)).toEqual(['s1', 's2']);
    prolazi(posle);
  });

  it('obrisiSlojeve({s2}) briše i sve animacije tog sloja, ostale ostaju istim redom (Review Focus 2)', () => {
    const p = dok([oblik('s1'), oblik('s2'), oblik('s3')], [
      animacija('a1', 's1'), animacija('a2', 's2'), animacija('a3', 's3'), animacija('a4', 's2', { vrsta: 'IZLAZ' }),
      animacija('a5', 's1', { vrsta: 'IZLAZ' }),
    ]);
    const posle = obrisiSlojeve(p, new Set(['s2']));
    expect(ids(posle)).toEqual(['s1', 's3']);
    expect(posle.animacije.map((a) => a.id)).toEqual(['a1', 'a3', 'a5']);
    expect(posle.animacije.some((a) => a.slojId === 's2')).toBe(false);
    prolazi(posle);
  });

  it('obrisiSlojeve nad pravim dokumentom (svih 6 vrsta): nijedna animacija ne cilja nepostojeći sloj', () => {
    const p = platno();
    const posle = obrisiSlojeve(p, new Set(['oblik', 'tekst']));
    expect(ids(posle)).toEqual(['slika', 'tabela', 'formula', 'crtez']);
    expect(posle.animacije.map((a) => a.id)).toEqual(['a2']);
    prolazi(posle);
  });

  it('obrisiSlojeve bez pogotka vraća isti objekat', () => {
    const p = dok([oblik('s1')], [animacija('a1', 's1')]);
    expect(obrisiSlojeve(p, new Set(['nema']))).toBe(p);
    expect(obrisiSlojeve(p, new Set())).toBe(p);
  });

  it('izmeniSlojeve menja samo izabrane; ostali su isti objekti', () => {
    const p = dok([oblik('s1'), oblik('s2'), oblik('s3')]);
    const posle = izmeniSlojeve(p, new Set(['s1', 's3']), (s) => ({ ...s, providnost: 0.5 }));
    expect(posle.slojevi.map((s) => s.providnost)).toEqual([0.5, 1, 0.5]);
    expect(posle.slojevi[1]).toBe(p.slojevi[1]);
    prolazi(posle);
  });

  it('izmeniSlojeve koji ništa ne menja (f vraća isti sloj) vraća isti objekat', () => {
    const p = dok([oblik('s1'), oblik('s2')]);
    expect(izmeniSlojeve(p, new Set(['s1']), (s) => s)).toBe(p);
    expect(izmeniSlojeve(p, new Set(['nema']), (s) => ({ ...s, providnost: 0 }))).toBe(p);
  });
});

describe('komande: pomeriSlojeve', () => {
  it('pomera izabrane za (dx, dy); ostali su isti objekti', () => {
    const p = dok([oblik('s1', 100, 100), oblik('s2', 200, 200), oblik('s3', 300, 300)]);
    const posle = pomeriSlojeve(p, new Set(['s1', 's3']), 10, -5.5);
    expect(posle.slojevi.map((s) => [s.x, s.y])).toEqual([[110, 94.5], [200, 200], [310, 294.5]]);
    expect(posle.slojevi[1]).toBe(p.slojevi[1]);
    prolazi(posle);
  });

  it('ograničava na [-960, 1920] i ne dira veličinu, rotaciju ni krajeve linije', () => {
    const linija = { ...noviOblik('s1', 'NACRT', 'LINIJA'), x: 1900, y: -950, rotacija: -90 };
    const p = dok([linija]);
    const posle = pomeriSlojeve(p, new Set(['s1']), 100, -100);
    const s = posle.slojevi[0] as OblikSloj;
    expect([s.x, s.y]).toEqual([1920, -960]);
    expect([s.sirina, s.visina, s.rotacija]).toEqual([240, 24, -90]);
    expect(s.od).toBe(linija.od);
    expect(s.do).toBe(linija.do);
    prolazi(posle);
  });

  it('pomeraj 0 (ili sloj već na granici) vraća isti objekat', () => {
    const p = dok([oblik('s1', 1920, 100)]);
    expect(pomeriSlojeve(p, new Set(['s1']), 0, 0)).toBe(p);
    expect(pomeriSlojeve(p, new Set(['s1']), 50, 0)).toBe(p);
  });

  it('više slojeva na granici: zajednički pomeraj se steže, pa raspored ostaje (nijedan ne izlazi iz [-960, 1920])', () => {
    const p = dok([oblik('s1', 1900, -950), oblik('s2', 1000, 100), oblik('s3', 0, 0)]);
    const posle = pomeriSlojeve(p, new Set(['s1', 's2']), 50, -30);
    expect(posle.slojevi.map((s) => [s.x, s.y])).toEqual([[1920, -960], [1020, 90], [0, 0]]);
    expect(posle.slojevi[2]).toBe(p.slojevi[2]);
    prolazi(posle);
  });

  it('jedan izabran sloj već na granici: ceo pomeraj na toj osi je 0 i za ostale izabrane', () => {
    const p = dok([oblik('s1', 1920, 100), oblik('s2', 500, 100)]);
    expect(pomeriSlojeve(p, new Set(['s1', 's2']), 10, 0)).toBe(p);
    const posle = pomeriSlojeve(p, new Set(['s1', 's2']), 10, 5);
    expect(posle.slojevi.map((s) => [s.x, s.y])).toEqual([[1920, 105], [500, 105]]);
  });

  it('zaokružuje kao server (2 decimale)', () => {
    const p = dok([oblik('s1', 0.1, 0.2)]);
    const s = pomeriSlojeve(p, new Set(['s1']), 0.2, 0.1).slojevi[0];
    expect([s.x, s.y]).toEqual([0.3, 0.3]);
  });
});

describe('komande: zOsa', () => {
  const p = dok([oblik('A'), oblik('B'), oblik('C'), oblik('D')]);
  const slucajevi: [string[], SmerZ, string[]][] = [
    [['B'], 'NAPRED', ['A', 'C', 'B', 'D']],
    [['B'], 'NAZAD', ['B', 'A', 'C', 'D']],
    [['B'], 'NA_VRH', ['A', 'C', 'D', 'B']],
    [['B'], 'NA_DNO', ['B', 'A', 'C', 'D']],
    [['A', 'C'], 'NAPRED', ['B', 'A', 'D', 'C']],
    [['B', 'D'], 'NAZAD', ['B', 'A', 'D', 'C']],
    [['A', 'C'], 'NA_VRH', ['B', 'D', 'A', 'C']],
    [['B', 'D'], 'NA_DNO', ['B', 'D', 'A', 'C']],
    [['C', 'D'], 'NAPRED', ['A', 'B', 'C', 'D']],
  ];
  it.each(slucajevi)('%j %s -> %j', (izabrani, smer, ocekivano) => {
    const posle = zOsa(p, new Set(izabrani), smer);
    expect(ids(posle)).toEqual(ocekivano);
    expect(ids(p)).toEqual(['A', 'B', 'C', 'D']);
  });

  it.each<[string[], SmerZ]>([
    [['D'], 'NAPRED'], [['D'], 'NA_VRH'], [['A'], 'NA_DNO'], [['A'], 'NAZAD'], [['C', 'D'], 'NAPRED'],
    [['A', 'B'], 'NA_DNO'], [[], 'NA_VRH'], [['nema'], 'NAPRED'],
  ])('%j %s ne menja redosled: isti objekat', (izabrani, smer) => {
    expect(zOsa(p, new Set(izabrani), smer)).toBe(p);
  });

  it('zaključan sloj se pomera po z-osi kao i ostali (odluka 14)', () => {
    const q = dok([oblik('A'), oblik('B', 100, 100, { zakljucan: true }), oblik('C')]);
    expect(ids(zOsa(q, new Set(['B']), 'NA_DNO'))).toEqual(['B', 'A', 'C']);
  });

  it('animacije ostaju netaknute', () => {
    const q = dok([oblik('A'), oblik('B')], [animacija('a1', 'A'), animacija('a2', 'B')]);
    const posle = zOsa(q, new Set(['A']), 'NA_VRH');
    expect(posle.animacije).toBe(q.animacije);
    prolazi(posle);
  });
});

describe('komande: premestiSloj', () => {
  const p = dok([oblik('s1'), oblik('s2'), oblik('s3')]);
  it('indeks 99 se ograniči na vrh', () => {
    expect(ids(premestiSloj(p, 's1', 99))).toEqual(['s2', 's3', 's1']);
  });
  it('negativan indeks se ograniči na dno', () => {
    expect(ids(premestiSloj(p, 's3', -5))).toEqual(['s3', 's1', 's2']);
  });
  it('u sredinu', () => {
    expect(ids(premestiSloj(p, 's3', 1))).toEqual(['s1', 's3', 's2']);
    expect(ids(p)).toEqual(['s1', 's2', 's3']);
  });
  it('isti indeks (i ograničen na isti) vraća isti objekat; nepoznat id takođe', () => {
    expect(premestiSloj(p, 's2', 1)).toBe(p);
    expect(premestiSloj(p, 's3', 99)).toBe(p);
    expect(premestiSloj(p, 'nema', 0)).toBe(p);
  });
});

describe('komande: postaviKutiju', () => {
  it('nepromenjena kutija sloja sa rotacijom -90 (ogranici daje 270) vraća isti objekat: nema fantomskog koraka', () => {
    const s = oblik('s1', 100, 100, { rotacija: -90 });
    const p = dok([s]);
    expect(postaviKutiju(p, 's1', kutijaSloja(s))).toBe(p);
    expect(postaviKutiju(p, 's1', { ...kutijaSloja(s), rotacija: 270 })).toBe(p);
  });

  it('linija 240 x 24 na 480 x 48: krajevi se skaliraju', () => {
    const linija = { ...noviOblik('s1', 'NACRT', 'LINIJA'), x: 100, y: 100 };
    const posle = postaviKutiju(dok([linija]), 's1', { x: 100, y: 100, sirina: 480, visina: 48, rotacija: 0 });
    const s = posle.slojevi[0] as OblikSloj;
    expect([s.sirina, s.visina]).toEqual([480, 48]);
    expect(s.od).toEqual({ x: 0, y: 24 });
    expect(s.do).toEqual({ x: 480, y: 24 });
    prolazi(posle);
  });

  it('linija bez krajeva (null) ostaje bez krajeva (podrazumevani se računaju iz kutije)', () => {
    const linija: OblikSloj = { ...noviOblik('s1', 'NACRT', 'STRELICA'), od: null, do: null };
    const s = postaviKutiju(dok([linija]), 's1', { ...kutijaSloja(linija), sirina: 100 }).slojevi[0] as OblikSloj;
    expect(s.od).toBeNull();
    expect(s.do).toBeNull();
  });

  it('tabela sa kolonama [100, 100, 100] na širinu 200: poslednja kolona upija zaokruživanje', () => {
    const t: TabelaSloj = {
      ...novaTabela('s1', 'NACRT', 2, 3), x: 0, y: 0, sirina: 300, visina: 80, kolone: [100, 100, 100], redovi: [40, 40],
    };
    const posle = postaviKutiju(dok([t]), 's1', { x: 0, y: 0, sirina: 200, visina: 100, rotacija: 0 });
    const s = posle.slojevi[0] as TabelaSloj;
    expect(s.kolone).toEqual([66.67, 66.67, 66.66]);
    expect(s.kolone.reduce((a, b) => a + b, 0)).toBeCloseTo(200, 9);
    expect(s.redovi).toEqual([50, 50]);
    expect(s.celije).toBe(t.celije);
    prolazi(posle);
  });

  it('tabela: zbir redova je tačan i pri neparnom deljenju', () => {
    const t: TabelaSloj = { ...novaTabela('s1', 'NACRT', 3, 1), x: 0, y: 0, sirina: 640, visina: 120, redovi: [40, 40, 40] };
    const s = postaviKutiju(dok([t]), 's1', { x: 0, y: 0, sirina: 640, visina: 100, rotacija: 0 }).slojevi[0] as TabelaSloj;
    expect(s.redovi).toEqual([33.33, 33.33, 33.34]);
    expect(s.kolone).toEqual(t.kolone);
  });

  it('crtež: potez [0, 0, 100, 50] iz 100 x 50 u 200 x 100 -> [0, 0, 200, 100]', () => {
    const c: CrtezSloj = {
      id: 's1', tip: 'CRTEZ', naziv: null, x: 10, y: 10, sirina: 100, visina: 50, rotacija: 0, providnost: 1,
      zakljucan: false, senka: null, medijId: MEDIJ, potezi: [{ boja: '#000000', debljina: 2, tacke: [0, 0, 100, 50] }],
    };
    const posle = postaviKutiju(dok([c]), 's1', { x: 10, y: 10, sirina: 200, visina: 100, rotacija: 0 });
    const s = posle.slojevi[0] as CrtezSloj;
    expect(s.potezi![0].tacke).toEqual([0, 0, 200, 100]);
    expect(s.potezi![0].debljina).toBe(2);
    prolazi(posle);
  });

  it('crtež bez poteza (null) ostaje null', () => {
    const c: CrtezSloj = { ...(platno().slojevi[5] as CrtezSloj), id: 's1' };
    const s = postaviKutiju(dok([c]), 's1', { ...kutijaSloja(c), sirina: 50 }).slojevi[0] as CrtezSloj;
    expect(s.potezi).toBeNull();
    expect(s.sirina).toBe(50);
  });

  it('tekst, slika i formula menjaju samo kutiju (sadržaj ostaje isti objekat)', () => {
    const tekst = noviTekst('s1', 'NACRT', { x: 10, y: 10, sirina: 300, visina: 80 });
    const slika = novaSlika('s2', MEDIJ, 400, 200);
    const formula = novaFormula('s3', 'NACRT', 'x^2');
    let p = dok([tekst, slika, formula]);
    for (const id of ['s1', 's2', 's3']) p = postaviKutiju(p, id, { x: 1, y: 2, sirina: 33.333, visina: 44.444, rotacija: 370 });
    for (const s of p.slojevi) expect([s.x, s.y, s.sirina, s.visina, s.rotacija]).toEqual([1, 2, 33.33, 44.44, 10]);
    expect((p.slojevi[0] as TekstSloj).pasusi).toBe(tekst.pasusi);
    expect((p.slojevi[1] as SlikaSloj).isecak).toBe(slika.isecak);
    prolazi(p);
  });

  it('kutija van granica servera se ograniči (ogranici)', () => {
    const p = postaviKutiju(dok([oblik('s1')]), 's1', { x: -5000, y: 5000, sirina: 9999, visina: 0, rotacija: -45 });
    const s = p.slojevi[0];
    expect([s.x, s.y, s.sirina, s.visina, s.rotacija]).toEqual([-960, 1920, 2880, 0.01, 315]);
    prolazi(p);
  });

  it('nepoznat id vraća isti objekat', () => {
    const p = dok([oblik('s1')]);
    expect(postaviKutiju(p, 'nema', { x: 0, y: 0, sirina: 1, visina: 1, rotacija: 0 })).toBe(p);
  });
});

describe('komande: kopijeSlojeva', () => {
  it('dva sloja: novi id-jevi s<n> bez sudara, x + 12, na vrhu, bez novih animacija', () => {
    const p = dok([oblik('s1', 100, 100), oblik('s3', 200, 50, { naziv: 'Kutija' })], [animacija('s2', 's1'), animacija('a1', 's3')]);
    const { platno: posle, ids: nova } = kopijeSlojeva(p, [p.slojevi[0], p.slojevi[1]], POMAK_KOPIJE);
    expect(POMAK_KOPIJE).toBe(12);
    expect(nova).toEqual(['s4', 's5']);
    expect(ids(posle)).toEqual(['s1', 's3', 's4', 's5']);
    expect(posle.slojevi.slice(2).map((s) => [s.x, s.y, s.naziv])).toEqual([[112, 112, null], [212, 62, 'Kutija']]);
    expect(posle.animacije).toBe(p.animacije);
    prolazi(posle);
  });

  it('kopija sloja na x = 1915 ide na granicu 1920', () => {
    const p = dok([oblik('s1', 1915, 0)]);
    const { platno: posle } = kopijeSlojeva(p, p.slojevi, POMAK_KOPIJE);
    expect([posle.slojevi[1].x, posle.slojevi[1].y]).toEqual([1920, 12]);
    prolazi(posle);
  });

  it('kopije iz međuspremnika (sa tuđim id-jevima) u drugi dokument dobijaju slobodne id-jeve', () => {
    const izvor = dok([oblik('s1'), oblik('s2')]);
    const cilj = dok([oblik('s1')]);
    const { platno: posle, ids: nova } = kopijeSlojeva(cilj, izvor.slojevi, POMAK_KOPIJE);
    expect(nova).toEqual(['s2', 's3']);
    prolazi(posle);
  });

  it('kopija svake vrste sloja prolazi proveru servera', () => {
    const p = platno();
    const { platno: posle, ids: nova } = kopijeSlojeva(p, p.slojevi, POMAK_KOPIJE);
    expect(nova).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(posle.slojevi).toHaveLength(12);
    expect(posle.animacije).toHaveLength(4);
    prolazi(posle);
  });

  it('prazan spisak: isti dokument', () => {
    const p = dok([oblik('s1')]);
    expect(kopijeSlojeva(p, [], POMAK_KOPIJE)).toEqual({ platno: p, ids: [] });
  });
});

describe('komande: slobodnoMesto', () => {
  it('na praznom platnu: centar', () => {
    expect(slobodnoMesto(dok([]), 200, 120)).toEqual(uSredini(200, 120));
    expect(slobodnoMesto(dok([]), 200, 120)).toEqual({ x: 380, y: 210 });
  });

  it('sa slojem tačno u centru: centar + 12', () => {
    expect(slobodnoMesto(dok([oblik('s1', 380, 210)]), 200, 120)).toEqual({ x: 392, y: 222 });
  });

  it('zauzeti centar i centar + 12: centar + 24; sloj blizu (< 0,5) se računa kao isto mesto', () => {
    const p = dok([oblik('s1', 380.4, 209.6), oblik('s2', 392, 222)]);
    expect(slobodnoMesto(p, 200, 120)).toEqual({ x: 404, y: 234 });
  });

  it('sloj pola jedinice dalje ne smeta', () => {
    expect(slobodnoMesto(dok([oblik('s1', 380.5, 210)]), 200, 120)).toEqual({ x: 380, y: 210 });
  });

  it('najviše 20 pomeraja', () => {
    const slojevi = Array.from({ length: 30 }, (_, i) => oblik(`s${i + 1}`, 380 + 12 * i, 210 + 12 * i));
    expect(slobodnoMesto(dok(slojevi), 200, 120)).toEqual({ x: 380 + 240, y: 210 + 240 });
  });
});

describe('komande: nazivSloja', () => {
  const tekst = (id: string, ...redovi: string[]): TekstSloj => ({
    ...noviTekst(id, 'NACRT', { x: 0, y: 0, sirina: 100, visina: 50 }), pasusi: redovi.map((r) => pasus(r)),
  });

  it('naziv ima prednost', () => {
    const s = { ...oblik('s1'), naziv: 'Logo' };
    expect(nazivSloja(dok([s]), s)).toBe('Logo');
  });

  it('TEKST: prvi red (do preloma), tab postaje razmak', () => {
    const a = tekst('s1', 'Prvi red\nx');
    const b = tekst('s2', 'Prvi red\tx');
    const p = dok([a, b]);
    expect(nazivSloja(p, a)).toBe('Tekst: Prvi red');
    expect(nazivSloja(p, b)).toBe('Tekst: Prvi red x');
  });

  it('TEKST: prazni pasusi na početku se preskaču, više od 30 znakova se skraćuje sa …', () => {
    const a = tekst('s1', '', '  ', 'Ovo je jedan prilično dugačak naslov slajda');
    expect(nazivSloja(dok([a]), a)).toBe('Tekst: Ovo je jedan prilično dugačak…');
    const b = tekst('s2', '😀'.repeat(31));
    expect(nazivSloja(dok([b]), b)).toBe(`Tekst: ${'😀'.repeat(30)}…`);
  });

  it('TEKST: prazan -> Tekst N (redni broj među TEKST slojevima odozdo)', () => {
    const a = tekst('s1', 'Naslov');
    const b = tekst('s2', '');
    const c = tekst('s3', ' \t ');
    const p = dok([a, oblik('s9'), b, c]);
    expect(nazivSloja(p, b)).toBe('Tekst 2');
    expect(nazivSloja(p, c)).toBe('Tekst 3');
  });

  it('OBLIK po vrsti, N među oblicima iste vrste', () => {
    const vrste: [VrstaOblika, string][] = [
      ['PRAVOUGAONIK', 'Pravougaonik'], ['ZAOBLJENI_PRAVOUGAONIK', 'Zaobljeni pravougaonik'], ['ELIPSA', 'Elipsa'],
      ['TROUGAO', 'Trougao'], ['LINIJA', 'Linija'], ['STRELICA', 'Strelica'], ['DVOSTRUKA_STRELICA', 'Dvostruka strelica'],
    ];
    const slojevi = vrste.map(([v], i) => noviOblik(`s${i + 1}`, 'NACRT', v));
    const druga = noviOblik('s20', 'NACRT', 'ELIPSA');
    const p = dok([...slojevi, druga]);
    vrste.forEach(([, naziv], i) => expect(nazivSloja(p, slojevi[i])).toBe(`${naziv} 1`));
    expect(nazivSloja(p, druga)).toBe('Elipsa 2');
  });

  it('SLIKA, TABELA, FORMULA, CRTEZ', () => {
    const p = platno();
    const [, slika, , , formula, crtez] = p.slojevi;
    const druga = { ...slika, id: 'slika2' };
    const tabela: TabelaSloj = { ...novaTabela('t', 'NACRT', 3, 2) };
    const q = dok([...p.slojevi, druga, tabela]);
    expect(nazivSloja(q, slika)).toBe('Slika 1');
    expect(nazivSloja(q, druga)).toBe('Slika 2');
    expect(nazivSloja(q, tabela)).toBe('Tabela 3 × 2');
    expect(nazivSloja(q, p.slojevi[3])).toBe('Tabela 1 × 2');
    expect(nazivSloja(q, formula)).toBe('Formula 1');
    expect(nazivSloja(q, crtez)).toBe('Crtež 1');
  });

  it('sloj koji nije u dokumentu dobija sledeći broj', () => {
    const s = oblik('novi');
    expect(nazivSloja(dok([oblik('s1')]), s)).toBe('Pravougaonik 2');
  });

  it('tabela sa celijom (fixture) i tekst iz fabrike prolaze kroz naziv bez izuzetka', () => {
    const t: TabelaSloj = { ...(platno().slojevi[3] as TabelaSloj), celije: [[celija('A'), celija('B')]] };
    expect(nazivSloja(dok([t]), t)).toBe('Tabela 1 × 2');
  });
});

describe('komande: medjuspremnik', () => {
  it('na nivou modula, prazan na početku', () => {
    expect(medjuspremnik.slojevi).toEqual([]);
  });
});
