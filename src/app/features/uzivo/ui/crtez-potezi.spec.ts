import type { Potez } from '../data-access/platno.models';
import {
  CRTEZ_KAO_VEKTOR, MAX_KOORDINATA, NAJKRACI_POTEZ_MS, duzinaPoteza, kadroviPoteza, nacrtivPotez, planIscrtavanja, putanjaPoteza,
  putanjeCrteza,
} from './crtez-potezi';

const potez = (tacke: number[], deo: Partial<Potez> = {}): Potez => ({ boja: '#FF0000', debljina: 2, tacke, ...deo });

describe('crtez-potezi: putanja i dužina poteza', () => {
  it('kapija W1: crtež se podrazumevano crta kao vektor', () => {
    expect(CRTEZ_KAO_VEKTOR).toBe(true);
    expect(NAJKRACI_POTEZ_MS).toBe(16);
  });

  it.each([
    { tacke: [0, 0, 10, 5], d: 'M0 0 L10 5' },
    { tacke: [3, 4], d: 'M3 4 L3 4' },
    { tacke: [], d: '' },
    { tacke: [1.25, 2, 3], d: 'M1.3 2 L1.3 2' },
    { tacke: [0.04, -1.26, 2.5, 3, 7, 8.95], d: 'M0 -1.3 L2.5 3 L7 9' },
  ])('putanjaPoteza($tacke) -> "$d"', ({ tacke, d }) => {
    expect(putanjaPoteza(tacke)).toBe(d);
  });

  it('dužina je zbir duži; ponovljena tačka ne dodaje ništa, jedna tačka je 0', () => {
    expect(duzinaPoteza([0, 0, 3, 4, 3, 4])).toBe(5);
    expect(duzinaPoteza([0, 0, 3, 4, 3, 0])).toBe(9);
    expect(duzinaPoteza([7, 7])).toBe(0);
    expect(duzinaPoteza([])).toBe(0);
  });
});

describe('crtez-potezi: plan iscrtavanja', () => {
  it('ULAZ: redom zapisa, 16 ms svakom plus ostatak srazmerno dužini', () => {
    expect(planIscrtavanja([10, 30], 1000, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 258 },
      { indeks: 1, pocetakMs: 258, trajanjeMs: 742 },
    ]);
  });

  it('IZLAZ: obrnutim redom (poslednji potez se briše prvi)', () => {
    expect(planIscrtavanja([10, 30], 1000, 'IZLAZ')).toEqual([
      { indeks: 1, pocetakMs: 0, trajanjeMs: 742 },
      { indeks: 0, pocetakMs: 742, trajanjeMs: 258 },
    ]);
  });

  it('trajanje 0 (prefers-reduced-motion): sve nule', () => {
    expect(planIscrtavanja([10, 30, 5], 0, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 0 },
      { indeks: 1, pocetakMs: 0, trajanjeMs: 0 },
      { indeks: 2, pocetakMs: 0, trajanjeMs: 0 },
    ]);
  });

  it('prazan crtež: prazan plan', () => {
    expect(planIscrtavanja([], 1000, 'ULAZ')).toEqual([]);
  });

  it('100 poteza u 1000 ms (manje od 16 ms po potezu): svaki 10 ms, uzastopno, poslednji počinje u 990', () => {
    const plan = planIscrtavanja(Array.from({ length: 100 }, () => 1), 1000, 'ULAZ');
    expect(plan).toHaveLength(100);
    plan.forEach((d, i) => {
      expect(d).toEqual({ indeks: i, pocetakMs: i * 10, trajanjeMs: 10 });
    });
    expect(plan[99].pocetakMs).toBe(990);
  });

  it('svi potezi dužine 0 dele ostatak ravnomerno', () => {
    expect(planIscrtavanja([0, 0], 100, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 50 },
      { indeks: 1, pocetakMs: 50, trajanjeMs: 50 },
    ]);
  });

  it.each([
    { duzine: [10, 30], trajanje: 1000 },
    { duzine: [1, 1, 1], trajanje: 100 },
    { duzine: [3.3, 0, 7.1, 12.9, 0.2], trajanje: 777 },
    { duzine: Array.from({ length: 37 }, (_, i) => (i * 7.3) % 11), trajanje: 500 },
    { duzine: [0, 5, 0], trajanje: 1 },
  ])('zbir trajanja = trajanjeMs i delovi idu jedan za drugim ($trajanje ms)', ({ duzine, trajanje }) => {
    for (const vrsta of ['ULAZ', 'IZLAZ'] as const) {
      const plan = planIscrtavanja(duzine, trajanje, vrsta);
      expect(plan.reduce((a, d) => a + d.trajanjeMs, 0)).toBe(trajanje);
      plan.forEach((d, i) => {
        expect(d.pocetakMs).toBe(i === 0 ? 0 : plan[i - 1].pocetakMs + plan[i - 1].trajanjeMs);
        expect(d.trajanjeMs).toBeGreaterThanOrEqual(0);
      });
      expect(plan.map((d) => d.indeks).sort((a, b) => a - b)).toEqual([...duzine.keys()]);
    }
  });
});

describe('crtez-potezi: kadrovi poteza (pathLength = 1)', () => {
  it('ULAZ: nevidljiv pre svog dela, pa se crta od početka do kraja', () => {
    const k = kadroviPoteza('ULAZ');
    expect(k[0]).toMatchObject({ opacity: 0, strokeDashoffset: '1', offset: 0 });
    expect(k[1]).toMatchObject({ opacity: 1, strokeDashoffset: '1' });
    expect(k.at(-1)).toMatchObject({ opacity: 1, strokeDashoffset: '0', offset: 1 });
    expect(k.every((f) => f['strokeDasharray'] === '1 1')).toBe(true);
  });

  it('IZLAZ obrnuto: ceo potez pre svog dela, briše se od kraja i na kraju je nevidljiv', () => {
    const k = kadroviPoteza('IZLAZ');
    expect(k[0]).toMatchObject({ opacity: 1, strokeDashoffset: '0', offset: 0 });
    expect(k.at(-2)).toMatchObject({ opacity: 1, strokeDashoffset: '1' });
    expect(k.at(-1)).toMatchObject({ opacity: 0, strokeDashoffset: '1', offset: 1 });
    expect(k.every((f) => f['strokeDasharray'] === '1 1')).toBe(true);
  });
});

describe('crtez-potezi: nacrtiv potez i keš putanja (minori F7)', () => {
  it.each([
    { naziv: 'ispravan', p: potez([0, 0, 10, 5]), da: true },
    { naziv: 'jedna tačka', p: potez([3, 4]), da: true },
    { naziv: 'granica koordinate', p: potez([MAX_KOORDINATA, -MAX_KOORDINATA]), da: true },
    { naziv: 'prazne tačke', p: potez([]), da: false },
    { naziv: 'pola tačke', p: potez([5]), da: false },
    { naziv: 'NaN u tačkama', p: potez([0, 0, Number.NaN, 1]), da: false },
    { naziv: '+1e308', p: potez([0, 0, 1e308, 1]), da: false },
    { naziv: '-1e308', p: potez([-1e308, 0, 1, 1]), da: false },
    { naziv: 'Infinity', p: potez([0, Number.POSITIVE_INFINITY]), da: false },
    { naziv: 'debljina NaN', p: potez([0, 0, 1, 1], { debljina: Number.NaN }), da: false },
    { naziv: 'debljina Infinity', p: potez([0, 0, 1, 1], { debljina: Number.POSITIVE_INFINITY }), da: false },
    { naziv: 'debljina 0', p: potez([0, 0, 1, 1], { debljina: 0 }), da: false },
    { naziv: 'boja nije #RRGGBB', p: potez([0, 0, 1, 1], { boja: 'url(#x)' }), da: false },
    { naziv: 'tačke nisu niz', p: { boja: '#FF0000', debljina: 2, tacke: null } as unknown as Potez, da: false },
  ])('nacrtivPotez: $naziv -> $da', ({ p, da }) => {
    expect(nacrtivPotez(p)).toBe(da);
  });

  it('putanjeCrteza: samo nacrtivi potezi, redom, sa d, bojom, debljinom i dužinom', () => {
    const r = putanjeCrteza([
      potez([0, 0, 3, 4]), potez([]), potez([Number.NaN, 0, 1, 1]), potez([1e308, -1e308, 0, 0]), potez([7, 7], { boja: '#0000FF', debljina: 4.5 }),
    ]);
    expect(r).toEqual([
      { d: 'M0 0 L3 4', boja: '#FF0000', debljina: 2, duzina: 5 },
      { d: 'M7 7 L7 7', boja: '#0000FF', debljina: 4.5, duzina: 0 },
    ]);
  });

  it('putanjeCrteza: nijedan nacrtiv potez -> prazno (prikaz tada crta sliku)', () => {
    expect(putanjeCrteza([])).toEqual([]);
    expect(putanjeCrteza([potez([]), potez([]), potez([Number.NaN, 1])])).toEqual([]);
  });

  it('putanjeCrteza: isti niz poteza -> isti rezultat (putanja se ne računa ponovo); drugi niz -> nov rezultat', () => {
    const potezi = [potez([0, 0, 10, 5])];
    const prvi = putanjeCrteza(potezi);
    expect(putanjeCrteza(potezi)).toBe(prvi);
    const kopija = [...potezi];
    expect(putanjeCrteza(kopija)).not.toBe(prvi);
    expect(putanjeCrteza(kopija)).toEqual(prvi);
  });

  it('planIscrtavanja: nekonačne ili NaN dužine i zbir koji prelije ne daju NaN; zbir trajanja ostaje tačan', () => {
    for (const duzine of [[Number.POSITIVE_INFINITY, 10], [Number.NaN, 10, 30], [1e308, 1e308], [-5, 5]]) {
      const plan = planIscrtavanja(duzine, 1000, 'ULAZ');
      expect(plan.every((d) => Number.isFinite(d.pocetakMs) && Number.isFinite(d.trajanjeMs))).toBe(true);
      expect(plan.reduce((a, d) => a + d.trajanjeMs, 0)).toBe(1000);
    }
    // 1e308 + 1e308 prelije u Infinity: ravnomerna podela.
    expect(planIscrtavanja([1e308, 1e308], 100, 'ULAZ').map((d) => d.trajanjeMs)).toEqual([50, 50]);
  });

  it('planIscrtavanja: trajanje NaN ili Infinity -> sve nule (kao trajanje 0)', () => {
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(planIscrtavanja([10, 30], t, 'ULAZ')).toEqual([
        { indeks: 0, pocetakMs: 0, trajanjeMs: 0 }, { indeks: 1, pocetakMs: 0, trajanjeMs: 0 },
      ]);
    }
  });
});
